"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import styles from "./feed.module.css";
import { FeedCardBoundary } from "./FeedCardBoundary";
import { FeedCardItem } from "./FeedCardItem";
import { FeedSkeleton } from "./FeedSkeleton";
import { useTranslator } from "@/i18n/client";
import { apiGet } from "@/lib/api-client";
import { DEFAULT_FEED_LIMIT } from "@/lib/feed-constants";
import type { FeedPage } from "@/domain/api";

/**
 * Pages after the first, fetched in the browser.
 *
 * Explicitly button-driven rather than infinite-scrolled: on a metered connection,
 * a reader who stops scrolling should stop downloading. It also keeps the
 * document short, which is the reason the feed does not need virtualisation at
 * this size (argued in the ADR).
 */
export function FeedLoadMore({ initialCursor }: { initialCursor: string | null }) {
  const t = useTranslator();

  const query = useInfiniteQuery({
    queryKey: ["feed", "after", initialCursor],
    queryFn: ({ pageParam, signal }) =>
      apiGet<FeedPage>(
        `/feed?cursor=${encodeURIComponent(pageParam)}&limit=${DEFAULT_FEED_LIMIT}`,
        { signal }
      ),
    initialPageParam: initialCursor ?? "",
    getNextPageParam: (lastPage: FeedPage) => lastPage.nextCursor ?? undefined,
    // Nothing is fetched until the reader asks for it.
    enabled: false,
  });

  const pages = query.data?.pages ?? [];
  const exhausted =
    initialCursor === null || (pages.length > 0 && pages[pages.length - 1]?.nextCursor == null);

  return (
    <>
      {pages.flatMap((page) =>
        page.items.map((card) => (
          <FeedCardBoundary cardId={card.id} key={card.id}>
            <li>
              <FeedCardItem card={card} t={t} />
            </li>
          </FeedCardBoundary>
        ))
      )}

      {query.isFetching ? <FeedSkeleton count={2} /> : null}

      <li className={styles.loadMoreRow}>
        {exhausted ? (
          <p className={styles.endOfFeed}>{t("feed.end")}</p>
        ) : (
          <button
            type="button"
            className={styles.loadMore}
            disabled={query.isFetching}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetching ? t("feed.loadingMore") : t("feed.loadMore")}
          </button>
        )}
      </li>
    </>
  );
}
