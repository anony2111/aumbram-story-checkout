"use client";

import { create } from "zustand";
import type { LiveUpdate } from "@/domain/types";

/**
 * Live updates, kept in their own store on purpose.
 *
 * The feed carries a few hundred cards and the ticker fires twice a second. If
 * every update went through a shared context, or through the query cache, the
 * whole list would re-render for a stock change on a product nobody is looking
 * at. Here a component subscribes to exactly one variant's stock or one story's
 * viewer count, and zustand re-renders only the components whose slice changed.
 *
 * Price drops are deliberately *not* applied to prices — the mock backend does
 * not treat them as authoritative either, because the generator's own README
 * says `newMin` may not match any variant price. They are kept only as a flag a
 * card can show.
 */

interface LiveState {
  connected: boolean;
  /** variantId -> stock, as last announced. */
  stock: Record<string, number>;
  /** storyId -> people watching. */
  viewers: Record<string, number>;
  /** productId -> true once a price drop has been announced for it. */
  priceDropped: Record<string, true>;
  setConnected: (connected: boolean) => void;
  apply: (update: LiveUpdate) => void;
}

export const useLiveStore = create<LiveState>()((set) => ({
  connected: false,
  stock: {},
  viewers: {},
  priceDropped: {},

  setConnected: (connected) => set({ connected }),

  apply: (update) =>
    set((state) => {
      switch (update.type) {
        case "stock":
          if (state.stock[update.variantId] === update.stock) return state;
          return { stock: { ...state.stock, [update.variantId]: update.stock } };
        case "live_viewers":
          if (state.viewers[update.storyId] === update.count) return state;
          return { viewers: { ...state.viewers, [update.storyId]: update.count } };
        case "price_drop":
          if (state.priceDropped[update.productId]) return state;
          return { priceDropped: { ...state.priceDropped, [update.productId]: true } };
      }
    }),
}));

/** Live stock for one variant, falling back to what the server rendered. */
export function useLiveStock(variantId: string, fallback: number): number {
  return useLiveStore((state) => state.stock[variantId] ?? fallback);
}

/** Summed live stock across a product's variants. */
export function useLiveTotalStock(variantIds: readonly string[], fallback: number): number {
  return useLiveStore((state) => {
    let known = false;
    let total = 0;
    for (const variantId of variantIds) {
      const live = state.stock[variantId];
      if (live !== undefined) known = true;
      total += live ?? 0;
    }
    // Until at least one variant has been announced, the server's number is the
    // better answer: a partial sum would under-report.
    return known ? total : fallback;
  });
}

export function useLiveViewers(storyId: string): number | undefined {
  return useLiveStore((state) => state.viewers[storyId]);
}
