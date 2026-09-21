#!/usr/bin/env node
/**
 * Lighthouse runs against the production build, on the device profile the brief
 * describes: a throttled mid-range Android on Slow 4G.
 *
 * Three runs per route, median reported — a single Lighthouse run is noisy
 * enough that one number is not evidence of anything.
 *
 *   npm run build
 *   npm run perf:lighthouse
 *
 * Writes docs/perf/lighthouse.json and docs/perf/lighthouse.md. Chrome comes
 * from the Playwright install, so there is nothing extra to set up.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PERF_PORT ?? 3120);
const BASE = `http://127.0.0.1:${PORT}`;
const RUNS = Number(process.env.PERF_RUNS ?? 3);

const ROUTES = [
  { path: "/", label: "/" },
  { path: "/stories/sty_0022", label: "/stories/[storyId]" },
];

/** Budgets from FE-E-19, in the units Lighthouse reports. */
const BUDGETS = { LCP: 2500, CLS: 0.1 };

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base =
    process.platform === "win32"
      ? join(process.env.LOCALAPPDATA ?? "", "ms-playwright")
      : process.platform === "darwin"
        ? join(process.env.HOME ?? "", "Library", "Caches", "ms-playwright")
        : join(process.env.HOME ?? "", ".cache", "ms-playwright");
  if (!existsSync(base)) return undefined;
  const chromium = readdirSync(base).find((entry) => entry.startsWith("chromium-"));
  if (!chromium) return undefined;
  // Playwright's folder layout differs by version and platform, so every shape
  // it has used is tried rather than guessed at.
  const candidates = [
    join(base, chromium, "chrome-win64", "chrome.exe"),
    join(base, chromium, "chrome-win", "chrome.exe"),
    join(base, chromium, "chrome-linux", "chrome"),
    join(base, chromium, "chrome-linux64", "chrome"),
    join(base, chromium, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
    join(base, chromium, "chrome-mac-arm64", "Chromium.app", "Contents", "MacOS", "Chromium"),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

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

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

const chromePath = findChrome();
if (!chromePath) {
  console.error("No Chrome found. Run `npm run e2e:install`, or set CHROME_PATH.");
  process.exit(1);
}

const { default: lighthouse } = await import("lighthouse");
const chromeLauncher = await import("chrome-launcher");

const server = startServer();
const results = [];

try {
  if (!(await waitForServer())) {
    console.error(`Production server did not start on ${BASE}`);
    process.exit(1);
  }

  // The debug latency profile would be measured as if it were the network.
  await fetch(`${BASE}/api/v1/debug`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "settings",
      settings: { latencyProfile: "off", failureRate: 0, liveUpdatesEnabled: false },
    }),
  });

  const chrome = await chromeLauncher.launch({
    chromePath,
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"],
  });

  try {
    for (const route of ROUTES) {
      const runs = [];
      for (let run = 1; run <= RUNS; run += 1) {
        process.stdout.write(`  ${route.label} run ${run}/${RUNS}… `);
        const result = await lighthouse(
          BASE + route.path,
          { port: chrome.port, output: "json", logLevel: "error" },
          {
            extends: "lighthouse:default",
            settings: {
              onlyCategories: ["performance"],
              // Lighthouse's own mobile profile: 4x CPU slowdown, Slow 4G.
              formFactor: "mobile",
              screenEmulation: {
                mobile: true,
                width: 412,
                height: 823,
                deviceScaleFactor: 1.75,
                disabled: false,
              },
              throttling: {
                rttMs: 150,
                throughputKbps: 1638.4,
                cpuSlowdownMultiplier: 4,
                requestLatencyMs: 150 * 3.75,
                downloadThroughputKbps: 1638.4,
                uploadThroughputKbps: 675,
              },
            },
          }
        );

        const audits = result.lhr.audits;
        runs.push({
          LCP: audits["largest-contentful-paint"].numericValue,
          CLS: audits["cumulative-layout-shift"].numericValue,
          TBT: audits["total-blocking-time"].numericValue,
          FCP: audits["first-contentful-paint"].numericValue,
          TTFB: audits["server-response-time"].numericValue,
          score: (result.lhr.categories.performance.score ?? 0) * 100,
        });
        console.log("done");
      }

      results.push({
        route: route.label,
        runs,
        median: {
          LCP: median(runs.map((r) => r.LCP)),
          CLS: median(runs.map((r) => r.CLS)),
          TBT: median(runs.map((r) => r.TBT)),
          FCP: median(runs.map((r) => r.FCP)),
          TTFB: median(runs.map((r) => r.TTFB)),
          score: median(runs.map((r) => r.score)),
        },
      });
    }
  } finally {
    await chrome.kill();
  }
} finally {
  server.kill();
}

const outDir = join(root, "docs", "perf");
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, "lighthouse.json"),
  JSON.stringify({ measuredAt: new Date().toISOString(), runs: RUNS, results }, null, 2) + "\n"
);

const ms = (value) => `${Math.round(value)} ms`;
const lines = [
  "# Lighthouse",
  "",
  `Measured ${new Date().toISOString().slice(0, 10)} against \`next start\`, Lighthouse mobile`,
  "(412x823, 4x CPU slowdown, Slow 4G: 1.6 Mbps / 150 ms RTT).",
  `Median of ${RUNS} runs per route. Regenerate with \`npm run build && npm run perf:lighthouse\`.`,
  "",
  "| Route | LCP | budget | CLS | budget | TBT | FCP | Perf score |",
  "|---|---|---|---|---|---|---|---|",
  ...results.map((entry) => {
    const m = entry.median;
    const lcpOk = m.LCP <= BUDGETS.LCP ? "ok" : "OVER";
    const clsOk = m.CLS <= BUDGETS.CLS ? "ok" : "OVER";
    return `| \`${entry.route}\` | ${ms(m.LCP)} | < 2500 ms (${lcpOk}) | ${m.CLS.toFixed(3)} | < 0.1 (${clsOk}) | ${ms(m.TBT)} | ${ms(m.FCP)} | ${Math.round(m.score)} |`;
  }),
  "",
  "## Every run",
  "",
  "| Route | Run | LCP | CLS | TBT |",
  "|---|---|---|---|---|",
  ...results.flatMap((entry) =>
    entry.runs.map(
      (run, index) =>
        `| \`${entry.route}\` | ${index + 1} | ${ms(run.LCP)} | ${run.CLS.toFixed(3)} | ${ms(run.TBT)} |`
    )
  ),
  "",
];
writeFileSync(join(outDir, "lighthouse.md"), lines.join("\n"));

console.log("");
for (const entry of results) {
  const m = entry.median;
  console.log(
    `${entry.route.padEnd(22)} LCP ${ms(m.LCP).padStart(8)}  CLS ${m.CLS.toFixed(3)}  TBT ${ms(m.TBT).padStart(8)}  score ${Math.round(m.score)}`
  );
}
console.log("\nWrote docs/perf/lighthouse.{json,md}");
