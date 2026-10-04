import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS, INPUT_RANGES } from '@/src/config/bc';
import { adjustedInputs, atDefaults, batteryInput, KNOBS, knobRange, resetAssumptions } from './assumptions';

describe('knobs', () => {
  it('round-trip every default and range through the display unit', () => {
    for (const k of KNOBS) {
      const { min, max } = INPUT_RANGES[k.key];
      expect(k.fromUi(k.toUi(DEFAULT_INPUTS[k.key]))).toBeCloseTo(DEFAULT_INPUTS[k.key], 9);
      expect(k.fromUi(k.toUi(min))).toBeCloseTo(min, 9);
      expect(k.fromUi(k.toUi(max))).toBeCloseTo(max, 9);
    }
  });

  it('show cost per kW and rates as percentages', () => {
    const cost = KNOBS.find((k) => k.key === 'costPerWatt')!;
    expect(knobRange(cost)).toEqual({ min: 1500, max: 5000, default: 2500 });
    const rise = KNOBS.find((k) => k.key === 'costIncrease')!;
    expect(knobRange(rise)).toEqual({ min: 0, max: 5, default: 3 });
  });

  it('every editable FinanceInputs range is covered (usage lives in "Your usage")', () => {
    const covered = new Set<string>([...KNOBS.map((k) => k.key), 'annualConsumptionKwh']);
    for (const key of Object.keys(INPUT_RANGES)) expect(covered).toContain(key);
  });
});

describe('reset', () => {
  it('restores BC defaults but keeps usage, plan and battery', () => {
    const battery = { kWh: 10, costPerKwh: 1200, peakSaver: true };
    const changed = { ...DEFAULT_INPUTS, costPerWatt: 3.4, rebateEligible: false, annualConsumptionKwh: 16000, ratePlan: 'flat' as const, battery };
    expect(atDefaults(changed)).toBe(false);
    const reset = resetAssumptions(changed);
    expect(atDefaults(reset)).toBe(true);
    expect(reset).toMatchObject({ annualConsumptionKwh: 16000, ratePlan: 'flat', battery, costPerWatt: DEFAULT_INPUTS.costPerWatt });
  });
});

describe('adjustedInputs', () => {
  it('names what the engine clamped and the value it used', () => {
    expect(adjustedInputs(DEFAULT_INPUTS)).toEqual([]);
    expect(adjustedInputs({ ...DEFAULT_INPUTS, annualConsumptionKwh: 400 })).toEqual([
      { key: 'annualConsumptionKwh', label: 'Household use', used: INPUT_RANGES.annualConsumptionKwh.min },
    ]);
  });
});

describe('batteryInput', () => {
  const draft = { on: true, kWh: 10, price: '$12,000', peakSaver: false };

  it('turns a priced battery into inputs.battery', () => {
    expect(batteryInput(draft)).toEqual({ kWh: 10, costPerKwh: 1200, peakSaver: false });
  });

  it('is undefined when off or without a usable price', () => {
    expect(batteryInput({ ...draft, on: false })).toBeUndefined();
    expect(batteryInput({ ...draft, price: '' })).toBeUndefined();
    expect(batteryInput({ ...draft, price: 'abc' })).toBeUndefined();
    expect(batteryInput({ ...draft, price: '-5' })).toBeUndefined();
  });
});
