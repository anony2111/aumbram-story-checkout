import type { Money } from "./types";

/**
 * Money arithmetic in integer paise.
 *
 * Every amount that crosses this app is an integer; there is no float path, so
 * `0.1 + 0.2` can never reach a total. Formatting is the only place a decimal
 * point appears, and it is produced by `Intl`, not by division.
 */

export const ZERO_INR: Money = { amount: 0, currency: "INR" };

export function money(amountInPaise: number): Money {
  if (!Number.isInteger(amountInPaise)) {
    throw new TypeError(`Money must be an integer number of paise, got ${amountInPaise}`);
  }
  return { amount: amountInPaise, currency: "INR" };
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: a.amount + b.amount, currency: a.currency };
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: a.amount - b.amount, currency: a.currency };
}

export function sumMoney(values: readonly Money[]): Money {
  return values.reduce(addMoney, ZERO_INR);
}

/** Line total: a unit price times an integer quantity. */
export function scaleMoney(value: Money, quantity: number): Money {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new TypeError(`Quantity must be a non-negative integer, got ${quantity}`);
  }
  return { amount: value.amount * quantity, currency: value.currency };
}

export function moneyEquals(a: Money, b: Money): boolean {
  return a.amount === b.amount && a.currency === b.currency;
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new TypeError(`Cannot combine ${a.currency} with ${b.currency}`);
  }
}

/**
 * Indian-grouped rupees: 269900 paise -> "₹2,699", 12499950 -> "₹1,24,999.50".
 *
 * Grouping stays `en-IN` in every locale (the assignment asks for it), so only the
 * currency symbol placement is locale-driven. Whole rupees drop the ".00" because
 * that is how prices are written on Indian storefronts.
 */
export function formatINR(value: Money): string {
  const showPaise = value.amount % 100 !== 0;
  const formatter = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: value.currency,
    minimumFractionDigits: showPaise ? 2 : 0,
    maximumFractionDigits: showPaise ? 2 : 0,
  });
  return formatter.format(value.amount / 100);
}

/**
 * Discount badge percentage: `floor((mrp - min) * 100 / mrp)`.
 * Returns null when there is no MRP, or the MRP does not beat the current price.
 */
export function discountPercent(mrp: Money | null | undefined, min: Money): number | null {
  if (!mrp || mrp.amount <= min.amount || mrp.amount <= 0) return null;
  return Math.floor(((mrp.amount - min.amount) * 100) / mrp.amount);
}
