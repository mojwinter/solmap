# CLAUDE.md — Solmap (working name)

Read this before touching the repo. It's the shared context for every developer
and every Claude Code session on the team.

## What we're building

A web tool where a **BC homeowner types their address** and gets an honest answer to
"is rooftop solar worth it for *my* house?":

1. **Viability**: a clear verdict (Strong / Moderate / Weak / Not recommended) with the reasons behind it.
2. **Benefits**: upfront cost, BC Hydro rebate, net cost, payback, 25-year savings, NPV.
3. **Specifications**: system size (kW DC), panel count, panel layout on the roof,
   roof segments used (pitch, azimuth, area), expected annual production (kWh).

Roof data comes from the **Google Solar API** (`buildingInsights:findClosest`).
Because Google returns **no financial analysis outside the US**, we compute the money
side ourselves with a **BC-specific model**. BC Hydro closed net metering on
**July 1, 2026**; exports now earn a flat **10¢/kWh** (Rate Schedule 2289). Most calculators
out there still assume the old rules, so this is how we stand out. See
`docs/FINANCIAL_MODEL.md`.

## Stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js (App Router) + TypeScript, React 19 | One repo, server routes hide the Solar key, shared types front↔back |
| UI | Tailwind + shadcn/ui, Recharts | Fast, consistent, no design bikeshedding |
| Map | `@vis.gl/react-google-maps` (Maps JS API + Places) | Solar results must be displayed on a Google Map if shown on a map (Google policy) |
| Validation | Zod | Validate every request body and every Google response we depend on |
| Tests | Vitest | Finance engine is pure TS; golden cases in `fixtures/finance-golden.json` |
| Rasters (P1) | `geotiff` npm | Decode dataLayers GeoTIFFs for the sun heatmap overlay |
| DB (P1, optional) | Postgres + Drizzle | Only for share links: store inputs, **never** Solar API responses |
| Deploy | Docker Compose on our VPS, Caddy for HTTPS | See `docs/INFRA.md` |

Package manager: **pnpm**. Node 22 LTS.

## Commands

```bash
pnpm dev            # local dev on :3000
pnpm build          # production build (standalone output)
pnpm test           # vitest (finance engine + parsers)
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm fixtures:record -- --lat 49.24 --lng -123.07   # save a live Solar response to fixtures/ (dev only, gitignored)
```

Set `USE_FIXTURES=1` in `.env.local` to serve fixtures from our API routes instead of calling
Google. The committed synthetic roofs are at `49.25, -123.15` (south-gable, Strong) and
`49.2615, -123.1702` (shaded-gable, Weak); anything else → 404. **Build all UI against fixtures
first** so nobody is blocked on keys, quota or coverage.

## Repo layout (target)

```
app/
  page.tsx                      # landing + address search
  report/[lat]/[lng]/page.tsx   # the report (URL is shareable, no DB needed)
  api/solar/building/route.ts   # GET → proxies buildingInsights:findClosest, returns BuildingResponse
  api/solar/layers/route.ts     # GET → proxies dataLayers:get (P1)
  api/solar/geotiff/route.ts    # GET → proxies geoTiff:get, adds key server-side (P1)
  api/health/route.ts           # { ok: true } for the Docker healthcheck
components/
  map/                          # Map, BuildingOutline, PanelOverlay, FluxOverlay
  report/                       # VerdictCard, MoneyCard, SpecSheet, SizeSlider, charts
  inputs/                       # BillInput, RatePlanToggle, AssumptionsDrawer
lib/
  solar/client.ts               # `import 'server-only'`; fetch wrappers for Google (uses SOLAR_API_KEY)
  solar/schema.ts               # zod schemas for the parts of the response we use
  solar/trim.ts                 # raw BuildingInsightsResponse → BuildingResponse ({lat,lng} from here on)
  finance/                      # PURE functions, no React, no fetch → fully unit-tested
    bill.ts  project.ts  recommend.ts  verdict.ts  manual.ts (P1)  index.ts (satisfies FinanceEngine)
  geo/panels.ts                 # panel center + azimuth → polygon corners for the map
src/types/solar.ts              # Google Solar API types (provided in this kit)
src/types/app.ts                # OUR contracts (provided in this kit) — change by PR only
src/config/bc.ts                # every BC number with its source (provided in this kit)
fixtures/finance-golden.json    # golden finance cases (C)
fixtures/synthetic/             # hand-made roofs in the Google response shape: CI + hour-0 dev (committed)
fixtures/solar/                 # real recorded responses: local/VPS only, gitignored, delete ≤ 30 days
scripts/record-fixture.ts       # saves a live response to fixtures/solar/ (dev only)
scripts/deploy.sh               # run on the VPS by the deploy workflow
docker/                         # Dockerfile, compose.yml, Caddyfile (see docs/INFRA.md)
```

Imports: `@/src/types/app`, `@/src/types/solar`, `@/src/config/bc` (alias `@/*` → repo root).

## Contracts (frozen at hour 1, change by PR only)

- `src/types/app.ts`: `BuildingResponse`, `FinanceInputs`, `ScenarioResult`, `Recommendation`,
  and `FinanceEngine` (the exact function signatures of `lib/finance`).
- The frontend never sees raw Google JSON. `app/api/solar/building` returns a
  trimmed `BuildingResponse` that holds only the fields we render.
- Finance runs **client-side** (it's pure and instant, so sliders stay live) from
  `BuildingResponse` + `FinanceInputs`. The server doesn't recompute money.

## Rules (please follow them)

1. **Keys**: `SOLAR_API_KEY` is server-only. `lib/solar/client.ts` starts with `import 'server-only'`,
   so a client import fails the build. Only `NEXT_PUBLIC_MAPS_API_KEY` (HTTP-referrer-restricted) goes to the browser.
   GeoTIFF URLs from dataLayers need a key appended, so we always proxy them.
2. **No persisting Google content.** Google lets us cache Building Insights / Data Layers
   temporarily, for **at most 30 days**. So: in-memory LRU is fine; recorded fixtures in `fixtures/solar/`
   are fine if deleted within 30 days; **never commit a real response** (git history is
   forever) and never put one in the DB. CI uses `fixtures/synthetic/`.
3. **Attribution** is required wherever Solar data is shown:
   `Source: Includes solar data from Google`. Keep the Google Maps logo visible on the map.
4. **Every BC constant lives in `src/config/bc.ts`** with a source URL and an as-of date.
   Never hard-code a rate, rebate or cost anywhere else.
5. **Finance code is pure.** No `Date.now()`, no fetch, no React. Inputs in, numbers out.
   Any change to `lib/finance` must keep `fixtures/finance-golden.json` passing (±0.5%).
6. **Honesty over hype.** If payback is longer than the panel lifetime, say so plainly.
   Show assumptions next to results. Never claim meaningful CO₂ savings for BC
   without the caveat (BC's grid is mostly hydro; BC Hydro itself says solar doesn't
   necessarily cut your footprint).
7. **Handle the 404.** Call `findClosest` once with `requiredQuality=LOW` (a minimum, so you still
   get HIGH where it exists). `NOT_FOUND` means no data at any quality we accept: show a friendly
   "we can't see this roof yet" state (P1: manual estimate from roof area + facing). The optional
   `EXPANDED_COVERAGE` retry is behind `SOLAR_EXPANDED_COVERAGE`; see docs/SOLAR_API.md.
8. Money in the UI is **CAD**, rounded to whole dollars. Energy in **kWh**, power in **kW**.
9. Small PRs, one owner per folder (see `PLAN.md` → Team). Rebase on `main` before
   pushing. `main` auto-deploys to staging.

## Domain cheat-sheet

- `solarPanelConfigs[i]` is cumulative: config *i* = the best *panelsCount* panels.
  To draw config *i*, take `solarPanels.slice(0, config.panelsCount)`.
- API panels are **400 W** (`panelCapacityWatts`). To model other wattages, scale
  `yearlyEnergyDcKwh` by `ourWatts / panelCapacityWatts`.
- Energy from the API is **DC**. Multiply by `dcToAcDerate` (0.85) for usable AC.
- Self-use is **not** a fixed %. It follows a saturating curve capped by `daytimeLoadShare`, so bigger
  systems export a bigger share at 10¢. That's why the sweet spot sits around 5 kW (FINANCIAL_MODEL.md).
- `azimuthDegrees`: 0 = north, 90 = east, 180 = south. South-ish (135–225°) is best in BC.
- `sunshineQuantiles` are 11 values (min → max) of annual sun hours on the roof. A big
  gap between the low and middle quantiles means shading.
- `imageryQuality`: HIGH (0.1 m/px aerial) > MEDIUM (0.25 m aerial) > BASE (0.25 m satellite,
  experimental in Canada) > LOW. Show it as a confidence badge.
- Coordinates: Google's raw JSON uses `{latitude, longitude}`; everything in `src/types/app.ts` uses
  `{lat, lng}`. Convert once in `lib/solar/trim.ts`.
- Places: use `PlaceAutocompleteElement`. The legacy `places.Autocomplete` widget isn't available to new projects.
- BC Hydro bills monthly **or every two months**. Always ask which, and treat the amount as including GST.
- BC sanity check: ~1,000–1,200 kWh per kW DC per year (BC Hydro: a 10 kW system makes
  10,000–12,000 kWh/yr). Flag results outside ~700–1,400 kWh/kW.

## When working with Claude Code

- Start by reading this file, `PLAN.md` (your role's section), and the doc for your area.
- Ask Claude for a plan before multi-file changes. Keep changes inside your owned folders.
- Use `/verify` before pushing and `/contract-check` if you touched `src/types`.
