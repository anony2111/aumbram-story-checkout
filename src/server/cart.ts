import { fail } from "./http";
import { currentPrice, currentStock, findVariant, getStore } from "./store";
import { cartLineView } from "./views";
import { scaleMoney, sumMoney } from "@/domain/money";
import { MAX_LINE_QUANTITY, mergeAttribution } from "@/domain/rules";
import type { CartResponse } from "@/domain/api";
import type { AddCartLineBody, PatchCartLineBody } from "@/domain/schemas";
import type { CartLine } from "@/domain/types";

/**
 * Cart operations.
 *
 * Every mutation is idempotent on `clientMutationId`: the offline queue replays in
 * order after a reconnect, and a replay must not add the same thing twice. We store
 * the response we already sent and hand it back unchanged.
 */

export function readCart(): CartResponse {
  const lines = [...getStore().cart.values()]
    .sort((a, b) => a.addedAt.localeCompare(b.addedAt))
    .map(cartLineView)
    .filter((line): line is NonNullable<typeof line> => line !== null);

  return {
    lines,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: sumMoney(lines.map((line) => scaleMoney(line.unitPrice, line.quantity))),
  };
}

function replayed(clientMutationId: string): CartResponse | undefined {
  return getStore().cartMutations.get(clientMutationId) as CartResponse | undefined;
}

function remember(clientMutationId: string, response: CartResponse): CartResponse {
  getStore().cartMutations.set(clientMutationId, response);
  return response;
}

function requireVariant(variantId: string) {
  const ref = findVariant(variantId);
  if (!ref) fail(404, "VARIANT_NOT_FOUND", `Unknown variant ${variantId}`);
  return ref;
}

/** `quantity` is a delta, so "add one more" and "add to cart" are the same call. */
export function addCartLine(body: AddCartLineBody): CartResponse {
  const cached = replayed(body.clientMutationId);
  if (cached) return cached;

  requireVariant(body.variantId);
  const store = getStore();
  const existing = store.cart.get(body.variantId);
  const requested = (existing?.quantity ?? 0) + body.quantity;

  if (requested <= 0) {
    store.cart.delete(body.variantId);
    return remember(body.clientMutationId, readCart());
  }

  if (requested > MAX_LINE_QUANTITY) {
    fail(422, "QUANTITY_OUT_OF_RANGE", `At most ${MAX_LINE_QUANTITY} per line`, {
      variantId: body.variantId,
      max: MAX_LINE_QUANTITY,
    });
  }

  const stock = currentStock(body.variantId);
  if (requested > stock) {
    fail(409, "OUT_OF_STOCK", "Not enough stock left", {
      variantId: body.variantId,
      available: stock,
    });
  }

  const line: CartLine = existing
    ? {
        ...existing,
        quantity: requested,
        // A later plain add must not erase the story this line came from.
        attribution: mergeAttribution(existing.attribution, body.attribution),
      }
    : {
        variantId: body.variantId,
        productId: requireVariant(body.variantId).product.id,
        quantity: requested,
        priceAtAdd: currentPrice(body.variantId) ?? requireVariant(body.variantId).variant.price,
        attribution: { ...body.attribution },
        addedAt: new Date().toISOString(),
      };

  store.cart.set(body.variantId, line);
  return remember(body.clientMutationId, readCart());
}

export function setCartLineQuantity(variantId: string, body: PatchCartLineBody): CartResponse {
  const cached = replayed(body.clientMutationId);
  if (cached) return cached;

  const store = getStore();
  const existing = store.cart.get(variantId);
  if (!existing) fail(404, "NOT_FOUND", `No cart line for ${variantId}`);

  if (body.quantity === 0) {
    store.cart.delete(variantId);
    return remember(body.clientMutationId, readCart());
  }

  const stock = currentStock(variantId);
  if (body.quantity > stock) {
    fail(409, "OUT_OF_STOCK", "Not enough stock left", { variantId, available: stock });
  }

  store.cart.set(variantId, { ...existing, quantity: body.quantity });
  return remember(body.clientMutationId, readCart());
}

export function removeCartLine(variantId: string, clientMutationId: string): CartResponse {
  const cached = replayed(clientMutationId);
  if (cached) return cached;

  // Removing something that is already gone is a success, not a 404: a replayed
  // remove after a reconnect must not strand the queue.
  getStore().cart.delete(variantId);
  return remember(clientMutationId, readCart());
}

/** Used after a successful order: ordered lines leave the cart. */
export function removeOrderedLines(variantIds: readonly string[]): void {
  const store = getStore();
  for (const variantId of variantIds) store.cart.delete(variantId);
}
