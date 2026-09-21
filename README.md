# Story-to-Checkout — Himanshu Nautiyal

Aumbram frontend assignment (Experienced track). A mobile-first Next.js App Router app that
takes a shopper from a story frame to a confirmed, correctly attributed, never-duplicated
multi-vendor order — with a mock backend in the same repo.

> Work in progress. This README is filled in as the build lands; the final version follows the
> submission template (Run it / What I built / Architecture / Trade-offs / Testing / Assumptions /
> AI usage / Time spent).

## Run it

Requires **Node 22+** (see `.nvmrc`). The mock dataset is generated automatically by the
`seed` script before `dev`, `build` and the tests, so a clean clone needs no extra step.

```bash
npm install
npm run dev          # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | Seeds mock data, starts the dev server |
| `npm run build` && `npm start` | Production build and start |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Unit and component tests (Vitest) |
| `npm run e2e:install` && `npm run test:e2e` | Playwright end-to-end tests |
| `npm run seed:force` | Regenerate `mock-data/out/` from scratch |

## Docs

- `docs/adr-001-frontend-architecture.md` — architecture decision record
- `docs/testing.md` — testing strategy
- `docs/perf/` — performance evidence
