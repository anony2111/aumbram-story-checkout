import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { addToCart, debugCommand, FIXTURE, ordersForKey, resetBackend } from "./support/mock-backend";

/**
 * Checkout and order placement.
 *
 * Two of these are the journeys the brief asks for by name: the whole path from
 * a story frame to a confirmation carrying the creator's attribution, and the
 * one where the order commits but the response never comes back.
 */

const ADDRESS = {
  name: "Nandini Das",
  phone: "9876543210",
  line1: "Plot 42, Saheed Nagar",
  city: "Bhubaneswar",
  state: "Odisha",
  pincode: FIXTURE.pincode,
};

test.beforeEach(async ({ request }) => {
  await resetBackend(request);
});

async function fillAddress(page: Page, overrides: Partial<typeof ADDRESS> = {}) {
  const values = { ...ADDRESS, ...overrides };
  await page.locator('[data-field="name"]').fill(values.name);
  await page.locator('[data-field="phone"]').fill(values.phone);
  await page.locator('[data-field="line1"]').fill(values.line1);
  await page.locator('[data-field="city"]').fill(values.city);
  await page.locator('[data-field="state"]').fill(values.state);
  await page.locator('[data-field="pincode"]').fill(values.pincode);
}

/** The key the client minted for this attempt, read from its own storage. */
async function idempotencyKey(page: Page): Promise<string> {
  const raw = await page.evaluate(() => localStorage.getItem("aumbram.checkout.v1"));
  expect(raw).toBeTruthy();
  return JSON.parse(raw as string).state.attempt.key as string;
}

test("story to confirmation: the full fixture journey", async ({ page, request }) => {
  // --- feed -> story -------------------------------------------------
  await page.goto("/");
  await page.locator(`[data-story-id="${FIXTURE.storyId}"] a`).first().click();
  await expect(page.getByTestId("story-viewer")).toBeVisible();

  // --- three hotspots, three sellers ---------------------------------
  const box = (await page.getByTestId("story-viewer").boundingBox())!;
  const addFromSegment = async (segmentIndex: number, productId: string) => {
    if (segmentIndex > 0) {
      await page.mouse.click(box.width * 0.75, box.height * 0.5);
      await expect(page.getByTestId("story-frame")).toHaveAttribute(
        "data-segment-index",
        String(segmentIndex)
      );
    }
    await page.getByTestId("story-pause").click();
    await page.locator(`[data-testid="story-hotspot"][data-product-id="${productId}"]`).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await sheet.getByTestId("sheet-add-to-cart").click();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  };

  await addFromSegment(0, FIXTURE.basket.productId);
  await addFromSegment(1, FIXTURE.dhurrie.productId);
  // Kochi Studio, who cannot deliver to 751001.
  await addFromSegment(3, FIXTURE.nosePin.productId);

  await expect(page.getByTestId("cart-badge")).toHaveText("3");

  // --- cart ----------------------------------------------------------
  await page.goto("/cart");
  await expect(page.getByTestId("cart-line")).toHaveCount(3);
  await expect(page.locator('[data-testid="cart-line-attribution"]')).toHaveCount(3);

  await page.getByTestId("go-to-checkout").click();

  // --- checkout ------------------------------------------------------
  await fillAddress(page);

  // Two sellers can deliver, one cannot, and the shopper is told which.
  await expect(page.getByTestId("order-block")).toHaveCount(2);
  const blocked = page.getByTestId("unserviceable-group");
  await expect(blocked).toHaveCount(1);
  await expect(blocked).toContainText("Kochi Studio");

  // Jaipur Kala refuses COD, so COD is off and says so.
  await expect(page.getByTestId("cod-reason")).toContainText(
    "Jaipur Kala doesn't offer Cash on Delivery"
  );

  await expect(page.getByTestId("split-notice")).toContainText("2 sellers");
  await expect(page.getByTestId("payable-total")).toHaveText("₹4,098");

  // Cannot place the order while something undeliverable is in it.
  await expect(page.getByTestId("place-order")).toBeDisabled();
  await page.getByTestId("remove-unserviceable").click();

  await expect(page.getByTestId("unserviceable-group")).toHaveCount(0);
  await expect(page.getByTestId("place-order")).toBeEnabled();
  await expect(page.getByTestId("place-order")).toContainText("₹4,098");

  // --- place ---------------------------------------------------------
  await page.getByTestId("place-order").click();
  await expect(page).toHaveURL(/\/orders\/confirmation/);

  await expect(page.getByTestId("order")).toHaveCount(2);
  await expect(page.getByTestId("confirmation-title")).toContainText("2 orders placed");

  // Both orders carry the creator whose story drove the sale.
  const attributions = page.getByTestId("order-attribution");
  await expect(attributions).toHaveCount(2);
  await expect(attributions.first()).toContainText("@lakshmi.desi7");
  await expect(attributions.first()).toHaveAttribute("data-story-id", FIXTURE.storyId);

  // Timestamps are shown in IST regardless of where the reader is.
  await expect(page.getByTestId("order-placed-at").first()).toContainText("IST");

  // And the server agrees there are exactly two.
  const key = await idempotencyKey(page);
  expect(await ordersForKey(request, key)).toHaveLength(2);
});

test("survives a response that never arrives, without placing a second set of orders", async ({
  page,
  request,
}) => {
  await addToCart(request, FIXTURE.basket.variantId, {
    storyId: FIXTURE.storyId,
    creatorId: FIXTURE.creatorId,
  });
  await addToCart(request, FIXTURE.dhurrie.variantId, {
    storyId: FIXTURE.storyId,
    creatorId: FIXTURE.creatorId,
  });

  await page.goto("/checkout");
  await fillAddress(page);
  await expect(page.getByTestId("place-order")).toBeEnabled();

  // The next POST /orders commits, then never answers.
  await debugCommand(request, {
    action: "settings",
    settings: { dropNextOrderResponse: true },
  });

  const orderRequests: string[] = [];
  page.on("request", (candidate) => {
    if (candidate.method() === "POST" && candidate.url().endsWith("/api/v1/orders")) {
      orderRequests.push(candidate.headers()["idempotency-key"] ?? "");
    }
  });

  await page.getByTestId("place-order").click();
  await expect(page.getByTestId("place-order")).toContainText("Confirming your order…");

  // The retry reuses the key, so the server recognises the repeat.
  await expect(page).toHaveURL(/\/orders\/confirmation/, { timeout: 40_000 });
  await expect(page.getByTestId("order")).toHaveCount(2);

  expect(orderRequests.length).toBeGreaterThan(1);
  expect(new Set(orderRequests).size).toBe(1);

  // The point of the whole exercise: one set of orders, not two.
  const key = await idempotencyKey(page);
  const orders = await ordersForKey(request, key);
  expect(orders).toHaveLength(2);
  expect(orders.map((order) => order.vendorId).sort()).toEqual([
    FIXTURE.vendors.kolkataLooms,
    FIXTURE.vendors.jaipurKala,
  ].sort());
});

test("a double tap produces one request, not two orders", async ({ page, request }) => {
  await addToCart(request, FIXTURE.basket.variantId);
  await page.goto("/checkout");
  await fillAddress(page);
  await expect(page.getByTestId("place-order")).toBeEnabled();

  let posts = 0;
  page.on("request", (candidate) => {
    if (candidate.method() === "POST" && candidate.url().endsWith("/api/v1/orders")) posts += 1;
  });

  const button = page.getByTestId("place-order");
  await button.click({ clickCount: 2, delay: 20 });

  await expect(page).toHaveURL(/\/orders\/confirmation/);
  await expect(page.getByTestId("order")).toHaveCount(1);
  expect(posts).toBe(1);
});

test("a price change must be accepted, and that mints a new key", async ({ page, request }) => {
  await addToCart(request, FIXTURE.basket.variantId);
  await page.goto("/checkout");
  await fillAddress(page);
  await expect(page.getByTestId("place-order")).toBeEnabled();

  // The seller raised the price after the quote was taken.
  await debugCommand(request, { action: "bumpPrice", variantId: FIXTURE.basket.variantId });

  await page.getByTestId("place-order").click();
  await expect(page.getByTestId("price-changed")).toBeVisible();
  const firstKey = await idempotencyKey(page);

  // Nothing was ordered behind the shopper's back.
  expect(await ordersForKey(request, firstKey)).toHaveLength(0);

  await page.getByTestId("accept-new-prices").click();
  await expect(page.getByTestId("payable-total")).toHaveText("₹2,799");

  await page.getByTestId("place-order").click();
  await expect(page).toHaveURL(/\/orders\/confirmation/);

  const secondKey = await idempotencyKey(page);
  // A different payload is a different order, so it gets its own key.
  expect(secondKey).not.toBe(firstKey);
  expect(await ordersForKey(request, secondKey)).toHaveLength(1);
});

test("the address form validates inline and puts the caret in the first bad field", async ({
  page,
  request,
}) => {
  await addToCart(request, FIXTURE.basket.variantId);
  await page.goto("/checkout");

  await page.locator('[data-field="name"]').fill("Nandini Das");
  await page.locator('[data-field="phone"]').fill("5876543210");
  await page.locator('[data-field="pincode"]').fill("751001");
  await page.getByTestId("place-order").click();

  const phoneError = page.getByTestId("error-phone");
  await expect(phoneError).toBeVisible();
  await expect(phoneError).toContainText("valid 10-digit mobile number");

  // The error is announced with the field, not just painted near it.
  const describedBy = await page.locator('[data-field="phone"]').getAttribute("aria-describedby");
  expect(describedBy).toContain(await phoneError.getAttribute("id"));
  await expect(page.locator('[data-field="phone"]')).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator('[data-field="phone"]')).toBeFocused();
});

test("the pincode drives the quote, and a stale answer cannot win", async ({ page, request }) => {
  await addToCart(request, FIXTURE.basket.variantId);
  await page.goto("/checkout");
  await fillAddress(page);
  await expect(page.getByTestId("order-block")).toHaveCount(1);

  // Nobody in the dataset serves Mumbai.
  await page.locator('[data-field="pincode"]').fill("400001");
  await expect(page.getByTestId("unserviceable-group")).toHaveCount(1);
  await expect(page.getByTestId("place-order")).toBeDisabled();

  await page.locator('[data-field="pincode"]').fill(FIXTURE.pincode);
  await expect(page.getByTestId("unserviceable-group")).toHaveCount(0);
  await expect(page.getByTestId("place-order")).toBeEnabled();
});
