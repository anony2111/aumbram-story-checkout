"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { enqueue, EMPTY_CART, projectCart } from "./cart-projection";
import type { CartLinePreview, PendingMutation, ProjectedCart } from "./cart-projection";
import { track } from "@/features/telemetry/analytics";
import { apiGet, apiRequest, ApiRequestError } from "@/lib/api-client";
import type { CartResponse } from "@/domain/api";
import type { Attribution } from "@/domain/types";

/**
 * The cart, which is the one piece of server state this app owns locally.
 *
 * Everything else reads through TanStack Query, because everything else can wait
 * for the network. The cart cannot: it has to accept writes on a train, survive a
 * reload, and end up consistent with the server afterwards. So it is a persisted
 * store holding the last acknowledged server cart plus an ordered queue of
 * unacknowledged mutations, with an explicit sync loop rather than a cache.
 *
 * Two rules keep the replay honest:
 *
 *  - a mutation carries the `clientMutationId` it was created with, forever. The
 *    server dedupes on it, so a replay after an ambiguous failure cannot add the
 *    same thing twice.
 *  - a mutation is only dropped from the queue when the server has definitely
 *    accepted or definitely rejected it. A timeout is neither, so it stays.
 */

export interface LineProblem {
  code: "OUT_OF_STOCK" | "QUANTITY_OUT_OF_RANGE" | "REJECTED";
  /** What is actually left, when the server told us. */
  available?: number;
  /** Kept so a rejected add can still be named after its line has gone. */
  title: string;
}

interface CartState {
  /** The last cart the server acknowledged. */
  server: CartResponse | null;
  /** Mutations the server has not acknowledged, oldest first. */
  queue: PendingMutation[];
  /** Variants the shopper has to deal with before checkout. */
  problems: Record<string, LineProblem>;
  syncing: boolean;
  /** False until `localStorage` has been read, to avoid a hydration mismatch. */
  hydrated: boolean;

  /** Called once persisted state has been read back. */
  markHydrated: () => void;
  add: (input: AddInput) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  clearProblem: (variantId: string) => void;
  /** Reads server truth without touching the queue. */
  refresh: () => Promise<void>;
  /** Drains the queue in order, then reconciles. */
  sync: () => Promise<void>;
  reset: () => void;
}

export interface AddInput {
  variantId: string;
  quantity?: number;
  attribution?: Attribution;
  preview: CartLinePreview;
}

function newMutationId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `cm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Sends one queued mutation and returns the cart the server replies with. */
async function sendMutation(mutation: PendingMutation): Promise<CartResponse> {
  switch (mutation.kind) {
    case "add":
      return (
        await apiRequest<CartResponse>("/cart/lines", {
          method: "POST",
          body: JSON.stringify({
            variantId: mutation.variantId,
            quantity: mutation.delta,
            attribution: mutation.attribution,
            clientMutationId: mutation.id,
          }),
        })
      ).data;

    case "set":
      return (
        await apiRequest<CartResponse>(`/cart/lines/${mutation.variantId}`, {
          method: "PATCH",
          body: JSON.stringify({ quantity: mutation.quantity, clientMutationId: mutation.id }),
        })
      ).data;

    case "remove":
      return (
        await apiRequest<CartResponse>(
          `/cart/lines/${mutation.variantId}?clientMutationId=${encodeURIComponent(mutation.id)}`,
          { method: "DELETE" }
        )
      ).data;
  }
}

function problemFor(error: ApiRequestError, title: string): LineProblem | null {
  if (error.code === "OUT_OF_STOCK") {
    const details = error.details as { available?: number } | undefined;
    return {
      code: "OUT_OF_STOCK",
      ...(typeof details?.available === "number" ? { available: details.available } : {}),
      title,
    };
  }
  if (error.code === "QUANTITY_OUT_OF_RANGE") return { code: "QUANTITY_OUT_OF_RANGE", title };
  // A line that is already gone is not a problem; a replayed remove is a no-op.
  if (error.code === "NOT_FOUND" || error.code === "VARIANT_NOT_FOUND") return null;
  return { code: "REJECTED", title };
}

function titleOf(mutation: PendingMutation, state: CartState): string {
  if (mutation.kind === "add") return mutation.preview.productTitle;
  const line = state.server?.lines.find((entry) => entry.variantId === mutation.variantId);
  return line?.productTitle ?? mutation.variantId;
}

/** One drain at a time, process-wide: two concurrent loops would double-send. */
let draining: Promise<void> | null = null;

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      server: null,
      queue: [],
      problems: {},
      syncing: false,
      hydrated: false,

      markHydrated: () => set({ hydrated: true }),

      add: (input) => {
        const mutation: PendingMutation = {
          kind: "add",
          id: newMutationId(),
          variantId: input.variantId,
          delta: input.quantity ?? 1,
          attribution: input.attribution ?? {},
          preview: input.preview,
          at: new Date().toISOString(),
        };
        set((state) => ({
          queue: enqueue(state.queue, mutation, state.syncing ? 1 : 0),
          // A fresh add is the shopper's answer to whatever was wrong before.
          problems: withoutKey(state.problems, input.variantId),
        }));
        // Reported from here rather than from each button, so an add can never
        // happen without being counted.
        track("add_to_cart", {
          variantId: input.variantId,
          productId: input.preview.productId,
          vendorId: input.preview.vendor.id,
          value: input.preview.unitPrice.amount,
          ...(input.attribution?.storyId ? { storyId: input.attribution.storyId } : {}),
          ...(input.attribution?.creatorId ? { creatorId: input.attribution.creatorId } : {}),
        });
        void get().sync();
      },

      setQuantity: (variantId, quantity) => {
        const mutation: PendingMutation = {
          kind: "set",
          id: newMutationId(),
          variantId,
          quantity,
          at: new Date().toISOString(),
        };
        set((state) => ({
          queue: enqueue(state.queue, mutation, state.syncing ? 1 : 0),
          problems: withoutKey(state.problems, variantId),
        }));
        void get().sync();
      },

      remove: (variantId) => {
        const mutation: PendingMutation = {
          kind: "remove",
          id: newMutationId(),
          variantId,
          at: new Date().toISOString(),
        };
        set((state) => ({
          queue: enqueue(state.queue, mutation, state.syncing ? 1 : 0),
          problems: withoutKey(state.problems, variantId),
        }));
        void get().sync();
      },

      clearProblem: (variantId) =>
        set((state) => ({ problems: withoutKey(state.problems, variantId) })),

      refresh: async () => {
        try {
          const cart = await apiGet<CartResponse>("/cart");
          // Only adopt server truth when nothing local is outstanding, or the
          // reply would wipe optimistic lines that are still on their way.
          if (get().queue.length === 0) set({ server: cart });
        } catch {
          // Offline or failing: the projection keeps working from what we have.
        }
      },

      sync: async () => {
        if (typeof navigator !== "undefined" && navigator.onLine === false) return;
        if (draining) return draining;

        draining = (async () => {
          set({ syncing: true });
          try {
            while (get().queue.length > 0) {
              const mutation = get().queue[0];
              if (!mutation) break;

              try {
                const cart = await sendMutation(mutation);
                set((state) => ({
                  server: cart,
                  queue: state.queue.filter((entry) => entry.id !== mutation.id),
                }));
              } catch (error) {
                if (!(error instanceof ApiRequestError) || error.isRetryable) {
                  // Unknown outcome or transport trouble: stop, keep the queue,
                  // and let the next online event or user action try again.
                  return;
                }
                // A definite rejection. Drop it, and make sure it is visible —
                // a mutation that fails must not silently disappear.
                const problem = problemFor(error, titleOf(mutation, get()));
                set((state) => ({
                  queue: state.queue.filter((entry) => entry.id !== mutation.id),
                  problems: problem
                    ? { ...state.problems, [mutation.variantId]: problem }
                    : state.problems,
                }));
              }
            }

            // A replayed mutation returns the response the server sent the first
            // time, which can be an older snapshot. Once the queue is empty, ask
            // for the truth.
            await get().refresh();
          } finally {
            set({ syncing: false });
            draining = null;
          }
        })();

        return draining;
      },

      reset: () => set({ server: null, queue: [], problems: {} }),
    }),
    {
      name: "aumbram.cart.v1",
      storage: createJSONStorage(() => localStorage),
      // `syncing` and `hydrated` are about this tab, not about the cart.
      partialize: (state) => ({
        server: state.server,
        queue: state.queue,
        problems: state.problems,
      }),
      /**
       * Flipped once localStorage has been read. Anything that renders a count
       * waits for it, so the server render and the first client render agree.
       *
       * This goes through the hydrated state's own action rather than
       * `useCartStore.setState`: localStorage is synchronous, so zustand
       * rehydrates while `create()` is still running and the exported binding is
       * in its temporal dead zone.
       */
      onRehydrateStorage: () => (state) => {
        state?.markHydrated();
      },
    }
  )
);

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

// ---------------------------------------------------------------- selectors

export function selectCart(state: CartState): ProjectedCart {
  if (!state.hydrated) return EMPTY_CART;
  return projectCart(state.server, state.queue);
}

export function selectPendingCount(state: CartState): number {
  return state.queue.length;
}

export function selectProblems(state: CartState): Record<string, LineProblem> {
  return state.problems;
}

export function selectHasProblems(state: CartState): boolean {
  return Object.keys(state.problems).length > 0;
}
