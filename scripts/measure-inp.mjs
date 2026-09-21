#!/usr/bin/env node
/**
 * Interaction to Next Paint for the two interactions the brief names: tapping to
 * the next story segment, and quick-add.
 *
 * Measured against the production build with the CPU throttled 4x through CDP,
 * which is the device assumption the whole brief is written around.
 *
 * INP is normally the 98th percentile of a session's interactions. Over a
 * handful of deliberate taps the 98th percentile *is* the worst one, so the
 * worst is what gets reported — it is the conservative reading either way.
 *
 *   npm run build
 *   npm run perf:inp
 *
 * Writes docs/perf/inp.md.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.INP_PORT ?? 3130);
const BASE = `http://127.0.0.1:${PORT}`;
const CPU_THROTTLE = 4;
const BUDGET_MS = 200;

function startServer() {
  const child = spawn(
    process.execPath,
    [join(root, "node_modules", "next", "dist", "bin", "next"), "start", "--port", String(PORT)],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"] }
  );
  child.stdout.resume();
  child.stderr.resume();
  return child;
}

async function waitForServer(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${BASE}/api/v1/debug`)).ok) return true;
    } catch {
      // not yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

/** Every event entry that belongs to a real interaction, largest first. */
const OBSERVER = `
  window.__interactions = [];
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.interactionId) {
        window.__interactions.push({ name: entry.name, duration: entry.duration });
      }
    }
  });
  observer.observe({ type: 'event', buffered: true, durationThreshold: 0 });
`;

async function readWorst(page) {
  return page.evaluate(() => {
    const entries = window.__interactions ?? [];
    if (entries.length === 0) return null;
    const worst = entries.reduce((a, b) => (b.duration > a.duration ? b : a));
    return {
      count: entries.length,
      worst: Math.round(worst.duration),
      worstEvent: worst.name,
      median: Math.round(
        [...entries].sort((a, b) => a.duration - b.duration)[Math.floor(entries.length / 2)]
          .duration
      ),
    };
  });
}

const server = startServer();
const results = [];

try {
  if (!(await waitForServer())) {
    console.error(`Production server did not start on ${BASE}`);
    process.exit(1);
  }

  await fetch(`${BASE}/api/v1/debug`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "settings",
      settings: { latencyProfile: "off", failureRate: 0, liveUpdatesEnabled: false },
    }),
  });

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 393, height: 851 },
      deviceScaleFactor: 2,
      hasTouch: true,
      locale: "en-IN",
      timezoneId: "Asia/Kolkata",
    });

    // ---- story tap-next ------------------------------------------------
    {
      const page = await context.newPage();
      const session = await context.newCDPSession(page);
      await session.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });
      await page.addInitScript(OBSERVER);

      await page.goto(`${BASE}/stories/sty_0022`);
      await page.waitForSelector('[data-testid="story-frame"]');
      const box = await page.locator('[data-testid="story-viewer"]').boundingBox();

      for (let index = 0; index < 8; index += 1) {
        await page.mouse.click(box.width * 0.75, box.height * 0.5);
        await page.waitForTimeout(250);
      }
      await page.waitForTimeout(500);
      results.push({ interaction: "story tap-next", ...(await readWorst(page)) });
      await page.close();
    }

    // ---- quick-add -----------------------------------------------------
    {
      const page = await context.newPage();
      const session = await context.newCDPSession(page);
      await session.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });
      await page.addInitScript(OBSERVER);

      await page.goto(`${BASE}/`);
      // Single-variant cards add straight to the cart; that is the quick-add
      // the budget is about.
      const buttons = page.locator('[data-testid="quick-add"][data-picker="false"]');
      const available = Math.min(await buttons.count(), 6);
      for (let index = 0; index < available; index += 1) {
        const button = buttons.nth(index);
        await button.scrollIntoViewIfNeeded();
        if (await button.isDisabled()) continue;
        await button.click();
        await page.waitForTimeout(300);
      }
      await page.waitForTimeout(500);
      results.push({ interaction: "quick-add", ...(await readWorst(page)) });
      await page.close();
    }

    await context.close();
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
}

const outDir = join(root, "docs", "perf");
mkdirSync(outDir, { recursive: true });

const lines = [
  "# INP",
  "",
  `Measured ${new Date().toISOString().slice(0, 10)} against \`next start\`, Chromium at a`,
  `${CPU_THROTTLE}x CPU slowdown through CDP, 393x851 at 2x DPR.`,
  "",
  "Collected from `PerformanceObserver` `event` entries carrying an `interactionId`.",
  "Over a handful of deliberate taps the 98th percentile is the worst one, so the",
  "worst is what is reported.",
  "",
  `Regenerate with \`npm run build && npm run perf:inp\`. Budget: < ${BUDGET_MS} ms.`,
  "",
  "| Interaction | Interactions measured | Worst | Median | Budget |",
  "|---|---|---|---|---|",
  ...results.map(
    (entry) =>
      `| ${entry.interaction} | ${entry.count ?? 0} | ${entry.worst ?? "—"} ms | ${entry.median ?? "—"} ms | < ${BUDGET_MS} ms (${(entry.worst ?? 0) <= BUDGET_MS ? "ok" : "OVER"}) |`
  ),
  "",
];
writeFileSync(join(outDir, "inp.md"), lines.join("\n"));

console.log("");
for (const entry of results) {
  console.log(
    `${entry.interaction.padEnd(18)} worst ${String(entry.worst ?? "—").padStart(5)} ms  median ${String(entry.median ?? "—").padStart(5)} ms  (${entry.count ?? 0} interactions)`
  );
}
console.log("\nWrote docs/perf/inp.md");
