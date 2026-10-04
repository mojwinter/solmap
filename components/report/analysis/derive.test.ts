import { describe, expect, it } from 'vitest';
import { recommend } from '@/lib/finance';
import { BC_SOLAR_YIELD, DEFAULT_INPUTS } from '@/src/config/bc';
import southGable from '@/fixtures/synthetic/south-gable.json';
import { trimBuilding } from '@/lib/solar/trim';
import type { SolarBuilding } from '@/lib/solar/schema';
import {
  billImpact,
  marginalNpv,
  monthlyProduction,
  monthlySplit,
  niceTicks,
  panelBars,
  weightedPitch,
} from './derive';

const building = trimBuilding(southGable as unknown as SolarBuilding, 'fixture');
const rec = recommend(building, DEFAULT_INPUTS);
const s = rec.scenarios[rec.recommendedIndex!];

describe('billImpact', () => {
  it('walks from the bill without solar to what is left, and the steps add up', () => {
    const b = billImpact(s);
    expect(b.before).toBeCloseTo(s.billWithoutSolarYear1);
    expect(b.afterSelfUse).toBeCloseTo(b.before - s.year1.selfUsedValue);
    expect(b.net).toBeCloseTo(b.afterSelfUse - b.exportCredit);
    expect(b.cut).toBeCloseTo(s.year1.total / b.before);
    // The solar you use replaces your tiered rate: between tier 1 and tier 2 (11.87–14.08¢).
    expect(b.avoidedRatePerKwh!).toBeGreaterThan(0.1187 - 1e-9);
    expect(b.avoidedRatePerKwh!).toBeLessThan(0.1408 + 1e-9);
  });
});

describe('panelBars', () => {
  it('scales each panel to the scenario’s AC basis and marks the ones in use', () => {
    const bars = panelBars(building, s);
    expect(bars).toHaveLength(building.panels.length);
    expect(bars.filter((b) => b.used)).toHaveLength(s.panelsCount);
    const used = bars.filter((b) => b.used).reduce((a, b) => a + b.kwh, 0);
    expect(used).toBeCloseTo(s.acKwhYear1, 0);
  });
});

describe('monthlyProduction', () => {
  const vancouver = BC_SOLAR_YIELD.towns.find((t) => t.name === 'Vancouver')!;

  it('sums to the year and peaks in summer', () => {
    const months = monthlyProduction(4800, vancouver, 30);
    expect(months).toHaveLength(12);
    expect(months.reduce((a, m) => a + m.kwh, 0)).toBeCloseTo(4800);
    const july = months[6].kwh;
    const december = months[11].kwh;
    expect(july).toBeGreaterThan(3 * december);
  });

  it('a flat roof has a sharper winter dip than a pitched one', () => {
    const flat = monthlyProduction(1000, vancouver, 0);
    const pitched = monthlyProduction(1000, vancouver, 30);
    expect(flat[11].kwh).toBeLessThan(pitched[11].kwh);
  });

  it('every town’s monthly columns add up to its annual values (±rounding)', () => {
    for (const t of BC_SOLAR_YIELD.towns) {
      expect(Math.abs(t.southMonthly.reduce((a, b) => a + b, 0) - t.south)).toBeLessThanOrEqual(6);
      expect(Math.abs(t.flatMonthly.reduce((a, b) => a + b, 0) - t.flat)).toBeLessThanOrEqual(6);
    }
  });
});

describe('weightedPitch', () => {
  it('is the pitch of the faces in use, weighted by output', () => {
    const p = weightedPitch(building, s);
    const pitches = building.segments.map((x) => x.pitchDegrees);
    expect(p).toBeGreaterThanOrEqual(Math.min(...pitches));
    expect(p).toBeLessThanOrEqual(Math.max(...pitches));
  });
});

describe('niceTicks', () => {
  it('spans the range in round steps', () => {
    expect(niceTicks(0, 10000)).toEqual([0, 2500, 5000, 7500, 10000]);
    expect(niceTicks(-7200, 10131)).toEqual([-10000, -5000, 0, 5000, 10000, 15000]);
    expect(niceTicks(1.6, 21.2, 5)).toEqual([0, 5, 10, 15, 20, 25]);
    expect(niceTicks(3, 3)).toEqual([3]);
  });
});

describe('monthlySplit', () => {
  const vancouver = BC_SOLAR_YIELD.towns.find((t) => t.name === 'Vancouver')!;
  const months = monthlyProduction(s.acKwhYear1, vancouver, 30);
  const cap = DEFAULT_INPUTS.daytimeLoadShare * DEFAULT_INPUTS.annualConsumptionKwh;
  const split = monthlySplit(months, s.year1.selfUsedKwh, cap);

  it('adds up to the year’s used and sold figures', () => {
    expect(split.reduce((a, m) => a + m.usedKwh, 0)).toBeCloseTo(s.year1.selfUsedKwh, 6);
    expect(split.reduce((a, m) => a + m.soldKwh, 0)).toBeCloseTo(s.year1.exportedKwh, 6);
    split.forEach((m) => {
      expect(m.usedKwh).toBeLessThanOrEqual(m.kwh + 1e-9);
      expect(m.usedKwh + m.soldKwh).toBeCloseTo(m.kwh, 9);
    });
  });

  it('sells a bigger share in summer than in winter', () => {
    const share = (m: (typeof split)[number]) => m.soldKwh / m.kwh;
    expect(share(split[6])).toBeGreaterThan(share(split[11]));
  });

  it('caps a month at what it makes and shares the rest over the others', () => {
    // Cap 50 a month: the small month's curve value (≈9) scaled up to reach 100 would pass its 10 kWh.
    const tiny = monthlySplit(
      [{ month: 0, kwh: 10 }, { month: 1, kwh: 1000 }],
      100,
      600,
    );
    expect(tiny[0].usedKwh).toBeCloseTo(10);
    expect(tiny[1].usedKwh).toBeCloseTo(90);
  });
});

describe('marginalNpv', () => {
  it('is the value change from each extra panel, where both layouts exist', () => {
    const m = marginalNpv(rec.scenarios);
    const [a, b] = rec.scenarios;
    expect(m.has(a.panelsCount)).toBe(false);
    expect(m.get(b.panelsCount)).toBeCloseTo(b.npv - a.npv);
    // Past the recommended size, extra panels lose value on the hero roof.
    const last = rec.scenarios[rec.scenarios.length - 1];
    expect(m.get(last.panelsCount)!).toBeLessThan(0);
  });
});
