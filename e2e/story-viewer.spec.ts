import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { FIXTURE, resetBackend } from "./support/mock-backend";

/**
 * The story viewer.
 *
 * Two of these are the assignment's own Given/When/Then scenarios: a hold must
 * freeze and resume without navigating, and time spent in the product sheet must
 * not advance the story.
 */

test.beforeEach(async ({ request }) => {
  await resetBackend(request);
});

/**
 * Elapsed time inside the current segment, read from the progress bar's inline
 * `scaleX`. That value is written by React from the timer state, so it is the
 * state itself rather than an interpolated animation frame.
 */
async function elapsedMs(page: Page, segmentIndex: number, durationMs: number): Promise<number> {
  const style = await page
    .locator(`[data-testid="story-progress-fill"][data-index="${segmentIndex}"]`)
    .getAttribute("style");
  const match = /scaleX\(([\d.]+)\)/.exec(style ?? "");
  return Number(match?.[1] ?? 0) * durationMs;
}

async function currentSegment(page: Page): Promise<number> {
  return Number(await page.getByTestId("story-frame").getAttribute("data-segment-index"));
}

/** Waits for the frame to load, which is when the timer actually starts. */
async function openStory(page: Page): Promise<void> {
  await page.goto(`/stories/${FIXTURE.storyId}`);
  await expect(page.getByTestId("story-frame")).toBeVisible();
  await page.waitForFunction(() => {
    const image = document.querySelector<HTMLImageElement>('[data-testid="story-frame"]');
    return Boolean(image?.complete && image.naturalWidth > 0);
  });
}

test("deep-links, and renders the first frame from server HTML", async ({ page, request }) => {
  const response = await request.get(`/stories/${FIXTURE.storyId}`);
  const html = await response.text();
  expect(html).toContain("Behind the loom with the artisans");

  await openStory(page);
  await expect(page.getByTestId("story-viewer")).toHaveAttribute("data-story-id", FIXTURE.storyId);
  // sty_0022 has four segments, so four bars.
  await expect(page.getByTestId("story-progress-fill")).toHaveCount(4);
});

test("taps navigate: the left third goes back, the rest goes forward", async ({ page }) => {
  await openStory(page);
  expect(await currentSegment(page)).toBe(0);

  const box = (await page.getByTestId("story-viewer").boundingBox())!;
  await page.mouse.click(box.width * 0.75, box.height * 0.5);
  await expect(page.getByTestId("story-frame")).toHaveAttribute("data-segment-index", "1");

  await page.mouse.click(box.width * 0.15, box.height * 0.5);
  await expect(page.getByTestId("story-frame")).toHaveAttribute("data-segment-index", "0");
});

test("a hold freezes progress and resumes from where it froze, without navigating", async ({
  page,
}) => {
  await openStory(page);
  const box = (await page.getByTestId("story-viewer").boundingBox())!;

  // Segment 0 is a 5 s image. Let it run, then press and hold.
  await page.waitForTimeout(1200);
  await page.mouse.move(box.width * 0.5, box.height * 0.5);
  await page.mouse.down();

  // The pause is deliberately 200 ms behind the press, which is what separates a
  // hold from a tap, so the measurement starts once the story has actually stopped.
  await expect(page.getByTestId("story-paused")).toBeVisible();
  const atPause = await elapsedMs(page, 0, 5000);
  expect(atPause).toBeGreaterThan(500);

  await page.waitForTimeout(1000);
  const stillHeld = await elapsedMs(page, 0, 5000);
  // Frozen: the held second is not charged to the segment at all.
  expect(stillHeld).toBe(atPause);

  await page.mouse.up();
  await expect(page.getByTestId("story-paused")).toBeHidden();

  // Released without navigating, and resuming from where it froze.
  expect(await currentSegment(page)).toBe(0);
  const after = await elapsedMs(page, 0, 5000);
  expect(after).toBeGreaterThanOrEqual(stillHeld);
  expect(after - stillHeld).toBeLessThanOrEqual(250);
});

test("the pause control and the keyboard drive the viewer", async ({ page }) => {
  await openStory(page);

  await page.getByTestId("story-pause").click();
  await expect(page.getByTestId("story-paused")).toBeVisible();
  await expect(page.getByTestId("story-pause")).toHaveAttribute("aria-pressed", "true");

  // Space is the same control, per WCAG 2.2.2's "pausable" requirement.
  await page.keyboard.press(" ");
  await expect(page.getByTestId("story-paused")).toBeHidden();

  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("story-frame")).toHaveAttribute("data-segment-index", "1");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("story-frame")).toHaveAttribute("data-segment-index", "0");
});

test("preloads the next segment and nothing beyond it", async ({ page, request }) => {
  const story = await (await request.get(`/api/v1/stories/${FIXTURE.storyId}`)).json();
  const frameUrl = (index: number) => {
    const segment = story.story.segments[index];
    return segment.type === "video" ? (segment.posterUrl ?? segment.url) : segment.url;
  };

  await openStory(page);

  const preloaded = async () =>
    page.locator('link[rel="preload"][as="image"]').evaluateAll((links) =>
      links.map((link) => (link as HTMLLinkElement).href)
    );

  await expect
    .poll(async () => (await preloaded()).includes(frameUrl(1)))
    .toBe(true);
  // Segment 2 is two frames away and must not have been fetched yet.
  expect(await preloaded()).not.toContain(frameUrl(2));
});

test("a hotspot opens the product sheet, and the story keeps its place", async ({
  page,
  request,
}) => {
  await openStory(page);

  // Segment 1 carries the Upcycled Dhurrie from Jaipur Kala.
  const box = (await page.getByTestId("story-viewer").boundingBox())!;
  await page.mouse.click(box.width * 0.75, box.height * 0.5);
  await expect(page.getByTestId("story-frame")).toHaveAttribute("data-segment-index", "1");
  await page.waitForTimeout(1200);

  const hotspot = page.locator(
    `[data-testid="story-hotspot"][data-product-id="${FIXTURE.dhurrie.productId}"]`
  );
  await expect(hotspot).toBeVisible();
  // The dot is not the whole story: a screen reader gets the product and price.
  await expect(hotspot).toHaveAccessibleName(/Upcycled Dhurrie, ₹1,399/);
  await hotspot.click();

  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId("story-paused")).toBeVisible();

  const atPause = await elapsedMs(page, 1, 5000);
  expect(atPause).toBeGreaterThan(300);

  // Spend real time choosing, as a shopper would.
  await page.waitForTimeout(2500);
  const whilePaused = await elapsedMs(page, 1, 5000);
  // Not a millisecond of those 2.5 s is charged to the story.
  expect(whilePaused).toBe(atPause);

  await sheet.getByRole("button", { name: "Indigo", exact: true }).click();
  await sheet.getByTestId("sheet-add-to-cart").click();
  await expect(page.getByTestId("cart-badge")).toHaveText("1");

  // Escape closes the sheet, Space stops the clock again straight away. Without
  // that second key the story is genuinely playing while Playwright waits out the
  // sheet's exit transition, and the reading would measure the wait rather than
  // the resume point.
  await page.keyboard.press("Escape");
  await page.keyboard.press(" ");
  const afterClose = await elapsedMs(page, 1, 5000);
  await expect(sheet).toBeHidden();

  // Same segment, resumed from the same place — the 2.5 s in the sheet is not
  // charged to the story.
  expect(await currentSegment(page)).toBe(1);
  expect(afterClose).toBeGreaterThanOrEqual(whilePaused);
  // Resumes within the 250 ms the brief allows.
  expect(afterClose - whilePaused).toBeLessThanOrEqual(250);

  // And the line carries the story it was discovered through.
  const cart = await (await request.get("/api/v1/cart")).json();
  expect(cart.lines).toHaveLength(1);
  expect(cart.lines[0].variantId).toBe(FIXTURE.dhurrie.variantId);
  expect(cart.lines[0].attribution).toEqual({
    storyId: FIXTURE.storyId,
    creatorId: FIXTURE.creatorId,
  });
});

test("closing returns to the feed at the same scroll position", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, 1200));
  const scrolled = await page.evaluate(() => window.scrollY);
  expect(scrolled).toBeGreaterThan(400);

  await page.locator('[data-testid="story-card"] a').first().click();
  await expect(page.getByTestId("story-viewer")).toBeVisible();

  await page.getByTestId("story-close").click();
  await expect(page.getByTestId("story-viewer")).toBeHidden();
  await expect.poll(async () => page.evaluate(() => window.scrollY)).toBeGreaterThan(400);
});
