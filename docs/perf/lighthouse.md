# Lighthouse

Measured 2026-09-21 against `next start`, Lighthouse mobile
(412x823, 4x CPU slowdown, Slow 4G: 1.6 Mbps / 150 ms RTT).
Median of 5 runs per route. Regenerate with `npm run build && npm run perf:lighthouse`.

| Route | LCP | budget | CLS | budget | TBT | FCP | Perf score |
|---|---|---|---|---|---|---|---|
| `/` | 3468 ms | < 2500 ms (OVER) | 0.000 | < 0.1 (ok) | 305 ms | 1067 ms | 84 |
| `/stories/[storyId]` | 1348 ms | < 2500 ms (ok) | 0.000 | < 0.1 (ok) | 439 ms | 878 ms | 89 |

## Every run

| Route | Run | LCP | CLS | TBT |
|---|---|---|---|---|
| `/` | 1 | 3049 ms | 0.000 | 416 ms |
| `/` | 2 | 4011 ms | 0.000 | 360 ms |
| `/` | 3 | 3468 ms | 0.000 | 275 ms |
| `/` | 4 | 3905 ms | 0.000 | 305 ms |
| `/` | 5 | 2721 ms | 0.000 | 206 ms |
| `/stories/[storyId]` | 1 | 1348 ms | 0.000 | 535 ms |
| `/stories/[storyId]` | 2 | 1181 ms | 0.000 | 439 ms |
| `/stories/[storyId]` | 3 | 1787 ms | 0.000 | 577 ms |
| `/stories/[storyId]` | 4 | 1084 ms | 0.000 | 328 ms |
| `/stories/[storyId]` | 5 | 1915 ms | 0.000 | 403 ms |
