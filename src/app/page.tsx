import { Suspense } from "react";
import styles from "@/components/feed/feed.module.css";
import chrome from "@/components/chrome/chrome.module.css";
import { AppHeader } from "@/components/chrome/AppHeader";
import { FeedCardBoundary } from "@/components/feed/FeedCardBoundary";
import { FeedCardItem } from "@/components/feed/FeedCardItem";
import { FeedLoadMore } from "@/components/feed/FeedLoadMore";
import { FeedSkeleton } from "@/components/feed/FeedSkeleton";
import { getTranslator } from "@/i18n/server";
import { ABOVE_FOLD_COUNT, DEFAULT_FEED_LIMIT } from "@/lib/feed-constants";
import { loadFeedPage, loadFeedPageSync } from "@/server/rsc";
import type { FeedCard } from "@/domain/api";
import type { Translator } from "@/i18n/translate";

/**
 * The feed.
 *
 * Rendered on the server and streamed in two parts:
 *
 * 1. The first six cards are read synchronously and are in the first flush of
 *    HTML, so `curl /` contains their titles and the LCP image is discoverable by
 *    the preload scanner before any JavaScript runs.
 * 2. Everything after that is awaited inside a Suspense boundary. A slow read —
 *    `slow4g` in /__debug makes this obvious — delays the rest of the list without
 *    holding up the first paint.
 *
 * Later pages are fetched in the browser (`FeedLoadMore`).
 */

export const dynamic = "force-dynamic";

function renderCards(items: FeedCard[], t: Translator, firstIsPriority = false) {
  return items.map((card, index) => (
    <FeedCardBoundary cardId={card.id} key={card.id}>
      <li>
        <FeedCardItem card={card} t={t} priority={firstIsPriority && index === 0} />
      </li>
    </FeedCardBoundary>
  ));
}

async function BelowTheFold({ cursor, t }: { cursor: string | null; t: Translator }) {
  const page = await loadFeedPage(cursor, DEFAULT_FEED_LIMIT - ABOVE_FOLD_COUNT);
  return (
    <>
      {renderCards(page.items, t)}
      <FeedLoadMore initialCursor={page.nextCursor} />
    </>
  );
}

export default async function FeedPage() {
  const t = await getTranslator();
  const aboveTheFold = loadFeedPageSync(null, ABOVE_FOLD_COUNT);

  return (
    <>
      <AppHeader />
      <main className={chrome.main}>
        <h1 className="srOnly">{t("feed.title")}</h1>
        <ul className={styles.list}>
          {renderCards(aboveTheFold.items, t, true)}
          <Suspense fallback={<FeedSkeleton count={3} />}>
            <BelowTheFold cursor={aboveTheFold.nextCursor} t={t} />
          </Suspense>
        </ul>
      </main>
    </>
  );
}
