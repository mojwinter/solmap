/**
 * Every BC-specific number in one place. Each value carries its source and as-of date.
 * If you change a number, update the source + date in the same commit.
 * Tariffs, RS 2289 and rebates verified 2026-09-27 and re-checked 2026-10-03.
 * Anything marked ASSUMPTION is ours, not BC Hydro's: expose it in the UI.
 */
import type { FinanceInputs } from '../types/app';

const BCH = 'https://app.bchydro.com/accounts-billing/rates-energy-use/electricity-rates/residential-rates';

export const TARIFFS = {
  tiered: {
    schedule: 'RS 1101',
    basicPerDay: 0.2344,
    tier1PerKwh: 0.1187,
    tier2PerKwh: 0.1408,
    thresholdKwhPerDay: 22.1918, // ≈ 675 kWh / 30-day month
    source: `${BCH}/tiered.html`,
  },
  flat: {
    schedule: 'RS 1151',
    basicPerDay: 0.25,
    ratePerKwh: 0.127,
    source: `${BCH}/flat.html`,
  },
} as const;

/** What a customer's bill adds on top of the tariff. Used to turn a bill amount back into kWh. */
export const BILL = {
  gstRate: 0.05, // GST applies to residential electricity; PST does not. Verify on a real bill (PLAN.md → Pre-event)
  /** BC Hydro bills monthly or every two months depending on the account; the UI asks which. */
  periodMonthsOptions: [1, 2] as const,
  /** Rate riders (deferral / trade income) change each April and can be negative; we ignore them. */
  ridersModelled: false,
  source: `${BCH}.html`,
} as const;

export const SELF_GENERATION = {
  schedule: 'RS 2289',
  effective: '2026-07-01',
  exportRatePerKwh: 0.1, // paid each billing cycle; replaces net metering (RS 1289) for new customers
  maxExportKwPerPhase: 100,
  source:
    'https://www.bchydro.com/toolbar/about/strategies-plans-regulatory/rate-design/self-generation-rate-updates.html',
} as const;

export const REBATES = {
  /**
   * Residential Dwelling – Single Family (T&C §8): $1,000/kW DC, capped at the lesser of
   * 50% of installed product cost and $5,000 → min(perKwDc × kW, maxFractionOfCost × cost, maxResidential).
   */
  solar: {
    perKwDc: 1000,
    maxFractionOfCost: 0.5,
    maxResidential: 5000,
  },
  /** T&C §8: $500/kWh, capped at the lesser of 50% of cost and the cap. §4(ii)(i): at least 5 kWh. */
  battery: {
    perKwh: 500,
    maxFractionOfCost: 0.5,
    maxResidential: 1500,
    maxResidentialPeakSaver: 5000,
    minKwh: 5,
  },
  conditions: [
    'BC Hydro (or City of New Westminster) residential account; FortisBC customers not eligible',
    'Rebate paid to the registered property owner (tenanted homes OK); detached, duplex/row/townhome, fixed mobile homes',
    'Self-generation application approved BEFORE buying equipment',
    'Installed by a Home Performance Contractor Network (HPCN) member (since 2026-06-01)',
    'Tesla products not eligible',
    'Battery rebate requires pairing with solar, unless enrolled in Peak Saver',
    'Battery must be on the Qualified Product List and at least 5 kWh',
    'Peak Saver ($5,000 battery cap) requires enrolling the battery within 14 days of the in-service date',
    'First come, first served while funding lasts',
  ],
  source:
    'https://app.bchydro.com/accounts-billing/electrical-connections/customer-generation/solar-battery-rebates.html',
  /** Terms and Conditions, effective 2026-07-29, checked 2026-10-03. §8 states the "lesser of" rule. */
  terms:
    'https://app.bchydro.com/content/dam/BCHydro/customer-portal/documents/power-smart/residential/programs/solar-battery-rebate-terms-and-conditions.pdf',
} as const;

export const INSTALL = {
  costPerKwDcLow: 2000,
  costPerKwDcAvg: 2500,
  costPerKwDcHigh: 3000,
  /** BC Hydro: a 10 kW system generates ~10,000–12,000 kWh/yr */
  specificYieldKwhPerKwLow: 1000,
  specificYieldKwhPerKwHigh: 1200,
  /** Wider band used only to flag suspicious API results */
  sanityYieldMin: 700,
  sanityYieldMax: 1400,
  degradationPerYear: 0.005,
  lifetimeYears: 25,
  averageHouseholdKwhPerYear: 10000,
  source: 'https://www.bchydro.com/powersmart/residential/tips-technologies/solar-panels.html',
} as const;

/** Defaults for FinanceInputs. Items marked ASSUMPTION are ours; expose them in the UI. */
export const DEFAULT_INPUTS: FinanceInputs = {
  annualConsumptionKwh: INSTALL.averageHouseholdKwhPerYear,
  ratePlan: 'tiered',
  panelWatts: 400,
  costPerWatt: INSTALL.costPerKwDcAvg / 1000,
  dcToAcDerate: 0.85, // Google non-US method default
  daytimeLoadShare: 0.35, // ASSUMPTION: share of yearly usage that overlaps solar hours (no battery). Slider 0.2–0.6
  exportRate: SELF_GENERATION.exportRatePerKwh,
  degradation: 1 - INSTALL.degradationPerYear,
  lifetimeYears: INSTALL.lifetimeYears,
  costIncrease: 1.03, // ASSUMPTION: recent BC Hydro increases were 3.75%/yr (capped through FY2026-27)
  discountRate: 1.04, // Google non-US method default
  rebateEligible: true,
};

/**
 * Peak Saver rewards for an enrolled home battery (Peak Saver T&C §9, updated 2026-10-01, checked 2026-10-03).
 * One Program Period a year (Nov 1 – Mar 31). Batteries can't opt out of control events (T&C §8(c)).
 * Paid as bill credits. Projecting the seasonal reward over the whole lifetime is an ASSUMPTION
 * (the program and the battery both have to last that long).
 */
export const PEAK_SAVER = {
  batteryEnrollmentIncentive: 500, // one-time
  batterySeasonalReward: 250, // per Program Period (winter), i.e. per year
  source: 'https://www.bchydro.com/powersmart/residential/rebates-programs/peak-saver/enroll-smart-home-devices.html',
  terms:
    'https://www.bchydro.com/content/dam/BCHydro/customer-portal/documents/power-smart/residential/programs/tc-peak-saver-connected-program.pdf',
} as const;

/**
 * Battery self-use model (FINANCIAL_MODEL.md → Self-use → Battery). ASSUMPTION, not BC Hydro numbers:
 * the battery raises the self-use cap K by min(roundTrip × kWh × cyclesPerYear, maxShareOfUse × consumption).
 */
export const BATTERY_MODEL = {
  roundTripEfficiency: 0.9,
  cyclesPerYear: 250,
  maxShareOfUse: 0.3,
} as const;

/** Allowed ranges for user-editable inputs. The engine clamps to these and adds a CLAMPED_INPUT warning. */
export const INPUT_RANGES = {
  annualConsumptionKwh: { min: 1000, max: 60000 },
  costPerWatt: { min: 1.5, max: 5 },
  daytimeLoadShare: { min: 0.2, max: 0.6 },
  costIncrease: { min: 1.0, max: 1.05 },
  discountRate: { min: 1.0, max: 1.08 },
  panelWatts: { min: 300, max: 500 },
} as const;

/**
 * Product tuning knobs, not BC facts. Changing these changes verdicts, so do it in one PR
 * and regenerate fixtures/finance-golden.json if the recommend cases move.
 */
export const TUNING = {
  verdict: {
    strong: { maxPaybackYears: 12, minNpv: 2500 },
    moderate: { maxPaybackYears: 18, minNpv: 1000 },
    // weak = pays back within lifetimeYears; not_recommended = never pays back, or no configs
  },
  /** Recommend the smallest config whose NPV is within this many dollars of the best. */
  recommendNpvTolerance: 100,
  /** (q5 − q1) / q5 of a segment's sunshineQuantiles above this → "Partial shading" chip */
  shadingSpread: 0.25,
  /** Sun-hours reference for the "sun" chip. Re-tune from real responses before the demo. */
  bcReferenceSunHours: 1200,
  /** Above this many panels, show the "large or multi-unit building" note */
  largeBuildingPanels: 150,
  /** Export share of year-1 production above this → "export_share" chip */
  exportShareWarn: 0.5,
  /** Imagery captured more than this many years ago → "imagery" chip (DESIGN.md §5) */
  imageryMaxAgeYears: 5,
} as const;

/**
 * NRCan "Photovoltaic potential and solar resource maps of Canada", municipality database
 * (dataset updated 2024-02-15, values read 2026-10-03). Annual AC kWh per kWp after all losses
 * (performance ratio 0.75), so these are AC, not DC. `south` = the south-facing tilt=latitude−15°
 * column (34–44° in BC, the closest to a ~30° roof); `flat` = the horizontal (0°) column.
 * The manual estimate uses the nearest town. Coordinates are town centres, ours, ±0.01°.
 * `southMonthly` / `flatMonthly`: the same two columns month by month (Jan–Dec; they sum to the
 * annual value ±rounding). The report's monthly chart spreads a roof's annual output by the nearest
 * town's shape; the finance model itself stays annual.
 */
export const BC_SOLAR_YIELD = {
  towns: [
    { name: 'Victoria', lat: 48.43, lng: -123.37, south: 1110, flat: 955, southMonthly: [39, 53, 92, 111, 127, 130, 142, 135, 121, 82, 42, 34], flatMonthly: [21, 35, 72, 103, 128, 134, 147, 127, 94, 54, 24, 17] },
    { name: 'Nanaimo', lat: 49.17, lng: -123.94, south: 1081, flat: 923, southMonthly: [37, 52, 90, 110, 125, 127, 139, 132, 117, 79, 41, 33], flatMonthly: [20, 33, 67, 99, 126, 131, 144, 124, 90, 51, 22, 16] },
    { name: 'Courtenay', lat: 49.69, lng: -124.99, south: 1042, flat: 881, southMonthly: [36, 48, 86, 108, 123, 127, 135, 126, 113, 71, 39, 30], flatMonthly: [18, 30, 62, 95, 124, 128, 139, 120, 85, 46, 21, 15] },
    { name: 'Campbell River', lat: 50.03, lng: -125.24, south: 1010, flat: 860, southMonthly: [35, 47, 85, 105, 119, 123, 130, 121, 109, 68, 38, 30], flatMonthly: [18, 29, 61, 91, 122, 126, 136, 117, 81, 44, 20, 14] },
    { name: 'Port Hardy', lat: 50.72, lng: -127.5, south: 946, flat: 813, southMonthly: [33, 45, 79, 98, 114, 117, 123, 112, 99, 62, 36, 27], flatMonthly: [17, 28, 58, 86, 119, 120, 129, 110, 73, 41, 20, 13] },
    { name: 'Tofino', lat: 49.15, lng: -125.91, south: 957, flat: 821, southMonthly: [37, 45, 77, 96, 108, 114, 124, 111, 105, 69, 40, 31], flatMonthly: [18, 28, 56, 81, 117, 118, 132, 115, 76, 44, 21, 15] },
    { name: 'Vancouver', lat: 49.26, lng: -123.12, south: 1025, flat: 892, southMonthly: [36, 49, 84, 102, 116, 121, 135, 127, 111, 71, 39, 33], flatMonthly: [19, 31, 63, 92, 124, 129, 142, 122, 84, 48, 22, 16] },
    { name: 'Surrey', lat: 49.19, lng: -122.85, south: 1014, flat: 887, southMonthly: [36, 49, 83, 101, 113, 119, 133, 126, 110, 71, 39, 33], flatMonthly: [19, 31, 62, 90, 124, 128, 142, 122, 83, 47, 22, 16] },
    { name: 'Abbotsford', lat: 49.05, lng: -122.33, south: 1013, flat: 890, southMonthly: [37, 49, 83, 100, 112, 118, 133, 127, 110, 72, 39, 34], flatMonthly: [20, 31, 63, 90, 124, 128, 143, 123, 82, 48, 22, 17] },
    { name: 'Chilliwack', lat: 49.16, lng: -121.95, south: 1007, flat: 887, southMonthly: [37, 49, 82, 100, 112, 117, 133, 127, 109, 70, 38, 34], flatMonthly: [20, 31, 62, 89, 124, 128, 143, 123, 81, 47, 22, 17] },
    { name: 'Hope', lat: 49.38, lng: -121.44, south: 1021, flat: 895, southMonthly: [36, 48, 83, 102, 115, 121, 135, 130, 110, 70, 38, 33], flatMonthly: [20, 31, 63, 91, 125, 130, 144, 124, 81, 47, 22, 17] },
    { name: 'Sechelt', lat: 49.47, lng: -123.76, south: 1021, flat: 881, southMonthly: [36, 49, 85, 104, 116, 121, 133, 126, 110, 70, 39, 32], flatMonthly: [19, 30, 62, 92, 123, 128, 140, 121, 83, 47, 21, 15] },
    { name: 'Powell River', lat: 49.84, lng: -124.52, south: 1035, flat: 881, southMonthly: [36, 50, 89, 107, 120, 123, 133, 125, 111, 71, 39, 31], flatMonthly: [18, 31, 64, 95, 123, 127, 139, 119, 83, 47, 21, 15] },
    { name: 'Squamish', lat: 49.7, lng: -123.16, south: 976, flat: 851, southMonthly: [35, 46, 80, 98, 110, 117, 130, 121, 104, 64, 38, 32], flatMonthly: [18, 28, 58, 86, 122, 126, 139, 119, 77, 43, 21, 15] },
    { name: 'Whistler', lat: 50.12, lng: -122.95, south: 1019, flat: 876, southMonthly: [37, 50, 87, 104, 117, 121, 134, 125, 107, 67, 38, 33], flatMonthly: [18, 29, 62, 92, 124, 129, 140, 120, 80, 44, 21, 15] },
    { name: 'Merritt', lat: 50.11, lng: -120.79, south: 1155, flat: 975, southMonthly: [41, 60, 104, 119, 131, 133, 145, 139, 118, 86, 45, 35], flatMonthly: [23, 39, 76, 108, 131, 138, 149, 126, 89, 54, 25, 17] },
    { name: 'Kamloops', lat: 50.67, lng: -120.33, south: 1171, flat: 972, southMonthly: [43, 63, 108, 122, 133, 134, 145, 138, 117, 87, 47, 35], flatMonthly: [23, 39, 77, 108, 131, 138, 149, 125, 88, 54, 25, 17] },
    { name: 'Salmon Arm', lat: 50.7, lng: -119.27, south: 1139, flat: 958, southMonthly: [40, 60, 103, 120, 128, 132, 143, 134, 115, 84, 46, 33], flatMonthly: [22, 38, 75, 105, 130, 137, 148, 125, 85, 52, 24, 17] },
    { name: 'Vernon', lat: 50.27, lng: -119.27, south: 1148, flat: 975, southMonthly: [39, 59, 103, 120, 130, 134, 144, 136, 117, 86, 46, 32], flatMonthly: [23, 39, 77, 106, 131, 138, 149, 127, 87, 54, 25, 18] },
    { name: 'Kelowna', lat: 49.89, lng: -119.5, south: 1150, flat: 988, southMonthly: [38, 58, 102, 119, 131, 135, 146, 138, 119, 87, 46, 32], flatMonthly: [24, 40, 77, 107, 132, 139, 150, 128, 89, 56, 26, 19] },
    { name: 'Penticton', lat: 49.49, lng: -119.59, south: 1151, flat: 996, southMonthly: [37, 57, 101, 118, 131, 134, 147, 139, 122, 89, 46, 31], flatMonthly: [25, 41, 78, 107, 132, 139, 152, 129, 92, 57, 27, 19] },
    { name: 'Osoyoos', lat: 49.03, lng: -119.47, south: 1153, flat: 1007, southMonthly: [37, 56, 99, 117, 130, 134, 147, 141, 124, 90, 45, 31], flatMonthly: [26, 42, 79, 108, 132, 139, 153, 131, 94, 59, 27, 20] },
    { name: 'Castlegar', lat: 49.32, lng: -117.66, south: 1126, flat: 980, southMonthly: [41, 56, 96, 114, 122, 131, 144, 136, 120, 88, 46, 32], flatMonthly: [25, 40, 75, 102, 131, 137, 151, 130, 89, 56, 26, 20] },
    { name: 'Trail', lat: 49.1, lng: -117.71, south: 1137, flat: 994, southMonthly: [41, 56, 97, 115, 123, 132, 145, 138, 121, 90, 47, 32], flatMonthly: [26, 41, 76, 104, 131, 138, 152, 131, 90, 57, 27, 21] },
    { name: 'Nelson', lat: 49.49, lng: -117.29, south: 1131, flat: 975, southMonthly: [42, 57, 97, 115, 123, 131, 144, 135, 119, 88, 47, 33], flatMonthly: [25, 39, 74, 102, 131, 137, 150, 129, 87, 54, 26, 20] },
    { name: 'Cranbrook', lat: 49.51, lng: -115.77, south: 1226, flat: 1016, southMonthly: [53, 70, 108, 121, 129, 136, 148, 140, 123, 99, 57, 42], flatMonthly: [27, 43, 81, 108, 133, 140, 153, 131, 90, 58, 28, 22] },
    { name: 'Revelstoke', lat: 50.99, lng: -118.2, south: 1107, flat: 928, southMonthly: [41, 58, 99, 118, 123, 130, 139, 127, 111, 80, 47, 34], flatMonthly: [21, 35, 71, 101, 130, 135, 145, 123, 80, 48, 23, 17] },
    { name: 'Golden', lat: 51.3, lng: -116.97, south: 1187, flat: 969, southMonthly: [47, 69, 109, 125, 128, 136, 143, 131, 114, 89, 55, 39], flatMonthly: [23, 39, 78, 107, 132, 140, 148, 124, 82, 51, 25, 18] },
    { name: '100 Mile House', lat: 51.64, lng: -121.29, south: 1147, flat: 933, southMonthly: [47, 65, 110, 121, 128, 129, 137, 131, 112, 82, 47, 38], flatMonthly: [20, 37, 75, 105, 129, 134, 142, 120, 83, 50, 23, 15] },
    { name: 'Williams Lake', lat: 52.14, lng: -122.14, south: 1136, flat: 920, southMonthly: [47, 65, 109, 121, 127, 128, 137, 130, 109, 79, 46, 38], flatMonthly: [19, 36, 74, 105, 128, 133, 140, 118, 82, 48, 22, 14] },
    { name: 'Quesnel', lat: 52.98, lng: -122.49, south: 1099, flat: 892, southMonthly: [44, 62, 105, 121, 125, 126, 135, 127, 104, 72, 44, 34], flatMonthly: [18, 34, 71, 103, 126, 131, 138, 115, 78, 44, 20, 13] },
    { name: 'Prince George', lat: 53.92, lng: -122.75, south: 1072, flat: 868, southMonthly: [42, 60, 102, 119, 122, 128, 134, 126, 99, 66, 43, 31], flatMonthly: [16, 32, 69, 100, 126, 131, 136, 113, 73, 41, 19, 12] },
    { name: 'Smithers', lat: 54.78, lng: -127.17, south: 990, flat: 840, southMonthly: [38, 57, 94, 109, 115, 117, 123, 120, 93, 59, 36, 29], flatMonthly: [14, 31, 68, 101, 123, 128, 129, 107, 72, 38, 17, 10] },
    { name: 'Terrace', lat: 54.52, lng: -128.6, south: 902, flat: 791, southMonthly: [32, 49, 81, 99, 111, 113, 117, 112, 85, 48, 30, 25], flatMonthly: [13, 26, 60, 92, 121, 126, 126, 104, 64, 33, 16, 10] },
    { name: 'Kitimat', lat: 54.05, lng: -128.65, south: 855, flat: 761, southMonthly: [31, 44, 72, 92, 105, 109, 115, 106, 80, 47, 29, 25], flatMonthly: [13, 24, 54, 85, 119, 123, 124, 103, 60, 33, 16, 10] },
    { name: 'Prince Rupert', lat: 54.31, lng: -130.32, south: 808, flat: 725, southMonthly: [29, 44, 70, 88, 101, 101, 103, 94, 76, 48, 30, 23], flatMonthly: [12, 24, 52, 79, 115, 117, 116, 97, 56, 32, 16, 10] },
    { name: 'Masset', lat: 54.01, lng: -132.15, south: 892, flat: 764, southMonthly: [28, 47, 79, 98, 117, 112, 111, 107, 87, 54, 33, 22], flatMonthly: [13, 26, 57, 86, 117, 120, 117, 100, 65, 35, 17, 10] },
    { name: 'Dawson Creek', lat: 55.76, lng: -120.24, south: 1177, flat: 868, southMonthly: [53, 73, 117, 132, 132, 134, 134, 124, 100, 80, 53, 45], flatMonthly: [16, 31, 70, 103, 128, 134, 136, 110, 70, 40, 18, 11] },
    { name: 'Fort St. John', lat: 56.25, lng: -120.85, south: 1172, flat: 857, southMonthly: [52, 73, 118, 132, 132, 135, 134, 125, 99, 79, 51, 44], flatMonthly: [15, 30, 69, 103, 128, 134, 135, 109, 69, 39, 17, 10] },
    { name: 'Fort Nelson', lat: 58.81, lng: -122.7, south: 1083, flat: 802, southMonthly: [41, 68, 117, 131, 126, 130, 125, 115, 92, 64, 43, 32], flatMonthly: [11, 26, 65, 100, 126, 133, 129, 101, 62, 32, 13, 7] },
  ],
  asOf: '2024-02-15',
  source:
    'https://ftp.maps.canada.ca/pub/nrcan_rncan/Solar-energy_Energie-solaire/photovoltaic_canada_photovoltaique/municip_potentiel-potential.csv',
} as const;

/**
 * P1: manual estimate when Google has no roof. Location yield comes from BC_SOLAR_YIELD.
 * ASSUMPTION: the off-south orientation factors are rough values for ~49°N at 25–35° tilt
 * (approximated from NREL PVWatts). Check one against PVWatts before relying on it.
 */
export const MANUAL = {
  /** Fraction of the entered sun-facing roof area that can hold panels (setbacks, vents, edges) */
  usableFraction: 0.7,
  /** × the town's south AC yield. FLAT uses the town's horizontal yield instead. */
  orientationFactor: { S: 1.0, SE: 0.95, SW: 0.95, E: 0.82, W: 0.82, N: 0.6 },
  /** Google Solar API's default panel (solarPotential.panel*), so manual and real roofs size the same */
  panel: { capacityWatts: 400, heightMeters: 1.879, widthMeters: 1.045, lifetimeYears: 20 },
  /** Smallest config offered, like the smallest Google config (4 panels = 1.6 kW) */
  minPanels: 4,
  /** ASSUMPTION: residential maximum. Larger entries are clamped and the result says so (`clamped`). */
  maxRoofAreaM2: 300,
  /** Compass direction → azimuth (0 = north, 180 = south). FLAT has no facing; 180 keeps it out of the north warning. */
  azimuthDegrees: { S: 180, SE: 135, SW: 225, E: 90, W: 270, N: 0, FLAT: 180 },
  /** ASSUMPTION: typical BC pitched roof, matching the 25–35° tilt behind orientationFactor. Never shown as a fact. */
  pitchDegrees: 30,
  source: 'https://pvwatts.nrel.gov/',
} as const;

/**
 * Rough BC bounding box for request validation. It also covers bits of Washington, Alberta and
 * the Yukon, so the report warns when BuildingResponse.administrativeArea isn't "BC".
 */
/**
 * CO₂ the grid emits per kWh, so the report can show what solar avoids (CLAUDE.md rule 6: always with
 * the caveat). Integrated Grid factor for 2025, which includes net imports: it more than doubled from
 * 2024 (9.9) after drought years made BC a net importer. Fort Nelson's separate grid is far higher; ignored.
 */
export const GRID_EMISSIONS = {
  kgCo2ePerKwh: 0.0228, // 22.8 t CO₂e/GWh
  year: 2025,
  asOf: '2026-10-03',
  source: 'https://www2.gov.bc.ca/gov/content/environment/climate-change/data/electricity',
} as const;

export const BC_BOUNDS = { latMin: 48.2, latMax: 60.0, lngMin: -139.1, lngMax: -114.0 } as const;

export const ATTRIBUTION = 'Source: Includes solar data from Google';
