# INP

Measured 2026-09-21 against `next start`, Chromium at a
4x CPU slowdown through CDP, 393x851 at 2x DPR.

Collected from `PerformanceObserver` `event` entries carrying an `interactionId`.
Over a handful of deliberate taps the 98th percentile is the worst one, so the
worst is what is reported.

Regenerate with `npm run build && npm run perf:inp`. Budget: < 200 ms.

| Interaction | Interactions measured | Worst | Median | Budget |
|---|---|---|---|---|
| story tap-next | 24 | 56 ms | 24 ms | < 200 ms (ok) |
| quick-add | 18 | 96 ms | 56 ms | < 200 ms (ok) |
