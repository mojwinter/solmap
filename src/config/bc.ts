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
 */
export const BC_SOLAR_YIELD = {
  towns: [
    { name: 'Victoria', lat: 48.43, lng: -123.37, south: 1110, flat: 955 },
    { name: 'Nanaimo', lat: 49.17, lng: -123.94, south: 1081, flat: 923 },
    { name: 'Courtenay', lat: 49.69, lng: -124.99, south: 1042, flat: 881 },
    { name: 'Campbell River', lat: 50.03, lng: -125.24, south: 1010, flat: 860 },
    { name: 'Port Hardy', lat: 50.72, lng: -127.5, south: 946, flat: 813 },
    { name: 'Tofino', lat: 49.15, lng: -125.91, south: 957, flat: 821 },
    { name: 'Vancouver', lat: 49.26, lng: -123.12, south: 1025, flat: 892 },
    { name: 'Surrey', lat: 49.19, lng: -122.85, south: 1014, flat: 887 },
    { name: 'Abbotsford', lat: 49.05, lng: -122.33, south: 1013, flat: 890 },
    { name: 'Chilliwack', lat: 49.16, lng: -121.95, south: 1007, flat: 887 },
    { name: 'Hope', lat: 49.38, lng: -121.44, south: 1021, flat: 895 },
    { name: 'Sechelt', lat: 49.47, lng: -123.76, south: 1021, flat: 881 },
    { name: 'Powell River', lat: 49.84, lng: -124.52, south: 1035, flat: 881 },
    { name: 'Squamish', lat: 49.7, lng: -123.16, south: 976, flat: 851 },
    { name: 'Whistler', lat: 50.12, lng: -122.95, south: 1019, flat: 876 },
    { name: 'Merritt', lat: 50.11, lng: -120.79, south: 1155, flat: 975 },
    { name: 'Kamloops', lat: 50.67, lng: -120.33, south: 1171, flat: 972 },
    { name: 'Salmon Arm', lat: 50.7, lng: -119.27, south: 1139, flat: 958 },
    { name: 'Vernon', lat: 50.27, lng: -119.27, south: 1148, flat: 975 },
    { name: 'Kelowna', lat: 49.89, lng: -119.5, south: 1150, flat: 988 },
    { name: 'Penticton', lat: 49.49, lng: -119.59, south: 1151, flat: 996 },
    { name: 'Osoyoos', lat: 49.03, lng: -119.47, south: 1153, flat: 1007 },
    { name: 'Castlegar', lat: 49.32, lng: -117.66, south: 1126, flat: 980 },
    { name: 'Trail', lat: 49.1, lng: -117.71, south: 1137, flat: 994 },
    { name: 'Nelson', lat: 49.49, lng: -117.29, south: 1131, flat: 975 },
    { name: 'Cranbrook', lat: 49.51, lng: -115.77, south: 1226, flat: 1016 },
    { name: 'Revelstoke', lat: 50.99, lng: -118.2, south: 1107, flat: 928 },
    { name: 'Golden', lat: 51.3, lng: -116.97, south: 1187, flat: 969 },
    { name: '100 Mile House', lat: 51.64, lng: -121.29, south: 1147, flat: 933 },
    { name: 'Williams Lake', lat: 52.14, lng: -122.14, south: 1136, flat: 920 },
    { name: 'Quesnel', lat: 52.98, lng: -122.49, south: 1099, flat: 892 },
    { name: 'Prince George', lat: 53.92, lng: -122.75, south: 1072, flat: 868 },
    { name: 'Smithers', lat: 54.78, lng: -127.17, south: 990, flat: 840 },
    { name: 'Terrace', lat: 54.52, lng: -128.6, south: 902, flat: 791 },
    { name: 'Kitimat', lat: 54.05, lng: -128.65, south: 855, flat: 761 },
    { name: 'Prince Rupert', lat: 54.31, lng: -130.32, south: 808, flat: 725 },
    { name: 'Masset', lat: 54.01, lng: -132.15, south: 892, flat: 764 },
    { name: 'Dawson Creek', lat: 55.76, lng: -120.24, south: 1177, flat: 868 },
    { name: 'Fort St. John', lat: 56.25, lng: -120.85, south: 1172, flat: 857 },
    { name: 'Fort Nelson', lat: 58.81, lng: -122.7, south: 1083, flat: 802 },
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
export const BC_BOUNDS = { latMin: 48.2, latMax: 60.0, lngMin: -139.1, lngMax: -114.0 } as const;

export const ATTRIBUTION = 'Source: Includes solar data from Google';
