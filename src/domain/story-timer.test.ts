import { describe, expect, it } from "vitest";
import {
  initialStoryTimerState,
  isPaused,
  isRunning,
  MEDIA_TIMEOUT_MS,
  segmentProgress,
  storyTimerReducer,
} from "./story-timer";
import type { StoryTimerContext, StoryTimerEvent, StoryTimerState } from "./story-timer";

/**
 * sty_0022's real shape: two 5 s images, then two videos whose URLs are fake, so
 * the poster is the normal path rather than an edge case.
 */
const context: StoryTimerContext = { durations: [5000, 5000, 8671, 14097] };

function run(state: StoryTimerState, events: StoryTimerEvent[]): StoryTimerState {
  return events.reduce((current, event) => storyTimerReducer(current, event, context), state);
}

const ready = (index = 0): StoryTimerState =>
  run(initialStoryTimerState(index), [{ type: "media-ready" }]);

describe("the timer waits for media", () => {
  it("does not advance while the frame is still loading", () => {
    const state = run(initialStoryTimerState(), [{ type: "tick", deltaMs: 2000 }]);
    expect(state.elapsedMs).toBe(0);
    expect(state.waitedMs).toBe(2000);
    expect(isRunning(state)).toBe(false);
  });

  it("starts counting the moment the frame is ready", () => {
    const state = run(initialStoryTimerState(), [
      { type: "tick", deltaMs: 800 },
      { type: "media-ready" },
      { type: "tick", deltaMs: 1000 },
    ]);
    expect(state.elapsedMs).toBe(1000);
    // Time spent waiting is not charged to the segment.
    expect(state.waitedMs).toBe(800);
  });

  it("gives up after 4 s, shows the fallback and plays anyway", () => {
    const state = run(initialStoryTimerState(), [{ type: "tick", deltaMs: MEDIA_TIMEOUT_MS }]);
    expect(state.media).toBe("failed");
    expect(isRunning(state)).toBe(true);

    const later = run(state, [{ type: "tick", deltaMs: 1000 }]);
    expect(later.elapsedMs).toBe(1000);
    expect(later.segmentIndex).toBe(0);
  });

  it("treats an explicit load error the same as the timeout, without stalling", () => {
    const state = run(initialStoryTimerState(), [
      { type: "media-failed" },
      { type: "tick", deltaMs: 1000 },
    ]);
    expect(state.media).toBe("failed");
    expect(state.elapsedMs).toBe(1000);
  });

  it("ignores a late ready after it already gave up", () => {
    const state = run(initialStoryTimerState(), [
      { type: "media-failed" },
      { type: "media-ready" },
    ]);
    expect(state.media).toBe("failed");
  });
});

describe("advancing", () => {
  it("moves to the next segment when the duration is reached", () => {
    const state = run(ready(), [{ type: "tick", deltaMs: 5000 }]);
    expect(state.segmentIndex).toBe(1);
    expect(state.elapsedMs).toBe(0);
    // Each segment waits for its own media.
    expect(state.media).toBe("loading");
  });

  it("asks the host for the next story at the end of the last segment", () => {
    const state = run(ready(3), [{ type: "tick", deltaMs: 14_097 }]);
    expect(state.overflow).toBe("next-story");
    expect(state.segmentIndex).toBe(3);
    expect(segmentProgress(state, context, 3)).toBe(1);
  });

  it("asks the host for the previous story when tapping back from the first segment", () => {
    expect(run(ready(0), [{ type: "previous" }]).overflow).toBe("previous-story");
  });

  it("clears an overflow once the host has acted on it", () => {
    const state = run(ready(3), [{ type: "next" }, { type: "clear-overflow" }]);
    expect(state.overflow).toBe("none");
  });

  it("clamps a seek to the segment range", () => {
    expect(run(ready(), [{ type: "seek-segment", index: 99 }]).segmentIndex).toBe(3);
    expect(run(ready(2), [{ type: "seek-segment", index: -4 }]).segmentIndex).toBe(0);
  });
});

describe("pausing", () => {
  it("freezes progress and resumes from exactly where it froze", () => {
    // The assignment's scenario: 40% into a 5 s segment, hold for 1 s, release.
    const playing = run(ready(1), [{ type: "tick", deltaMs: 2000 }]);
    expect(playing.elapsedMs).toBe(2000);

    const held = run(playing, [
      { type: "pause", reason: "hold" },
      { type: "tick", deltaMs: 1000 },
    ]);
    expect(held.elapsedMs).toBe(2000);
    expect(held.segmentIndex).toBe(1);

    const released = run(held, [{ type: "resume", reason: "hold" }, { type: "tick", deltaMs: 100 }]);
    expect(released.elapsedMs).toBe(2100);
    // A hold must never navigate.
    expect(released.segmentIndex).toBe(1);
  });

  it("freezes the media wait too, so a hidden tab does not burn the 4 s budget", () => {
    const state = run(initialStoryTimerState(), [
      { type: "pause", reason: "hidden" },
      { type: "tick", deltaMs: 10_000 },
    ]);
    expect(state.waitedMs).toBe(0);
    expect(state.media).toBe("loading");
  });

  it("counts reasons rather than toggling a flag", () => {
    // A sheet opened while the tab was hidden; coming back must not start playback.
    const state = run(ready(), [
      { type: "pause", reason: "hidden" },
      { type: "pause", reason: "sheet" },
      { type: "resume", reason: "hidden" },
    ]);
    expect(isPaused(state)).toBe(true);
    expect(state.pauses).toEqual(["sheet"]);

    const resumed = run(state, [{ type: "resume", reason: "sheet" }]);
    expect(isPaused(resumed)).toBe(false);
  });

  it("is idempotent, so a repeated event cannot unbalance the count", () => {
    const state = run(ready(), [
      { type: "pause", reason: "hold" },
      { type: "pause", reason: "hold" },
      { type: "resume", reason: "hold" },
    ]);
    expect(isPaused(state)).toBe(false);
    expect(run(state, [{ type: "resume", reason: "sheet" }])).toBe(state);
  });
});

describe("loading another story", () => {
  it("starts from the first segment with a fresh timer", () => {
    const state = run(ready(2), [{ type: "tick", deltaMs: 3000 }, { type: "load", segmentCount: 2 }]);
    expect(state).toMatchObject({ segmentIndex: 0, elapsedMs: 0, waitedMs: 0, media: "loading" });
  });

  it("can start from the last segment, which is what tapping back into a story means", () => {
    expect(run(ready(), [{ type: "load", segmentCount: 3, index: 2 }]).segmentIndex).toBe(2);
  });

  it("keeps pauses that are still true across the change", () => {
    const state = run(ready(), [
      { type: "pause", reason: "hidden" },
      { type: "load", segmentCount: 4 },
    ]);
    expect(state.pauses).toEqual(["hidden"]);
  });
});

describe("segmentProgress", () => {
  it("is 1 behind, 0 ahead and a fraction on the current segment", () => {
    const state = run(ready(1), [{ type: "tick", deltaMs: 2500 }]);
    expect(segmentProgress(state, context, 0)).toBe(1);
    expect(segmentProgress(state, context, 1)).toBe(0.5);
    expect(segmentProgress(state, context, 2)).toBe(0);
  });

  it("never exceeds 1", () => {
    const state: StoryTimerState = { ...ready(0), elapsedMs: 99_999 };
    expect(segmentProgress(state, context, 0)).toBe(1);
  });
});
