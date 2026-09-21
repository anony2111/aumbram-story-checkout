"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * The idempotency key's lifecycle.
 *
 * The rule the whole order path rests on: one payload gets one key, and that key
 * is written to storage *before* the request leaves. A reload halfway through a
 * request therefore comes back holding the same key, so the retry asks the server
 * "did you already do this one?" rather than "please do this again".
 *
 * A new key is minted only when the payload's fingerprint changes — after
 * accepting a price change, removing an item, or editing the address.
 *
 * What is stored is a random UUID, a non-reversible digest and some order ids.
 * No address, no phone number: this is `localStorage` on a phone that may be
 * shared.
 */

export interface OrderAttempt {
  key: string;
  /** Digest of the payload this key belongs to. */
  fingerprint: string;
  createdAt: string;
  /** Filled in once the server has confirmed what the key produced. */
  orderIds: string[];
}

interface CheckoutState {
  attempt: OrderAttempt | null;
  hydrated: boolean;
  markHydrated: () => void;
  /** The key for this payload, creating and persisting one if there is none. */
  ensureKey: (fingerprint: string) => string;
  recordOrders: (key: string, orderIds: string[]) => void;
  clearAttempt: () => void;
}

function newKey(): string {
  // Random, never derived from anything about the shopper.
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `key-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export const useCheckoutStore = create<CheckoutState>()(
  persist(
    (set, get) => ({
      attempt: null,
      hydrated: false,

      markHydrated: () => set({ hydrated: true }),

      ensureKey: (fingerprint) => {
        const existing = get().attempt;
        if (existing && existing.fingerprint === fingerprint) return existing.key;

        const attempt: OrderAttempt = {
          key: newKey(),
          fingerprint,
          createdAt: new Date().toISOString(),
          orderIds: [],
        };
        // Synchronous, and therefore on disk before the caller starts fetching.
        set({ attempt });
        return attempt.key;
      },

      recordOrders: (key, orderIds) =>
        set((state) =>
          state.attempt && state.attempt.key === key
            ? { attempt: { ...state.attempt, orderIds } }
            : state
        ),

      clearAttempt: () => set({ attempt: null }),
    }),
    {
      name: "aumbram.checkout.v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ attempt: state.attempt }),
      // Same temporal-dead-zone care as the cart store: go through the state's
      // own action rather than the exported binding.
      onRehydrateStorage: () => (state) => {
        state?.markHydrated();
      },
    }
  )
);
