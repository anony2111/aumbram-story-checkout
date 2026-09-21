import { ordersForKey } from "./checkout";
import { getDataset } from "./dataset";
import { getFeedPage } from "./feed";
import { injectedLatencyMs, sleep } from "./http";
import { productDetail, storyCard } from "./views";
import type { FeedPage, StoryCardView } from "@/domain/api";

/**
 * Data access for server components.
 *
 * Server components read the mock store directly instead of fetching their own
 * route handlers over HTTP. A server component calling its own API is a real
 * round trip through the whole stack for data the process already has — it costs
 * TTFB, which is the budget the feed's LCP is spent from.
 *
 * The debug latency profile is applied here too, so `slow4g` slows the server
 * render as well as client fetches. Without that, a reviewer would see skeletons
 * only after hydration and never in the streamed HTML.
 */

async function withInjectedLatency<T>(produce: () => T): Promise<T> {
  const latency = injectedLatencyMs();
  if (latency > 0) await sleep(latency);
  return produce();
}

export function loadFeedPageSync(cursor: string | null, limit: number): FeedPage {
  return getFeedPage(cursor, limit);
}

export function loadFeedPage(cursor: string | null, limit: number): Promise<FeedPage> {
  return withInjectedLatency(() => getFeedPage(cursor, limit));
}

/** The cover the feed already showed, so the viewer can paint before data arrives. */
export function loadStoryCard(storyId: string): StoryCardView | null {
  const story = getDataset().stories.get(storyId);
  return story ? storyCard(story) : null;
}

export function loadStoryBundle(storyId: string) {
  const dataset = getDataset();
  const story = dataset.stories.get(storyId);
  if (!story) return null;
  const creator = dataset.creators.get(story.creatorId);
  if (!creator) return null;

  const productIds = [...new Set(story.taggedProducts.map((tag) => tag.productId))];
  const products = productIds
    .map((id) => dataset.products.get(id))
    .filter((product) => product !== undefined)
    .map(productDetail);

  return { story, creator, products, creatorFeedOrder: [...dataset.creatorFeedOrder] };
}

/**
 * Everything the confirmation page renders, resolved server-side.
 *
 * Orders store ids, not names — so a client that only had the order would need a
 * request per vendor, per creator and per variant to render one screen. Reading
 * the key here means a refresh paints from HTML.
 */
export function loadOrdersForKey(idempotencyKey: string) {
  const dataset = getDataset();
  const orders = ordersForKey(idempotencyKey);

  const vendorNames: Record<string, string> = {};
  const creatorHandles: Record<string, string> = {};
  const lineTitles: Record<string, string> = {};

  for (const order of orders) {
    const vendor = dataset.vendors.get(order.vendorId);
    if (vendor) vendorNames[order.vendorId] = vendor.name;

    const creatorId = order.attribution.creatorId;
    if (creatorId) {
      const creator = dataset.creators.get(creatorId);
      if (creator) creatorHandles[creatorId] = creator.handle;
    }

    for (const line of order.lines) {
      const ref = dataset.variants.get(line.variantId);
      if (ref) {
        const options = Object.values(ref.variant.options).join(" · ");
        lineTitles[line.variantId] = options
          ? `${ref.product.title} · ${options}`
          : ref.product.title;
      }
    }
  }

  return { orders, vendorNames, creatorHandles, lineTitles };
}

export type ConfirmationBundle = ReturnType<typeof loadOrdersForKey>;
