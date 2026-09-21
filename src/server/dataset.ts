import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  creatorSchema,
  feedEntrySchema,
  liveUpdateSchema,
  productSchema,
  storySchema,
  vendorSchema,
} from "@/domain/schemas";
import type { Creator, LiveUpdate, Product, Story, Variant, Vendor } from "@/domain/types";

/**
 * The seed dataset, read once per process and indexed.
 *
 * It is the immutable half of the mock backend: entities as generated. Everything
 * that changes during a session (stock, cart, orders) lives in `store.ts` as an
 * overlay, so a reset is just dropping the overlay rather than re-reading 3 MB.
 */

export type FeedEntry =
  | { id: string; type: "product"; productId: string; reason?: "trending" | "followed_vendor" | "similar" }
  | { id: string; type: "story"; storyId: string; creatorId: string; productIds: string[] }
  | { id: string; type: "creator"; creatorId: string; sampleProductIds: string[] }
  | { id: string; type: "promo"; title: string; imageUrl: string; deeplink: string; endsAt: string };

export interface VariantRef {
  variant: Variant;
  product: Product;
  vendor: Vendor;
}

export interface Dataset {
  vendors: ReadonlyMap<string, Vendor>;
  creators: ReadonlyMap<string, Creator>;
  products: ReadonlyMap<string, Product>;
  variants: ReadonlyMap<string, VariantRef>;
  stories: ReadonlyMap<string, Story>;
  /** Per creator, sorted by publishedAt ascending — the story-to-story advance order. */
  storiesByCreator: ReadonlyMap<string, Story[]>;
  feed: readonly FeedEntry[];
  /** Creators in the order their story cards appear in the feed (swipe order). */
  creatorFeedOrder: readonly string[];
  liveUpdates: readonly LiveUpdate[];
}

const DATA_DIR = join(process.cwd(), "mock-data", "out");

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(join(DATA_DIR, file), "utf8"));
  } catch (cause) {
    throw new Error(
      `Could not read mock-data/out/${file}. Run \`npm run seed\` first (dev/build do it for you).`,
      { cause }
    );
  }
}

function parseList<T>(file: string, schema: { parse: (value: unknown) => T }): T[] {
  const raw = readJson(file);
  if (!Array.isArray(raw)) throw new Error(`${file} is not an array`);
  return raw.map((entry, index) => {
    try {
      return schema.parse(entry);
    } catch (cause) {
      throw new Error(`${file}[${index}] failed validation`, { cause });
    }
  });
}

function normaliseFeedEntry(raw: unknown): FeedEntry {
  const parsed = feedEntrySchema.parse(raw);
  switch (parsed.type) {
    case "product":
      return {
        id: parsed.id,
        type: "product",
        productId: parsed.product.id,
        ...(parsed.reason ? { reason: parsed.reason } : {}),
      };
    case "story":
      return {
        id: parsed.id,
        type: "story",
        storyId: parsed.story.id,
        creatorId: parsed.creator.id,
        productIds: parsed.products.map((product) => product.id),
      };
    case "creator":
      return {
        id: parsed.id,
        type: "creator",
        creatorId: parsed.creator.id,
        sampleProductIds: parsed.sampleProducts.map((product) => product.id),
      };
    case "promo":
      return {
        id: parsed.id,
        type: "promo",
        title: parsed.title,
        imageUrl: parsed.imageUrl,
        deeplink: parsed.deeplink,
        endsAt: parsed.endsAt,
      };
  }
}

function loadDataset(): Dataset {
  const vendors = new Map(parseList("vendors.json", vendorSchema).map((v) => [v.id, v as Vendor]));
  const creators = new Map(parseList("creators.json", creatorSchema).map((c) => [c.id, c as Creator]));
  const products = new Map(parseList("products.json", productSchema).map((p) => [p.id, p as Product]));
  const stories = new Map(parseList("stories.json", storySchema).map((s) => [s.id, s as Story]));

  const variants = new Map<string, VariantRef>();
  for (const product of products.values()) {
    const vendor = vendors.get(product.vendorId);
    if (!vendor) throw new Error(`Product ${product.id} references unknown vendor ${product.vendorId}`);
    for (const variant of product.variants) {
      variants.set(variant.id, { variant, product, vendor });
    }
  }

  const storiesByCreator = new Map<string, Story[]>();
  for (const story of stories.values()) {
    const list = storiesByCreator.get(story.creatorId);
    if (list) list.push(story);
    else storiesByCreator.set(story.creatorId, [story]);
  }
  for (const list of storiesByCreator.values()) {
    list.sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  }

  const rawFeed = readJson("feed.json");
  if (!Array.isArray(rawFeed)) throw new Error("feed.json is not an array");
  const feed = rawFeed.map(normaliseFeedEntry);

  const creatorFeedOrder: string[] = [];
  for (const entry of feed) {
    if (entry.type === "story" && !creatorFeedOrder.includes(entry.creatorId)) {
      creatorFeedOrder.push(entry.creatorId);
    }
  }

  const liveUpdates = readFileSync(join(DATA_DIR, "live-updates.jsonl"), "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return liveUpdateSchema.parse(JSON.parse(line)) as LiveUpdate;
      } catch (cause) {
        throw new Error(`live-updates.jsonl:${index + 1} failed validation`, { cause });
      }
    });

  return {
    vendors,
    creators,
    products,
    variants,
    stories,
    storiesByCreator,
    feed,
    creatorFeedOrder,
    liveUpdates,
  };
}

/**
 * Cached on `globalThis` so the dev server's module reloads do not re-parse 3 MB
 * of JSON on every edit.
 */
const CACHE_KEY = Symbol.for("aumbram.dataset");
type GlobalWithDataset = typeof globalThis & { [CACHE_KEY]?: Dataset };

export function getDataset(): Dataset {
  const globalScope = globalThis as GlobalWithDataset;
  const cached = globalScope[CACHE_KEY];
  if (cached) return cached;
  const dataset = loadDataset();
  globalScope[CACHE_KEY] = dataset;
  return dataset;
}
