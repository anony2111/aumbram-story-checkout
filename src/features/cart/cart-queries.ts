"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api-client";
import type { CartResponse } from "@/domain/api";
import type { Attribution } from "@/domain/types";

/**
 * Server cart state.
 *
 * This is the plain read/write layer. The optimistic, offline-tolerant layer —
 * the local mirror and the replayable mutation queue — is built on top of it and
 * owns every write once it exists; nothing here assumes the network is up beyond
 * reporting that it was not.
 */

export const cartQueryKey = ["cart"] as const;

export function useCart() {
  return useQuery({
    queryKey: cartQueryKey,
    queryFn: ({ signal }) => apiGet<CartResponse>("/cart", { signal }),
  });
}

export function newMutationId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `cm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface AddToCartInput {
  variantId: string;
  /** A delta, so "add one more" is the same call. */
  quantity?: number;
  attribution?: Attribution;
}

export function useAddToCart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddToCartInput) =>
      apiPost<CartResponse>("/cart/lines", {
        variantId: input.variantId,
        quantity: input.quantity ?? 1,
        attribution: input.attribution ?? {},
        clientMutationId: newMutationId(),
      }),
    onSuccess: (cart) => {
      queryClient.setQueryData(cartQueryKey, cart);
    },
  });
}
