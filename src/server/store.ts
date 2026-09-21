import { getDataset } from "./dataset";
import type { VariantRef } from "./dataset";
import type { CartLine, Money, Order } from "@/domain/types";

/**
 * The mutable half of the mock backend.
 *
 * An overlay on top of the immutable seed dataset: stock and price deltas, the
 * cart, placed orders, idempotency records and the fault-injection switches. Held
 * on `globalThis` so it survives the dev server's module reloads, and resettable
 * in one call from `/__debug`.
 *
 * Memory only, single user, single process — the assignment's FAQ says a restart
 * may lose it.
 */

export const MOCK_USER_ID = "usr_000001";

export type LatencyProfile = "off" | "fast" | "slow4g" | "fixed";

export interface DebugSettings {
  latencyProfile: LatencyProfile;
  /** Used when `latencyProfile` is "fixed". */
  fixedLatencyMs: number;
  /** Probability (0-1) that an API call answers 503 instead of doing its job. */
  failureRate: number;
  /** The next POST /orders commits and then never answers. Cleared once consumed. */
  dropNextOrderResponse: boolean;
  /** Replay of live-updates.jsonl. Turned off by e2e tests that need a still world. */
  liveUpdatesEnabled: boolean;
}

export interface IdempotencyRecord {
  key: string;
  fingerprint: string;
  orderIds: string[];
  createdAt: number;
}

export interface LoggedEvent {
  receivedAt: string;
  kind: "event" | "rum" | "client-error";
  payload: unknown;
}

export interface Store {
  /** variantId -> stock, overriding the seed value. */
  stock: Map<string, number>;
  /** variantId -> price, overriding the seed value (the price-change fault). */
  price: Map<string, Money>;
  cart: Map<string, CartLine>;
  /** clientMutationId -> the response we already sent, so a replay is a no-op. */
  cartMutations: Map<string, unknown>;
  orders: Map<string, Order>;
  idempotency: Map<string, IdempotencyRecord>;
  orderSequence: number;
  debug: DebugSettings;
  /** Bounded ring of what the client reported, so /__debug can show it. */
  telemetry: LoggedEvent[];
}

export const DEFAULT_DEBUG_SETTINGS: DebugSettings = {
  latencyProfile: "fast",
  fixedLatencyMs: 800,
  failureRate: 0,
  dropNextOrderResponse: false,
  liveUpdatesEnabled: true,
};

const TELEMETRY_LIMIT = 200;

function createStore(): Store {
  return {
    stock: new Map(),
    price: new Map(),
    cart: new Map(),
    cartMutations: new Map(),
    orders: new Map(),
    idempotency: new Map(),
    orderSequence: 800,
    debug: { ...DEFAULT_DEBUG_SETTINGS },
    telemetry: [],
  };
}

const CACHE_KEY = Symbol.for("aumbram.store");
type GlobalWithStore = typeof globalThis & { [CACHE_KEY]?: Store };

export function getStore(): Store {
  const globalScope = globalThis as GlobalWithStore;
  const existing = globalScope[CACHE_KEY];
  if (existing) return existing;
  const store = createStore();
  globalScope[CACHE_KEY] = store;
  return store;
}

/** Back to seed state, debug switches included. */
export function resetStore(): void {
  (globalThis as GlobalWithStore)[CACHE_KEY] = createStore();
}

// ----------------------------------------------------------- stock/price

export function findVariant(variantId: string): VariantRef | undefined {
  return getDataset().variants.get(variantId);
}

export function currentStock(variantId: string): number {
  const override = getStore().stock.get(variantId);
  if (override !== undefined) return override;
  return findVariant(variantId)?.variant.stock ?? 0;
}

export function setStock(variantId: string, stock: number): void {
  getStore().stock.set(variantId, Math.max(0, Math.trunc(stock)));
}

export function currentPrice(variantId: string): Money | undefined {
  const override = getStore().price.get(variantId);
  if (override) return override;
  return findVariant(variantId)?.variant.price;
}

export function setPrice(variantId: string, price: Money): void {
  getStore().price.set(variantId, price);
}

/** Summed across a product's variants, with live overrides applied. */
export function totalStockForProduct(productId: string): number {
  const product = getDataset().products.get(productId);
  if (!product) return 0;
  return product.variants.reduce((sum, variant) => sum + currentStock(variant.id), 0);
}

// ------------------------------------------------------------ telemetry

export function recordTelemetry(kind: LoggedEvent["kind"], payload: unknown): void {
  const store = getStore();
  store.telemetry.push({ receivedAt: new Date().toISOString(), kind, payload });
  if (store.telemetry.length > TELEMETRY_LIMIT) {
    store.telemetry.splice(0, store.telemetry.length - TELEMETRY_LIMIT);
  }
}

// ----------------------------------------------------------- idempotency

/** The assignment's window: a key is remembered for 24 hours of mock time. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export function findIdempotencyRecord(key: string): IdempotencyRecord | undefined {
  const record = getStore().idempotency.get(key);
  if (!record) return undefined;
  if (Date.now() - record.createdAt > IDEMPOTENCY_TTL_MS) {
    getStore().idempotency.delete(key);
    return undefined;
  }
  return record;
}

export function nextOrderId(): string {
  const store = getStore();
  store.orderSequence += 1;
  return `ord_${String(store.orderSequence).padStart(6, "0")}`;
}
