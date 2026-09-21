import { discountPercent } from "./money";
import type { Money } from "./types";

/**
 * Card display rules, as pure functions.
 *
 * They are spelled out in the assignment (FE-E-02) and are easy to get subtly
 * wrong — a rounded discount instead of a floored one, a "From" prefix on a
 * single-price product, "Only 0 left" instead of "Sold out". Keeping them out of
 * the components means they can be tested directly and reused by the cart and the
 * product sheet.
 */

/** At or below this, the card nudges with "Only N left". */
export const LOW_STOCK_THRESHOLD = 5;

export type StockState =
  | { kind: "sold_out" }
  | { kind: "low"; count: number }
  | { kind: "in_stock" };

export function stockState(totalStock: number): StockState {
  if (totalStock <= 0) return { kind: "sold_out" };
  if (totalStock <= LOW_STOCK_THRESHOLD) return { kind: "low", count: totalStock };
  return { kind: "in_stock" };
}

export interface DisplayPrice {
  /** Always `priceRange.min` — the cheapest variant is what a card advertises. */
  price: Money;
  /** True when variants differ, so the price reads "From ₹1,399". */
  prefixFrom: boolean;
  /** Null unless there is an MRP above the displayed price. */
  discountPercent: number | null;
  mrp: Money | null;
}

export function displayPrice(
  priceRange: { min: Money; max: Money },
  mrp: Money | null | undefined
): DisplayPrice {
  const percent = discountPercent(mrp, priceRange.min);
  return {
    price: priceRange.min,
    prefixFrom: priceRange.min.amount !== priceRange.max.amount,
    discountPercent: percent,
    mrp: percent === null ? null : (mrp ?? null),
  };
}

/**
 * Promo cards carry a deeplink from the feed. Only our own scheme is ever
 * followed — an unvalidated deeplink is a redirect gadget, and `javascript:` in an
 * href is a script injection.
 */
export const DEEPLINK_SCHEME = "aumbram://";

export function isSafeDeeplink(deeplink: string): boolean {
  return deeplink.startsWith(DEEPLINK_SCHEME) && !deeplink.includes("\n");
}
