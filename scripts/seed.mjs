#!/usr/bin/env node
/**
 * Generates the mock dataset into mock-data/out/ if it isn't there yet.
 *
 * Runs before dev/build/test so a clean clone needs one command. The generator is
 * deterministic for a given seed, so reviewers get byte-identical fixtures.
 * `--events 0` skips the large events.csv, which no frontend surface reads.
 *
 * Pass --force to regenerate.
 */
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "mock-data", "out");
const generator = join(root, "mock-data", "generate.mjs");

const force = process.argv.includes("--force");
const REQUIRED = [
  "feed.json",
  "stories.json",
  "products.json",
  "vendors.json",
  "creators.json",
  "live-updates.jsonl",
];

if (force && existsSync(outDir)) {
  rmSync(outDir, { recursive: true, force: true });
}

const complete = REQUIRED.every((file) => existsSync(join(outDir, file)));
if (complete) {
  console.log("[seed] mock-data/out is present, skipping generation (use --force to regenerate)");
  process.exit(0);
}

console.log("[seed] generating mock data into mock-data/out …");
const result = spawnSync(
  process.execPath,
  [generator, "--out", outDir, "--events", "0"],
  { stdio: "inherit", cwd: root }
);

if (result.status !== 0) {
  console.error("[seed] generation failed");
  process.exit(result.status ?? 1);
}
console.log("[seed] done");
