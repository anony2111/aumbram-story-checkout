"use client";

import { useCallback, useEffect, useMemo, useReducer } from "react";
import {
  initialStoryTimerState,
  isPaused,
  isRunning,
  storyTimerReducer,
} from "@/domain/story-timer";
import type {
  PauseReason,
  StoryTimerContext,
  StoryTimerEvent,
  StoryTimerState,
} from "@/domain/story-timer";
import { selectSheetOpen, useUiStore } from "@/stores/ui-store";

/**
 * Drives the pure timer, and wires up the four things that pause it.
 *
 * The tick is a 100 ms interval rather than an animation frame. At 60 Hz the
 * reducer would re-render the viewer sixty times a second on a device whose CPU
 * we are told to assume is four times slower than this one; 100 ms is ten
 * renders a second, is well inside the ±250 ms the resume requirement allows,
 * and the progress bars interpolate the gap with a compositor-only transform
 * transition so nothing looks stepped.
 *
 * Deltas come from `performance.now()`, not from the interval period, so a
 * throttled or delayed timer does not silently lose time.
 */

const TICK_MS = 100;

export interface StoryPlayer {
  state: StoryTimerState;
  dispatch: (event: StoryTimerEvent) => void;
  paused: boolean;
  running: boolean;
  /** Pause/resume from the visible control, independent of the automatic ones. */
  toggleManualPause: () => void;
  manuallyPaused: boolean;
}

export function useStoryPlayer(
  durations: readonly number[],
  options: { startIndex?: number } = {}
): StoryPlayer {
  const context: StoryTimerContext = useMemo(() => ({ durations }), [durations]);

  const [state, dispatch] = useReducer(
    (current: StoryTimerState, event: StoryTimerEvent) =>
      storyTimerReducer(current, event, context),
    options.startIndex ?? 0,
    initialStoryTimerState
  );

  const paused = isPaused(state);
  const running = isRunning(state);

  // ------------------------------------------------------------- ticking
  useEffect(() => {
    if (paused) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const deltaMs = now - last;
      last = now;
      dispatch({ type: "tick", deltaMs });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [paused]);

  // -------------------------------------------------------- pause: tab
  useEffect(() => {
    const sync = () => {
      dispatch({ type: document.hidden ? "pause" : "resume", reason: "hidden" });
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  // ------------------------------------------------------ pause: sheet
  const sheetOpen = useUiStore(selectSheetOpen);
  useEffect(() => {
    dispatch({ type: sheetOpen ? "pause" : "resume", reason: "sheet" });
  }, [sheetOpen]);

  // ---------------------------------------------------- pause: offline
  //
  // Only while the frame has not arrived. Offline with the picture already on
  // screen is not a reason to stop a story the reader can still watch.
  const mediaLoading = state.media === "loading";
  useEffect(() => {
    const sync = () => {
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      dispatch({ type: offline && mediaLoading ? "pause" : "resume", reason: "offline" });
    };
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, [mediaLoading]);

  // ----------------------------------------------------- pause: control
  const manuallyPaused = state.pauses.includes("manual" as PauseReason);
  const toggleManualPause = useCallback(() => {
    dispatch({ type: manuallyPaused ? "resume" : "pause", reason: "manual" });
  }, [manuallyPaused]);

  return { state, dispatch, paused, running, toggleManualPause, manuallyPaused };
}
