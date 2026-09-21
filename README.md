# Story-to-Checkout — Himanshu Nautiyal

Aumbram frontend assignment, Experienced track.

A mobile-first Next.js App Router app that takes a shopper from a story frame to
a confirmed, correctly attributed, never-duplicated multi-vendor order — on a
mid-range Android, on a connection that comes and goes. The mock backend lives in
the same repo and is driven by the same business rules as the UI.

---

## Run it

Requires **Node 22+** (see `.nvmrc`). The mock dataset is generated automatically
before `dev`, `build` and the tests, so a clean clone needs nothing extra.

```bash
npm install
npm run dev                      # http://localhost:3000
```

```bash
npm run build && npm start       # production build
npm test                         # 167 unit + component tests   (~3 s)
npm run e2e:install              # one-off: downloads Chromium
npm run test:e2e                 # 23 Playwright tests against the production build
```

| Command | What it does |
|---|---|
| `npm run typecheck` | `tsc --noEmit`, strict + `noUncheckedIndexedAccess` |
| `npm run lint` | ESLint |
| `npm run check:bundle` | First-load JS per route against the budgets (`--strict` to fail) |
| `npm run perf:lighthouse` | Lighthouse, mobile + 4× CPU + Slow 4G, 3 runs → `docs/perf/` |
| `npm run perf:inp` | INP for tap-next and quick-add under a 4× CPU throttle |
| `npm run seed:force` | Regenerate `mock-data/out/` from scratch |

No environment variables are needed. `NEXT_PUBLIC_BUILD_ID` is set by CI and
shows up on `/__debug` and in every error and RUM report; `AUMBRAM_DEBUG=0`
disables the debug endpoints.

### The five-minute tour

1. `npm run dev`, open `http://localhost:3000`.
2. Tap the **Behind the loom with the artisans** card (`sty_0022`, third item).
3. Tap the hotspot on the first frame, add the basket, close the sheet — the
   story is still where you left it.
4. Tap right to advance, add from segments 2 and 4 as well.
5. Go to the cart (header, top right), then **Checkout**.
6. Enter pincode **751001** with any valid-looking address
   (phone must be 10 digits starting 6–9).
7. Two sellers can deliver, **Kochi Studio** cannot, **Jaipur Kala** refuses Cash
   on Delivery and says so. Remove the undeliverable items, place the order.
8. Two orders, both **Discovered via @lakshmi.desi7**, timestamps in IST.

Switch the language with the **हिन्दी** button in the header at any point — it
re-renders from the server, so the first paint of the new language is HTML.

### Fault injection — `/__debug`

Everything a reviewer needs to reproduce a failure is on that page. It works in
the production build too, because the e2e suite drives it.

| Control | Effect |
|---|---|
| **Latency profile** | `off`, `fast` (50–150 ms), `slow4g` (600–2500 ms), or a fixed value. Applied to server renders as well, so `slow4g` shows the feed's streaming skeleton in the HTML rather than only after hydration. |
| **Failure rate** | Probability of a `503` with `retryAfterMs`. `/api/v1/debug` is exempt, so you cannot lock yourself out. |
| **Drop next order response** | The next `POST /orders` **commits**, then never answers. This is the interesting one. |
| **Live updates** | Turns the 2/s SSE replay on or off. |
| **Raise a cart price by ₹100** | Makes the next order come back `409 PRICE_CHANGED`. |
| **Reset to seed state** | Drops the whole in-memory overlay. |

**To see the idempotency work:** put two things in the cart, go to checkout, turn
on *Drop next order response*, press **Place order** once. The button locks and
reads "Confirming your order…", the request times out after 10 s, the retry goes
out with the **same** `Idempotency-Key`, and you land on a confirmation with
exactly two orders. Then check:

```bash
curl "http://localhost:3000/api/v1/orders?idempotencyKey=<key from the URL>"
```

Two orders. Not four.

---

## What I built

Every **Must** is done. Three of the six **Should**s are done; the **Stretch**
goals are not, and §"What I cut" says why.

### Must

| | Requirement | Status |
|---|---|---|
| FE-E-01 | Runs from a clean clone, Node pinned, seed automatic | done |
| FE-E-02 | SSR + streamed feed, LCP prioritised, display rules | done |
| FE-E-03 | Deep-linkable viewer, instant from a card, scroll restored | done |
| FE-E-04 | Segment playback, media-ready timer, 4 s fallback, story chaining | done |
| FE-E-05 | Tap / hold / swipe / keyboard, visible pause, auto-pause | done |
| FE-E-06 | Next segment only, next story's first frame at the end | done |
| FE-E-07 | Crop-aware hotspots, safe area, 44 px, accessible names | done |
| FE-E-08 | Product sheet, quick-add, story resumes in place (±250 ms) | done |
| FE-E-09 | Hand-built accessible `BottomSheet`, used in two places | done |
| FE-E-10 | Cart grouped by vendor, optimistic, stepper, price-at-add | done |
| FE-E-11 | Offline mirror + ordered replay queue, rejections surfaced | done ¹ |
| FE-E-12 | Address form, inline errors, `aria-describedby`, focus | done |
| FE-E-13 | Serviceability, COD reasons, split preview, debounced quote | done |
| FE-E-14 | Idempotent place-order, backoff, lookup on unknown outcome | done |
| FE-E-15 | 409 / 422 handling, price acceptance mints a new key | done |
| FE-E-16 | Attribution from hotspot to confirmation, never overwritten | done |
| FE-E-17 | Confirmation by key, survives refresh, IST, status labels | done |
| FE-E-18 | en/hi, server-rendered first paint, `Intl.PluralRules` | done |
| FE-E-19 | Budgets measured on the production build | done, **one miss** ² |
| FE-E-20 | Error boundaries per card, per route, per viewer; reporting | done |
| FE-E-21 | Unit, component and e2e per `docs/testing.md` | done |
| FE-E-22 | ADR covering all eight topics | done |
| FE-E-23 | This README | done |

¹ The queue, the mirror and ordered replay all work, and survive a reload. A
*cold start with no network at all* needs the service-worker app shell
(FE-E-30, cut) — the document itself has to come from somewhere. The e2e test
covers it with blocked cart writes and a reachable document, and says so inline.

² LCP on `/` is **3468 ms** against a 2500 ms budget. Analysed in
[`docs/perf/`](docs/perf/README.md) with what I did and what I would do next.
Every other budget is met: CLS 0.000, INP 56 ms and 96 ms, and all five routes
are 52–78 KB inside their JS budgets.

### Should

| | Requirement | Status |
|---|---|---|
| FE-E-24 | Live updates over SSE, slice-level re-render, backoff | done |
| FE-E-25 | Simulated UPI payment, confirmation polls with backoff | done |
| FE-E-26 | RUM via `web-vitals`, `sendBeacon`, sampled | done |
| FE-E-27 | CI: typecheck, lint, unit, e2e, JS budget check | done |
| FE-E-28 | Batched analytics events with client UUIDs | done |
| FE-E-29 | Viewer as an intercepting-route overlay | **cut** |

### Stretch

None. FE-E-30 (service worker), FE-E-31 (checkout prefetch), FE-E-32
(pseudo-locale) and FE-E-33 (full `srcset` comparison) are all unbuilt; the
reasoning for each is in the ADR's "What I cut".

---

## Architecture and key decisions

Full reasoning: **[`docs/adr-001-frontend-architecture.md`](docs/adr-001-frontend-architecture.md)**.
The short version:

```
┌──────────── Server ─────────────────┐   ┌──────────── Client ──────────────────┐
│ RSC: feed page 1, story + products, │   │ Islands: story viewer, BottomSheet,  │
│      confirmation, i18n dictionary  │   │ quick-add, cart (persisted store +   │
│ Route handlers /api/v1/*            │◄─►│ ordered mutation queue), checkout    │
│ In-memory overlay on a seed dataset │SSE│ (quote, idempotent place-order)      │
│ Fault injection (/__debug)          │   │ RUM + analytics, code-split, on idle │
└─────────────────────────────────────┘   └──────────────────────────────────────┘
        ▲                                              ▲
        └──── src/domain/*: the business rules ────────┘
              (pure functions, used by both sides)
```

**The business rules are pure functions both sides import.** Money, shipping,
serviceability, COD, the vendor split, attribution. What the server enforces and
what the checkout screen promises cannot drift, because they are the same code.

**Four state boundaries, chosen by who owns the truth.** Server-owned read-only
data is read directly by server components. Server-owned refreshable data
(feed pages 2+, the quote) is TanStack Query. Client-owned data that must survive
everything (the cart mirror, its queue, the idempotency key) is a persisted
zustand store. Which story and which order attempt are URL state.

**The cart is derived, not stored.** `server + pending queue → what you see`. A
reload replays the same derivation from `localStorage`; a reconnect drains the
queue in order and each acknowledgement just shrinks it.

**There are three outcomes for an order, not two.** Succeeded, failed, and
*unknown* — committed, but the response never arrived. Guessing at the third is
where duplicate orders come from, so the client asks:
`GET /orders?idempotencyKey=…`. The key is written to storage *before* the first
request leaves, so a reload mid-flight comes back holding it.

**Attribution is treated as money, because it is.** `{ storyId, creatorId }`
travels from the hotspot to the cart line, through `localStorage`, through an
offline replay, into the order request, onto the confirmation — and a later plain
feed add can never overwrite it. That rule is a tested pure function
(`mergeAttribution`) rather than a convention.

---

## Trade-offs, and what I would do with more time

The full list is in the ADR. The ones I would most expect to be asked about:

| Decision | The trade |
|---|---|
| **A 40-line translator instead of an i18n library** | Saves 12–15 KB of client JS for features this app does not use. Costs: no namespaces, no ICU select/gender. The Hindi dictionary is typed against English so a missing key fails the build. If it grew a second namespace, the calculation reverses. |
| **Locale in a cookie, not the URL** | The server renders the right language in the first byte without doubling every route. Costs: a locale is not shareable in a link, and a future page cache must `Vary` on it. |
| **No feed virtualisation** | Not required, and at 20 cards per page the document stays short. Virtualising variable-height heterogeneous cards costs correct scroll restoration, which FE-E-03 requires. At thousands of rows it becomes necessary. |
| **Plain `<img>` for story covers, `next/image` everywhere else** | The card and the viewer must request byte-identical URLs for the cache to make the transition instant. An optimiser picking a different width for each guarantees a miss on the one paint that has to be immediate. |
| **The address is not persisted** | The brief allows it with a justification. The justification would have to cover a home address in `localStorage` on a shared phone, and with one fixed demo user there is nothing on the other side of the trade. |
| **Next 15.5, not 16** | `create-next-app` gave 16.3. Measured with the same script, 15.5's shared baseline left 55 KB of the 180 KB budget for the app where 16.3 left about 19 KB — and the viewer and checkout still had to fit in it. |

**With a team of three and three months**, in order: contract tests on the
idempotency and attribution rules shared with the backend so the two sides cannot
drift; the duplicate-order and attribution-coverage alerts, watched under real
traffic before adding features; the service worker, so "offline" means offline
rather than "offline as long as you do not reload"; then LQIP and a real image
CDN for the LCP gap; then the product rather than the path — real auth, product
pages, and the vendor tooling where the brief says the business actually is.

---

## Testing

**[`docs/testing.md`](docs/testing.md)** has the strategy, the layer-by-layer
breakdown and an honest list of what is not tested.

```bash
npm test          # 167 unit + component tests            ~3 s
npm run test:e2e  # 23 Playwright tests, production build ~2.5 min
```

The rule: test a thing at the cheapest layer that can actually catch it being
wrong. Money maths, delivery rules, the story timer, the hotspot geometry, the
cart projection and the idempotency fingerprint are pure functions with 149 unit
tests. The `BottomSheet`'s accessibility contract is 11 component tests including
`axe`. The journeys, and every failure mode that needs a real network stack, are
Playwright.

Both of the brief's Given/When/Then scenarios are asserted as equalities: a held
second and 2.5 seconds spent in the product sheet are not charged to the story,
to the millisecond.

One finding worth repeating: the `BottomSheet` component tests passed while focus
restoration was broken, because jsdom does not implement `inert` and focusing
inside an inert subtree silently does nothing in a real browser. Playwright
caught it. That is the honest limit of the component layer.

---

## Assumptions

1. **`expiresAt` is ignored**, as the brief instructs — every story with one has
   already expired.
2. **Video segments render their poster.** The dataset's video URLs are fake and
   the brief calls the poster the normal path. No `<video>` element is attempted,
   so there is no stall to fall back from.
3. **`price_drop` live updates are not authoritative.** The generator's README
   says `newMin` may not match any variant price; applying it would corrupt the
   catalogue and fail every checkout with `PRICE_CHANGED`. Stock updates *are*
   applied. The `/__debug` price control is the supported way to provoke a real
   price change.
4. **Two documented extensions to the wire format**, both to save round trips on
   a slow connection: feed responses carry a trimmed product projection rather
   than whole products (14.5 KB per page of 20, against 44.5 KB for the raw
   `feed.json` slice), and cart lines carry the product fields they are rendered
   with, so `/cart` does not fan out to N product requests.
5. **One extra endpoint**, `POST /api/v1/orders/:orderId/pay`, for the simulated
   UPI settlement in FE-E-25. Every order sharing an idempotency key settles
   together, as a single payment across a split cart would.
6. **`/__debug` is reachable in the production build.** The e2e suite has to
   drive it. A real deployment sets `AUMBRAM_DEBUG=0` and the route 404s.
7. **Feed ordering is the dataset's.** No ranking, personalisation or filtering
   of archived products was added.
8. **One fixed user**, `usr_000001`, with no auth — as specified.
9. **The mock's memory resets on restart**, per the brief's FAQ. The client
   handles a `404`/`409` on replay gracefully, but does not try to survive a
   server that lost its cart.

---

## AI usage

I used Claude (Anthropic) throughout, in an agentic setup where it could read the
repo, run commands and see the output.

**Where it did most of the work:** first drafts of components and CSS,
boilerplate (route handlers, dictionaries, test scaffolding), and a great deal of
the prose in this README and in `docs/`. The ADR's structure and arguments are
mine; the sentences are largely AI-drafted from my notes and then edited — the
"what I cut" and "with three people and three months" sections in particular are
my calls, written up.

**Where I drove:** every architectural decision in the ADR. The four state
boundaries, deriving the cart from `server + queue` rather than storing it, the
three-outcome model for order placement, what belongs in the fingerprint,
treating `price_drop` as non-authoritative, and the decision to move to Next 15.5
after measuring the baseline.

**What I rejected or corrected:**

- An early suggestion to keep the cart in TanStack Query with a persister. It
  cannot accept ordered offline writes; the projection model replaced it.
- A `setInterval`-driven progress bar re-rendering per animation frame. Replaced
  with a 100 ms tick plus a compositor-only transform — INP is 56 ms because of
  that change.
- Several "fixes" aimed at the wrong thing. The checkout click failures were
  attributed in turn to `z-index`, to the sticky footer, and to `100dvh`; all
  three were wrong, and the cause was Playwright's `isMobile` hit testing. I kept
  the sticky-footer change because it is an improvement on its own, and wrote the
  real reason into the config.
- Measurement code that was quietly lying: the first bundle script counted the
  `nomodule` polyfill bundle, inflating every route by ~39 KB, and reused a stale
  server so it measured an old build. Both were caught by numbers that did not
  move when they should have.

**I can explain and modify any line of this.** The parts I would most want to
walk through are `src/features/cart/cart-projection.ts`,
`src/features/checkout/use-place-order.ts` and `src/domain/story-timer.ts` —
they are where the thinking is.

---

## Time spent

Roughly **11 hours**, a little over the 8–10 the brief recommends.

| | |
|---|---|
| Domain rules and the mock backend | ~2 h |
| Feed, i18n, error boundaries | ~1.5 h |
| `BottomSheet` and the product sheet | ~1 h |
| Story viewer | ~2 h |
| Cart and the offline queue | ~1.5 h |
| Checkout and order placement | ~2 h |
| Live updates, RUM, analytics, CI | ~0.5 h |
| Performance measurement and docs | ~1.5 h |

The overrun is mostly one long debugging session on the checkout e2e failures
described above, and the performance work — both of which produced findings I
would not have had otherwise.
