// Pure figures for the report's analysis section: ScenarioResult (and the roof) → what the charts and
// tiles draw. No React, no fetch; every number comes from lib/finance's projection, so the charts can
// never disagree with the answer card. Tested in derive.test.ts.
import type { BuildingResponse, ScenarioResult } from '@/src/types/app';

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

export interface PanelBar {
  /** 1-based rank, best first (Google orders solarPanels best-first). */
  rank: number;
  /** First-year AC kWh, on the same basis as the scenario's total. */
  kwh: number;
  /** In the system on screen. */
  used: boolean;
  /**
   * What adding this panel does to the value in today's dollars (NPV of the layout with it minus the
   * one without), when both layouts exist; null for the first layout's panels or a gap in the layouts.
   */
  addsNpv?: number | null;
}

/** NPV change from each panel: layout n vs layout n − 1, by panel count. */
export function marginalNpv(scenarios: readonly Pick<ScenarioResult, 'panelsCount' | 'npv'>[]): Map<number, number> {
  const byCount = new Map(scenarios.map((s) => [s.panelsCount, s.npv]));
  const out = new Map<number, number>();
  for (const [n, v] of byCount) {
    const prev = byCount.get(n - 1);
    if (prev !== undefined) out.set(n, v - prev);
  }
  return out;
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
