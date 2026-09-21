"use client";

import styles from "@/features/story/story.module.css";
import { useUiStore } from "@/stores/ui-store";

/**
 * The bridge between tapping a story card and the server render arriving.
 *
 * Paints the exact cover the card was showing, from the reader's own cache, with
 * empty progress bars above it. On a fast connection this is a frame or two; on
 * `slow4g` it is the difference between an instant open and a black screen.
 */
export default function StoryLoading() {
  const pending = useUiStore((state) => state.pendingStory);

  return (
    <div className={styles.viewer} data-testid="story-loading">
      {pending ? (
        <div className={styles.frame}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.frameImage} src={pending.coverUrl} alt="" decoding="async" />
          <div className={styles.scrim} />
        </div>
      ) : null}

      <div className={styles.progress} aria-hidden="true">
        {Array.from({ length: pending?.segmentCount ?? 1 }, (_, index) => (
          <div className={styles.progressTrack} key={index} />
        ))}
      </div>

      {pending ? <p className={styles.caption}>{pending.caption}</p> : null}
    </div>
  );
}
