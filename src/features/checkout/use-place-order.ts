"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { useCheckoutStore } from "./checkout-store";
import { fingerprintPayload } from "./payload";
import { useCartStore } from "@/features/cart/cart-store";
import { apiGet, apiRequest, ApiRequestError } from "@/lib/api-client";
import { reportClientError } from "@/lib/error-reporter";
import type { Money, Order } from "@/domain/types";
import type { OrdersByKeyResponse, PlaceOrderResponse } from "@/domain/api";
import type { PlaceOrderBody } from "@/domain/schemas";

/**
 * Placing the order.
 *
 * The state this exists to handle is the third one: not "succeeded" or "failed"
 * but *unknown*. The request reached the server, the orders were committed, and
 * the response never arrived. Guessing either way is wrong — saying "failed"
 * invites the shopper to order again, and saying "done" invites them to wait for
 * something that may not exist. So an exhausted retry does not guess: it asks the
 * server what that key produced.
 *
 * Everything else follows from that:
 *
 *  - one key per payload, written to storage before the first request;
 *  - retries reuse the key, so the server can recognise the repeat;
 *  - only transport failures and 503 are retried. A 409 will not become true by
 *    asking again, so it is surfaced instead;
 *  - one flight at a time, so a double tap or a held Enter key is one request.
 */

export type PlaceOrderState =
  | { status: "idle" }
  | { status: "confirming"; attempt: number }
  /** Retries exhausted and the lookup found nothing. The key is still valid. */
  | { status: "unknown" }
  | { status: "priceChanged"; lines: { variantId: string; expected: Money; current: Money }[] }
  | { status: "outOfStock"; variantId: string; available: number }
  | { status: "notServiceable"; vendorIds: string[] }
  | { status: "codUnavailable" }
  | { status: "failed"; code: string };

const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 10_000;

function backoffMs(attempt: number): number {
  // 400ms, 1.2s, plus jitter so a retry storm does not synchronise.
  return Math.min(400 * 3 ** (attempt - 1), 4000) + Math.round(Math.random() * 200);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface PlaceOrderController {
  state: PlaceOrderState;
  /** True whenever a flight is in progress; the button stays locked. */
  busy: boolean;
  place: (payload: PlaceOrderBody) => Promise<void>;
  /** Dismiss an error and let the shopper change something. */
  reset: () => void;
}

export function usePlaceOrder(options: { onQuoteInvalidated?: () => void } = {}): PlaceOrderController {
  const router = useRouter();
  const queryClient = useQueryClient();
  const ensureKey = useCheckoutStore((store) => store.ensureKey);
  const recordOrders = useCheckoutStore((store) => store.recordOrders);
  const refreshCart = useCartStore((store) => store.refresh);

  const [state, setState] = useState<PlaceOrderState>({ status: "idle" });
  /** Guards the single flight. A ref, because two taps can land in one render. */
  const inFlight = useRef(false);

  const { onQuoteInvalidated } = options;

  const succeed = useCallback(
    (key: string, orders: Order[]) => {
      recordOrders(
        key,
        orders.map((order) => order.id)
      );
      // The ordered lines have left the server cart; adopt that before leaving.
      void refreshCart();
      router.replace(`/orders/confirmation?key=${encodeURIComponent(key)}`);
    },
    [recordOrders, refreshCart, router]
  );

  const place = useCallback(
    async (payload: PlaceOrderBody) => {
      if (inFlight.current) return;
      inFlight.current = true;

      // Persisted here, before anything is sent. A reload now still finds it.
      const key = ensureKey(fingerprintPayload(payload));

      try {
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
          setState({ status: "confirming", attempt });

          try {
            const response = await apiRequest<PlaceOrderResponse>("/orders", {
              method: "POST",
              headers: { "idempotency-key": key },
              body: JSON.stringify(payload),
              timeoutMs: REQUEST_TIMEOUT_MS,
            });
            succeed(key, response.data.orders);
            return;
          } catch (error) {
            if (!(error instanceof ApiRequestError)) throw error;

            if (error.isRetryable) {
              if (attempt < MAX_ATTEMPTS) {
                await delay(backoffMs(attempt));
                continue;
              }
              break;
            }

            // Definite answers. None of these get better by asking again.
            switch (error.code) {
              case "PRICE_CHANGED": {
                const details = error.details as
                  | { lines: { variantId: string; expected: Money; current: Money }[] }
                  | undefined;
                setState({ status: "priceChanged", lines: details?.lines ?? [] });
                return;
              }
              case "OUT_OF_STOCK": {
                const details = error.details as
                  | { variantId: string; available: number }
                  | undefined;
                void refreshCart();
                setState({
                  status: "outOfStock",
                  variantId: details?.variantId ?? "",
                  available: details?.available ?? 0,
                });
                return;
              }
              case "PINCODE_NOT_SERVICEABLE": {
                const details = error.details as { vendorIds: string[] } | undefined;
                onQuoteInvalidated?.();
                setState({ status: "notServiceable", vendorIds: details?.vendorIds ?? [] });
                return;
              }
              case "COD_NOT_AVAILABLE": {
                onQuoteInvalidated?.();
                setState({ status: "codUnavailable" });
                return;
              }
              case "IDEMPOTENCY_KEY_REUSED": {
                // Impossible in normal use: it means a key outlived its payload.
                // Report it rather than silently minting a new key over the top.
                reportClientError({
                  error: new Error("Idempotency key reused for a different payload"),
                  route: "/checkout",
                });
                setState({ status: "failed", code: error.code });
                return;
              }
              default:
                setState({ status: "failed", code: error.code });
                return;
            }
          }
        }

        // Retries exhausted after a transport failure: the outcome is unknown,
        // so ask rather than guess.
        const lookup = await apiGet<OrdersByKeyResponse>(
          `/orders?idempotencyKey=${encodeURIComponent(key)}`
        ).catch(() => null);

        if (lookup && lookup.items.length > 0) {
          succeed(key, lookup.items);
          return;
        }

        setState({ status: "unknown" });
      } finally {
        inFlight.current = false;
        void queryClient.invalidateQueries({ queryKey: ["quote"] });
      }
    },
    [ensureKey, onQuoteInvalidated, queryClient, refreshCart, succeed]
  );

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return {
    state,
    busy: state.status === "confirming",
    place,
    reset,
  };
}
