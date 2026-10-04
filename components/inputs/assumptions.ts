// What the assumptions drawer (#28) and battery choice (#32) show and edit. Pure: every number comes
// from src/config/bc.ts (DEFAULT_INPUTS, INPUT_RANGES and the source URLs); this file only says how
// each knob is labelled and converted for display.
import { clampInputs } from '@/lib/finance/clamp';
import { DEFAULT_INPUTS, INPUT_RANGES, INSTALL, REBATES, SELF_GENERATION, TARIFFS } from '@/src/config/bc';
import type { FinanceInputs } from '@/src/types/app';

type RangedKey = keyof typeof INPUT_RANGES;

/** A knob the user can change, within INPUT_RANGES. `toUi`/`fromUi` convert to the unit shown. */
export interface Knob {
  key: Exclude<RangedKey, 'annualConsumptionKwh'>; // usage is set in "Your usage"
  label: string;
  unit: string;
  step: number;
  toUi: (v: number) => number;
  fromUi: (u: number) => number;
  /** ASSUMPTION = ours (CLAUDE.md: expose it); estimate = from a BC source but varies by home. */
  kind: 'assumption' | 'estimate';
  note: string;
  source?: string;
}

const pctPerYear = { toUi: (m: number) => round1((m - 1) * 100), fromUi: (u: number) => 1 + u / 100 };
const round1 = (n: number) => Math.round(n * 10) / 10;

export const KNOBS: Knob[] = [
  {
    key: 'costPerWatt',
    label: 'Installed cost',
    unit: '$/kW',
    step: 50,
    toUi: (v) => Math.round(v * 1000),
    fromUi: (u) => u / 1000,
    kind: 'estimate',
    note: `BC Hydro's typical range is $${INSTALL.costPerKwDcLow.toLocaleString('en-CA')}–$${INSTALL.costPerKwDcHigh.toLocaleString('en-CA')} per kW. Use your quote if you have one.`,
    source: INSTALL.source,
  },
  {
    key: 'daytimeLoadShare',
    label: 'Use while the sun is up',
    unit: '%',
    step: 1,
    toUi: (v) => Math.round(v * 100),
    fromUi: (u) => u / 100,
    kind: 'assumption',
    note: 'The most of your yearly use that could ever line up with solar hours. Higher if someone is home in the day.',
  },
  {
    key: 'costIncrease',
    label: 'BC Hydro price rise',
    unit: '%/yr',
    step: 0.1,
    ...pctPerYear,
    kind: 'assumption',
    note: 'How fast the power you no longer buy gets more expensive. Recent increases were 3.75% a year.',
    source: TARIFFS.tiered.source,
  },
  {
    key: 'discountRate',
    label: 'Discount rate',
    unit: '%/yr',
    step: 0.1,
    ...pctPerYear,
    kind: 'assumption',
    note: "Turns future savings into today's dollars for net value. Google's solar method uses 4%.",
  },
  {
    key: 'panelWatts',
    label: 'Panel size',
    unit: 'W',
    step: 10,
    toUi: (v) => v,
    fromUi: (u) => u,
    kind: 'assumption',
    note: "Google lays out 400 W panels; bigger panels make proportionally more from the same layout.",
  },
];

/** Uniform view of a knob's range and default in display units. */
export function knobRange(k: Knob) {
  const { min, max } = INPUT_RANGES[k.key];
  return { min: k.toUi(min), max: k.toUi(max), default: k.toUi(DEFAULT_INPUTS[k.key]) };
}

/** Read-only facts behind the numbers, each with its source (CLAUDE.md rule 4). */
export const FACTS: { label: string; value: string; source: string }[] = [
  {
    label: 'Power you sell back',
    value: `${Math.round(SELF_GENERATION.exportRatePerKwh * 100)}¢/kWh (${SELF_GENERATION.schedule}, since ${SELF_GENERATION.effective})`,
    source: SELF_GENERATION.source,
  },
  {
    label: 'Tiered rate',
    value: `${(TARIFFS.tiered.tier1PerKwh * 100).toFixed(2)}¢ then ${(TARIFFS.tiered.tier2PerKwh * 100).toFixed(2)}¢/kWh (${TARIFFS.tiered.schedule})`,
    source: TARIFFS.tiered.source,
  },
  {
    label: 'Flat rate',
    value: `${(TARIFFS.flat.ratePerKwh * 100).toFixed(1)}¢/kWh (${TARIFFS.flat.schedule})`,
    source: TARIFFS.flat.source,
  },
  {
    label: 'Solar rebate',
    value: `$${REBATES.solar.perKwDc.toLocaleString('en-CA')}/kW, up to $${REBATES.solar.maxResidential.toLocaleString('en-CA')} or half the cost`,
    source: REBATES.terms,
  },
  {
    label: 'Panel life and wear',
    value: `${INSTALL.lifetimeYears} years, losing ${INSTALL.degradationPerYear * 100}% a year`,
    source: INSTALL.source,
  },
];

/** Inputs back to BC defaults, keeping the household's usage, plan and any battery. */
export const resetAssumptions = (inputs: FinanceInputs): FinanceInputs => ({
  ...DEFAULT_INPUTS,
  annualConsumptionKwh: inputs.annualConsumptionKwh,
  ratePlan: inputs.ratePlan,
  ...(inputs.battery && { battery: inputs.battery }),
});

/** True when every knob and the rebate are at their BC defaults. */
export const atDefaults = (inputs: FinanceInputs) =>
  KNOBS.every((k) => inputs[k.key] === DEFAULT_INPUTS[k.key]) && inputs.rebateEligible === DEFAULT_INPUTS.rebateEligible;

const LABELS: Record<RangedKey, string> = {
  annualConsumptionKwh: 'Household use',
  ...Object.fromEntries(KNOBS.map((k) => [k.key, k.label])),
} as Record<RangedKey, string>;

/** Which inputs the engine clamped (the CLAMPED_INPUT warning), with what it used instead. */
export function adjustedInputs(inputs: FinanceInputs): { key: RangedKey; label: string; used: number }[] {
  const { inputs: clamped } = clampInputs(inputs);
  return (Object.keys(INPUT_RANGES) as RangedKey[])
    .filter((k) => clamped[k] !== inputs[k])
    .map((k) => ({ key: k, label: LABELS[k], used: clamped[k] }));
}

/** The battery choice in the UI. `price` is the installed price as typed; there is no default (FINANCIAL_MODEL.md). */
export interface BatteryDraft {
  on: boolean;
  kWh: number;
  price: string;
  peakSaver: boolean;
}

export const BATTERY_SIZES = [5, 10, 15, 20] as const;

/** Draft → `inputs.battery`, or undefined until it's switched on with a price. */
export function batteryInput(d: BatteryDraft): FinanceInputs['battery'] {
  if (!d.on) return undefined;
  const price = Number(d.price.replace(/[$,\s]/g, ''));
  if (d.price.trim() === '' || !Number.isFinite(price) || price <= 0 || d.kWh <= 0) return undefined;
  return { kWh: d.kWh, costPerKwh: price / d.kWh, peakSaver: d.peakSaver };
}
