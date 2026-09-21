import { createHash } from "node:crypto";
import { removeOrderedLines } from "./cart";
import { getDataset } from "./dataset";
import { fail } from "./http";
import {
  currentPrice,
  currentStock,
  findIdempotencyRecord,
  findVariant,
  getStore,
  MOCK_USER_ID,
  nextOrderId,
  setStock,
} from "./store";
import { buildQuote, groupLinesByVendor } from "@/domain/quote";
import type { Quote, QuoteLineInput } from "@/domain/quote";
import { attributionForLines, isValidPincode } from "@/domain/rules";
import { moneyEquals, scaleMoney, sumMoney } from "@/domain/money";
import { shippingFeeFor } from "@/domain/rules";
import type { PlaceOrderBody } from "@/domain/schemas";
import type { CartLine, Money, Order, OrderStatus } from "@/domain/types";

/**
 * Checkout: the split preview, and order placement with idempotency.
 *
 * The invariant this file exists to protect: one `Idempotency-Key` produces one set
 * of orders, no matter how many times the request arrives. The commit and the
 * record of the key happen together, before the response is written, so a response
 * that never reaches the client still leaves a replayable record behind.
 */

function cartLineInputs(pincode: string): QuoteLineInput[] {
  const dataset = getDataset();
  const inputs: QuoteLineInput[] = [];
  for (const line of getStore().cart.values()) {
    const ref = dataset.variants.get(line.variantId);
    if (!ref) continue;
    const image = ref.product.images[0];
    inputs.push({
      variantId: line.variantId,
      productId: ref.product.id,
      productTitle: ref.product.title,
      ...(image ? { imageUrl: image.url } : {}),
      variantOptions: ref.variant.options,
      quantity: line.quantity,
      unitPrice: currentPrice(line.variantId) ?? ref.variant.price,
      priceAtAdd: line.priceAtAdd,
      attribution: line.attribution,
      addedAt: line.addedAt,
      vendor: ref.vendor,
    });
  }
  void pincode;
  return inputs;
}

export function quoteForCart(pincode: string): Quote {
  if (!isValidPincode(pincode)) {
    fail(422, "INVALID_PINCODE", "Enter a valid 6-digit pincode", { pincode });
  }
  const lines = cartLineInputs(pincode);
  if (lines.length === 0) fail(422, "CART_EMPTY", "There is nothing in the cart");
  return buildQuote(lines, pincode);
}

// ---------------------------------------------------------- idempotency

/**
 * The payload fingerprint decides whether two requests are "the same order".
 *
 * Lines are sorted so the client's ordering cannot change the fingerprint; only
 * what would change the outcome is included — variant, quantity, expected price,
 * address and payment method.
 */
export function fingerprintPayload(body: PlaceOrderBody): string {
  const canonical = {
    paymentMethod: body.paymentMethod,
    address: {
      name: body.shippingAddress.name,
      line1: body.shippingAddress.line1,
      line2: body.shippingAddress.line2 ?? "",
      city: body.shippingAddress.city,
      state: body.shippingAddress.state,
      pincode: body.shippingAddress.pincode,
      phone: body.shippingAddress.phone,
    },
    lines: [...body.lines]
      .map((line) => ({
        variantId: line.variantId,
        quantity: line.quantity,
        expectedUnitPrice: line.expectedUnitPrice.amount,
      }))
      .sort((a, b) => a.variantId.localeCompare(b.variantId)),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export interface PlaceOrdersResult {
  orders: Order[];
  replayed: boolean;
}

export function ordersForKey(idempotencyKey: string): Order[] {
  const record = findIdempotencyRecord(idempotencyKey);
  if (!record) return [];
  const store = getStore();
  return record.orderIds
    .map((id) => store.orders.get(id))
    .filter((order): order is Order => order !== undefined);
}

export function placeOrders(idempotencyKey: string, body: PlaceOrderBody): PlaceOrdersResult {
  const fingerprint = fingerprintPayload(body);
  const existing = findIdempotencyRecord(idempotencyKey);

  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      fail(422, "IDEMPOTENCY_KEY_REUSED", "This key was used for a different order", {
        idempotencyKey,
      });
    }
    return { orders: ordersForKey(idempotencyKey), replayed: true };
  }

  // ---- validate every line before mutating anything -------------------
  const priceMismatches: { variantId: string; expected: Money; current: Money }[] = [];
  const resolved = body.lines.map((line) => {
    const ref = findVariant(line.variantId);
    if (!ref) fail(404, "VARIANT_NOT_FOUND", `Unknown variant ${line.variantId}`);
    const price = currentPrice(line.variantId) ?? ref.variant.price;
    if (!moneyEquals(price, line.expectedUnitPrice)) {
      priceMismatches.push({
        variantId: line.variantId,
        expected: line.expectedUnitPrice,
        current: price,
      });
    }
    return { line, ref, price };
  });

  if (priceMismatches.length > 0) {
    fail(409, "PRICE_CHANGED", "Some prices changed while you were checking out", {
      lines: priceMismatches,
    });
  }

  for (const { line } of resolved) {
    const stock = currentStock(line.variantId);
    if (line.quantity > stock) {
      fail(409, "OUT_OF_STOCK", "Not enough stock left", {
        variantId: line.variantId,
        available: stock,
      });
    }
  }

  const unserviceable = [
    ...new Set(
      resolved
        .filter(
          ({ ref }) =>
            !ref.vendor.serviceablePincodePrefixes.some((prefix) =>
              body.shippingAddress.pincode.startsWith(prefix)
            )
        )
        .map(({ ref }) => ref.vendor.id)
    ),
  ];
  if (unserviceable.length > 0) {
    fail(422, "PINCODE_NOT_SERVICEABLE", "Some sellers do not deliver to this pincode", {
      vendorIds: unserviceable,
    });
  }

  // ---- build the split ------------------------------------------------
  const cart = getStore().cart;
  const groupInputs = resolved.map(({ line, ref, price }, index) => ({
    variantId: line.variantId,
    quantity: line.quantity,
    unitPrice: price,
    attribution: line.attribution,
    // Fall back to request order when a line is not (or no longer) in the cart.
    addedAt: cart.get(line.variantId)?.addedAt ?? `9999-${String(index).padStart(4, "0")}`,
    productId: ref.product.id,
    vendor: ref.vendor,
  }));

  const groups = groupLinesByVendor(groupInputs);

  if (body.paymentMethod === "cod") {
    const reasons: { code: string; vendorId: string }[] = [];
    for (const group of groups) {
      const subtotal = sumMoney(group.lines.map((l) => scaleMoney(l.unitPrice, l.quantity)));
      const total = subtotal.amount + shippingFeeFor(subtotal).amount;
      if (!group.vendor.codEnabled) {
        reasons.push({ code: "VENDOR_COD_DISABLED", vendorId: group.vendor.id });
      }
      if (total > 500_000) {
        reasons.push({ code: "ORDER_TOTAL_TOO_HIGH", vendorId: group.vendor.id });
      }
    }
    if (reasons.length > 0) {
      fail(422, "COD_NOT_AVAILABLE", "Cash on Delivery is not available for this order", {
        reasons,
      });
    }
  }

  const status: OrderStatus = body.paymentMethod === "cod" ? "confirmed" : "pending_payment";
  const now = new Date().toISOString();
  const store = getStore();
  const orders: Order[] = [];

  for (const group of groups) {
    const subtotal = sumMoney(group.lines.map((l) => scaleMoney(l.unitPrice, l.quantity)));
    const shippingFee = shippingFeeFor(subtotal);
    const asCartLines: CartLine[] = group.lines.map((l) => ({
      variantId: l.variantId,
      productId: l.productId,
      quantity: l.quantity,
      priceAtAdd: l.unitPrice,
      attribution: l.attribution,
      addedAt: l.addedAt,
    }));

    orders.push({
      id: nextOrderId(),
      userId: MOCK_USER_ID,
      vendorId: group.vendor.id,
      lines: group.lines.map((l) => ({
        variantId: l.variantId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      })),
      subtotal,
      shippingFee,
      total: { amount: subtotal.amount + shippingFee.amount, currency: "INR" },
      paymentMethod: body.paymentMethod,
      status,
      shippingAddress: body.shippingAddress,
      attribution: attributionForLines(asCartLines),
      idempotencyKey,
      createdAt: now,
      updatedAt: now,
    });
  }

  // ---- commit ---------------------------------------------------------
  for (const { line } of resolved) {
    setStock(line.variantId, currentStock(line.variantId) - line.quantity);
  }
  for (const order of orders) store.orders.set(order.id, order);
  store.idempotency.set(idempotencyKey, {
    key: idempotencyKey,
    fingerprint,
    orderIds: orders.map((order) => order.id),
    createdAt: Date.now(),
  });
  removeOrderedLines(body.lines.map((line) => line.variantId));

  return { orders, replayed: false };
}

/** Mock payment settlement: prepaid orders become `paid`. */
export function markOrdersPaid(orderIds: readonly string[]): Order[] {
  const store = getStore();
  const updated: Order[] = [];
  for (const id of orderIds) {
    const order = store.orders.get(id);
    if (!order || order.status !== "pending_payment") continue;
    const paid: Order = { ...order, status: "paid", updatedAt: new Date().toISOString() };
    store.orders.set(id, paid);
    updated.push(paid);
  }
  return updated;
}
