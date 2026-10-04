// Pure figures for the report's analysis section: ScenarioResult (and the roof) → what the charts and
// tiles draw. No React, no fetch; every number comes from lib/finance's projection, so the charts can
// never disagree with the answer card. Tested in derive.test.ts.
import { evaluate } from '@/lib/finance/project';
import { INPUT_RANGES, INSTALL } from '@/src/config/bc';
import type { BuildingResponse, ConfigLite, FinanceInputs, ScenarioResult } from '@/src/types/app';

/** Sum of a column over the panels' lifetime. */
const total = (s: Pick<ScenarioResult, 'years'>, key: 'productionKwh' | 'savings' | 'selfUsedKwh' | 'exportedKwh') =>
  s.years.reduce((sum, y) => sum + y[key], 0);

export interface LifetimeFigures {
  /** AC kWh over the panels' life, after degradation. */
  energyKwh: number;
  /** Savings over the life, before subtracting what you paid. */
  grossSavings: number;
  /** What you pay (after the rebate) per kWh the panels make over their life; null when they make nothing. */
  costPerKwh: number | null;
  /** Lifetime savings for every dollar paid: 2.4 = $2.40 back per $1. Null when the system is free. */
  returnPerDollar: number | null;
  /** Share of lifetime production used at home (the rest sells at the export rate). */
  selfUseShare: number;
}

export function lifetimeFigures(s: Pick<ScenarioResult, 'years' | 'netCost'>): LifetimeFigures {
  const energyKwh = total(s, 'productionKwh');
  const grossSavings = total(s, 'savings');
  return {
    energyKwh,
    grossSavings,
    costPerKwh: energyKwh > 0 ? s.netCost / energyKwh : null,
    returnPerDollar: s.netCost > 0 ? grossSavings / s.netCost : null,
    selfUseShare: energyKwh > 0 ? total(s, 'selfUsedKwh') / energyKwh : 0,
  };
}

export interface BillImpact {
  /** Year-1 bill for the same usage with no panels (pre-tax, as lib/finance models it). */
  before: number;
  /** The bill once the solar you use yourself comes off it. */
  afterSelfUse: number;
  /** What BC Hydro pays for the power you export (credited on the bill). */
  exportCredit: number;
  /** before − savings: what you'd still pay over the year, never below zero on screen. */
  net: number;
  /** Share of the bill the panels cover, 0–1 (can pass 1 when exports outweigh the bill). */
  cut: number;
  /** ¢/kWh your own solar saves you on average: your rate for the kWh it replaces. */
  avoidedRatePerKwh: number | null;
}

export function billImpact(s: Pick<ScenarioResult, 'billWithoutSolarYear1' | 'year1'>): BillImpact {
  const before = s.billWithoutSolarYear1;
  const { selfUsedValue, exportValue, total: saved, selfUsedKwh } = s.year1;
  return {
    before,
    afterSelfUse: before - selfUsedValue,
    exportCredit: exportValue,
    net: before - saved,
    cut: before > 0 ? saved / before : 0,
    avoidedRatePerKwh: selfUsedKwh > 0 ? selfUsedValue / selfUsedKwh : null,
  };
}

export interface SweepPoint {
  index: number;
  panels: number;
  kw: number;
  /** Net savings over the life (CAD). */
  net: number;
  /** The same, in today's dollars (future savings discounted): what recommend() maximises. */
  npv: number;
  /** Years to pay back; null = never within the lifetime. */
  payback: number | null;
  /** Share of year-1 production sold back, 0–1. */
  exportShare: number;
}

/** One point per roof config: how the money changes as the system grows (the sweet-spot chart). */
export function sweep(scenarios: readonly ScenarioResult[]): SweepPoint[] {
  return scenarios.map((s, index) => ({
    index,
    panels: s.panelsCount,
    kw: s.systemKwDc,
    net: s.lifetimeNetSavings,
    npv: s.npv,
    payback: s.paybackYears,
    exportShare: s.acKwhYear1 > 0 ? s.year1.exportedKwh / s.acKwhYear1 : 0,
  }));
}

/** The config with the highest `key` (the top of the curve). */
export function peakIndex(points: readonly SweepPoint[], key: 'net' | 'npv' = 'net'): number | null {
  if (points.length === 0) return null;
  return points.reduce((best, p) => (p[key] > points[best][key] ? p.index : best), 0);
}

/** The largest config that still pays back within the lifetime, or null when none does. */
export function largestPayingIndex(points: readonly SweepPoint[]): number | null {
  for (let i = points.length - 1; i >= 0; i--) if (points[i].payback !== null) return points[i].index;
  return null;
}

export interface PanelBar {
  /** 1-based rank, best first (Google orders solarPanels best-first). */
  rank: number;
  /** First-year AC kWh, on the same basis as the scenario's total. */
  kwh: number;
  /** In the system on screen. */
  used: boolean;
}

/**
 * Every panel the roof can hold, best first, in first-year AC kWh scaled like the scenario: each
 * panel's own DC output × (the config's AC total ÷ its DC total). The first `panelsCount` are in use.
 */
export function panelBars(
  building: Pick<BuildingResponse, 'panels' | 'configs'>,
  s: Pick<ScenarioResult, 'configIndex' | 'panelsCount' | 'acKwhYear1'>,
): PanelBar[] {
  const config = building.configs[s.configIndex];
  const acPerDc = config && config.yearlyEnergyDcKwh > 0 ? s.acKwhYear1 / config.yearlyEnergyDcKwh : 0;
  return building.panels.map((p, i) => ({ rank: i + 1, kwh: p.yearlyEnergyDcKwh * acPerDc, used: i < s.panelsCount }));
}

export interface RoofFace {
  index: number;
  azimuth: number;
  pitch: number;
  areaM2: number;
  /** Median annual sun hours on this face. */
  medianSunHours: number;
  /** (q5 − q1) / q5: how much less sun the shadier parts get (verdict.ts's shading test). */
  shadeSpread: number;
  /** Panels this face holds in the system on screen. */
  panelsUsed: number;
  /** Panels the roof's largest layout puts here. */
  panelsMax: number;
  /** First-year AC kWh from this face in the system on screen. */
  kwhUsed: number;
}

/** The roof's faces, largest first, with what the system on screen uses of each. */
export function roofFaces(
  building: Pick<BuildingResponse, 'segments' | 'configs' | 'panels'>,
  s: Pick<ScenarioResult, 'configIndex' | 'acKwhYear1'> | null,
): RoofFace[] {
  const config = s ? building.configs[s.configIndex] : undefined;
  const acPerDc = s && config && config.yearlyEnergyDcKwh > 0 ? s.acKwhYear1 / config.yearlyEnergyDcKwh : 0;
  const maxCounts = new Map<number, number>();
  for (const p of building.panels) maxCounts.set(p.segmentIndex, (maxCounts.get(p.segmentIndex) ?? 0) + 1);
  return building.segments
    .map((seg) => {
      const used = config?.segments.find((c) => c.segmentIndex === seg.index);
      const q = seg.sunshineQuantiles;
      const q1 = q[1] ?? 0;
      const q5 = q[5] ?? 0;
      return {
        index: seg.index,
        azimuth: seg.azimuthDegrees,
        pitch: seg.pitchDegrees,
        areaM2: seg.areaMeters2,
        medianSunHours: q5,
        shadeSpread: q5 > 0 ? Math.max(0, (q5 - q1) / q5) : 0,
        panelsUsed: used?.panelsCount ?? 0,
        panelsMax: maxCounts.get(seg.index) ?? 0,
        kwhUsed: (used?.yearlyEnergyDcKwh ?? 0) * acPerDc,
      };
    })
    .sort((a, b) => b.areaM2 - a.areaM2);
}

/**
 * Round, readable axis ticks from `lo` to `hi` (inclusive of zero when the range spans it), about
 * `count` steps. Each tick is i × step, so ticks are exact and never repeat.
 */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  const min = Math.min(lo, hi);
  const max = Math.max(lo, hi);
  if (max === min) return [min];
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
  const first = Math.floor(min / step + 1e-9);
  const last = Math.ceil(max / step - 1e-9);
  return Array.from({ length: last - first + 1 }, (_, i) => Number(((first + i) * step).toPrecision(12)));
}

export interface MonthBar {
  /** 0 = January. */
  month: number;
  /** AC kWh this month in the first year. */
  kwh: number;
}

/**
 * The first year's AC output spread over the months by NRCan's monthly shape for the nearest town
 * (BC_SOLAR_YIELD). The shape blends the town's south-facing and horizontal columns by the roof's
 * pitch (0° = flat, 30° or steeper = south), weighted by what each face of the system makes.
 * Months sum exactly to `acKwhYear1`; the finance model itself stays annual.
 */
export function monthlyProduction(
  acKwhYear1: number,
  town: { southMonthly: readonly number[]; flatMonthly: readonly number[] },
  pitchDegrees: number,
): MonthBar[] {
  const w = Math.min(Math.max(pitchDegrees / 30, 0), 1);
  const shape = town.southMonthly.map((s, i) => w * s + (1 - w) * town.flatMonthly[i]);
  const sum = shape.reduce((a, b) => a + b, 0);
  return shape.map((v, month) => ({ month, kwh: sum > 0 ? (acKwhYear1 * v) / sum : acKwhYear1 / 12 }));
}

/** The system's pitch, weighted by each used face's output (a flat roof's faces read 0°). */
export function weightedPitch(
  building: Pick<BuildingResponse, 'segments' | 'configs'>,
  s: Pick<ScenarioResult, 'configIndex'>,
): number {
  const used = building.configs[s.configIndex]?.segments ?? [];
  let energy = 0;
  let sum = 0;
  for (const u of used) {
    const seg = building.segments.find((x) => x.index === u.segmentIndex);
    if (!seg) continue;
    energy += u.yearlyEnergyDcKwh;
    sum += u.yearlyEnergyDcKwh * seg.pitchDegrees;
  }
  return energy > 0 ? sum / energy : 30;
}

export interface SensitivityRow {
  key: 'cost' | 'prices' | 'daytime' | 'rebate';
  label: string;
  /** The two ends tried, worse-for-you first where it's clear. */
  ends: { setting: string; payback: number | null; net: number }[];
}

/**
 * What moves the payback for the size on screen: each assumption at both ends of its BC range (install
 * cost per BC Hydro's $/W band, price rises and daytime use per INPUT_RANGES, the rebate on or off),
 * everything else as it is now. Re-runs lib/finance's evaluate(), so it's the same model as the answer.
 */
export function sensitivity(
  config: Pick<ConfigLite, 'panelsCount' | 'yearlyEnergyDcKwh'>,
  configIndex: number,
  apiPanelWatts: number,
  inputs: FinanceInputs,
): SensitivityRow[] {
  const run = (patch: Partial<FinanceInputs>) => {
    const s = evaluate(config, configIndex, apiPanelWatts, { ...inputs, ...patch });
    return { payback: s.paybackYears, net: s.lifetimeNetSavings };
  };
  const pct = (m: number) => `${Math.round((m - 1) * 1000) / 10}%`;
  const rows: SensitivityRow[] = [
    {
      key: 'cost',
      label: 'Install cost',
      ends: [INSTALL.costPerKwDcHigh, INSTALL.costPerKwDcLow].map((perKw) => ({
        setting: `$${(perKw / 1000).toFixed(2)}/W`,
        ...run({ costPerWatt: perKw / 1000 }),
      })),
    },
    {
      key: 'prices',
      label: 'Power prices rise',
      ends: [INPUT_RANGES.costIncrease.min, INPUT_RANGES.costIncrease.max].map((m) => ({
        setting: m === 1 ? 'not at all' : `${pct(m)} a year`,
        ...run({ costIncrease: m }),
      })),
    },
    {
      key: 'daytime',
      label: 'Use while the sun’s up',
      ends: [INPUT_RANGES.daytimeLoadShare.min, INPUT_RANGES.daytimeLoadShare.max].map((d) => ({
        setting: `${Math.round(d * 100)}%`,
        ...run({ daytimeLoadShare: d }),
      })),
    },
  ];
  if (inputs.rebateEligible) {
    rows.push({
      key: 'rebate',
      label: 'BC Hydro rebate',
      ends: [
        { setting: 'none', ...run({ rebateEligible: false }) },
        { setting: 'as now', ...run({}) },
      ],
    });
  }
  return rows;
}

export interface MonthSplit extends MonthBar {
  /** Of `kwh`, used at home as it's made. */
  usedKwh: number;
  /** Of `kwh`, sold to BC Hydro. */
  soldKwh: number;
}

/**
 * Each month's output split into used at home vs sold, consistent with the yearly model: the self-use
 * curve (lib/finance → selfUsed) applied to each month with a twelfth of the yearly cap gives the
 * seasonal shape (summer saturates, winter is nearly all used), then the months are scaled so they add
 * up to the year's `usedKwh` exactly, never using more than a month makes (water-filling: months that
 * hit their output are capped and the rest is shared over the others).
 */
export function monthlySplit(months: readonly MonthBar[], usedKwhYear: number, selfUseCapKwhYear: number): MonthSplit[] {
  const K = selfUseCapKwhYear / 12;
  const shape = months.map((m) => (K > 0 ? K * (1 - Math.exp(-m.kwh / K)) : 0));
  const target = Math.min(usedKwhYear, months.reduce((a, m) => a + m.kwh, 0));
  const used = new Array<number>(months.length).fill(0);
  const capped = new Array<boolean>(months.length).fill(false);
  for (let round = 0; round < months.length; round++) {
    const fixed = used.reduce((a, u, i) => a + (capped[i] ? u : 0), 0);
    const free = shape.reduce((a, v, i) => a + (capped[i] ? 0 : v), 0);
    if (free <= 0) break;
    const k = (target - fixed) / free;
    let changed = false;
    months.forEach((m, i) => {
      if (capped[i]) return;
      used[i] = shape[i] * k;
      if (used[i] > m.kwh) {
        used[i] = m.kwh;
        capped[i] = true;
        changed = true;
      }
    });
    if (!changed) break;
  }
  return months.map((m, i) => ({ ...m, usedKwh: used[i], soldKwh: Math.max(0, m.kwh - used[i]) }));
}
