# Performance evidence

Everything here is generated against the **production build**, not the dev
server, and regenerated with two commands:

```bash
npm run build
npm run perf:lighthouse    # -> lighthouse.json, lighthouse.md   (~4 min)
npm run perf:inp           # -> inp.md                            (~1 min)
npm run check:bundle       # first-load JS per route              (instant)
```

Chrome comes from the Playwright install, so there is nothing extra to set up.

## Where it landed

| Metric | Budget | Measured | |
|---|---|---|---|
| LCP `/` | < 2500 ms | **3468 ms** | **missed by ~970 ms** |
| LCP `/stories/[storyId]` | < 2500 ms | 1348 ms | ok |
| CLS `/` and the viewer | < 0.1 | **0.000** | ok |
| INP story tap-next | < 200 ms | 56 ms | ok |
| INP quick-add | < 200 ms | 96 ms | ok |
| First-load JS `/` | ≤ 180 KB | 127.8 KB | ok |
| First-load JS `/stories/[storyId]` | ≤ 200 KB | 122.4 KB | ok |
| First-load JS `/checkout` | ≤ 190 KB | 125.0 KB | ok |

`/cart` (111.4 KB) and `/orders/confirmation` (110.9 KB) have no stated budget;
they are checked against 190 KB for consistency.

Details: [`lighthouse.md`](./lighthouse.md), [`inp.md`](./inp.md),
[`lighthouse.json`](./lighthouse.json) for every audit value.

## The miss, and what was done about it

`/` started at **4284 ms**. Three measured changes brought it to 3468 ms:

| Change | Why it helped |
|---|---|
| `experimental.inlineCss` | The stylesheet was a second round trip before anything could paint. At 150 ms RTT that was most of a second of a 2.1 s FCP. FCP is now 1067 ms. |
| Feed image `quality={60}` | Photographs of textiles on a 400-pixel column; invisible at arm's length, about a third off the hero image. |
| `fetchPriority="low"` on non-LCP images | Chrome starts lazy images well before they scroll in. At 1.6 Mbps, six of them were taking bandwidth from the one image LCP waits for. |
| RUM, analytics and the SSE client code-split and mounted on idle | Useful, but none of them are content, and they were competing in the same race. |

**What is left is bandwidth, not JavaScript.** Total Blocking Time is 305 ms and
every route sits 52–78 KB inside its JS budget. The feed simply has more image
bytes above the fold than 1.6 Mbps delivers in 2.5 seconds.

Worth noting from the per-run table: the five runs span 2721–4011 ms. The fastest
run is inside budget. A median of five is the honest number to report, but the
spread says this is a page sitting right at the edge of its bandwidth envelope
rather than one with a structural problem.

## What I would do next, in order

1. **Inline an LQIP placeholder.** The dataset carries an unused `blurhash`
   field. A ~200-byte inline placeholder makes the largest paint happen at parse
   time instead of after a network round trip. Biggest remaining lever, and cheap.
2. **Put images behind a real CDN.** They are proxied from `picsum.photos`
   through our own optimiser on every cold request. Long-lived immutable URLs
   remove an origin hop entirely.
3. **Drop the first flush from six cards to three.** Six was chosen to fill the
   fold; two cover a 412×823 screen. Fewer requests competing during the LCP race.

## Reading these numbers fairly

- **Lighthouse mobile throttling is deliberately pessimistic**: 1.6 Mbps with a
  562 ms effective request latency and a 4× CPU slowdown, applied to a local
  server with no CDN in front of it. It is the right bar for this brief — the
  users being designed for are on exactly this — but it is not a number to
  compare against a production site on a CDN.
- **LCP is noisy.** Hence five runs and a median; a single run is not evidence.
- **INP is the number I would defend hardest**, because it is the device-facing
  one. 56 ms and 96 ms against a 200 ms budget, at a 4× CPU slowdown, come from
  two deliberate choices: the story timer ticks at 100 ms rather than per
  animation frame, and the progress bar interpolates with a compositor-only
  `transform`. Ten React renders a second instead of sixty, on a CPU assumed to
  be four times slower than the one measuring it.
- **CLS is 0.000 on both routes**, which is not luck: no web fonts, so no swap;
  skeletons that reserve the same box as the content replacing them; and images
  with explicit dimensions throughout.

## Next-segment preloading (FE-E-06)

Asserted in the test suite rather than screenshotted, in
`e2e/story-viewer.spec.ts`:

```
preloads the next segment and nothing beyond it
```

It reads the `<link rel="preload" as="image">` tags the viewer emits and checks
that segment *N+1* is there and segment *N+2* is not.
