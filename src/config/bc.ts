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
 * P1: manual estimate when Google has no roof. ASSUMPTION: orientation factors are rough values
 * for ~49°N at 25–35° tilt (approximated from NREL PVWatts). Check one against PVWatts before relying on it.
 */
export const MANUAL = {
  /** Fraction of the entered sun-facing roof area that can hold panels (setbacks, vents, edges) */
  usableFraction: 0.7,
  /** DC yield of an unshaded south roof, kWh per kW DC per year */
  southYieldDcKwhPerKw: 1150,
  orientationFactor: { S: 1.0, SE: 0.95, SW: 0.95, E: 0.82, W: 0.82, FLAT: 0.88, N: 0.6 },
  source: 'https://pvwatts.nrel.gov/',
} as const;

/**
 * Rough BC bounding box for request validation. It also covers bits of Washington, Alberta and
 * the Yukon, so the report warns when BuildingResponse.administrativeArea isn't "BC".
 */
export const BC_BOUNDS = { latMin: 48.2, latMax: 60.0, lngMin: -139.1, lngMax: -114.0 } as const;

export const ATTRIBUTION = 'Source: Includes solar data from Google';
