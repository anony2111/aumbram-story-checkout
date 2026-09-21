"use client";

import Link from "next/link";
import styles from "./feed.module.css";
import { useUiStore } from "@/stores/ui-store";
import type { StoryCardView } from "@/domain/api";
import type { ReactNode } from "react";

/**
 * The tap target on a story card.
 *
 * Hands the cover the card is already showing to the store before navigating, so
 * the viewer's loading state can paint that exact frame from cache while the
 * server render is still in flight. Without it, a tap on `slow4g` is a black
 * screen for as long as the round trip takes.
 */
export function StoryCardLink({
  story,
  children,
}: {
  story: StoryCardView;
  children: ReactNode;
}) {
  const setPendingStory = useUiStore((state) => state.setPendingStory);

  return (
    <Link
      className={styles.storyLink}
      href={`/stories/${story.id}`}
      prefetch={false}
      onClick={() =>
        setPendingStory({
          storyId: story.id,
          coverUrl: story.coverUrl,
          caption: story.caption,
          segmentCount: story.segmentCount,
        })
      }
    >
      {children}
    </Link>
  );
}
