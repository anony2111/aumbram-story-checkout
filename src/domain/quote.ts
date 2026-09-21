import { scaleMoney, sumMoney } from "./money";
import { codAvailability, servesPincode, shippingFeeFor } from "./rules";
import type { CodAvailability } from "./rules";
import type { Attribution, Money, Vendor, VendorSummary } from "./types";

/**
 * The split preview: cart lines become one order per vendor, each priced on its own.
 *
 * Pure, so the mock backend, the checkout screen and the unit tests all agree on
 * what "two orders from two sellers" costs.
 */

export interface QuoteLineInput {
  variantId: string;
  productId: string;
  productTitle: string;
  imageUrl?: string;
  variantOptions: Record<string, string>;
  quantity: number;
  /** Price right now — may differ from what the shopper saw when adding. */
  unitPrice: Money;
  priceAtAdd: Money;
  attribution: Attribution;
  addedAt: string;
  vendor: Vendor;
}

export interface QuoteLine {
  variantId: string;
  productId: string;
  productTitle: string;
  imageUrl?: string;
  variantOptions: Record<string, string>;
  quantity: number;
  unitPrice: Money;
  priceAtAdd: Money;
  lineTotal: Money;
  attribution: Attribution;
}

export interface QuoteGroup {
  vendor: VendorSummary;
  serviceable: boolean;
  lines: QuoteLine[];
  subtotal: Money;
  shippingFee: Money;
  total: Money;
}

export interface Quote {
  pincode: string;
  groups: QuoteGroup[];
  cod: CodAvailability;
  /** Serviceable groups only — we never ask for money we cannot ship against. */
  payable: Money;
}

function toSummary(vendor: Vendor): VendorSummary {
  return { id: vendor.id, name: vendor.name, codEnabled: vendor.codEnabled };
}

/**
 * Group lines by vendor, preserving the order the shopper built the cart in:
 * a vendor's position is decided by its earliest line.
 */
export function groupLinesByVendor<T extends { vendor: Vendor; addedAt: string }>(
  lines: readonly T[]
): { vendor: Vendor; lines: T[] }[] {
  const byVendor = new Map<string, { vendor: Vendor; lines: T[] }>();
  for (const line of lines) {
    const existing = byVendor.get(line.vendor.id);
    if (existing) {
      existing.lines.push(line);
    } else {
      byVendor.set(line.vendor.id, { vendor: line.vendor, lines: [line] });
    }
  }
  const groups = [...byVendor.values()];
  for (const group of groups) {
    group.lines.sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  }
  groups.sort((a, b) => {
    const first = (group: { lines: T[] }) =>
      group.lines.reduce((min, line) => (line.addedAt < min ? line.addedAt : min), "￿");
    const byAdded = first(a).localeCompare(first(b));
    return byAdded !== 0 ? byAdded : a.vendor.id.localeCompare(b.vendor.id);
  });
  return groups;
}

export function buildQuote(lines: readonly QuoteLineInput[], pincode: string): Quote {
  const groups: QuoteGroup[] = groupLinesByVendor(lines).map(({ vendor, lines: vendorLines }) => {
    const quoteLines: QuoteLine[] = vendorLines.map((line) => ({
      variantId: line.variantId,
      productId: line.productId,
      productTitle: line.productTitle,
      ...(line.imageUrl === undefined ? {} : { imageUrl: line.imageUrl }),
      variantOptions: line.variantOptions,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      priceAtAdd: line.priceAtAdd,
      lineTotal: scaleMoney(line.unitPrice, line.quantity),
      attribution: line.attribution,
    }));
    const subtotal = sumMoney(quoteLines.map((line) => line.lineTotal));
    const shippingFee = shippingFeeFor(subtotal);
    return {
      vendor: toSummary(vendor),
      serviceable: servesPincode(vendor.serviceablePincodePrefixes, pincode),
      lines: quoteLines,
      subtotal,
      shippingFee,
      total: { amount: subtotal.amount + shippingFee.amount, currency: subtotal.currency },
    };
  });

  const serviceable = groups.filter((group) => group.serviceable);

  return {
    pincode,
    groups,
    cod: codAvailability(
      serviceable.map((group) => ({
        vendorId: group.vendor.id,
        codEnabled: group.vendor.codEnabled,
        total: group.total,
      }))
    ),
    payable: sumMoney(serviceable.map((group) => group.total)),
  };
}

/** How many orders this checkout will actually create. */
export function orderCount(quote: Quote): number {
  return quote.groups.filter((group) => group.serviceable).length;
}

export function unserviceableGroups(quote: Quote): QuoteGroup[] {
  return quote.groups.filter((group) => !group.serviceable);
}
