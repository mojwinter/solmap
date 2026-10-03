/**
 * OUR contracts. Frozen at hour 1 of the hackathon; change by PR with a 👍 from
 * the owners on both sides (A↔B for BuildingResponse, C↔D for finance types).
 *
 * Coordinates are `{ lat, lng }` everywhere in this file (same shape as
 * google.maps.LatLngLiteral). Google's raw `{ latitude, longitude }` stays in solar.ts
 * and is converted by B's trim step, so it never reaches the client.
 */
import type { ImageryQuality } from './solar';

export interface LatLngLiteral {
  lat: number;
  lng: number;
}

export interface LatLngBounds {
  sw: LatLngLiteral;
  ne: LatLngLiteral;
}

/* ───────────── API → client (owners: B produces, A + C + D consume) ───────────── */

export interface PanelLite {
  lat: number;
  lng: number;
  landscape: boolean;
  /** Index into BuildingResponse.segments (segments[i].index === i). */
  segmentIndex: number;
  yearlyEnergyDcKwh: number;
}

export interface SegmentLite {
  index: number;
  pitchDegrees: number;
  /** 0 = north, 90 = east, 180 = south, 270 = west. */
  azimuthDegrees: number;
  areaMeters2: number;
  /** [min, q1 … q9, max] annual sunshine hours */
  sunshineQuantiles: number[];
  center: LatLngLiteral;
}

export interface ConfigLite {
  panelsCount: number;
  yearlyEnergyDcKwh: number;
  segments: { segmentIndex: number; panelsCount: number; yearlyEnergyDcKwh: number }[];
}

/** Trimmed, validated view of buildingInsights. Everything the UI needs, nothing else. */
export interface BuildingResponse {
  buildingId: string; // Google "buildings/…" name, or "manual" (P1)
  center: LatLngLiteral;
  boundingBox: LatLngBounds;
  imagery: { quality: ImageryQuality; date: string /* YYYY-MM-DD */ };
  postalCode?: string;
  /** Google's administrativeArea, e.g. "BC". Lets the UI warn when a point near the border isn't in BC. */
  administrativeArea?: string;
  panel: {
    capacityWatts: number;
    heightMeters: number;
    widthMeters: number;
    /** Google's value (20). Finance uses FinanceInputs.lifetimeYears (25, BC Hydro) instead. */
    lifetimeYears: number;
  };
  roof: {
    areaMeters2: number;
    maxPanels: number;
    maxArrayAreaMeters2: number;
    maxSunshineHoursPerYear: number;
    sunshineQuantiles: number[];
  };
  segments: SegmentLite[];
  /** Best-first. Render panels.slice(0, config.panelsCount). Empty for source 'manual'. */
  panels: PanelLite[];
  /** Ascending by panelsCount. Empty = roof too small. */
  configs: ConfigLite[];
  /** 'manual' = synthesized from the no-coverage form (P1, see docs/FINANCIAL_MODEL.md → Manual estimate). */
  source: 'live' | 'fixture' | 'manual';
}

export type ApiErrorCode = 'NO_COVERAGE' | 'BAD_REQUEST' | 'RATE_LIMITED' | 'UPSTREAM';
export interface ApiError {
  error: ApiErrorCode;
  message?: string;
}

/* ───────────── Finance (owners: C produces, D consumes) ───────────── */

export type RatePlan = 'tiered' | 'flat';

export interface FinanceInputs {
  annualConsumptionKwh: number;
  ratePlan: RatePlan;
  panelWatts: number;
  costPerWatt: number;
  dcToAcDerate: number;
  /**
   * Share of annual household usage that happens while the panels are producing, i.e. the
   * most solar you could ever use directly without a battery. Self-use saturates toward
   * this as the system grows (see FINANCIAL_MODEL.md → Self-use). 0–1.
   */
  daytimeLoadShare: number;
  exportRate: number;
  /** Multiplier per year, e.g. 0.995 */
  degradation: number;
  lifetimeYears: number;
  /** Multiplier per year, e.g. 1.03 */
  costIncrease: number;
  /** Multiplier per year, e.g. 1.04 */
  discountRate: number;
  /** false → rebate is 0 (FortisBC customer, equipment bought before approval, non-HPCN installer…) */
  rebateEligible: boolean;
  battery?: { kWh: number; costPerKwh: number; peakSaver: boolean }; // P1
}

export interface YearRow {
  year: number; // 1-based for display
  productionKwh: number;
  selfUsedKwh: number;
  exportedKwh: number;
  savings: number;
  cumulative: number;
}

/** Machine codes; D maps them to copy. */
export type ScenarioWarning =
  | 'SPECIFIC_YIELD_OUT_OF_RANGE' // acKwhYear1 / systemKwDc outside TUNING.sanityYield band
  | 'PRODUCES_MORE_THAN_USE' // offsetPct > 1
  | 'CLAMPED_INPUT'; // an input was out of range and was clamped (see FINANCIAL_MODEL.md → Input ranges)

export interface ScenarioResult {
  configIndex: number;
  panelsCount: number;
  systemKwDc: number;
  acKwhYear1: number;
  specificYield: number; // AC kWh per kW DC
  offsetPct: number; // acKwhYear1 / consumption (fraction, 0.45 = 45 %)
  installCost: number;
  rebate: number;
  netCost: number;
  billWithoutSolarYear1: number;
  year1: { selfUsedKwh: number; exportedKwh: number; selfUsedValue: number; exportValue: number; total: number };
  paybackYears: number | null; // null = never within lifetimeYears
  lifetimeNetSavings: number;
  npv: number;
  years: YearRow[];
  warnings: ScenarioWarning[];
}

export type Verdict = 'strong' | 'moderate' | 'weak' | 'not_recommended';

export interface ReasonChip {
  kind:
    | 'sun'
    | 'orientation'
    | 'shading'
    | 'rebate_cap'
    | 'export_share'
    | 'oversized' // produces more than you use
    | 'roof_small'
    | 'imagery'
    | 'small_savings'; // pays back, but the dollars are too small to matter (verdict materiality rule)
  tone: 'good' | 'neutral' | 'warn';
  text: string;
}

export interface Recommendation {
  /** null when there are no configs (roof too small / no panels fit). */
  recommendedIndex: number | null;
  verdict: Verdict;
  headline: string;
  reasons: ReasonChip[]; // top 3
  scenarios: ScenarioResult[]; // one per config, same order as BuildingResponse.configs
}

/* ───────────── Finance engine API (lib/finance/index.ts must `satisfies FinanceEngine`) ───────────── */

export interface FinanceEngine {
  /** Pre-tax bill for one month of `monthlyKwh` (DAYS = 365/12). */
  monthlyBill(monthlyKwh: number, plan: RatePlan): number;
  /** Inverse of monthlyBill. `billAmount` includes GST; `periodMonths` is 1 or 2 (BC Hydro bills monthly or every two months). */
  annualKwhFromBill(billAmount: number, periodMonths: 1 | 2, plan: RatePlan): number;
  /** One configuration → full projection. `apiPanelWatts` = BuildingResponse.panel.capacityWatts. */
  evaluate(config: Pick<ConfigLite, 'panelsCount' | 'yearlyEnergyDcKwh'>, configIndex: number, apiPanelWatts: number, inputs: FinanceInputs): ScenarioResult;
  /** Evaluates every config, picks the recommended one, computes verdict + reasons. */
  recommend(building: BuildingResponse, inputs: FinanceInputs): Recommendation;
}
