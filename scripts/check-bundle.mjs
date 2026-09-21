#!/usr/bin/env node
/**
 * First-load JS budget check (FE-E-19).
 *
 * Reads the production build's `app-build-manifest.json`, which lists exactly the
 * chunks a route loads on first paint (layout chunks included), gzips each one at
 * level 9 and adds them up. This is the same set Next's own "First Load JS"
 * column reports, so the two numbers can be compared directly.
 *
 * `polyfillFiles` is excluded on purpose: that bundle carries `nomodule`, so no
 * browser with module support ever downloads it. Including it would add ~39 KB to
 * every route and measure a phone nobody in the target market is using.
 *
 *   node scripts/check-bundle.mjs              # report
 *   node scripts/check-bundle.mjs --strict     # exit 1 when a route is over budget
 *   node scripts/check-bundle.mjs --json       # machine-readable, for CI
 *
 * Requires a completed `npm run build`.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const strict = process.argv.includes("--strict");
const asJson = process.argv.includes("--json");

/** Budgets in KB, gzipped. The first three are the assignment's. */
const ROUTES = [
  { manifestKey: "/page", label: "/", budgetKb: 180 },
  { manifestKey: "/stories/[storyId]/page", label: "/stories/[storyId]", budgetKb: 200 },
  { manifestKey: "/checkout/page", label: "/checkout", budgetKb: 190 },
  { manifestKey: "/cart/page", label: "/cart", budgetKb: 190 },
  { manifestKey: "/orders/confirmation/page", label: "/orders/confirmation", budgetKb: 190 },
];

const manifestPath = join(root, ".next", "app-build-manifest.json");
if (!existsSync(manifestPath)) {
  console.error("No production build found. Run `npm run build` first.");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const gzipCache = new Map();
function gzippedBytes(relativePath) {
  const cached = gzipCache.get(relativePath);
  if (cached !== undefined) return cached;
  const absolute = join(root, ".next", relativePath);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    gzipCache.set(relativePath, 0);
    return 0;
  }
  const size = gzipSync(readFileSync(absolute), { level: 9 }).byteLength;
  gzipCache.set(relativePath, size);
  return size;
}

const results = ROUTES.map((route) => {
  const files = manifest.pages?.[route.manifestKey];
  if (!files) return { ...route, present: false, bytes: 0, chunks: 0 };
  const scripts = files.filter((file) => file.endsWith(".js"));
  const bytes = scripts.reduce((sum, file) => sum + gzippedBytes(file), 0);
  return { ...route, present: true, bytes, chunks: scripts.length };
});

if (asJson) {
  console.log(JSON.stringify(results, null, 2));
} else {
  const pad = (value, width) => String(value).padEnd(width);
  const padStart = (value, width) => String(value).padStart(width);
  console.log("");
  console.log(
    `${pad("route", 24)}${padStart("first-load JS", 14)}${padStart("budget", 10)}${padStart("headroom", 11)}  status`
  );
  console.log("-".repeat(72));
  for (const result of results) {
    if (!result.present) {
      console.log(
        `${pad(result.label, 24)}${padStart("—", 14)}${padStart(`${result.budgetKb} KB`, 10)}${padStart("—", 11)}  not built yet`
      );
      continue;
    }
    const kb = result.bytes / 1024;
    console.log(
      pad(result.label, 24) +
        padStart(`${kb.toFixed(1)} KB`, 14) +
        padStart(`${result.budgetKb} KB`, 10) +
        padStart(`${(result.budgetKb - kb).toFixed(1)} KB`, 11) +
        `  ${kb > result.budgetKb ? "OVER" : "ok"}`
    );
  }
  console.log("");
}

const over = results.filter((result) => result.present && result.bytes / 1024 > result.budgetKb);
if (over.length > 0 && strict) {
  console.error(`Over budget: ${over.map((result) => result.label).join(", ")}`);
  process.exit(1);
}
