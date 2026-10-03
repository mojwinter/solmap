# Kickoff prompts (paste into Claude Code at hour 0:45)

Each dev opens Claude Code in the repo and pastes their role's prompt. Every prompt makes Claude
read the shared context first, work against fixtures, and stay inside the dev's own folders.
`SOLAR_SOURCE=fixtures` (the default in `.env.example`) serves the committed synthetic roofs, so
nobody needs a Google key to start. PLAN.md → Data roadmap says when real data comes online.

---

## A: Map & Geo

```
Read CLAUDE.md, DESIGN.md §2, §3 and §6, and docs/SOLAR_API.md ("Drawing a panel" and Gotchas 5 and 8).
I own components/map/* and lib/geo/*. Coordinates in src/types/app.ts are {lat, lng}.

Build, against SOLAR_SOURCE=fixtures data from /api/solar/building (synthetic roof at 49.25, -123.15):
1. <AddressSearch onPlace={(lat, lng, label) => …}> wrapping google.maps.places.PlaceAutocompleteElement
   (Places API (New)). Do NOT use the legacy places.Autocomplete widget; it isn't available to new projects.
   Restrict to Canada, get the location with place.fetchFields({ fields: ['location','formattedAddress'] }).
2. A <SolarMap> using @vis.gl/react-google-maps with NEXT_PUBLIC_MAP_ID, satellite view, tilt 0,
   that fits BuildingResponse.boundingBox.
3. lib/geo/panels.ts: pure function panelPolygon(panel, segments, panelDims) → 4 LatLngLiteral corners.
   Use google.maps.geometry.spherical.computeOffset. Unit-test the corner math with a mocked computeOffset.
4. <PanelOverlay panels={...} count={n}>: create one polygon per panel ONCE per building, then show/hide
   by index when n changes (no re-creation). Fill opacity scaled by yearlyEnergyDcKwh (min→0.45, max→0.95).
   Redraw must take < 16 ms.
5. Map click → onRoofPick(lat, lng) callback (the page navigates to the new report URL).
Plan first, then implement in small commits. Don't touch files outside my folders.
```

## B: API & Infra

```
Read CLAUDE.md, DESIGN.md §6 ("Our API contract"), docs/SOLAR_API.md and docs/INFRA.md.
I own app/api/*, lib/solar/*, scripts/*, docker/*, .github/*, fixtures/synthetic/*.

1. lib/solar/schema.ts: zod schemas for the parts of BuildingInsightsResponse (src/types/solar.ts) we use.
   roofSegmentStats, solarPanels and solarPanelConfigs default to []. Unknown fields are ignored.
2. lib/solar/client.ts (`import 'server-only'` first line): findClosest(lat, lng) making ONE call with
   requiredQuality=LOW; on 404 and SOLAR_EXPANDED_COVERAGE=1, one retry with
   experiments=EXPANDED_COVERAGE&requiredQuality=BASE.
   lib/solar/cache.ts (server-only), exactly per docs/INFRA.md → Data sources: SOLAR_SOURCE modes,
   memory LRU caching the in-flight promise, disk cache entries {fetchedAt, request, status, body} written
   atomically, bbox / 5 m matching, 404s cached, expiry at SOLAR_CACHE_MAX_AGE_DAYS (clamp to ≤ 29) on read,
   on startup and hourly. Unit-test matching and expiry with an injected clock (no real waiting).
   One log line per lookup: lat,lng,source,layer=memory|disk|google,quality,status,ms.
3. lib/solar/trim.ts: BuildingInsightsResponse → BuildingResponse (src/types/app.ts), converting
   {latitude, longitude} → {lat, lng}. Unit test it with both files in fixtures/synthetic/.
4. app/api/solar/building/route.ts implementing the contract exactly (200/400/404/429/502),
   BC_BOUNDS validation, Cache-Control: private, no-store, per-IP rate limit (first X-Forwarded-For),
   and BuildingResponse.source set to live / cache / fixture.
5. app/api/health/route.ts and scripts/warm-cache.ts (pnpm solar:warm; same code path as cache mode).
Then get CI green and the first deploy out. Plan first.
```

## C: Finance

```
Read CLAUDE.md and docs/FINANCIAL_MODEL.md end to end. Constants are in src/config/bc.ts.
The engine's exact API is the FinanceEngine interface in src/types/app.ts.
I own lib/finance/*, src/config/bc.ts and fixtures/finance-golden.json.

Implement pure TypeScript (no React, no fetch, no Date):
1. bill.ts: monthlyBill(kWh, plan) and annualKwhFromBill(amount, periodMonths, plan) (exact inverse, strips GST).
2. project.ts: evaluate(config, configIndex, apiPanelWatts, inputs) → ScenarioResult, per the formulas,
   including the self-use curve, input clamping (INPUT_RANGES → CLAMPED_INPUT) and warnings.
3. recommend.ts: recommend(building, inputs) → Recommendation (smallest config within
   TUNING.recommendNpvTolerance of max NPV; null index when there are no configs).
4. verdict.ts: verdict (TUNING.verdict, first match wins) + top-3 ReasonChips per DESIGN.md §5.
5. index.ts exporting an object that `satisfies FinanceEngine`.
6. Vitest: every case in fixtures/finance-golden.json (bill, scenarios, recommend) within ±0.5%, plus
   assert golden `defaults` equals DEFAULT_INPUTS. Edge cases: 0 configs, consumption below the clamp,
   production > consumption, bill below the basic charge, rebateEligible=false.
Write the tests first from the golden file, then the code. Plan first.
```

## D: Report UI & Pitch

```
Read CLAUDE.md and DESIGN.md end to end. Types are in src/types/app.ts.
I own app/page.tsx, app/report/*, components/report/*, components/inputs/*.

Using shadcn/ui + Tailwind, and a hard-coded mock Recommendation + BuildingResponse until C and A land
(base the mock on fixtures/synthetic/south-gable.json, and on the numbers in FINANCIAL_MODEL.md → Golden tests):
1. Landing page with an address slot (A provides <AddressSearch>) and 3 example chips.
2. /report/[lat]/[lng] layout: map slot left (55%), results right; stacked on mobile, verdict first.
3. VerdictCard, MoneyCard, SizeSlider (snaps to configs, star on recommended), UsageInputs
   (bill amount + "covers 1 / 2 months" + rate plan, or annual kWh), SpecSheet.
4. Every state in DESIGN.md §3 → States (loading, wrong building hint, NO_COVERAGE, low quality,
   outside BC, roof too small), attribution line, tabular numbers, CAD formatting helpers,
   and copy for each ScenarioWarning and ReasonChip kind.
Keep components presentational: they take props, no fetching inside. Plan first.
```

---

## Integration prompt (the lead, at each checkpoint)

```
Pull main. Read CLAUDE.md. Wire the report page: fetch /api/solar/building → recommend() →
pass BuildingResponse + Recommendation + selected index to the map and cards. Slider and input
state live in the page and sync to ?panels=&kwh=&plan= in the URL (annual kWh, never the bill amount).
Run /verify, then /demo-check against the deployed site. List anything that's mocked or broken, with the owner for each.
```
