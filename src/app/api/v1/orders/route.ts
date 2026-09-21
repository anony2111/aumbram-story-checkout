import { ordersForKey, placeOrders } from "@/server/checkout";
import { apiError, fail, json, sleep, withApi } from "@/server/http";
import { getStore } from "@/server/store";
import { placeOrderSchema } from "@/domain/schemas";
import type { OrdersByKeyResponse, PlaceOrderResponse } from "@/domain/api";

export const dynamic = "force-dynamic";

/** Long enough to outlast any client timeout, short enough not to leak a timer forever. */
const DROPPED_RESPONSE_HANG_MS = 120_000;

/**
 * Structured, PII-free order log.
 *
 * Deliberately no name, phone or address: an order log is the easiest place to
 * leak personal data, and nothing here needs it to be debuggable.
 */
function logPlacement(fields: {
  idempotencyKey: string;
  outcome: string;
  durationMs: number;
  orderIds?: string[];
  vendorIds?: string[];
  paymentMethod?: string;
  errorCode?: string;
}): void {
  console.log(
    JSON.stringify({
      at: new Date().toISOString(),
      event: "order_placement",
      ...fields,
    })
  );
}

export const POST = withApi(async (request: Request) => {
  const startedAt = Date.now();
  const idempotencyKey = request.headers.get("idempotency-key");

  if (!idempotencyKey) {
    logPlacement({
      idempotencyKey: "-",
      outcome: "rejected",
      errorCode: "IDEMPOTENCY_KEY_MISSING",
      durationMs: Date.now() - startedAt,
    });
    return apiError(400, "IDEMPOTENCY_KEY_MISSING", "The Idempotency-Key header is required");
  }

  let body;
  try {
    body = placeOrderSchema.parse(await request.json());
  } catch {
    fail(422, "INVALID_BODY", "Order payload failed validation");
  }

  let result;
  try {
    result = placeOrders(idempotencyKey, body);
  } catch (error) {
    logPlacement({
      idempotencyKey,
      outcome: "failed",
      durationMs: Date.now() - startedAt,
      paymentMethod: body.paymentMethod,
    });
    throw error;
  }

  const responseBody: PlaceOrderResponse = { orders: result.orders };
  logPlacement({
    idempotencyKey,
    outcome: result.replayed ? "replayed" : "created",
    durationMs: Date.now() - startedAt,
    orderIds: result.orders.map((order) => order.id),
    vendorIds: result.orders.map((order) => order.vendorId),
    paymentMethod: body.paymentMethod,
  });

  // Fault injection: the orders are committed above, then the response is never
  // delivered. The client must recover by retrying with the same key, or by
  // looking the key up — never by guessing.
  const store = getStore();
  if (store.debug.dropNextOrderResponse && !result.replayed) {
    store.debug.dropNextOrderResponse = false;
    logPlacement({
      idempotencyKey,
      outcome: "response_dropped",
      durationMs: Date.now() - startedAt,
      orderIds: result.orders.map((order) => order.id),
    });
    await sleep(DROPPED_RESPONSE_HANG_MS);
  }

  return json(responseBody, {
    status: result.replayed ? 200 : 201,
    ...(result.replayed ? { headers: { "idempotent-replayed": "true" } } : {}),
  });
});

export const GET = withApi(async (request: Request) => {
  const idempotencyKey = new URL(request.url).searchParams.get("idempotencyKey");
  if (!idempotencyKey) {
    fail(422, "INVALID_BODY", "idempotencyKey query parameter is required");
  }
  const body: OrdersByKeyResponse = { items: ordersForKey(idempotencyKey) };
  return json(body);
});
