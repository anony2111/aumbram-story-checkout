import { getDataset } from "./dataset";
import { productCardById, storyCard } from "./views";
import type { FeedCard, FeedPage, ProductCardView } from "@/domain/api";

/**
 * Feed paging.
 *
 * The cursor is an opaque, base64-encoded offset. Offsets are fine for a static
 * ranked list; a real ranked feed would encode a rank key plus a tiebreaker so
 * inserts cannot shift a page under the reader, and that is called out in the ADR.
 */

export { DEFAULT_FEED_LIMIT } from "@/lib/feed-constants";

const MAX_FEED_LIMIT = 50;

export function encodeCursor(offset: number): string {
  return Buffer.from(`feed:${offset}`, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string | null): number {
  if (!cursor) return 0;
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const match = /^feed:(\d+)$/.exec(decoded);
    if (!match?.[1]) return 0;
    return Number.parseInt(match[1], 10);
  } catch {
    return 0;
  }
}

function cards(productIds: readonly string[]): ProductCardView[] {
  return productIds
    .map(productCardById)
    .filter((card): card is ProductCardView => card !== null);
}

export function getFeedPage(cursor: string | null, limit: number): FeedPage {
  const dataset = getDataset();
  const offset = Math.max(0, decodeCursor(cursor));
  const size = Math.min(Math.max(1, limit), MAX_FEED_LIMIT);
  const slice = dataset.feed.slice(offset, offset + size);

  const items: FeedCard[] = [];
  for (const entry of slice) {
    switch (entry.type) {
      case "product": {
        const product = productCardById(entry.productId);
        if (!product) continue;
        items.push({
          id: entry.id,
          type: "product",
          product,
          ...(entry.reason ? { reason: entry.reason } : {}),
        });
        break;
      }
      case "story": {
        const story = dataset.stories.get(entry.storyId);
        const creator = dataset.creators.get(entry.creatorId);
        if (!story || !creator) continue;
        items.push({
          id: entry.id,
          type: "story",
          story: storyCard(story),
          creator,
          products: cards(entry.productIds),
        });
        break;
      }
      case "creator": {
        const creator = dataset.creators.get(entry.creatorId);
        if (!creator) continue;
        items.push({
          id: entry.id,
          type: "creator",
          creator,
          sampleProducts: cards(entry.sampleProductIds),
        });
        break;
      }
      case "promo": {
        items.push({
          id: entry.id,
          type: "promo",
          title: entry.title,
          imageUrl: entry.imageUrl,
          deeplink: entry.deeplink,
          endsAt: entry.endsAt,
        });
        break;
      }
    }
  }

  const nextOffset = offset + slice.length;
  return {
    items,
    nextCursor: nextOffset < dataset.feed.length ? encodeCursor(nextOffset) : null,
  };
}
