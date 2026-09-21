"use client";

import { useMemo } from "react";
import { EMPTY_CART, projectCart } from "./cart-projection";
import { useCartStore } from "./cart-store";
import type { ProjectedCart } from "./cart-projection";

/**
 * What the shopper sees: the server cart with the pending queue applied.
 *
 * Derived here rather than stored, so there is exactly one representation of the
 * cart to keep correct. Selecting the two inputs separately keeps the snapshot
 * stable — a selector that built the projection inside the store would hand
 * `useSyncExternalStore` a new object on every read.
 */
export function useCartView(): ProjectedCart {
  const hydrated = useCartStore((state) => state.hydrated);
  const server = useCartStore((state) => state.server);
  const queue = useCartStore((state) => state.queue);

  return useMemo(
    // Before localStorage has been read, render the same empty cart the server
    // rendered, or hydration mismatches on every page.
    () => (hydrated ? projectCart(server, queue) : EMPTY_CART),
    [hydrated, server, queue]
  );
}
