# DESIGN.md — product, UX and architecture

## 1. User and job

**Primary user:** a BC homeowner (detached house, townhouse or duplex) who's curious about
solar but doesn't know if it's worth it. They know their address and roughly what they pay
BC Hydro. They don't know kW from kWh.

**Job to be done:** "Tell me in one minute whether solar makes sense for my house, how big,
what it costs and what I get back, and give me something I can take to an installer."

**Not our user (for now):** installers, commercial buildings, non-BC Hydro customers.

## 2. Core flow

```
Landing ──► type address (PlaceAutocompleteElement → place.location)
              │
              ▼
        /report/{lat}/{lng}
              │  GET /api/solar/building?lat&lng
              ▼
   ┌───────────────────────────────┐
   │ Map (left / top on mobile)    │   Results (right / below)
   │  • building outline           │    • Verdict card
   │  • panels for current size    │    • Money card (cost → rebate → net → payback)
   │  • [P1] sun heatmap toggle    │    • Size slider (recommended mark)
   │                               │    • Your usage inputs (bill, rate plan)
   │                               │    • Spec sheet
   │                               │    • [P1] charts, assumptions drawer
   └───────────────────────────────┘
```

- The URL carries lat/lng (plus later `?panels=&kwh=&plan=`), so a report is shareable
  without a database. Put **derived annual kWh** in the URL, not the bill amount; it's the same
  number for the model and reveals less about the household.
- On first load we pre-fill usage with the **BC average (~10,000 kWh/yr)** and label it
  "Typical BC home, enter your bill for accuracy". The verdict shows immediately, and
  entering the bill makes it personal.

## 3. Screens and components

### Landing
- Headline: *"Is solar worth it on your roof? Find out under BC's new 2026 rules."*
- One big address input. Three example chips ("Try: a sunny Kitsilano roof", ...) that route
  to pre-verified demo addresses.
- Small print: "Uses Google aerial imagery. Estimates only, not a quote."
- Layout (see §4): sky gradient with a soft sun glow, centred `display-xl` headline, one body line,
  the bare frosted address search as the only call to action, example chips below it.

### Report page

Layout (`components/report/ReportLayout.tsx`): the house window (a locked map; click to explore it
full screen) top left, the answer top right, then a dashboard under both. From 1024px, two columns:

```
house window                        | answer (payback year, verdict, install cost, 25-year savings)
key figures (4 tiles)               | size slider (with a value curve over the track)
savings over time [charts]          | your home (usage + rate plan, opens in place)
                                    | environmental impact · get real quotes
─────────────── analysis grid (3 columns with charts, 2 without) ───────────────
which size pays best [charts] (2)   | where your solar goes + yearly bill
how sure is this? [charts] (2)      | spec sheet
month by month [charts] (2)         | your roof
panel by panel [charts] (full width)
what we assumed [assumptions] (full width)
footer: attribution + every source
```

Narrower, one column in reading order (house, answer, slider, your home, figures, charts…). Without
the `charts` flag, "where your solar goes" moves under the house so that column isn't short.

**Keep it clean (like the original answer card):** each card is a title, the visual and its key number.
No explanatory paragraphs or sub-notes on screen: each chart's takeaway sentence is screen-reader only
(`ChartSection`'s `summary`), how a figure is worked out sits behind an ⓘ, and the numbers behind a
chart are in a closed "See the numbers" table, so nothing depends on hovering or colour. The pure figures behind the dashboard are in `components/report/analysis/derive.ts`.

**VerdictCard** (the hero element)
- Badge: **Strong / Moderate / Weak / Not recommended** (colour + glyph + word, never colour alone),
  styled as the design's VerdictBadge: strong = `good`, moderate = `fair`, weak and not recommended = `poor`
  (not recommended gets its own glyph).
- One sentence: "A 4 kW system pays for itself in about 13 years and saves ~$7,000 over 25."
- Three reason chips, picked from the rules in §5 (e.g., [sun] "1,180 sun-hours, above BC average",
  [roof] "South-west roof, 28° pitch", [warning] "Rebate maxes out at 5 kW"). Icons, not emoji.
- Confidence badge: imagery quality + date ("High-res aerial, Aug 2024").

**MoneyCard**
- A waterfall row: Install cost → − BC Hydro rebate → **Net cost** → Payback → 25-yr net savings.
- Year-1 breakdown: "You use $X of your solar directly (saves ~12.7¢/kWh) and sell $Y back at 10¢/kWh."

**SizeSlider**
- Snaps to `solarPanelConfigs` steps. Label: "10 panels · 3,989 kWh" (first-year AC, the sum of those panels' own output;
  kW DC is in the Spec sheet). Looks like the design's
  PanelSlider (−/+ steppers, `sky-600` filled track, white thumb).
- A star marks the **recommended** size. A faint band shows sizes with payback < lifetime.
- Dragging redraws panels on the map and recomputes everything client-side (<16 ms).

**UsageInputs**
- Toggle: "My bill ($)" ↔ "Annual usage (kWh)". Rate plan: Tiered (default) / Flat.
- The bill input asks **"This bill covers: 1 month / 2 months"**. Many BC Hydro accounts are billed
  every two months, and a 2-month bill typed in as monthly doubles the usage. The amount is
  "as printed, including GST" (the engine strips GST).
- Best input of all: "Annual kWh" from the BC Hydro account's consumption history. Link to where to find it.
- "Electric heat?" hint text that links to the flat rate explanation.

**SpecSheet** (printable)
| Field | Source |
|---|---|
| System size (kW DC) | panelsCount × panel W |
| Panels | count × wattage, dimensions (`panelHeightMeters` × `panelWidthMeters`) |
| Array area (m²) | panelsCount × panel area |
| Est. production (kWh AC/yr) | config `yearlyEnergyDcKwh` × scale × derate |
| Specific yield (kWh/kW) | production ÷ kW, with a BC range check |
| Roof segments used | from `roofSegmentSummaries`: pitch, azimuth (as compass words), panels, kWh |
| Whole roof | area, max panels, max sun-hours/yr |
| Suggested inverter size (kW AC) | ≈ kW DC ÷ 1.2 (label as rule of thumb) |
| Imagery | quality + capture date |
| Next steps | "Get 3 quotes from Home Performance Contractor Network members; apply for self-generation **before** buying equipment (required for the rebate)." |

**Key figures** (always on): year 1 savings, share off the bill, solar cost per kWh over its life, and
dollars back per $1 paid. Number and label only; each ⓘ shows the sum.

**Where your solar goes** (always on): year-1 split used at home vs sold at 10¢, and the yearly bill as a
waterfall (without solar → minus solar used → minus export credit → with solar).

**Your roof** (always on): a compass of the roof faces (wedge = area, sky = used by this size, south-ish arc
marked), sunniest spot and roof area, and a row per face: direction, pitch, a cloud if shaded, panels used.

**[P1, `charts`] Charts**
- *Which size pays best (sweet spot):* x = system kW (each config); one measure at a time, never two
  y-axes: value today (NPV, the default, what the recommendation maximises), total saved, or payback
  years. Recommended and on-screen sizes marked; clicking picks a size.
- *Savings over time (cash flow):* cumulative net savings, years 0–25, break-even marked.
- *How sure is this?:* payback with each assumption at both ends of its BC range (install cost, price
  rises, daytime use, rebate), biggest swing first.
- *Month by month:* year-1 output spread by NRCan's monthly shape for the nearest town, against the
  household's average month.
- *Panel by panel:* every panel spot's year-1 kWh, best first, the ones in use highlighted.

**[P1, `assumptions`] What we assumed**: install cost, price rises, daytime use share, discount rate and
panel size as sliders (range from `INPUT_RANGES`, BC default, why), the rebate as a switch, the fixed BC
facts beside them, and "Reset to BC defaults".

### States
| State | Behaviour |
|---|---|
| Loading | Map flies to the place's location immediately, skeleton cards in the floating panel |
| Wrong building | `findClosest` can pick a neighbour or a garage. Always show "Not your roof? Click your roof on the map" |
| 404 / no coverage | "We don't have roof imagery for this address yet." P0: link to the demo addresses. P1: manual estimate form (sun-facing roof area + facing) → `source: 'manual'` report with a "Rough estimate" badge |
| Low quality (BASE / LOW) | Show results + a "Satellite-based, lower confidence" badge |
| Outside BC | `administrativeArea` present and not "BC" → banner: "This tool uses BC Hydro rates; this address looks like it's outside BC" |
| Roof too small | `configs` empty → verdict Not recommended, `roof_small` chip, no slider |
| Multi-unit / huge roof | If `maxArrayPanelsCount > 150`, note "This looks like a large or multi-unit building; results assume one BC Hydro account" |
| API error / quota | Friendly retry. Ops fallback: switch prod to `SOLAR_SOURCE=fixtures` (serves every cached roof, calls nothing) |

## 4. Visual direction

**Source of truth for anything visual: the Solmap design system (Claude Design, "Daylight")**:
https://claude.ai/artifact/K7zzamvLTAppqvdqZcZtK3. Its README has the full rules and every
component's guidelines. Tokens are in `app/globals.css` under the same names. If this section
and the design disagree, the design wins; data, finance and copy rules elsewhere in this
file and in CLAUDE.md still apply.

- **Feel:** a sunny day seen through frosted glass. Bright sky colours, heavy frost over the map,
  calm type, one clear money answer. Money leads; roof facts support it.
- **Colour:** sky blues carry the interface (`sky-050` page ground, `sky-600` the one action
  colour, `sky-700` links). `sun-500` marks energy, sunshine and the break-even point.
  `good` / `fair` / `poor` (with `*-ink` text and `*-soft` grounds) are **only** for the verdict
  and gains/losses. Text is `ink`, labels and units `ink-secondary`, footnotes `ink-tertiary`.
  Day theme is the default; Dusk (`.dark`) is ready for later.
- **Glass:** anything floating over the map uses the `glass` utility (frost + 1px edge + sheen +
  float shadow); small map controls use `glass-thin`. Never glass on glass: group content inside a
  card on `fill-quiet` tiles. Falls back to solid `sky-050` under `prefers-reduced-transparency`.
- **Type:** system faces (SF Pro on Apple, Segoe UI / system-ui elsewhere), no web font.
  `display-xl` once on the landing page; `title` for the address; `headline` / `body` / `callout`
  for text; `footnote` for assumptions only. Numbers use `font-rounded` + `tabular-nums` at
  `metric-xl` (the hero number) or `metric`. Units are small and `ink-secondary`.
- **Shape:** 4px spacing. Cards `rounded-xl` (24px) padded 20px; tiles `rounded-md`; icon
  tiles `rounded-sm`; buttons, badges, segmented controls and tracks are pills.
- **Layout:** the map is the canvas (full screen); cards float over it, inset 24px on desktop and
  16px on phones, and never split the screen. Below 640px the results panel is a bottom sheet with
  the verdict first.
- **Map:** panels on the roof as dark blue polygons with a thin light stroke; opacity encodes each
  panel's `yearlyEnergyDcKwh` (brighter = more productive), which shows shading without the heatmap.
  The selected building is outlined in `sun-500`.
- **Motion:** 150ms press (scale .97); numbers update instantly with the slider; cards fade and rise
  8px over 250ms. Respect `prefers-reduced-motion`.
- **Focus:** 2px solid `focus-ring` outline, 2px offset, on every interactive element.
- **Voice:** plain, warm, second person, sentence case, no exclamation marks or emoji, no jargon
  ("ROI", "LCOE") on screen. Net money figures carry a sign and a true minus (−$4,200).
- Attribution line under the results: "Source: Includes solar data from Google."
  Keep the Google Maps logo visible on the map.

## 5. Verdict rules (implemented in `lib/finance/verdict.ts`)

Computed for the **recommended** configuration; first match wins. Thresholds live in
`TUNING.verdict` (`src/config/bc.ts`), and the reasoning is in docs/FINANCIAL_MODEL.md → Verdict.

| Verdict | Rule |
|---|---|
| Strong | payback ≤ 12 yrs **and** NPV ≥ $2,500 |
| Moderate | payback ≤ 18 yrs **and** NPV ≥ $1,000 |
| Weak | pays back within lifetime (25 yrs) |
| Not recommended | never pays back within lifetime, or no configs (roof too small) |

Reason chips (top 3; order: the chip that explains the verdict first, then warnings, then positives):

| kind | When | Tone | Example text |
|---|---|---|---|
| `sun` | `maxSunshineHoursPerYear` vs `TUNING.bcReferenceSunHours` | good / warn | "☀ 1,350 sun-hours a year, above the BC typical" |
| `orientation` | dominant used segment's azimuth as compass words; 315–45° = warn | good / warn | "↗ South-west roof, 28° pitch" |
| `shading` | used segment `(q[5] − q[1]) / q[5] > TUNING.shadingSpread` | warn | "Partial shading on the main roof" |
| `rebate_cap` | recommended kW ≥ 5 **or** the max-size config is > 5 kW | neutral | "BC Hydro's rebate stops growing at 5 kW" |
| `export_share` | year-1 exported / produced > `TUNING.exportShareWarn` for the **selected** size | warn | "62% of this size would sell at 10¢; smaller pays back faster" |
| `oversized` | `offsetPct > 1` | warn | "Produces more than you use" |
| `small_savings` | missed Moderate only because of the NPV floor | warn | "Pays back, but saves only ~$700 over 25 years" |
| `roof_small` | no configs | warn | "Not enough usable roof for panels" |
| `imagery` | quality BASE/LOW, or imagery older than 5 years | neutral | "Satellite imagery, lower confidence" |

## 6. Architecture

```
Browser (Next.js client)
  ├─ Maps JS + Places (browser key, referrer-restricted)
  ├─ lib/finance (pure TS, runs on every slider move)
  └─ fetch /api/solar/*  ─────────────┐
                                      ▼
Next.js server (Docker on VPS, behind Caddy)
  ├─ /api/solar/building   → solar.googleapis.com/v1/buildingInsights:findClosest
  ├─ /api/solar/layers     → dataLayers:get + geoTiff:get (rasters cached as bytes)  (P1)
  ├─ /api/solar/heatmap    → PNG rendered from the cached rasters, no Google call  (P1)
  ├─ zod validation → trim to BuildingResponse
  ├─ lib/solar/cache.ts: memory LRU → disk cache (fixtures/solar/, ≤ 25 days) → Google (if SOLAR_SOURCE allows)
  ├─ per-IP rate limit
  └─ SOLAR_SOURCE=fixtures → disk cache + fixtures/synthetic/*.json only, never Google
Postgres (P2, optional): share links = inputs only
```

### Our API contract

`GET /api/solar/building?lat={number}&lng={number}`

- 200 → `BuildingResponse` (see `src/types/app.ts`)
- 404 → `{ error: "NO_COVERAGE", message }` (no data at any quality we accept; see below)
- 400 → `{ error: "BAD_REQUEST", message }` (zod failure; lat/lng must be inside BC's bounding box: lat 48.2–60.0, lng −139.1 to −114.0)
- All responses: `Cache-Control: private, no-store` (Google's terms cap caching at 30 days; don't let a CDN or browser decide).
- 429 → `{ error: "RATE_LIMITED" }`
- 502 → `{ error: "UPSTREAM", message }`

Server-side, make **one** call with `requiredQuality=LOW`. It's a *minimum*, and the API always
returns the best quality it has, so a single call gets HIGH where HIGH exists and still widens
coverage. Only if that 404s **and** `SOLAR_EXPANDED_COVERAGE=1`, retry once with
`experiments=EXPANDED_COVERAGE&requiredQuality=BASE` (pre-GA satellite data; B confirms before the
event whether it returns anything in BC). See docs/SOLAR_API.md → Quality and coverage.

Data source by `SOLAR_SOURCE` (details in docs/INFRA.md → Data sources):

| Mode | Lookup order | On a miss |
|---|---|---|
| `fixtures` | disk cache → nearest synthetic roof within 250 m | 404 `NO_COVERAGE` (the error state for free) |
| `cache` | memory → disk cache | call Google once, save the result (including 404s) to disk |
| `live` | memory | call Google |

A cached entry matches when the requested point is inside the cached building's `boundingBox`
(the same building `findClosest` would return) or within 5 m of the point that was originally requested
(covers cached 404s).

`GET /api/solar/layers?lat&lng` (P1 sun heatmap; only called when the user opens it):

- 200 → `SolarLayersResponse` (see `src/types/app.ts`): `bounds`, `heatmapUrl`, `fluxScale` (legend), imagery, `source`.
  The map draws it with `new google.maps.GroundOverlay(heatmapUrl, bounds)`. No GeoTIFF code in the browser.
- 404 `NO_COVERAGE` (no building, or no Data Layers for it), 400 / 429 / 502 as above; `Cache-Control: private, no-store`.
- Server side: resolve the building first (never spend a Data Layers call on a roof we can't see), then one
  `dataLayers:get` per building (`view=IMAGERY_AND_ANNUAL_FLUX_LAYERS`, radius = half the bbox diagonal + 5 m,
  clamped 15–50 m, `pixelSizeMeters=0.25`, same quality rule as findClosest). Its raster URLs only work for an
  hour, so the annual-flux and mask GeoTIFFs are downloaded immediately and cached as bytes next to the JSON
  (same 25-day expiry). The server decodes them, reprojects the bounds and colours the flux on a fixed scale
  (the approach of Google's js-solar-potential sample, moved server-side).
- `SOLAR_SOURCE=fixtures`: synthetic roofs get a synthetic heatmap built from their roof segments.

`GET /api/solar/heatmap?id=…` → `image/png`, transparent outside the roof. The id comes from `/layers` and only
resolves in our own cache (404 once expired), so nothing from the browser is ever forwarded to Google.

### Data flow for the slider

```
BuildingResponse.configs[i] ──┐
FinanceInputs (bill, plan, …) ├─► lib/finance.evaluate() ─► ScenarioResult ─► cards + map
selected i (slider) ──────────┘
lib/finance.recommend(building, inputs) ─► Recommendation (index, all ScenarioResults for charts)
```

`recommend` evaluates every config once per input change (typically < 100 configs × 25 years, trivial).
