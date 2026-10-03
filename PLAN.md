# PLAN.md — 24-hour build plan

## The pitch (30 seconds)

> BC changed the rules for rooftop solar on July 1, 2026. Net metering is closed. Exported
> power now earns 10¢/kWh, but the power you avoid buying still saves 12–14¢. Most
> solar calculators still assume the old deal. **Solmap** takes your address, reads your
> actual roof from Google's aerial data, and tells you honestly whether solar pays off
> under BC's new rules, what size to install, and exactly what you'd be buying.

What makes it stand out:
- **It's a real roof, not a zip-code average.** Panels are drawn on *your* roof segments.
- **Current BC economics.** RS 2289 export rate, BC Hydro's rebate ($1,000/kW, capped at
  $5,000), tiered or flat rate plan.
- **An honest verdict.** A good Vancouver roof sized right pays back in roughly 11–13 years;
  sized to fill the roof, the same house may never pay back. We say that plainly and show
  the sweet spot. Right now it's usually around 5 kW, well below the max, because the
  rebate stops growing at 5 kW and every extra panel mostly exports at 10¢.

## Scope

### P0 — the demo must do this (target: working end-to-end by hour 10)
- Address autocomplete (`PlaceAutocompleteElement`, Places API (New)) → location → `buildingInsights`.
- "Not your roof? Click it": map click re-queries `findClosest` at the clicked point.
- Map zoomed to the building, with **panels drawn on the roof**.
- **Panel-count slider** that redraws panels and updates every number live.
- Inputs: bill amount + period (1 or 2 months) **or** annual kWh; rate plan (tiered / flat).
- Results: system kW, annual kWh (AC), % of usage covered, install cost, rebate, net cost,
  payback years, 25-year net savings, **verdict** with its three main reasons.
- **Recommended size** (max NPV over `solarPanelConfigs`), marked on the slider.
- Spec sheet: panel count × wattage, array area, roof segments used (pitch, azimuth,
  area, panels), imagery quality and date.
- 404 / no-coverage state (friendly message + demo addresses). Attribution. Deployed on our domain with HTTPS.

### P1 — do after P0 is deployed (hours 10–18)
- **Sun heatmap overlay** from dataLayers `annualFluxUrl` (GeoTIFF → canvas → map overlay).
- **Savings-vs-size chart** (x = kW, y = NPV and payback). This is the "sweet spot" visual.
- Cumulative cash-flow chart (years 0–25, break-even marked).
- Assumptions drawer: cost/W, daytime usage share (self-use cap), rate escalation, discount rate, panel W, rebate eligibility.
- **Battery scenario** toggle (raises self-consumption, adds cost and a battery rebate).
- Print-friendly report / "Save as PDF" (CSS print stylesheet, not a PDF library).
- **Manual estimate** for no-coverage roofs (roof area + facing → synthetic configs; C builds
  `lib/finance/manual.ts`, D the form). See FINANCIAL_MODEL.md → Manual estimate.

### P2 — only if ahead
- Plain-language summary written by an LLM from the computed numbers (numbers stay ours).
- Share link with saved assumptions (query string first; Postgres only if needed).
- Compare two addresses side by side.
- Monthly production chart from dataLayers `monthlyFluxUrl`.

## Data roadmap

We build on free data first and let real data in step by step. Every real roof costs one Google call,
ever (within 25 days), thanks to the disk cache. Mechanics: docs/INFRA.md → Data sources.

| Phase | When | `SOLAR_SOURCE` | Data we have | Google calls |
|---|---|---|---|---|
| **0. Synthetic** | Hours 0–5 | `fixtures` everywhere | 2 hand-made roofs (Strong, Weak) + the 404 state | 0 |
| **1. Demo roofs** | Pre-event (≤ 25 days out) or hour 1 | B runs `pnpm solar:warm` on the demo list | + 5 real roofs, incl. the no-coverage one | ~5–10, once |
| **2. Real roofs on the VPS** | Checkpoint 1 (hour 5) | VPS `cache`; laptops stay `fixtures` | + any roof the team tries on the deployed site | 1 per new roof |
| **3. Production** | Checkpoint 2 (hour 10) | prod `cache` (demo roofs already warm) | + roofs judges try | 1 per new roof |
| **4. Sun heatmap** | P1 | same, cache extended to dataLayers + GeoTIFF bytes | + annual flux + roof mask rasters | 1 Data Layers call per roof (the $75/1,000 SKU) |

Laptops only switch to `cache` when someone needs a specific real roof locally (B's IP is on the key);
everyone else pulls nothing from Google. Only A runs a live map in dev; D uses a placeholder until checkpoint 1.

**Further data goals** (after P1, roughly in value order; each one is a new cached source or input, not a rewrite):
1. **More synthetic roofs** for edge cases: flat roof, east–west roof, tiny roof (no configs), multi-unit (> 150 panels),
   BASE-quality imagery. Cheap, no Google calls, and they harden B's parser and D's states. Keep the generator
   recipe in the fixture `_note`.
2. **Monthly flux** (`monthlyFluxUrl`) → monthly production chart (P2), and later a **seasonal self-use model**
   (BC's summer-heavy solar vs winter-heavy load) to replace part of the `daytimeLoadShare` assumption.
3. **The user's own BC Hydro usage**: account holders can download their consumption history from MyHydro (check the export format first).
   An upload (parsed in the browser, never stored) gives real annual kWh and, with hourly data,
   real self-use instead of our assumption. Biggest accuracy win per hour of work.
4. **Existing panels**: `additionalInsights=DETECTED_ARRAYS` (GA May 2026) → "this roof already has solar" state.
5. **Hourly shade** (`hourlyShadeUrls`): shade animation by month. Impressive, expensive to build; last.

### Out of scope (say no fast)
User accounts, installer marketplace, non-BC utilities (FortisBC etc.), commercial buildings,
native mobile.

## Team (4 devs): one owner per area

| Role | Owns | P0 deliverables | P1 |
|---|---|---|---|
| **A: Map & Geo** | `components/map/*`, `lib/geo/*` | Map with Map ID, Places autocomplete, building bounds fit, panel polygons from `solarPanels`, slider → visible panel count | Flux heatmap overlay (with B) |
| **B: API & Infra** | `app/api/*`, `lib/solar/*`, `scripts/*`, `docker/`, `.github/`, `fixtures/synthetic/` | Solar proxy routes, zod parsing into `BuildingResponse`, single-call quality handling + 404, `SOLAR_SOURCE` modes + disk cache with expiry, `solar:warm`, VPS deploy, env/secrets | dataLayers + geoTiff proxy (through the same cache), rate limiting |
| **C: Finance** | `lib/finance/*`, `src/config/bc.ts`, `fixtures/finance-golden.json` | Bill model (tiered/flat, bill → kWh), projection with the self-use curve, rebate, payback, NPV, recommendation, verdict + reasons. Golden tests green | Battery scenario, manual estimate, size-sweep data for the chart, sensitivity |
| **D: Report UI & Pitch** | `app/report/*`, `components/report/*`, `components/inputs/*`, deck | Landing page, report layout, VerdictCard, MoneyCard, SpecSheet, inputs, attribution, empty/error states | Charts, assumptions drawer, print CSS, deck + demo script |

The lead (whoever's closest to the idea) also owns the **contracts** in `src/types/app.ts`
and does the integration merge at each checkpoint.

**Pairing rule:** A↔B share the `BuildingResponse` shape; C↔D share `ScenarioResult`. If
you need to change one, post in the channel and get a 👍 from the other owner first.

## Timeline

Times are hours from kickoff. Checkpoints are hard stops: everyone merges, lead
integrates, 10-minute sync.

| Hours | What happens |
|---|---|
| **0:00–0:45** | Kickoff. Re-read CLAUDE.md/DESIGN.md. Lead scaffolds repo (`create-next-app`, shadcn init, drop in this kit), pushes, confirms CI is green. B confirms keys work with one live call from the VPS. **Freeze contracts.** |
| **0:45–5:00** | Parallel build **against the synthetic fixtures** (`SOLAR_SOURCE=fixtures`, no keys needed; Data roadmap phase 0). A: map + panels. B: API routes + deploy pipeline. C: finance engine + golden tests. D: report layout with a mock `Recommendation`. |
| **5:00** | **Checkpoint 1**: real building on map, real numbers on screen for one fixture address. Deployed to solmap.yardstick.football (behind Cloudflare Access), which switches to `SOLAR_SOURCE=cache` (phase 2). |
| **5:00–10:00** | Wire live API. Slider end-to-end. Verdict + recommendation. Spec sheet. Error states. |
| **10:00** | **Checkpoint 2 = P0 done.** Full demo path works on the deployed URL with 3 demo addresses. Tag `v0-demo` and note its `sha-` image tag (that's what the demo freeze pins). If P0 isn't done, **nobody starts P1**. |
| 10:00–12:00 | Sleep rotation starts (2 on / 2 off, 3-hour blocks). Whoever's up picks from the P1 list. |
| **12:00–18:00** | P1 features, each behind a small flag so it can be switched off. |
| **18:00** | **Checkpoint 3 = feature freeze.** Only bug fixes, copy and polish after this. |
| 18:00–21:00 | Polish: loading skeletons, mobile layout, number formatting, empty states, a11y pass. Record a backup demo video. |
| 21:00–23:00 | Deck (5 slides), 3-minute demo script, **two full rehearsals** on the deployed URL. |
| 23:00–24:00 | Submit. Buffer for the unexpected. |

## Pre-event checklist (do this before the clock starts)

> ⚠️ First check the hackathon's rules about **pre-written code**. Planning docs, config
> and boilerplate are usually fine; feature code often isn't. This kit is docs, types and
> infra config on purpose. Keep any code written before the event out of the repo if the
> rules require it.

**Google Cloud (B)**
- [ ] Project `solmap` with billing enabled. Delete the unrestricted "Maps Platform API Key" Google may auto-create.
- [ ] **Budget alert: $20, alerts at 25 / 50 / 100%.** Expected spend is $0 (see pricing below), so even
      the $5 alert means something is wrong. Budgets only alert; the quotas below are what actually stop spend.
- [ ] Enable: Solar API, Maps JavaScript API, Places API (New). (Geocoding only if you want a server-side fallback.)
- [ ] **Server key** (Solar API only), restricted by **IP** to the VPS's IPv4 **and IPv6** (`curl -4 ifconfig.me`,
      `curl -6 ifconfig.me`), plus B's IP for recording fixtures. Remove B's IP after the event.
- [ ] **Browser key** (Maps JS + Places (New) only), restricted by **website**: `http://localhost:3000/*`,
      `https://solmap.yardstick.football/*` (no wildcard).
- [ ] Create a **Map ID** (JavaScript, vector) for advanced markers.
- [ ] **Set quotas** (each API → Quotas & system limits; per-day where offered, else per-minute):

  | API | Per day | Per minute |
  |---|---|---|
  | Solar Building Insights | 1,000 | 60 |
  | Solar Data Layers | 50 (or 0 until the heatmap is being built) | 5 |
  | Maps JavaScript (map loads) | 3,000 | |
  | Places API (New) | 2,000 | |

  Why: everything we use has a free monthly allowance far above hackathon volume, so the risk
  is a bug or a leaked key, not normal use. A render loop at the 600/min rate limit would cost
  ~$360/hour on Building Insights and ~$2,700/hour on Data Layers once the free allowance is gone.
  If a cap bites on demo day, raise it in the console (1 min) or flip to fixtures.

  Pricing as of 2026-10-03 (USD, [source](https://developers.google.com/maps/billing-and-pricing/pricing)).
  Free allowances are most likely per billing account, so other Maps usage on that account would share them:

  | SKU | Free / month | Then |
  |---|---|---|
  | Solar Building Insights (Essentials) | 10,000 | $10 per 1,000 |
  | Solar Data Layers (Enterprise) | 1,000 | $75 per 1,000 |
  | Dynamic Maps (map loads) | 10,000 | $7 per 1,000 |
  | Place Details Essentials (location + address) | 10,000 | $5 per 1,000 |
  | Autocomplete Session Usage (ends in Place Details) | unlimited | $0 |

  Expected use: a few hundred Building Insights calls, a few dozen Data Layers calls, a few
  thousand map loads (dev hot reloads count). Assume 404s are billed. Call dataLayers only when the heatmap is opened.
- [ ] **Quality-param test** (10 min, from a whitelisted IP). Results go in the team channel and decide
      `SOLAR_EXPANDED_COVERAGE`:
      1. A known-good Vancouver address with `requiredQuality=LOW` → expect 200 and `imageryQuality` HIGH.
         (If LOW is rejected with a 400, use `MEDIUM` and tell B's prompt.)
      2. A BC address that 404s with `requiredQuality=LOW`.
      3. That same address with `experiments=EXPANDED_COVERAGE&requiredQuality=BASE` → does BC get anything?

**Demo addresses (C + D)**
- [ ] Pick 5 BC addresses and confirm each returns 200 (coverage is spotty, and a 404 can
      happen even inside covered areas). Aim for: a great south-facing roof, a roof where a
      small system clearly wins, a big electric-heat house, a **really** poor roof for the
      contrast, and one no-coverage address for the error state. Expect most decent roofs to
      recommend ~5 kW. "Weak" needs a genuinely poor roof (low sun-hours or north-facing), because
      the rebate makes even small systems on mediocre roofs pay back.
- [ ] Use addresses whose owners are OK with it (your own, a teammate's, or a public building). The
      demo shows their roof and an estimate of their bill on a big screen.
- [ ] Warm them into the disk cache (`pnpm solar:warm -- --file fixtures/demo-addresses.json`, **never
      committed**) no more than 25 days before demo day. The app deletes entries after 25 days (Google's
      limit is 30); if the event is further out, warm them the week before. Wipe the cache after the event.

**Bill model calibration (C)**
- [ ] Take one real BC Hydro bill (yours or a teammate's): put its kWh and period through
      `monthlyBill` by hand, and compare with the printed pre-tax energy + basic charge. Note any rate
      riders on the bill. If we're off by more than ~5%, tell the team before the event.

**Hackathon rules (lead)**
- [ ] Confirm the rule on **pre-written code**. This kit has types, config, infra and data on purpose,
      and no feature code. If even that is off-limits, bring only the docs and re-type the rest at hour 0.

**VPS & repo (B)**
- [ ] The VPS is shared with puckbank + yardstick: follow docs/INFRA.md → One-time VPS setup (checkout,
      Caddy block PR in mojwinter/puckbank, Cloudflare DNS + Access for `solmap.yardstick.football`).
- [ ] Docker + Compose installed, Caddy config tested with a hello-world container.
- [ ] GitHub repo, branch protection on `main` (PR + passing CI), deploy key / SSH secret in Actions.
- [ ] `~/solmap-ops/.env` on the VPS; GHCR package made public after the first build.
- [ ] **Dry-run the whole pipeline** with a throwaway `create-next-app` repo: push → CI → deploy →
      HTTPS → Cloudflare Access prompt → rollback by pinning `SOLMAP_TAG`. Delete the repo after.
      Finding a broken SSH key at hour 4 costs much more than at T-3 days.

**Everyone**
- [ ] Node 22, pnpm, Claude Code logged in, repo cloned.
- [ ] Read CLAUDE.md, DESIGN.md, and the doc for your area.

## Demo script (3 minutes)

1. **Hook (20s):** "July 1 BC changed solar. Here's what it means for a real house."
2. **Type an address (20s):** autocomplete → map flies in → panels appear on the roof.
3. **The verdict (40s):** "Strong. A 4.8 kW system pays back in about 12 years and nets ~$10k
   over 25." Point at the three reasons (sun hours, orientation, rebate cap). *(Replace these
   numbers with the hero address's real ones once it's recorded.)*
4. **The insight (40s):** drag the slider to the max size: export share climbs past 60%, payback
   goes past the panel lifetime. Drag back to the star. "Bigger isn't better under the new export rate."
5. **Spec sheet (20s):** "This is what you'd take to an installer: 12 × 400 W, south segment
   at 30° pitch, ~4,800 kWh/yr."
6. **Contrast (20s):** a shaded or north-facing house → "Weak. Here's why." Honesty = trust.
7. **Close (20s):** stack, what's next (battery + Peak Saver, installer quotes).

Backup: recorded video + `SOLAR_SOURCE=fixtures` on prod (every cached roof still works, nothing calls Google)
in case the venue Wi-Fi or the API fails.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Demo address returns 404 on stage | Pre-verified addresses; fixtures fallback; friendly error state is itself demo-able |
| `findClosest` picks the neighbour's roof | Demo addresses pre-checked visually; "click your roof" re-query |
| A judge asks "where do these numbers come from?" | Assumptions drawer + `bc.ts` sources; the self-use curve explained in one sentence ("small systems are mostly used at home; big ones mostly sell at 10¢") |
| We break Google's terms by accident | No real responses in git or images (synthetic fixtures for CI), disk cache auto-deletes at 25 days, attribution on every Solar view |
| API quota/billing surprise | Daily quota caps; disk cache (one call per roof); laptops on `fixtures`; dataLayers only on demand |
| Disk cache bug serves stale or wrong roofs | `source` field + log line on every lookup; `/demo-check` flags non-`cache` demo addresses; wipe the folder to reset |
| Finance numbers look wrong to judges | Golden tests; BC sanity range check; assumptions visible; sources in `bc.ts` |
| Merge hell at hour 20 | Folder ownership, frozen contracts, checkpoints, feature flags |
| GeoTIFF overlay eats the night | It's P1 and time-boxed to 4 hours. If it isn't working by hour 16, cut it |
| Everyone exhausted at the demo | Sleep rotation from hour 10; rehearse twice |
