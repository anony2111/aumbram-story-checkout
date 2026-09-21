# ADR-001: Frontend architecture for story-to-checkout

- **Status**: accepted
- **Date**: 2026-09-22
- **Scope**: the feed, the story viewer, the cart and the checkout, plus the mock
  backend they run against.

---

## Context

One path has to work: a shopper is watching a creator's story, taps a product
tagged on a frame, and ends up with a confirmed order — on a mid-range Android,
on a connection that comes and goes, with the basket split across sellers who
have different delivery and payment rules.

Three properties of that path drive almost every decision below.

**It starts in content, not in intent.** The shopper did not come to buy this;
they came to watch. Anything that interrupts — a spinner where a photo should be,
a story that loses its place while they pick a colour — costs the sale, not just
the frame rate.

**The network is not a detail.** The target is Slow 4G with real outages. A
design that only works when requests succeed is a design that works in the
office.

**The money is real, and some of it is someone else's.** A duplicate order is a
double charge. Attribution is a creator's commission. Neither is a rounding
error that can be cleaned up later.

The device assumption sets a hard ceiling the whole design has to fit under:
≤ 180 KB of first-load JavaScript on `/`, ≤ 200 KB on the viewer, ≤ 190 KB on
checkout.

---

## 1. State boundaries

### Decision drivers

There are four genuinely different kinds of state here, and the usual mistake is
to put them all in one place — either everything in a client store, which makes
the server render useless, or everything in a query cache, which cannot accept a
write while offline.

### Options considered

| Option | Why not |
|---|---|
| One client store for everything | Throws away server rendering, which is where the feed's first paint comes from. |
| Everything in TanStack Query, cart included | A query cache is a cache: it is not a place to accept writes the server has not seen, and `localStorage` persistence of a cache does not give ordered replay. |
| Everything server-driven, no client store | The cart has to accept a write in a tunnel. There is no server to drive it. |

### Decision

Four boundaries, chosen by *who owns the truth and when*:

| Kind | Lives in | Examples | Why |
|---|---|---|---|
| **Server-owned, read-only** | React Server Components, read directly from the store | feed page 1, story + tagged products, confirmation orders | The server already has it. Fetching it again from the client is a round trip for data the process is holding. |
| **Server-owned, client-refreshed** | TanStack Query | feed pages 2+, creator stories, a product opened from a feed card, the delivery quote | Cacheable, abortable, retryable; none of it needs to be writable offline. |
| **Client-owned, must survive everything** | zustand + `localStorage` | the cart mirror and its mutation queue; the idempotency key for the current checkout payload | These have to accept writes with no network and be correct after a reload. |
| **URL state** | the route | which story (`/stories/[storyId]`), which attempt (`/orders/confirmation?key=…`) | Deep-linkable, refresh-survivable, shareable. The confirmation is keyed by idempotency key rather than order id precisely because one attempt can produce several orders. |

Two things deliberately do **not** live in a store: the address form (component
state, never persisted — see §7) and the story timer's elapsed time (a reducer
inside the viewer, because nothing outside it needs to know).

### Consequences

- The cart is the only server state with two representations, and it is the only
  one that needs a sync loop. That is a real cost, paid once, in one file.
- `useCartView()` derives what is shown from `server + queue` rather than storing
  it. There is exactly one representation of the cart to keep correct, and the
  hard cases — reload, reconnect, rejection — become the same derivation run
  again rather than three separate code paths.
- The query client is created inside a component, not at module scope: a
  module-level client is shared between requests on the server and would leak one
  user's data into another's render.

---

## 2. Server and client components

### Decision drivers

The JS budget, and the fact that most of this app is content.

### Decision

| Surface | Server | Client | Measured first-load JS |
|---|---|---|---|
| Feed `/` | page, all four card types, header | quick-add + stock strip, locale switch, cart badge, load-more | **127.8 KB** / 180 KB |
| Story viewer | route, story bundle, first frame | the whole viewer — it is a gesture surface | **122.4 KB** / 200 KB |
| Product sheet | — | all of it; it is a modal | (in the shared layout chunk) |
| Cart | shell only | all of it — the cart is client-owned state | **111.4 KB** / 190 KB |
| Checkout | shell only | all of it — a live quote about a pincode nobody has typed yet | **125.0 KB** / 190 KB |
| Confirmation | orders, vendor names, creator handles, line titles | the payment step and its polling | **110.9 KB** / 190 KB |

Three details worth naming:

**Cards are server components that the client can also render.** `FeedCardItem`
has no `"use client"`, so the server renders page 1 with it and the client-side
"load more" imports the same component for later pages. That is why `t` arrives
as a prop rather than from a hook — one implementation, two rendering
environments.

**Server components read the store directly** rather than fetching `/api/v1/*`.
A server component calling its own API is a full round trip through the stack for
data the process is already holding, and it is charged to TTFB, which is where
LCP is spent from.

**The product sheet does not fetch when it does not have to.** The story route
server-renders every tagged product; the viewer hands the product to the sheet,
so opening a hotspot costs no request. It is what makes the sheet work offline,
and it removes a round trip everywhere else.

### Consequences

- Every route is comfortably inside budget, with 52–78 KB of headroom.
- `next build` does not report per-route gzipped JS in a form a CI check can
  assert on, so `scripts/check-bundle.mjs` reads `app-build-manifest.json` and
  gzips each chunk. CI runs it with `--strict`, which is the only way a budget
  stays a budget.

---

## 3. Caching and revalidation

### Decision

| Data | Cached | Revalidated |
|---|---|---|
| Feed page 1 | Not cached. `force-dynamic` | Every request — live stock is on those cards |
| Feed pages 2+ | TanStack Query, 30 s stale | On demand; a back-navigation paints from cache |
| Story + products | Not cached (server render) | Every request |
| Creator stories | 60 s stale | Only read when advancing past the last segment |
| Product (from a feed card) | 15 s stale | On sheet open |
| **Cart** | **Never** | Client-owned; the server copy is fetched once the queue drains |
| **Quote** | **Never** — `staleTime: 0`, `gcTime: 0` | Every pincode change |
| **Orders** | **Never** | Read by key, server-rendered |

Every `/api/v1` response carries `Cache-Control: no-store`. The cart, the quote
and orders are per-user and time-sensitive: a quote is a price *and* a promise to
deliver, and serving a stale one is lying about both.

### Consequences

- Nothing is prerendered, so there is no CDN story here. A production feed would
  want the ranked skeleton cached per segment with live elements hydrated over
  it; that is a backend-shaped change, not a frontend one, and it is out of scope.
- The locale lives in a cookie, so any future page cache has to `Vary` on it.
  That is the price of server-rendering the right language on first paint (§8).

---

## 4. Live updates: SSE

### Decision drivers

Server-to-client only. Small, frequent messages. Indian mobile networks, which
means transparent proxies, captive portals and connections that die without
closing.

### Options considered

| Option | Verdict |
|---|---|
| **WebSocket** | Bidirectional, which we do not need. Needs its own upgrade path through every proxy, its own heartbeat, and its own reconnect logic. Real cost, no benefit here. |
| **Polling** | Simplest and survives anything. But 2 updates/second means either a request every 500 ms — unaffordable on a metered connection — or a batching window that makes "sold out" arrive late, which is exactly when it matters. |
| **SSE** | Plain HTTP, so it goes wherever a `GET` goes. One connection. Browser reconnects natively. Server-to-client only, which is the shape of the problem. |

### Decision

SSE, one connection for the whole app, into a store components subscribe to by
slice.

Two things are ours rather than the browser's:

**Reconnection.** `EventSource` retries on a fixed ~3 s interval, which during a
tunnel is a request every 3 s for the length of the tunnel. The stream is closed
on error and reopened with exponential backoff and jitter, capped at 30 s, and
the attempt counter resets on a clean open. Nothing is opened at all while the
browser reports itself offline.

**Resync.** There is none, deliberately. A stock number is a hint, not a
contract — the authority is `POST /orders`, which re-checks stock and answers
`409 OUT_OF_STOCK` if the shelf emptied. Reconciling a missed stock message
would add a protocol for something the order path already gets right.

`price_drop` is **not** applied to prices, on either side. The generator's own
README says `newMin` may not match any variant price; treating it as
authoritative would corrupt the catalogue and fail every checkout with
`PRICE_CHANGED`. It is forwarded as a flag only.

### Consequences

- A stock update re-renders one card's footer, not the feed. The store is keyed
  by variant and by story, and components subscribe to one key.
- The stream is code-split and connects on idle, so it does not compete with the
  LCP image for bandwidth (§9).

---

## 5. Idempotency, retries, and the unknown outcome

This is the part of the system most worth arguing about, so it is spelled out.

### Context

Two writes can be sent twice: a cart mutation and an order. Both can fail in a
way that does not say whether they happened.

### Decision drivers

There are not two outcomes. There are three: **succeeded**, **failed**, and
**unknown** — the request reached the server, the work committed, and the
response never came back. Guessing at the third is where duplicate orders come
from. Saying "failed" invites a second order; saying "done" invites waiting for
something that may not exist.

### Decision

**Cart mutations** are idempotent on a `clientMutationId` generated once and kept
forever. The queue drains in order; a mutation leaves it only on a definite
accept or a definite reject. A timeout is neither, so it stays and is retried.

Coalescing only touches the tail, and only mutations that cannot be in flight:
a run of stepper taps collapses to one write, an add-then-remove collapses to
nothing. A test asserts that a collapsed queue and the queue it came from project
to the same cart.

**Order placement** works like this:

1. The payload is fingerprinted.
2. `ensureKey(fingerprint)` returns the existing key if the fingerprint matches,
   or mints a UUID. It writes to `localStorage` **synchronously, before anything
   is sent** — a reload mid-request comes back holding the same key.
3. Up to three attempts, reusing that key, with exponential backoff and jitter
   and a 10 s per-attempt timeout.
4. Only transport failures and `503` are retried. A `409` will not become true
   by asking again, so it is surfaced.
5. If the attempts are exhausted, the client **does not guess**. It calls
   `GET /orders?idempotencyKey=…`. Orders found → confirmation. None →
   "We couldn't confirm your order yet", with a retry that reuses the key.

On the server, the commit and the idempotency record happen together, before the
response is written. That ordering is the whole trick: a response that never
arrives still leaves a replayable record behind.

**What counts as the same payload.** Lines (variant, quantity, expected unit
price), address, and payment method. Lines are sorted, so array order cannot
change it. Attribution is excluded: it decides who is paid a commission, not what
is bought or what it costs, so re-attributing a line is not a different order.

Too loose and a changed cart silently replays the old order. Too tight and an
innocent reordering looks new and creates a duplicate. Both directions have tests.

**The fingerprint is a digest, not the payload** — 64-bit FNV-1a. The canonical
form contains a name, a phone number and a home address, and this is
`localStorage` on a phone that gets handed around. `crypto.subtle` would be
stronger but is async, and the key has to be written before the request leaves;
a synchronous step is the point.

**A new key is minted only when the fingerprint changes** — after accepting a
price change, removing an item, or editing the address.

**`422 IDEMPOTENCY_KEY_REUSED` should be impossible.** If it happens, a key
outlived its payload, which is a bug in this logic. It is reported as a client
error rather than papered over with a fresh key.

### Consequences

- Verified end to end: with the mock's "drop next order response" on, the client
  times out, retries with the same key, lands on the confirmation, and
  `GET /orders?idempotencyKey=` returns exactly two orders. A double tap produces
  one request.
- A replayed cart mutation returns the response the server sent the *first* time,
  which can be an older snapshot. The client therefore re-reads the cart once the
  queue empties. Without that step the UI would settle on stale truth.
- The key outlives the tab. A shopper who gets bored, closes the tab and comes
  back to the same cart reuses the key rather than ordering twice.

---

## 6. Error boundaries and failure UX

### Decision

Boundaries are placed where the blast radius should stop, which is not the same
as where errors happen:

| Boundary | Protects | Fallback |
|---|---|---|
| Per feed card | The feed from one malformed card | That card becomes a short message; the rest of the feed is untouched |
| Story viewer route | The app from a story that cannot play | "Back to the feed" and a retry |
| Route level | Everything else | Retry and a way home |

The principle underneath: **a failure is described in terms of what the shopper
can do next.** `OUT_OF_STOCK` on a queued mutation marks the line and bars
checkout until it is dealt with, rather than vanishing. An unserviceable seller
is flagged with a "Remove these items" action, not silently dropped. An
unconfirmed order offers "Check again", not "Failed".

Every catch reports to `/api/v1/client-errors` with a route, a build id and a
correlation id — never with the cart, the address or the form.

### Consequences

- A boundary per card costs one small client component per card. It is worth it:
  the feed is heterogeneous and partly generated, and it is exactly the surface
  where one bad row should not be fatal.
- `useCartView` returning an empty cart before hydration means the empty state
  can appear briefly. The banners render either way, so it never says "your cart
  is empty" without also saying "you are offline" when that is the reason.

---

## 7. Monitoring, RUM and privacy

### Decision

**Collected:** LCP, CLS, INP and TTFB, with attribution, tagged with route
pattern, locale, `effectiveType` and build id. Client errors with name, message,
stack and correlation id. Funnel events: `story_view` (≥ 3 s watched),
`story_product_tap`, `add_to_cart`, `checkout_start`.

**Sampling:** configurable via `NEXT_PUBLIC_RUM_SAMPLE_RATE`, defaulting to 1 in
this submission so a reviewer sees every beacon. A real deployment would run RUM
at 5–10% and errors at 100% — a distribution needs a sample, a stack trace needs
the one that happened.

**Transport:** `sendBeacon`, with a `keepalive` fetch fallback. Analytics batches
on a 5 s timer, a 20-event cap, and `pagehide` — which on a phone is the last
callback you reliably get. Every event carries a client UUID so a batch sent
twice dedupes.

**No PII, structurally rather than by policy:**

- Route *patterns*, never URLs: `/orders/[segment]`, not an order id.
- Error messages and stacks are scrubbed for long digit runs and email addresses
  before they leave. That is a last line of defence for interpolated text, not a
  substitute for not collecting it.
- The order log on the server carries key, outcome, duration, order ids and
  vendor ids — no name, no phone, no address. An order log is the easiest place
  in a commerce system to leak personal data, and nothing here needs it.
- The address is **not persisted**. The brief allows it with a justification; the
  justification would have to cover a home address in `localStorage` on a shared
  phone, and for one fixed demo user there is nothing on the other side of the
  trade.

**Alerts I would set**, in the order I would set them:

1. `POST /orders` 5xx rate, and the rate of attempts that end in the *unknown*
   branch. That number rising means shoppers are being asked to wait for orders
   nobody can confirm.
2. Duplicate orders per idempotency key — should be structurally zero, so any
   non-zero value is a defect, not a threshold.
3. `add_to_cart` → `checkout_start` conversion by `effectiveType`. A drop that
   only shows on `3g` is a performance regression that a median will hide.
4. Attribution coverage: the share of orders with a `storyId` where the session
   had a qualifying story interaction. This is money owed to creators; silence
   here is the failure mode nobody notices.
5. p75 LCP on `/` by `effectiveType`, and INP on the two interactions in §9.

---

## 8. Smaller decisions worth defending

**A hand-written translator instead of an i18n library.** One namespace,
`{brace}` placeholders, plurals via `Intl.PluralRules` — about forty lines. A
library adds 12–15 KB of client JavaScript for namespaces, lazy catalogues and
rich text, none of which this app uses. The Hindi dictionary is typed against
English, so a missing key or a plural that became a string fails the build rather
than showing a blank. If this grew a second namespace or needed gender/select
rules, the calculation reverses.

**Locale in a cookie, not the URL.** The server has to render the right language
in the first byte. A cookie does that without doubling every route. The costs are
real and accepted: a locale is not shareable in a link, and any future page cache
must `Vary` on it.

**No web fonts.** The system stack renders both Latin and Devanagari. Zero font
bytes on the critical path and no swap-induced layout shift — CLS measures 0.000
on both routes.

**The story cover is a plain `<img>` in both the card and the viewer.** They must
request byte-identical URLs for the browser cache to make the transition instant.
An optimiser picking a different width for a card than for a full-screen frame
guarantees a miss on the one paint that has to be immediate.

**No feed virtualisation.** It is not required, and at 20 cards per page with
button-driven paging the document stays short. Virtualising a heterogeneous feed
with variable-height cards costs correct scroll restoration — which FE-E-03
requires — and is the wrong trade at this size. At thousands of rows, or with
infinite scroll, it becomes necessary.

**Button-driven "load more" rather than infinite scroll.** On a metered
connection, a reader who stops scrolling should stop downloading.

---

## 9. Performance

Measured on the production build; median of 5 Lighthouse runs, mobile emulation,
4× CPU slowdown, Slow 4G. Numbers and every run are in `docs/perf/`.

| Metric | Budget | Measured | |
|---|---|---|---|
| LCP `/` | < 2500 ms | **3468 ms** | **missed by ~970 ms** |
| LCP `/stories/[storyId]` | < 2500 ms | 1348 ms | ok |
| CLS, both routes | < 0.1 | 0.000 | ok |
| INP story tap-next | < 200 ms | 56 ms | ok |
| INP quick-add | < 200 ms | 96 ms | ok |
| First-load JS, all five routes | 180/200/190 KB | 111–128 KB | ok |

**The miss, honestly.** `/` started at 4284 ms. Three changes brought it to 3468:
inlining route CSS removed a render-blocking round trip worth most of a second at
150 ms RTT; image quality 60 took about a third off the hero image; and marking
non-LCP images `fetchPriority="low"` stopped six lazy images racing the one that
matters.

What is left is bandwidth, not JavaScript. TBT is 305 ms and every route is well
inside its JS budget; the feed simply has more image bytes above the fold than
1.6 Mbps delivers in 2.5 seconds. The three things I would do next, in order:

1. **Serve a blurred LQIP inline.** The dataset has a `blurhash` field that is
   unused. A ~200-byte inline placeholder makes the largest paint happen at
   parse time instead of after a network round trip. This is the single biggest
   remaining lever and it is cheap.
2. **Put the images behind a real CDN.** They are proxied from `picsum.photos`
   through our own optimiser on every cold request. A CDN with long-lived
   immutable URLs removes an origin hop entirely.
3. **Drop the first flush to three cards.** Six were chosen to fill the fold; two
   cover a 412×823 screen. Fewer competing image requests during the LCP race.

The INP numbers are the ones I would defend hardest, because they are the
device-facing ones: 56 ms and 96 ms against a 200 ms budget, at a 4× CPU
slowdown. The story timer ticks at 100 ms rather than per animation frame, and
the progress bar interpolates with a compositor-only transform — ten React
renders a second instead of sixty, on a CPU we are told to assume is four times
slower than this one.

---

## 10. What I cut, and what I would do next

### Cut, deliberately

| Cut | Why |
|---|---|
| **FE-E-29** viewer as an intercepting-route overlay | The viewer is already instant from a card: `loading.tsx` paints the cover from the store while the server render is in flight. Intercepting routes would buy a nicer transition for real complexity in the one place scroll restoration must not break. |
| **FE-E-30** service-worker app shell | It is the only thing missing from a *cold* offline start: the queue survives a reload, but the document itself needs a network. The brief's own scenario is written assuming this; the gap is called out in the test that covers it. |
| **FE-E-31** prefetching the checkout route on first add | Measurable cost, speculative benefit. I would want the add→checkout conversion rate from §7 before spending the bytes. |
| **FE-E-32** pseudo-locale | Hindi already runs 30–40% longer and the layouts hold against it. A padded pseudo-locale is the right tool when you cannot read the real translation; here I can. |
| **FE-E-33** `srcset` strategy with before/after LCP | Partly done and measured (quality, `fetchPriority`), but the full responsive-image comparison is unfinished. It is item 1 and 2 of §9. |
| Real `<video>` playback | The dataset's video URLs are fake. Posters are the specified path. |
| Desktop layouts, visual design beyond clean | Explicitly out of scope. |

### With three people and three months

**Month 1 — make the money path provably safe.** Move the idempotency and
attribution rules into contract tests shared with the backend, so the two sides
cannot drift. Add the duplicate-order and attribution-coverage alerts from §7 and
watch them under real traffic before adding features. Ship the service worker, so
"offline" means offline rather than "offline as long as you do not reload".

**Month 2 — make it fast where it is slow.** LQIP and a real image CDN (§9). RUM
segmented by `effectiveType` so the 3G tail is visible rather than averaged away.
A budget check on LCP in CI, not just on bytes. Feed virtualisation once the feed
is long enough to need it — with scroll restoration tested first, not after.

**Month 3 — make it a product rather than a path.** Real auth and a real cart per
user. Product detail pages, search, creator profiles. Vendor-side tooling, which
is where the brief says the business actually is. By then the interesting
frontend question is no longer "does checkout work" but "how does a creator see
what their story earned" — and the attribution signal this app is careful never
to lose is what makes that answerable.

### The one thing I would change about this submission

The mock backend is in the same process as the app, which made the whole thing
demonstrable in one command but let me be sloppier about the client/server
boundary than a real integration would allow — server components read the store
directly, which is right here and would be a network call in production. If I
were doing it again I would put the mock behind a real HTTP boundary from the
start, even locally, so that distinction was never blurred.
