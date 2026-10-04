# Financial model (BC, post-July 2026)

Owner: **C (Finance)**. Implementation: `lib/finance/*`. Constants: `src/config/bc.ts`.
Engine API: `FinanceEngine` in `src/types/app.ts`. Golden tests: `fixtures/finance-golden.json`
(must pass within ±0.5%).

The Solar API only returns `financialAnalyses` for US addresses. For BC we follow Google's
published non-US method (lifetime production, cost with vs. without solar, pick the size
with the most savings) and adapt it to **BC Hydro's actual tariffs** and the **new
self-generation rate (RS 2289)**.

## Why BC is different now

Until June 30, 2026, net metering banked exported kWh at retail value, so every kWh was worth
~11–14¢. From **July 1, 2026**, new systems go on **RS 2289**:
- Power you **use as it's produced** avoids your normal rate (11.87–14.08¢ tiered, or 12.70¢ flat).
- Power you **export** is bought at a flat **10¢/kWh**, paid each billing cycle.
- Existing net-metering customers stay on RS 1289 for 10 years from their start date. Our
  user is a *new* customer, so we model RS 2289 only.

So the *share of production you use yourself* now matters. That share **falls as the system
grows**: the first panels cover your daytime load, and every extra panel mostly exports at 10¢.
Combined with the rebate cap (full $1,000/kW only up to 5 kW), the best NPV usually lands at
**about 5 kW, often well below what the roof can hold**. That's the core insight to show.

> What to expect from real roofs: with default inputs, a decent BC roof recommends ~4–5 kW
> (12–13 panels) almost every time, because the rebate cap sets the sweet spot. What varies
> by roof is the payback and whether the verdict clears the money thresholds.

## Inputs (`FinanceInputs`)

| Input | Default | Range (clamped) | Source / note |
|---|---|---|---|
| `annualConsumptionKwh` | 10,000 | 1,000–60,000 | BC Hydro: average household ≈ 10,000 kWh/yr. Or derived from a bill (below). |
| `ratePlan` | `"tiered"` | | BC Hydro default plan; `"flat"` (RS 1151) can suit high-usage electric-heat homes |
| `panelWatts` | 400 | 300–500 | Matches API `panelCapacityWatts`; user can set e.g. 440 |
| `costPerWatt` | $2.50 / W DC | 1.50–5.00 | BC Hydro: $2,000–3,000 per kW DC installed, average $2,500 |
| `dcToAcDerate` | 0.85 | | Google's default |
| `daytimeLoadShare` | 0.35 | 0.20–0.60 | **Assumption.** Share of yearly usage that overlaps solar production. Caps self-use (see below). Slider in the assumptions drawer. |
| `exportRate` | $0.10 / kWh | | RS 2289, fixed (we don't escalate it) |
| `degradation` | 0.995 / yr | | BC Hydro: ~0.5%/yr |
| `lifetimeYears` | 25 | | BC Hydro: industry average panel lifespan ~25 yrs (Google uses 20) |
| `costIncrease` | 1.03 / yr | 1.00–1.05 | **Assumption.** Recent increases were 3.75% in 2025 and 2026 under a cap that expires after FY2026-27; Google's US default is 2.2% |
| `discountRate` | 1.04 / yr | 1.00–1.08 | Google's default |
| `rebateEligible` | true | | false → rebate 0. Show as "I'm a BC Hydro customer and will get approval before buying" |
| `battery` (P1) | off | | `{ kWh, costPerKwh, peakSaver }`; rebate $500/kWh, max 50% of cost, cap $1,500 ($5,000 with Peak Saver) |

Ranges live in `INPUT_RANGES` (`bc.ts`). Out-of-range values are clamped and the scenario gets a
`CLAMPED_INPUT` warning, so the engine never sees 0 consumption or a 0% discount rate.

## Tariffs (`src/config/bc.ts`)

| Plan | Energy | Basic charge | Notes |
|---|---|---|---|
| Tiered (RS 1101) | 11.87¢ up to threshold, 14.08¢ above | 23.44¢/day | Threshold = 22.1918 kWh × days in period (≈ 675 kWh / 30 days, 1,350 kWh / 60 days) |
| Flat (RS 1151) | 12.70¢ | 25.00¢/day | |

Simplifications (fine for a hackathon; list them in the UI's "About the estimate"):
monthly periods of 365/12 days, even consumption across months, rate riders ignored,
time-of-day pricing ignored, GST left out of savings (it's only stripped from a bill the user types in).

## Formulas

```
DAYS = 365 / 12

monthlyBill(kWh, plan):                  // pre-tax
  flat:   DAYS × basic + kWh × rate
  tiered: DAYS × basic + min(kWh, T) × tier1 + max(0, kWh − T) × tier2,   T = 22.1918 × DAYS

annualKwhFromBill(amount, periodMonths, plan):   // exact inverse; amount includes GST
  m = amount / (1 + GST) / periodMonths           // pre-tax monthly bill
  e = m − DAYS × basic;  if e ≤ 0 → 0
  flat:   kWh = e / rate
  tiered: kWh = e / tier1                        if e ≤ T × tier1
          kWh = T + (e − T × tier1) / tier2      otherwise
  return 12 × kWh

selfUsed(prod, C):                        // the self-use curve, C = annual consumption
  K = daytimeLoadShare × C                // the most you could ever use directly
  return K × (1 − exp(−prod / K))

For a given config c (inputs clamped first):
  scale        = panelWatts / apiPanelWatts
  systemKwDc   = c.panelsCount × panelWatts / 1000
  acKwhYear1   = c.yearlyEnergyDcKwh × scale × dcToAcDerate
  installCost  = systemKwDc × 1000 × costPerWatt
  rebate       = rebateEligible ? min(1000 × systemKwDc, 0.5 × installCost, 5000) : 0
  netCost      = installCost − rebate
  billNoSolar  = 12 × monthlyBill(C / 12)

  for t in 0 … lifetimeYears−1:
    prod_t     = acKwhYear1 × degradation^t
    self_t     = selfUsed(prod_t, C)
    export_t   = prod_t − self_t
    billWith_t = 12 × monthlyBill((C − self_t) / 12)
    savings_t  = (billNoSolar − billWith_t) × costIncrease^t  +  export_t × exportRate
    cumulative_t = −netCost + Σ savings_0..t
    npv       += savings_t / discountRate^t          (starting from −netCost; Google's convention)

  paybackYears = t + (−cumulative_{t−1}) / savings_t   at the first t where cumulative_t ≥ 0
                 (cumulative_{−1} = −netCost; null if never)
  lifetimeNetSavings = cumulative_{lifetime−1}
  offsetPct    = acKwhYear1 / C
  specificYield = acKwhYear1 / systemKwDc
  year1        = { selfUsedKwh: self_0, exportedKwh: export_0,
                   selfUsedValue: billNoSolar − billWith_0, exportValue: export_0 × exportRate,
                   total: savings_0 }
```

### Self-use, and why it's a curve

`self = K × (1 − e^(−prod/K))` behaves the way real homes do without a battery:
- Small system (prod ≪ K): almost everything is used on-site (self ≈ prod).
- Big system (prod ≫ K): self-use flattens out at K, and the extra panels just export at 10¢.

With the defaults, a 10 MWh/yr home exports ~20% of a 1.6 kW system's output, ~45% at 4.8 kW and
~65% at 9.6 kW. A fixed ratio (the kit's first version used 50% at every size) can't show that,
and it would make the "export share" reason chip impossible to trigger.

`daytimeLoadShare` = 0.35 is our assumption for BC (winter-peaking, often electric-heat loads
vs summer-peaking solar). It's the most uncertain number in the model, so it's a slider.

**Battery (P1):** model as raising the cap: `K = (daytimeLoadShare × C) + min(0.9 × kWh × 250, 0.3 × C)`
(≈250 useful cycles/yr at 90% round-trip; `BATTERY_MODEL` in `bc.ts`). Mark it ASSUMPTION. Only applies when
`inputs.battery` is set; there is no default battery or default `costPerKwh`. Battery cost (`kWh × costPerKwh`) is
added to `installCost` and its rebate to `rebate`, so `netCost = installCost − rebate` still holds. Battery rebate =
`min($500 × kWh, 50% of battery cost, $1,500 or $5,000 with Peak Saver)`, 0 under 5 kWh or when `rebateEligible` is false.
`peakSaver: true` also adds BC Hydro's Peak Saver rewards (`PEAK_SAVER` in `bc.ts`): the one-time $500 enrollment
incentive goes into `rebate`, and the $250 winter reward is added to every year's savings (not escalated). These don't
depend on `rebateEligible`. Battery lifetime and replacement are not modelled, so the reward runs for all `lifetimeYears`
(ASSUMPTION; a battery usually lasts 10–15 years).

Note the tiered subtlety: solar trims the **Step 2** kWh first, so tiered households
over the threshold save at 14.08¢. The bill-difference formulation handles this for free.

## Recommendation

Evaluate every config. Let `best` = max NPV.
- If `best ≥ 0`: recommend the **smallest** config with `npv ≥ best − TUNING.recommendNpvTolerance` ($100).
  (Floats never tie exactly, and a $20 NPV gain isn't worth 2 more panels.)
- If `best < 0`: recommend the config with the shortest payback; if none pays back, index 0.
- No configs: `recommendedIndex = null`, verdict `not_recommended`, reason `roof_small`.

## Verdict (computed for the recommended config; first match wins)

| Verdict | Rule (thresholds in `TUNING.verdict`) |
|---|---|
| Strong | payback ≤ 12 yrs **and** NPV ≥ $2,500 |
| Moderate | payback ≤ 18 yrs **and** NPV ≥ $1,000 |
| Weak | pays back within `lifetimeYears` |
| Not recommended | never pays back, or no configs |

The NPV floor (the materiality rule) matters. Without it, the recommender can almost always
find a tiny 1.6–2 kW system that the $1,000/kW rebate makes pay back in ~15 years, and every
mediocre roof would come out "Moderate" while saving $150 a year. When a roof misses Moderate
only because of the NPV floor, add the `small_savings` reason chip ("Pays back, but saves only ~$X over 25 years").

Reason chips are in DESIGN.md §5.

## Manual estimate (P1, for the no-coverage state)

When Google has no roof, the user gives: sun-facing roof area (m²), facing (S/SE/SW/E/W/N/flat).
`manualBuilding({ center, roofAreaM2, facing })` in `lib/finance/manual.ts` returns `{ building, clamped, yieldFrom }`.
`building` is a `BuildingResponse` with `source: 'manual'`, no panels, one segment, and synthetic configs for
`MANUAL.minPanels` (4) … maxPanels. Constants are in `MANUAL` and `BC_SOLAR_YIELD` (`src/config/bc.ts`):

```
area        = clamp(roofAreaM2, 0, MANUAL.maxRoofAreaM2)                       // 300 m²; NaN → 0
maxPanels   = floor(area × MANUAL.usableFraction / (panel.heightMeters × panel.widthMeters))   // 1.879 × 1.045 m
town        = nearest BC_SOLAR_YIELD town to center                           // NRCan, ~40 BC towns
acKwhPerKw  = facing = FLAT ? town.flat : town.south × orientationFactor[facing]
dcPerPanel  = acKwhPerKw / DEFAULT_INPUTS.dcToAcDerate × panel.capacityWatts / 1000
config(n)   = { panelsCount: n, yearlyEnergyDcKwh: n × dcPerPanel, segments: [{ segmentIndex: 0, … }] }
```

- **Yield is AC and local.** NRCan's municipal PV potential is AC kWh per kWp after all losses
  (performance ratio 0.75). `south` is the south-facing latitude−15° tilt column (34–44° in BC, the
  closest to the assumed 30° pitch), and `flat` is the horizontal column. Dividing by the default derate
  cancels `evaluate`'s × `dcToAcDerate`, so at default inputs the AC result is NRCan's, with losses counted once.
  A south roof makes 1025 kWh/kW in Vancouver, 1150 in Kelowna and 808 in Prince Rupert. Show
  `yieldFrom.town` in the assumptions ("Sun data for Kelowna, NRCan").
- **`clamped`** is true when the area was out of range or not a number. Show the same "we adjusted your
  input" notice as `CLAMPED_INPUT`.
- The segment carries `azimuthDegrees[facing]` and an assumed `pitchDegrees` (30°, 0° when flat), so the
  orientation chip works. For manual roofs it shows only the user's input ("Roof faces south", "Flat roof"),
  never the assumed pitch.
- No imagery: `imagery` is `{ quality: 'LOW', date: '' }` because the contract requires it, and `reasonChips`
  skips the imagery chip. With no sunshine data, the shading and sun chips never appear.
- Fewer than 4 panels (or bad input) → `configs: []` → `recommend` says "Not enough usable roof".
- A north roof (Vancouver: 1025 × 0.6 ≈ 615 kWh/kW AC) falls below the sanity band and gets
  `SPECIFIC_YIELD_OUT_OF_RANGE`, which is fair.

Then run the normal `recommend`. Show a "Rough estimate, no roof imagery" badge.

## Golden tests (`fixtures/finance-golden.json`)

| Section | Tests | Shape |
|---|---|---|
| `bill.monthlyBill` | `monthlyBill` | `{ plan, monthlyKwh, expectedMonthlyBill }` |
| `bill.annualKwhFromBill` | `annualKwhFromBill` | `{ plan, billAmountInclGst, periodMonths, expectedAnnualKwh }` |
| `scenarios` | `evaluate` | `{ apiPanelWatts, config, inputs (overrides on top of defaults), expected (ScenarioResult subset) }` |
| `battery` | `evaluate` with `inputs.battery` (P1) | same as `scenarios`; kept separate because `battery` has no default |
| `recommend` | `recommend` | `{ configs, inputs, expected: { recommendedIndex, panelsCount, verdict, npv, paybackYears } }` |

`defaults` in the file equals `DEFAULT_INPUTS`; assert that too, so a changed default can't
silently break every case. For `recommend` cases, build a minimal `BuildingResponse` stub
from `configs` (or load the named synthetic fixture through B's trim once it exists).

Highlights:

| Case | kW | AC kWh/yr | Net cost | Export | Payback | 25-yr net | NPV |
|---|---|---|---|---|---|---|---|
| Flat, 10 MWh/yr, 20 panels (9,000 DC kWh) | 8.0 | 7,650 | $15,000 | 59% | 16.3 yrs | $9,490 | $513 |
| Tiered, 14 MWh/yr (electric heat), same roof | 8.0 | 7,650 | $15,000 | 49% | 14.7 yrs | $12,891 | $2,541 |
| Flat, 10 MWh/yr, **10 panels** (4,600 DC kWh) | 4.0 | 3,910 | $6,000 | 40% | **12.1 yrs** | $8,017 | **$2,789** |
| Flat, 20 × **440 W** panels | 8.8 | 8,415 | $17,000 | 62% | 16.9 yrs | $9,473 | −$203 |
| Synthetic south roof, recommend (tiered, 10 MWh) | 4.8 | 4,763 | $7,200 | 45% | 11.7 yrs | $10,131 | $3,680 → **Strong** |
| Synthetic shaded roof, recommend | 2.0 | 1,360 | $3,000 | 17% | 14.2 yrs | $2,993 | $723 → **Weak** (NPV floor) |
| Same roof at max size (53 panels) | 21.2 | | | | never | −$964 | −$17,797 |

Row 3 vs row 1 is the demo insight: half the system has **5× the NPV**, pays back 4 years
sooner and exports less, because the rebate is at its full $1,000/kW and less power sells at 10¢.

## Sanity checks to implement

- Specific yield (`acKwhYear1 / systemKwDc`) outside 700–1,400 kWh/kW → `SPECIFIC_YIELD_OUT_OF_RANGE`
  and a "check this estimate" badge. BC Hydro: 10 kW makes 10,000–12,000 kWh/yr. (Heavily shaded
  roofs can legitimately fall below 700; the badge wording should allow for that.)
- `offsetPct > 1` → `PRODUCES_MORE_THAN_USE` and the `oversized` chip.
- Never show a negative rebate or cost; clamp inputs (above) instead of guarding everywhere.

## What we deliberately don't model (say so in the UI)

GST on savings and bill riders; time-of-day rates; seasonal mismatch beyond the self-use curve;
inverter replacement (~year 12–15); roof replacement; financing (the federal Greener Homes Loan
closed to new applicants on Oct 1, 2025); FortisBC or municipal utilities (rebates are BC Hydro /
New Westminster only); property-value effects.

## Sources

- BC Hydro tiered rate: https://app.bchydro.com/accounts-billing/rates-energy-use/electricity-rates/residential-rates/tiered.html
- BC Hydro flat rate: https://app.bchydro.com/accounts-billing/rates-energy-use/electricity-rates/residential-rates/flat.html
- RS 2289 self-generation rate (10¢/kWh, effective July 1, 2026): https://www.bchydro.com/toolbar/about/strategies-plans-regulatory/rate-design/self-generation-rate-updates.html
- Solar & battery rebates: https://app.bchydro.com/accounts-billing/electrical-connections/customer-generation/solar-battery-rebates.html
- Rebate Terms and Conditions (effective 2026-07-29; §8 defines the residential single-family solar rebate as $1,000/kW, capped at the lesser of 50% of cost and $5,000): https://app.bchydro.com/content/dam/BCHydro/customer-portal/documents/power-smart/residential/programs/solar-battery-rebate-terms-and-conditions.pdf
- Costs, yield, lifespan, degradation: https://www.bchydro.com/powersmart/residential/tips-technologies/solar-panels.html
- Manual-estimate yield by town (NRCan PV potential, municipality database, updated 2024-02-15): https://ftp.maps.canada.ca/pub/nrcan_rncan/Solar-energy_Energie-solaire/photovoltaic_canada_photovoltaique/municip_potentiel-potential.csv
- Google non-US cost method: https://developers.google.com/maps/documentation/solar/calculate-costs-non-us
- Orientation factors (manual estimate): https://pvwatts.nrel.gov/
