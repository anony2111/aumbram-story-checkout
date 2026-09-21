import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import { addToCart, FIXTURE, resetBackend } from "./support/mock-backend";

/**
 * The cart, and the offline mutation queue underneath it.
 *
 * The scenario the brief describes — add something while offline, come back, end
 * up consistent — is the one that decides whether a shopper on a train loses
 * their basket, so it is tested against the real production build rather than
 * reasoned about.
 */

test.beforeEach(async ({ request }) => {
  await resetBackend(request);
});

async function serverCart(request: APIRequestContext) {
  return (await request.get("/api/v1/cart")).json();
}

/** Opens the fixture story and waits for its first frame. */
async function openStory(page: Page) {
  await page.goto(`/stories/${FIXTURE.storyId}`);
  await expect(page.getByTestId("story-frame")).toBeVisible();
}

test("groups lines by seller and keeps the story each came from", async ({ page, request }) => {
  await addToCart(request, FIXTURE.basket.variantId, {
    storyId: FIXTURE.storyId,
    creatorId: FIXTURE.creatorId,
  });
  await addToCart(request, FIXTURE.dhurrie.variantId);

  await page.goto("/cart");
  await expect(page.getByTestId("cart-line")).toHaveCount(2);

  // One group per vendor, which is one order per vendor at checkout.
  await expect(page.locator(`[data-vendor-id="${FIXTURE.vendors.kolkataLooms}"]`)).toBeVisible();
  await expect(page.locator(`[data-vendor-id="${FIXTURE.vendors.jaipurKala}"]`)).toBeVisible();

  const attributed = page.locator('[data-testid="cart-line-attribution"]');
  await expect(attributed).toHaveCount(1);
  await expect(attributed).toHaveAttribute("data-story-id", FIXTURE.storyId);
  await expect(attributed).toHaveAttribute("data-creator-id", FIXTURE.creatorId);
});

test("the stepper respects the shelf, and remove empties the cart", async ({ page, request }) => {
  // var_00576 has three in stock, so the stepper must stop at three.
  await addToCart(request, FIXTURE.basket.variantId);
  await page.goto("/cart");

  const increase = page.getByTestId("cart-increase");
  await increase.click();
  await increase.click();
  await expect(increase).toBeDisabled();
  await expect(page.getByTestId("cart-subtotal")).toHaveText("₹8,097");

  await expect.poll(async () => (await serverCart(request)).itemCount).toBe(3);

  await page.getByTestId("cart-remove").click();
  await expect(page.getByTestId("cart-line")).toHaveCount(0);
  await expect.poll(async () => (await serverCart(request)).lines.length).toBe(0);
});

test("an add taken offline is kept, shown as pending, and replayed on reconnect", async ({
  page,
  context,
  request,
}) => {
  await addToCart(request, FIXTURE.basket.variantId);
  await page.goto("/cart");
  await expect(page.getByTestId("cart-line")).toHaveCount(1);

  // Into the tunnel, mid-story.
  await openStory(page);
  await context.setOffline(true);

  const box = (await page.getByTestId("story-viewer").boundingBox())!;
  await page.mouse.click(box.width * 0.75, box.height * 0.5);
  await expect(page.getByTestId("story-frame")).toHaveAttribute("data-segment-index", "1");

  await page
    .locator(`[data-testid="story-hotspot"][data-product-id="${FIXTURE.dhurrie.productId}"]`)
    .click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await sheet.getByTestId("sheet-add-to-cart").click();

  // Applied locally straight away, even though nothing has been sent.
  await expect(page.getByTestId("cart-badge")).toHaveText("2");
  await page.keyboard.press("Escape");

  // The server has not heard about it.
  const offlineServerCart = await serverCart(request);
  expect(offlineServerCart.lines).toHaveLength(1);

  await context.setOffline(false);

  // On reconnect the queue replays in order and the server catches up exactly.
  await expect.poll(async () => (await serverCart(request)).lines.length, { timeout: 15_000 }).toBe(2);

  await page.goto("/cart");
  await expect(page.getByTestId("cart-line")).toHaveCount(2);
  await expect(page.getByTestId("pending-banner")).toHaveCount(0);

  const finalCart = await serverCart(request);
  const dhurrie = finalCart.lines.find(
    (line: { variantId: string }) => line.variantId === FIXTURE.dhurrie.variantId
  );
  // And the attribution survived the whole round trip.
  expect(dhurrie.attribution).toEqual({
    storyId: FIXTURE.storyId,
    creatorId: FIXTURE.creatorId,
  });
});

test("a queued mutation survives a reload and still reaches the server", async ({
  page,
  request,
}) => {
  await addToCart(request, FIXTURE.basket.variantId);

  // The document still loads, but cart writes cannot get through — the shape of
  // a flaky connection rather than a flight-mode switch. (A cold start with no
  // network at all needs the service-worker app shell, which is a stretch goal
  // and is not built.)
  await page.route("**/api/v1/cart/lines**", (route) => route.abort("connectionfailed"));

  await page.goto("/cart");
  await expect(page.getByTestId("cart-line")).toHaveCount(1);

  await page.getByTestId("cart-increase").click();
  await expect(page.getByTestId("pending-banner")).toBeVisible();
  await expect(page.getByTestId("cart-line-pending")).toBeVisible();

  await page.reload();
  // The queue came back out of localStorage, so the optimistic quantity is still there.
  await expect(page.getByTestId("pending-banner")).toBeVisible();
  await expect(page.getByTestId("cart-subtotal")).toHaveText("₹5,398");
  expect((await serverCart(request)).itemCount).toBe(1);

  await page.unroute("**/api/v1/cart/lines**");
  await page.reload();

  await expect(page.getByTestId("pending-banner")).toHaveCount(0);
  await expect.poll(async () => (await serverCart(request)).itemCount, { timeout: 15_000 }).toBe(2);
});

test("a rejected mutation is surfaced and blocks checkout until it is dealt with", async ({
  page,
  request,
}) => {
  await addToCart(request, FIXTURE.basket.variantId);
  // A second line from another seller, so removing the flagged one still leaves
  // a cart to check out.
  await addToCart(request, FIXTURE.dhurrie.variantId);
  await page.goto("/cart");
  await expect(page.getByTestId("cart-line")).toHaveCount(2);

  // The shelf emptied between the shopper adding and the change reaching us.
  await page.route("**/api/v1/cart/lines/*", (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "OUT_OF_STOCK",
          message: "Not enough stock left",
          details: { variantId: FIXTURE.basket.variantId, available: 1 },
        },
      }),
    })
  );

  const flagged = page.locator(
    `[data-testid="cart-line"][data-variant-id="${FIXTURE.basket.variantId}"]`
  );
  await flagged.getByTestId("cart-increase").click();

  // It does not vanish quietly: the line is marked and checkout is barred.
  await expect(page.getByTestId("cart-line-problem")).toBeVisible();
  await expect(page.getByTestId("cart-problems")).toBeVisible();
  await expect(page.getByTestId("go-to-checkout")).toHaveCount(0);

  // Dealing with the line is what clears it. The quantity is back at 1, so the
  // only move left is to drop it — which is exactly the choice a shopper has when
  // the last one has gone.
  await page.unroute("**/api/v1/cart/lines/*");
  await flagged.getByTestId("cart-remove").click();
  await expect(page.getByTestId("cart-line-problem")).toHaveCount(0);
  await expect(page.getByTestId("cart-line")).toHaveCount(1);
  await expect(page.getByTestId("go-to-checkout")).toBeVisible();
});

test("the offline banner appears and order placement is barred while offline", async ({
  page,
  context,
  request,
}) => {
  await addToCart(request, FIXTURE.basket.variantId);
  await page.goto("/cart");

  await context.setOffline(true);
  await expect(page.getByTestId("offline-banner")).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByTestId("offline-banner")).toHaveCount(0);
});
