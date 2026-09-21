# Testing strategy

```bash
npm test            # 167 unit and component tests (Vitest), ~3 s
npm run test:e2e    # 23 Playwright tests against the production build, ~2.5 min
```

## The shape of it

The rule behind every choice here: **test a thing at the cheapest layer that can
actually catch it being wrong.**

That is not the same as testing everything at the cheapest layer. A focus trap
cannot be reasoned about from a unit test, and a dropped order response cannot be
reproduced in jsdom. But the money maths, the delivery rules and the story
timer's behaviour under a hold can all be settled in milliseconds, and pushing
them up to a browser test would make them slow *and* less thorough.

| Layer | Count | What it is for | Runtime |
|---|---|---|---|
| Unit | 149 | Rules and state machines. Pure functions, no DOM. | ~1 s |
| Component | 18 | Accessibility contracts that only exist in a DOM. | ~2 s |
| End-to-end | 23 | Journeys, and every failure mode that needs a real network stack. | ~2.5 min |

Unit tests run in Node, not jsdom — the domain has no DOM and jsdom start-up
dominated the run. Component tests opt in per file with
`// @vitest-environment jsdom`.

---

## Unit: the rules, and the state machines

Every business rule in the brief is a pure function in `src/domain/`, called by
*both* the mock backend and the UI. They cannot drift: what the server enforces
and what the checkout screen promises are the same code.

| Module | Tests | Covers |
|---|---|---|
| `money.ts` | 12 | Integer paise only; Indian grouping; floored discount |
| `rules.ts` | 24 | Pincode and mobile formats, prefix serviceability, per-order shipping, COD with named reasons, quantity clamping, attribution merge |
| `quote.ts` | 12 | The multi-vendor split, priced per seller, payable over serviceable groups only |
| `display.ts` | 13 | "From" prefix, discount visibility, "Only N left" / "Sold out", deeplink validation |
| `variants.ts` | 12 | Deriving a picker from a flat variant list, and which option is unselectable |
| `story-timer.ts` | 19 | The viewer's timer as a reducer |
| `hotspot.ts` | 12 | Mapping a tag through an `object-fit` crop and into a safe area |
| `cart-projection.ts` | 20 | `server + queue` → the cart on screen; queue coalescing |
| `checkout/payload.ts` | 17 | Address validation, payload construction, the idempotency fingerprint |
| `i18n/translate.ts` | 12 | Plurals in both languages, dictionary parity, IST formatting |
| `server/checkout.ts` | 8 | The server's own fingerprint |
| `lib/pii.ts` | 6 | Scrubbing before telemetry leaves the device |

Three of these carry most of the weight.

**The story timer** is a reducer because the subtle parts are not clickable: the
timer starts when the *media* is ready rather than when React rendered, it gives
up after four seconds and plays a fallback for the full duration, and it
reference-counts pauses because four independent things can hold playback at once
(a finger, an open sheet, a hidden tab, a dropped connection). With a boolean,
the first release restarts a story the other three still want stopped — and there
is a test for exactly that.

**The hotspot geometry** is pure because a dot on the wrong pixel is invisible in
review and obvious to a shopper. Tags are authored on the original 720×1280
frame, so `left: x%` lands on the wrong thing once `object-fit: cover` crops it.
67 of the dataset's 259 tags sit within 8% of an edge, so clamping is the normal
case: there are cases for 9:16, wider, taller, cropped-out, and a container
smaller than its own safe area.

**The idempotency fingerprint** is tested in both directions, because both are
expensive. Too loose and a changed cart silently replays the old order; too tight
and an innocent reordering of the lines array looks like a new order and creates
a duplicate. So: it ignores line order and attribution, and it reacts to
quantity, price, address and payment method.

---

## Component: the accessibility contract

`BottomSheet` is the app's only modal primitive, so its contract is asserted once
rather than re-checked at every call site: 11 tests covering the labelled dialog
role, focus moving in and being returned to the node that opened it, Tab and
Shift+Tab cycling, Escape, the backdrop, the rest of the page going `inert`,
scroll lock, and an `axe` pass over the whole document while it is open.

**These tests passed while the sheet had a real bug.** Focus restoration ran
while the trigger's ancestor was still `inert`, and focusing inside an inert
subtree silently does nothing in a real browser — but jsdom does not implement
`inert`, so it looked fine. Playwright caught it. That is the honest limit of
this layer, and it is why the focus-restoration assertion also exists end to end.

---

## End-to-end: the journeys, and the dangerous paths

Playwright runs against `npm run build && npm start`, never the dev server.
Streaming, the idempotent order flow and the offline queue all behave differently
under dev's double-rendering and on-demand compilation.

One worker, serial: the mock backend holds one in-memory cart for one user, so
the suite is serial by construction and saying so beats flaky cross-talk. Each
spec resets the backend to seed state with the fault switches off.

### The two journeys the brief names

**`story to confirmation: the full fixture journey`** — feed → `sty_0022` → three
hotspots across three sellers → cart → checkout at 751001 → Kochi Studio flagged
as undeliverable and the order barred → remove → place → a confirmation with two
orders, both carrying `@lakshmi.desi7`, timestamps in IST, and the server
agreeing there are exactly two.

**`survives a response that never arrives`** — with the mock's "drop next order
response" on, the order commits and the response never comes. The client times
out at 10 s, retries with the **same** key, lands on the confirmation, and
`GET /orders?idempotencyKey=` returns exactly two orders. The test also asserts
every `POST /orders` carried the same key.

### The rest

| Spec | What it protects |
|---|---|
| `feed-sheet` (4) | SSR before any JS runs; the sheet picking a variant; Escape returning focus to the trigger |
| `story-viewer` (7) | Deep link; taps; **a hold freezing progress and resuming without navigating**; keyboard and the pause control; next-segment-only preload; **2.5 s in the sheet not being charged to the story**; scroll position on close |
| `cart-offline` (6) | Vendor grouping and attribution; the stepper against the shelf; an offline add replayed on reconnect; a queued mutation surviving a reload; a rejection blocking checkout until dealt with; the offline banner |
| `checkout` (6) | The two journeys above, plus a double tap producing one request, a price change requiring acceptance and minting a new key, inline validation with focus, and a stale quote never winning |

Both of the brief's Given/When/Then scenarios are asserted as *equalities*, not
approximations: the elapsed time while paused equals the elapsed time at the
moment of pausing, to the millisecond. The ±250 ms tolerance is applied to the
resume, which is where it belongs.

---

## What is not tested, and why

| Not tested | Why |
|---|---|
| **A cold start with no network** | Needs the service-worker app shell (FE-E-30, cut). The reload test uses blocked cart writes with a reachable document instead, and says so inline. |
| **Real screen readers** | `axe` and explicit ARIA assertions catch structural problems; they do not catch a bad experience. This needs a human with NVDA or VoiceOver, and that is a real gap rather than an oversight. |
| **The SSE client's reconnect backoff** | Would need a server that drops connections on cue. The timing logic is simple and isolated; the risk is low and the test would be slow and flaky. |
| **Visual regression** | Out of scope per the brief, and a screenshot suite on a design that is deliberately plain is maintenance without signal. |
| **The mock backend's own handlers, in isolation** | Their rules are the unit-tested domain functions, and their wiring is covered by the e2e suite going through them. Testing them twice would test the framework. |
| **Hindi at every surface, end to end** | The dictionary parity and plural rules are unit-tested and the locale switch is verified server-side. A full second pass of the journeys in Hindi is the next thing I would add. |

## Known flakiness, and what was done about it

`isMobile` is turned off in the Playwright project. With it on, Playwright's hit
test resolves a scrolled-to element to whatever sits about a hundred pixels above
it, and every click far down a long page fails as "intercepted" — while
`elementsFromPoint` at the button's own centre returns the button, with nothing
above it, and the same click succeeds the moment `isMobile` is off. Viewport,
DPR, touch, `en-IN` and IST are all kept. The reasoning is written into
`playwright.config.ts` so the next person does not have to rediscover it.

No test is retried locally. CI allows one retry, which is a concession to shared
runners rather than an admission that the suite is unstable.
