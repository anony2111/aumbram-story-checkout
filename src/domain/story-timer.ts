/**
 * The story player's timer, as a pure state machine.
 *
 * Everything that makes story playback subtle lives here rather than in the
 * component: the timer starts when the *media* is ready rather than when React
 * rendered, a frame that never arrives gives up after four seconds and plays
 * anyway, and a pause can come from four independent places at once (a finger
 * held down, an open sheet, a hidden tab, a dropped connection) so it has to be
 * reference-counted rather than boolean.
 *
 * Pure because it is the part that is genuinely hard to get right, and the part
 * that is impossible to test by clicking.
 */

/** A frame that has not loaded within this gets a fallback, and the timer starts anyway. */
export const MEDIA_TIMEOUT_MS = 4000;

export type PauseReason = "hold" | "sheet" | "hidden" | "offline" | "manual";

export type MediaState = "loading" | "ready" | "failed";

/** Set when navigation ran off either end. The host acts on it, then clears it. */
export type Overflow = "none" | "next-story" | "previous-story";

export interface StoryTimerState {
  segmentIndex: number;
  /** Milliseconds elapsed inside the current segment. */
  elapsedMs: number;
  /** Milliseconds spent waiting for the current segment's media. */
  waitedMs: number;
  media: MediaState;
  /** Every reason currently holding playback. Empty means running. */
  pauses: readonly PauseReason[];
  overflow: Overflow;
}

export type StoryTimerEvent =
  | { type: "tick"; deltaMs: number }
  | { type: "media-ready" }
  | { type: "media-failed" }
  | { type: "next" }
  | { type: "previous" }
  | { type: "seek-segment"; index: number }
  | { type: "pause"; reason: PauseReason }
  | { type: "resume"; reason: PauseReason }
  /** A new story was loaded. `index` defaults to the first segment. */
  | { type: "load"; segmentCount: number; index?: number }
  | { type: "clear-overflow" };

export interface StoryTimerContext {
  /** `durationMs` per segment, in order. */
  durations: readonly number[];
}

export function initialStoryTimerState(index = 0): StoryTimerState {
  return {
    segmentIndex: index,
    elapsedMs: 0,
    waitedMs: 0,
    media: "loading",
    pauses: [],
    overflow: "none",
  };
}

export function isPaused(state: StoryTimerState): boolean {
  return state.pauses.length > 0;
}

/** Running means: media has resolved one way or the other, and nothing is holding it. */
export function isRunning(state: StoryTimerState): boolean {
  return !isPaused(state) && state.media !== "loading";
}

/** 0-1 for the current segment; completed segments are 1 and future ones 0. */
export function segmentProgress(
  state: StoryTimerState,
  context: StoryTimerContext,
  index: number
): number {
  if (index < state.segmentIndex) return 1;
  if (index > state.segmentIndex) return 0;
  const duration = context.durations[index] ?? 0;
  if (duration <= 0) return 0;
  return Math.min(1, state.elapsedMs / duration);
}

function enterSegment(index: number, base: StoryTimerState): StoryTimerState {
  return {
    ...base,
    segmentIndex: index,
    elapsedMs: 0,
    waitedMs: 0,
    media: "loading",
  };
}

export function storyTimerReducer(
  state: StoryTimerState,
  event: StoryTimerEvent,
  context: StoryTimerContext
): StoryTimerState {
  const lastIndex = context.durations.length - 1;

  switch (event.type) {
    case "tick": {
      if (isPaused(state)) return state;

      if (state.media === "loading") {
        const waitedMs = state.waitedMs + event.deltaMs;
        // Give up waiting and play the fallback frame for its full duration.
        if (waitedMs >= MEDIA_TIMEOUT_MS) return { ...state, waitedMs, media: "failed" };
        return { ...state, waitedMs };
      }

      const duration = context.durations[state.segmentIndex] ?? 0;
      const elapsedMs = state.elapsedMs + event.deltaMs;
      if (elapsedMs < duration) return { ...state, elapsedMs };

      if (state.segmentIndex >= lastIndex) {
        // Park on a completed last segment; the host moves to the next story.
        return { ...state, elapsedMs: duration, overflow: "next-story" };
      }
      return enterSegment(state.segmentIndex + 1, state);
    }

    case "media-ready":
      return state.media === "loading" ? { ...state, media: "ready" } : state;

    case "media-failed":
      return state.media === "loading" ? { ...state, media: "failed" } : state;

    case "next": {
      if (state.segmentIndex >= lastIndex) {
        return { ...state, overflow: "next-story" };
      }
      return enterSegment(state.segmentIndex + 1, state);
    }

    case "previous": {
      if (state.segmentIndex <= 0) {
        return { ...state, overflow: "previous-story" };
      }
      return enterSegment(state.segmentIndex - 1, state);
    }

    case "seek-segment": {
      const index = Math.max(0, Math.min(lastIndex, event.index));
      return enterSegment(index, state);
    }

    case "pause": {
      if (state.pauses.includes(event.reason)) return state;
      return { ...state, pauses: [...state.pauses, event.reason] };
    }

    case "resume": {
      if (!state.pauses.includes(event.reason)) return state;
      return { ...state, pauses: state.pauses.filter((reason) => reason !== event.reason) };
    }

    case "load": {
      const index = Math.max(0, Math.min(event.segmentCount - 1, event.index ?? 0));
      // Pauses survive a story change: a hidden tab is still hidden, and an open
      // sheet is still open.
      return { ...initialStoryTimerState(index), pauses: state.pauses };
    }

    case "clear-overflow":
      return state.overflow === "none" ? state : { ...state, overflow: "none" };
  }
}
