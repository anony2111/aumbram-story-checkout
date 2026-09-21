import { scaleMoney, sumMoney, ZERO_INR } from "@/domain/money";
import { MAX_LINE_QUANTITY, mergeAttribution } from "@/domain/rules";
import type { CartLineView, CartResponse } from "@/domain/api";
import type { Attribution, Money, VendorSummary } from "@/domain/types";

/**
 * The offline cart, as pure data.
 *
 * The client never edits a cart in place. It holds two things — the last cart the
 * server acknowledged, and an ordered queue of mutations it has not acknowledged
 * yet — and *derives* what the shopper sees from the pair. That is what makes the
 * hard cases fall out rather than need special-casing:
 *
 * - a reload replays the same derivation from `localStorage`, so the optimistic
 *   lines survive;
 * - a reconnect replays the queue in order and each acknowledgement simply
 *   shrinks the queue, so there is no "did this already apply?" question;
 * - a mutation the server rejects is removed from the queue and recorded as a
 *   problem, so it cannot silently vanish.
 */

/**
 * Enough of a product to render a line the server has never seen. Captured when
 * the shopper adds, because offline there is nobody to ask.
 */
export interface CartLinePreview {
  productId: string;
  productTitle: string;
  imageUrl: string | null;
  variantOptions: Record<string, string>;
  unitPrice: Money;
  stock: number;
  vendor: VendorSummary;
}

export type PendingMutation =
  | {
      kind: "add";
      /** The `clientMutationId` the server dedupes on. Generated once, reused on every replay. */
      id: string;
      variantId: string;
      /** A delta, so two offline taps become quantity 2. */
      delta: number;
      attribution: Attribution;
      preview: CartLinePreview;
      at: string;
    }
  | { kind: "set"; id: string; variantId: string; quantity: number; at: string }
  | { kind: "remove"; id: string; variantId: string; at: string };

export interface ProjectedLine extends CartLineView {
  /** True when a queued mutation is still responsible for this line's state. */
  pending: boolean;
}

export interface ProjectedCart {
  lines: ProjectedLine[];
  itemCount: number;
  subtotal: Money;
  pendingCount: number;
}

export const EMPTY_CART: ProjectedCart = {
  lines: [],
  itemCount: 0,
  subtotal: ZERO_INR,
  pendingCount: 0,
};

function lineFromPreview(
  variantId: string,
  quantity: number,
  attribution: Attribution,
  preview: CartLinePreview,
  addedAt: string
): ProjectedLine {
  return {
    variantId,
    productId: preview.productId,
    quantity,
    priceAtAdd: preview.unitPrice,
    attribution,
    addedAt,
    productTitle: preview.productTitle,
    imageUrl: preview.imageUrl,
    variantOptions: preview.variantOptions,
    unitPrice: preview.unitPrice,
    stock: preview.stock,
    vendor: preview.vendor,
    pending: true,
  };
}

export function projectCart(
  server: CartResponse | null,
  queue: readonly PendingMutation[]
): ProjectedCart {
  const lines = new Map<string, ProjectedLine>();
  for (const line of server?.lines ?? []) {
    lines.set(line.variantId, { ...line, pending: false });
  }

  for (const mutation of queue) {
    const existing = lines.get(mutation.variantId);

    switch (mutation.kind) {
      case "add": {
        const quantity = (existing?.quantity ?? 0) + mutation.delta;
        if (quantity <= 0) {
          lines.delete(mutation.variantId);
          break;
        }
        const capped = Math.min(quantity, MAX_LINE_QUANTITY);
        if (existing) {
          lines.set(mutation.variantId, {
            ...existing,
            quantity: capped,
            // A later plain add must not erase the story an earlier one carried.
            attribution: mergeAttribution(existing.attribution, mutation.attribution),
            pending: true,
          });
        } else {
          lines.set(
            mutation.variantId,
            lineFromPreview(
              mutation.variantId,
              capped,
              mutation.attribution,
              mutation.preview,
              mutation.at
            )
          );
        }
        break;
      }

      case "set": {
        if (!existing) break;
        if (mutation.quantity <= 0) {
          lines.delete(mutation.variantId);
          break;
        }
        lines.set(mutation.variantId, {
          ...existing,
          quantity: Math.min(mutation.quantity, MAX_LINE_QUANTITY),
          pending: true,
        });
        break;
      }

      case "remove":
        lines.delete(mutation.variantId);
        break;
    }
  }

  const ordered = [...lines.values()].sort((a, b) => a.addedAt.localeCompare(b.addedAt));

  return {
    lines: ordered,
    itemCount: ordered.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: sumMoney(ordered.map((line) => scaleMoney(line.unitPrice, line.quantity))),
    pendingCount: queue.length,
  };
}

/**
 * Collapses redundant work at the moment it is queued, never afterwards.
 *
 * Only the tail is considered, and only mutations that cannot have been sent yet,
 * because a mutation already in flight owns a `clientMutationId` the server may
 * have recorded. Two rules, both of which provably preserve the final state:
 *
 *  - a `set` replaces an immediately preceding `set` on the same variant
 *    (tapping the stepper five times is one write, not five);
 *  - a `remove` swallows the trailing `add`/`set` run for the same variant
 *    (adding then removing while offline should reach the server as nothing).
 *
 * Anything else is left alone. A queue that is a little longer than it needs to
 * be is a performance problem; a queue that is wrong is a lost order.
 */
export function enqueue(
  queue: readonly PendingMutation[],
  mutation: PendingMutation,
  inFlightCount = 0
): PendingMutation[] {
  const next = [...queue];
  const firstCoalescable = inFlightCount;

  if (mutation.kind === "set") {
    const last = next[next.length - 1];
    if (
      next.length > firstCoalescable &&
      last?.kind === "set" &&
      last.variantId === mutation.variantId
    ) {
      next[next.length - 1] = mutation;
      return next;
    }
  }

  if (mutation.kind === "remove") {
    let end = next.length;
    while (
      end > firstCoalescable &&
      next[end - 1]?.variantId === mutation.variantId &&
      next[end - 1]?.kind !== "remove"
    ) {
      end -= 1;
    }
    if (end < next.length) {
      // Everything dropped here only ever touched this variant, which the remove
      // now settles on its own.
      const trimmed = next.slice(0, end);
      const addedOffline = next.slice(end).some((entry) => entry.kind === "add");
      // If the line only ever existed in the queue, the remove has nothing left
      // to tell the server about.
      return addedOffline ? trimmed : [...trimmed, mutation];
    }
  }

  next.push(mutation);
  return next;
}
