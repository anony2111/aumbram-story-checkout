import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { addToCart, FIXTURE, resetBackend } from "./support/mock-backend";

/**
 * Smoke coverage for the feed and the BottomSheet.
 *
 * The critical-path journeys live in their own specs; this one guards the two
 * things everything else stands on — that the feed server-renders, and that the
 * sheet opens, picks a variant and adds a line.
 */

test.beforeEach(async ({ request }) => {
  await resetBackend(request);
});

/**
 * The first card whose product has several variants, so quick-add has to open
 * the picker. Found rather than hard-coded: which products land on feed page one
 * is the generator's business, not this test's.
 */
async function firstCardNeedingPicker(page: Page) {
  const button = page.locator('[data-testid="quick-add"][data-picker="true"]').first();
  await button.scrollIntoViewIfNeeded();
  const productId = await button
    .locator("xpath=ancestor::article[@data-product-id]")
    .getAttribute("data-product-id");
  return { button, productId };
}

test("the feed server-renders its cards before any JavaScript runs", async ({ request }) => {
  const response = await request.get("/");
  const html = await response.text();

  // The assignment's requirement: `curl /` contains the first cards' titles.
  expect(html).toContain("Small-batch Masala Chai Mix");
  expect(html).toContain("Behind the loom with the artisans");
  // Items 7+ stream in behind a Suspense boundary, so they are in the document too.
  expect(html.match(/data-testid="product-card"/g)?.length ?? 0).toBeGreaterThan(5);
});

test("the product sheet picks a variant and adds a line with no story attribution", async ({
  page,
  request,
}) => {
  await page.goto("/");

  const { button, productId } = await firstCardNeedingPicker(page);
  expect(productId).toBeTruthy();
  await button.click();

  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute("aria-modal", "true");
  await expect(sheet).toHaveAccessibleName(/\S/);

  await sheet.getByTestId("sheet-add-to-cart").click();
  await expect(page.getByTestId("cart-badge")).toHaveText("1");

  const cart = await (await request.get("/api/v1/cart")).json();
  expect(cart.lines).toHaveLength(1);
  expect(cart.lines[0].productId).toBe(productId);
  // Added from a plain feed card, so there is no story to attribute it to.
  expect(cart.lines[0].attribution).toEqual({});
});

test("Escape closes the sheet and returns focus to the button that opened it", async ({ page }) => {
  await page.goto("/");

  const { button } = await firstCardNeedingPicker(page);
  await button.click();

  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(button).toBeFocused();
});

test("the header badge reflects a cart built outside the page", async ({ page, request }) => {
  await addToCart(request, FIXTURE.basket.variantId, {
    storyId: FIXTURE.storyId,
    creatorId: FIXTURE.creatorId,
  });
  await addToCart(request, FIXTURE.dhurrie.variantId);

  await page.goto("/");
  await expect(page.getByTestId("cart-badge")).toHaveText("2");
});
