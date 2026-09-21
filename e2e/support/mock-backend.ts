import type { APIRequestContext, Page } from "@playwright/test";

/**
 * Helpers for driving the mock backend from a test.
 *
 * Every spec starts from seed state with the fault switches off, so one spec
 * cannot leave a 503 rate or a half-full cart behind for the next.
 */

export const FIXTURE = {
  storyId: "sty_0022",
  feedItemId: "fi_0004",
  creatorId: "crt_0008",
  pincode: "751001",
  /** Handcrafted Bamboo Basket, Kolkata Looms, ₹2,699, the only variant. */
  basket: { productId: "prd_0179", variantId: "var_00576", amount: 269_900 },
  /** Upcycled Dhurrie, Jaipur Kala (no COD), ₹1,399, colour Indigo. */
  dhurrie: { productId: "prd_0082", variantId: "var_00305", amount: 139_900 },
  /** Meenakari Nose Pin, Kochi Studio — does not deliver to 751001. */
  nosePin: { productId: "prd_0034", variantId: "var_00121", amount: 159_900 },
  vendors: {
    kolkataLooms: "vnd_0017",
    jaipurKala: "vnd_0023",
    kochiStudio: "vnd_0009",
  },
} as const;

type DebugCommand =
  | { action: "reset" }
  | { action: "settings"; settings: Record<string, unknown> }
  | { action: "bumpPrice"; variantId?: string }
  | { action: "setStock"; variantId: string; stock: number };

export async function debugCommand(
  request: APIRequestContext,
  command: DebugCommand
): Promise<void> {
  const response = await request.post("/api/v1/debug", { data: command });
  if (!response.ok()) {
    throw new Error(`Debug command ${command.action} failed: ${response.status()}`);
  }
}

/**
 * Seed state, no injected latency, no injected failures, and the live replay
 * stopped — a test asserting on stock should not race a background ticker.
 */
export async function resetBackend(request: APIRequestContext): Promise<void> {
  await debugCommand(request, { action: "reset" });
  await debugCommand(request, {
    action: "settings",
    settings: { latencyProfile: "off", failureRate: 0, liveUpdatesEnabled: false },
  });
}

export async function addToCart(
  request: APIRequestContext,
  variantId: string,
  attribution: { storyId?: string; creatorId?: string } = {}
): Promise<void> {
  const response = await request.post("/api/v1/cart/lines", {
    data: {
      variantId,
      quantity: 1,
      attribution,
      clientMutationId: `e2e-${variantId}-${Date.now()}`,
    },
  });
  if (!response.ok()) throw new Error(`Add to cart failed: ${response.status()}`);
}

export async function ordersForKey(
  request: APIRequestContext,
  idempotencyKey: string
): Promise<{ id: string; vendorId: string; attribution: Record<string, string> }[]> {
  const response = await request.get(
    `/api/v1/orders?idempotencyKey=${encodeURIComponent(idempotencyKey)}`
  );
  const body = (await response.json()) as {
    items: { id: string; vendorId: string; attribution: Record<string, string> }[];
  };
  return body.items;
}

/** The app reads the locale from a cookie during the server render. */
export async function setLocale(page: Page, locale: "en" | "hi"): Promise<void> {
  await page.context().addCookies([
    {
      name: "aumbram_locale",
      value: locale,
      url: page.url().startsWith("http") ? new URL(page.url()).origin : "http://127.0.0.1:3100",
    },
  ]);
}
