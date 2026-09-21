import { getDataset } from "./dataset";
import { currentStock, getStore, setStock } from "./store";
import type { LiveUpdate } from "@/domain/types";

/**
 * Replays `live-updates.jsonl` at 2 updates per second and fans it out to every
 * connected client.
 *
 * One ticker per process, not one per connection: two open tabs must see the same
 * stock, and the replay cursor must not restart when a tab reloads.
 *
 * `stock` updates are authoritative and land in the store — they are what makes a
 * variant sell out under the shopper. `price_drop` is **not** applied to prices:
 * the generator's own README says `newMin` may not match any variant price, so
 * treating it as authoritative would corrupt the catalogue and make every checkout
 * fail with PRICE_CHANGED. It is forwarded for display only; the `/__debug` price
 * toggle is the supported way to provoke a real price change.
 */

export const LIVE_TICK_MS = 500;

type Subscriber = (update: LiveUpdate) => void;

interface LiveHub {
  subscribers: Set<Subscriber>;
  cursor: number;
  timer: ReturnType<typeof setInterval> | null;
  /** Latest live viewer count per story, so a late joiner is not left blank. */
  viewers: Map<string, number>;
}

const CACHE_KEY = Symbol.for("aumbram.live");
type GlobalWithHub = typeof globalThis & { [CACHE_KEY]?: LiveHub };

function getHub(): LiveHub {
  const globalScope = globalThis as GlobalWithHub;
  const existing = globalScope[CACHE_KEY];
  if (existing) return existing;
  const hub: LiveHub = { subscribers: new Set(), cursor: 0, timer: null, viewers: new Map() };
  globalScope[CACHE_KEY] = hub;
  return hub;
}

function tick(): void {
  const hub = getHub();
  const updates = getDataset().liveUpdates;
  if (updates.length === 0) return;

  const update = updates[hub.cursor % updates.length];
  hub.cursor = (hub.cursor + 1) % updates.length;
  if (!update) return;

  if (update.type === "stock") {
    // Skip no-op writes so subscribers are not woken for nothing.
    if (currentStock(update.variantId) === update.stock) return;
    setStock(update.variantId, update.stock);
  }
  if (update.type === "live_viewers") {
    hub.viewers.set(update.storyId, update.count);
  }

  for (const subscriber of hub.subscribers) subscriber(update);
}

export function subscribeToLiveUpdates(subscriber: Subscriber): () => void {
  const hub = getHub();
  hub.subscribers.add(subscriber);
  if (!hub.timer && getStore().debug.liveUpdatesEnabled) {
    hub.timer = setInterval(tick, LIVE_TICK_MS);
    // Never hold the process open just to replay a mock feed.
    hub.timer.unref?.();
  }
  return () => {
    hub.subscribers.delete(subscriber);
    if (hub.subscribers.size === 0 && hub.timer) {
      clearInterval(hub.timer);
      hub.timer = null;
    }
  };
}

export function liveViewersFor(storyId: string): number | undefined {
  return getHub().viewers.get(storyId);
}

/** Used by /__debug and by e2e tests that need a still world. */
export function stopLiveUpdates(): void {
  const hub = getHub();
  if (hub.timer) {
    clearInterval(hub.timer);
    hub.timer = null;
  }
}
