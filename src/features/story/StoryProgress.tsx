"use client";

import { useEffect, useRef } from "react";
import styles from "./story.module.css";
import { segmentProgress } from "@/domain/story-timer";
import type { StoryTimerState } from "@/domain/story-timer";
import type { StorySegment } from "@/domain/types";
import type { Translator } from "@/i18n/translate";

/**
 * One bar per segment: completed ones full, the current one filling, future ones
 * empty.
 *
 * The fill is a `scaleX` transform with a 100 ms linear transition, matching the
 * timer's tick, so ten state updates a second read as continuous motion without
 * touching layout. Backwards jumps disable the transition for a frame — a bar
 * should snap back when you tap left, not rewind.
 */
export function StoryProgress({
  segments,
  state,
  durations,
  t,
}: {
  segments: StorySegment[];
  state: StoryTimerState;
  durations: readonly number[];
  t: Translator;
}) {
  const previousIndex = useRef(state.segmentIndex);
  const wentBackwards = state.segmentIndex < previousIndex.current;

  useEffect(() => {
    previousIndex.current = state.segmentIndex;
  }, [state.segmentIndex]);

  return (
    <div
      className={styles.progress}
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={segments.length}
      aria-valuenow={state.segmentIndex + 1}
      aria-label={t("story.segmentProgress", {
        current: state.segmentIndex + 1,
        total: segments.length,
      })}
    >
      {segments.map((_, index) => (
        <div className={styles.progressTrack} key={index}>
          <div
            className={styles.progressFill}
            data-testid="story-progress-fill"
            data-index={index}
            data-instant={wentBackwards ? "true" : undefined}
            style={{ transform: `scaleX(${segmentProgress(state, { durations }, index)})` }}
          />
        </div>
      ))}
    </div>
  );
}
