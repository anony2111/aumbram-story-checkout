import { markOrdersPaid } from "@/server/checkout";
import { json, notFound, withApi } from "@/server/http";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/** Settlement delay, so the confirmation page has something real to poll for. */
const SETTLEMENT_DELAY_MS = 2000;

/**
 * Mock UPI/card settlement. Not in the assignment's contract — an extension for
 * FE-E-25, documented in the README.
 *
 * Every order created with the same idempotency key settles together, which is how
 * a real gateway callback would behave for a single payment across a split cart.
 */
export const POST = withApi(
  async (_request: Request, context: { params: Promise<{ orderId: string }> }) => {
    const { orderId } = await context.params;
    const store = getStore();
    const order = store.orders.get(orderId);
    if (!order) return notFound(`Order ${orderId}`);

    const siblings = [...store.orders.values()]
      .filter((candidate) => candidate.idempotencyKey === order.idempotencyKey)
      .map((candidate) => candidate.id);

    setTimeout(() => {
      markOrdersPaid(siblings);
    }, SETTLEMENT_DELAY_MS);

    return json({ accepted: true, orderIds: siblings, settlesInMs: SETTLEMENT_DELAY_MS }, { status: 202 });
  }
);
