import { z } from "zod";
import { getDataset } from "./dataset";
import { fail } from "./http";
import { stopLiveUpdates } from "./live";
import {
  currentPrice,
  currentStock,
  DEFAULT_DEBUG_SETTINGS,
  getStore,
  resetStore,
  setPrice,
  setStock,
} from "./store";
import type { DebugSettings } from "./store";
import { money } from "@/domain/money";

/**
 * Fault injection, driven by `/__debug`.
 *
 * Reviewers need to reproduce a dropped order response and a mid-checkout price
 * change on demand; so do the e2e tests. The switches live in the same in-memory
 * store as everything else, so "Reset" is one call.
 *
 * Available unless `AUMBRAM_DEBUG=0`. It stays on in the production build on
 * purpose — the e2e suite runs against `next start` and has to drive these. A real
 * deployment would set the flag and drop the route.
 */

export function isDebugEnabled(): boolean {
  return process.env.AUMBRAM_DEBUG !== "0";
}

export function assertDebugEnabled(): void {
  if (!isDebugEnabled()) fail(404, "NOT_FOUND", "Debug endpoints are disabled");
}

/** The fixture variant, used when no cart line is available to bump. */
const FALLBACK_VARIANT_ID = "var_00576";
const PRICE_BUMP_PAISE = 10_000;

export const debugCommandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("settings"),
    settings: z
      .object({
        latencyProfile: z.enum(["off", "fast", "slow4g", "fixed"]).optional(),
        fixedLatencyMs: z.number().int().min(0).max(30_000).optional(),
        failureRate: z.number().min(0).max(1).optional(),
        dropNextOrderResponse: z.boolean().optional(),
        liveUpdatesEnabled: z.boolean().optional(),
      })
      .strict(),
  }),
  z.object({ action: z.literal("reset") }),
  z.object({ action: z.literal("bumpPrice"), variantId: z.string().optional() }),
  z.object({ action: z.literal("setStock"), variantId: z.string(), stock: z.number().int().min(0) }),
]);

export type DebugCommand = z.infer<typeof debugCommandSchema>;

export interface DebugState {
  settings: DebugSettings;
  buildId: string;
  cartLineCount: number;
  orderCount: number;
  idempotencyKeyCount: number;
  stockOverrides: { variantId: string; stock: number }[];
  priceOverrides: { variantId: string; amount: number }[];
  telemetryCount: number;
}

export function readDebugState(): DebugState {
  const store = getStore();
  return {
    settings: { ...store.debug },
    buildId: buildId(),
    cartLineCount: store.cart.size,
    orderCount: store.orders.size,
    idempotencyKeyCount: store.idempotency.size,
    stockOverrides: [...store.stock.entries()].map(([variantId, stock]) => ({ variantId, stock })),
    priceOverrides: [...store.price.entries()].map(([variantId, value]) => ({
      variantId,
      amount: value.amount,
    })),
    telemetryCount: store.telemetry.length,
  };
}

export interface DebugCommandResult {
  state: DebugState;
  message: string;
}

export function applyDebugCommand(command: DebugCommand): DebugCommandResult {
  const store = getStore();

  switch (command.action) {
    case "settings": {
      store.debug = { ...store.debug, ...command.settings };
      if (command.settings.liveUpdatesEnabled === false) stopLiveUpdates();
      return { state: readDebugState(), message: "Settings updated" };
    }

    case "reset": {
      stopLiveUpdates();
      resetStore();
      return { state: readDebugState(), message: "Back to seed state" };
    }

    case "bumpPrice": {
      const variantId =
        command.variantId ?? [...store.cart.keys()][0] ?? FALLBACK_VARIANT_ID;
      const current = currentPrice(variantId);
      if (!current) fail(404, "VARIANT_NOT_FOUND", `Unknown variant ${variantId}`);
      const next = money(current.amount + PRICE_BUMP_PAISE);
      setPrice(variantId, next);
      return {
        state: readDebugState(),
        message: `${variantId} is now ₹${next.amount / 100} (was ₹${current.amount / 100})`,
      };
    }

    case "setStock": {
      if (!getDataset().variants.has(command.variantId)) {
        fail(404, "VARIANT_NOT_FOUND", `Unknown variant ${command.variantId}`);
      }
      setStock(command.variantId, command.stock);
      return {
        state: readDebugState(),
        message: `${command.variantId} stock is now ${currentStock(command.variantId)}`,
      };
    }
  }
}

export { DEFAULT_DEBUG_SETTINGS };

/**
 * Release identifier shown in the footer and attached to RUM and error reports.
 * Set by CI; falls back to "dev" locally.
 */
export function buildId(): string {
  return process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
}
