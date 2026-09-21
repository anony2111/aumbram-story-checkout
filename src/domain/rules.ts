import { money } from "./money";
import type { Attribution, CartLine, Money } from "./types";

/**
 * The assignment's business rules, as pure functions.
 *
 * The mock backend and the UI both call these, so a rule can never drift between
 * what the server enforces and what the checkout screen promises.
 */

// ---------------------------------------------------------------- pincode

export const PINCODE_PATTERN = /^[1-9][0-9]{5}$/;

export function isValidPincode(value: string): boolean {
  return PINCODE_PATTERN.test(value);
}

/** Indian mobile numbers, as typed: ten digits starting 6-9. */
export const MOBILE_PATTERN = /^[6-9][0-9]{9}$/;

export function isValidMobile(value: string): boolean {
  return MOBILE_PATTERN.test(value);
}

/** Store phone numbers as E.164; display is a separate concern. */
export function toE164(tenDigitMobile: string): string {
  return `+91${tenDigitMobile}`;
}

// ------------------------------------------------------- serviceability

/** A vendor serves a pincode when any of its prefixes is a prefix of that pincode. */
export function servesPincode(
  serviceablePincodePrefixes: readonly string[],
  pincode: string
): boolean {
  return serviceablePincodePrefixes.some((prefix) => pincode.startsWith(prefix));
}

// ------------------------------------------------------------- shipping

export const FREE_SHIPPING_THRESHOLD_PAISE = 49_900;
export const FLAT_SHIPPING_FEE_PAISE = 4_900;

/** Per order, i.e. per vendor: free at ₹499 or more, otherwise ₹49. */
export function shippingFeeFor(subtotal: Money): Money {
  return money(subtotal.amount >= FREE_SHIPPING_THRESHOLD_PAISE ? 0 : FLAT_SHIPPING_FEE_PAISE);
}

// ------------------------------------------------------------------ COD

export const COD_MAX_ORDER_TOTAL_PAISE = 500_000;

export type CodUnavailableReason =
  | { code: "VENDOR_COD_DISABLED"; vendorId: string }
  | { code: "ORDER_TOTAL_TOO_HIGH"; vendorId: string; limit: Money; total: Money };

export interface CodCandidateGroup {
  vendorId: string;
  codEnabled: boolean;
  total: Money;
}

export interface CodAvailability {
  available: boolean;
  reasons: CodUnavailableReason[];
}

/**
 * COD needs *every* order in the split to qualify. Callers pass serviceable groups
 * only — an order we cannot ship should not also block the payment method.
 */
export function codAvailability(groups: readonly CodCandidateGroup[]): CodAvailability {
  const reasons: CodUnavailableReason[] = [];
  for (const group of groups) {
    if (!group.codEnabled) {
      reasons.push({ code: "VENDOR_COD_DISABLED", vendorId: group.vendorId });
    }
    if (group.total.amount > COD_MAX_ORDER_TOTAL_PAISE) {
      reasons.push({
        code: "ORDER_TOTAL_TOO_HIGH",
        vendorId: group.vendorId,
        limit: money(COD_MAX_ORDER_TOTAL_PAISE),
        total: group.total,
      });
    }
  }
  return { available: groups.length > 0 && reasons.length === 0, reasons };
}

// ------------------------------------------------------------ quantity

export const MIN_LINE_QUANTITY = 1;
export const MAX_LINE_QUANTITY = 10;

/** Clamp to 1-10 and to what is actually on the shelf. */
export function clampQuantity(requested: number, stock: number): number {
  const ceiling = Math.min(MAX_LINE_QUANTITY, Math.max(0, stock));
  if (ceiling <= 0) return 0;
  return Math.min(Math.max(Math.trunc(requested), MIN_LINE_QUANTITY), ceiling);
}

// --------------------------------------------------------- attribution

/**
 * Per-vendor order attribution (mock rule): take the attribution of that vendor's
 * most recently added line that actually carries a `storyId`. A later plain
 * feed-card add must not wipe an earlier story add for the same vendor — that is
 * a creator's commission.
 */
export function attributionForLines(lines: readonly CartLine[]): Attribution {
  let best: CartLine | undefined;
  for (const line of lines) {
    if (!line.attribution.storyId) continue;
    if (!best || line.addedAt >= best.addedAt) best = line;
  }
  if (!best) return {};
  return { ...best.attribution };
}

/**
 * Merge attribution when the same variant is added again. An add that carries a
 * story wins; an add without one leaves an existing story attribution in place.
 */
export function mergeAttribution(existing: Attribution, incoming: Attribution): Attribution {
  if (incoming.storyId) return { ...incoming };
  return { ...existing };
}
