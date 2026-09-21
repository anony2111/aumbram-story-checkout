"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { apiGet } from "@/lib/api-client";
import type { CreatorStoriesResponse } from "@/domain/api";

/**
 * Moving between stories and between creators.
 *
 * Two orderings are in play and they are not the same one:
 *
 * - within a creator, stories advance by `publishedAt` ascending, which is the
 *   order `/creators/:id/stories` returns;
 * - across creators, a horizontal swipe follows the order their story cards
 *   appear in the *feed*, which the story response hands us as `creatorFeedOrder`.
 *
 * Navigation between stories uses `replace`, not `push`: after watching six
 * stories, Back should return to the feed the reader came from, not walk them
 * back through all six.
 */

export interface StoryNavigation {
  openStory: (storyId: string) => void;
  close: () => void;
  goToAdjacentStory: (direction: 1 | -1) => Promise<void>;
  goToAdjacentCreator: (direction: 1 | -1) => Promise<void>;
}

export function useStoryNavigation(options: {
  storyId: string;
  creatorId: string;
  creatorFeedOrder: readonly string[];
}): StoryNavigation {
  const { storyId, creatorId, creatorFeedOrder } = options;
  const router = useRouter();
  const queryClient = useQueryClient();

  const fetchCreatorStories = useCallback(
    (id: string) =>
      queryClient.fetchQuery({
        queryKey: ["creator-stories", id],
        queryFn: ({ signal }) =>
          apiGet<CreatorStoriesResponse>(`/creators/${id}/stories`, { signal }),
        staleTime: 60_000,
      }),
    [queryClient]
  );

  const openStory = useCallback(
    (nextStoryId: string) => {
      router.replace(`/stories/${nextStoryId}`);
    },
    [router]
  );

  /**
   * Back to where the reader came from, at the scroll position they left.
   * A hard load of the URL has nothing to go back to, so it lands on the feed.
   */
  const close = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  }, [router]);

  /**
   * Walks the feed's creator order until it finds one with a story, so a creator
   * whose stories have all gone does not dead-end the swipe. Running out in
   * either direction ends the session.
   */
  const goToAdjacentCreator = useCallback(
    async (direction: 1 | -1) => {
      const start = creatorFeedOrder.indexOf(creatorId);
      if (start === -1) {
        close();
        return;
      }

      for (let index = start + direction; index >= 0 && index < creatorFeedOrder.length; index += direction) {
        const candidateId = creatorFeedOrder[index];
        if (!candidateId) continue;
        const { items } = await fetchCreatorStories(candidateId);
        // Forwards lands on that creator's first story, backwards on their last,
        // so a reversed swipe carries on from where it came from.
        const target = direction === 1 ? items[0] : items[items.length - 1];
        if (target) {
          openStory(target.id);
          return;
        }
      }

      close();
    },
    [close, creatorFeedOrder, creatorId, fetchCreatorStories, openStory]
  );

  const goToAdjacentStory = useCallback(
    async (direction: 1 | -1) => {
      const { items } = await fetchCreatorStories(creatorId);
      const index = items.findIndex((item) => item.id === storyId);
      const next = index === -1 ? undefined : items[index + direction];
      if (next) {
        openStory(next.id);
        return;
      }
      await goToAdjacentCreator(direction);
    },
    [creatorId, fetchCreatorStories, goToAdjacentCreator, openStory, storyId]
  );

  return { openStory, close, goToAdjacentStory, goToAdjacentCreator };
}
