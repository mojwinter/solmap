import { INSTALL, REBATES } from '@/src/config/bc';
import type { ConfigLite, FinanceInputs, ScenarioResult, ScenarioWarning, YearRow } from '@/src/types/app';
import { monthlyBill } from './bill';
import { clampInputs } from './clamp';

/**
 * Self-use curve: K × (1 − e^(−prod/K)), K = daytimeLoadShare × consumption.
 * Small systems are almost all self-used; big ones saturate at K and export the rest.
 */
export function selfUsed(productionKwh: number, consumptionKwh: number, daytimeLoadShare: number): number {
  const K = daytimeLoadShare * consumptionKwh;
  if (K <= 0) return 0;
  return K * (1 - Math.exp(-productionKwh / K));
}

/** BC Hydro residential single-family solar rebate (T&C §8): the lesser of $/kW, 50% of cost and the cap. */
export function solarRebate(systemKwDc: number, installCost: number, eligible: boolean): number {
  if (!eligible) return 0;
  const r = REBATES.solar;
  return Math.max(0, Math.min(r.perKwDc * systemKwDc, r.maxFractionOfCost * installCost, r.maxResidential));
}

/** System size (kW DC) where the rebate hits its cap: below $2/W the 50%-of-cost limit sets the per-kW rate. */
export function rebateCapKw(costPerWatt: number): number {
  const r = REBATES.solar;
  return r.maxResidential / Math.min(r.perKwDc, r.maxFractionOfCost * costPerWatt * 1000);
}

/** One configuration → full lifetime projection (FINANCIAL_MODEL.md → Formulas). */
export function evaluate(
  config: Pick<ConfigLite, 'panelsCount' | 'yearlyEnergyDcKwh'>,
  configIndex: number,
  apiPanelWatts: number,
  rawInputs: FinanceInputs,
): ScenarioResult {
  const { inputs, clamped } = clampInputs(rawInputs);
  const C = inputs.annualConsumptionKwh;
  const plan = inputs.ratePlan;
  const annualBill = (kWh: number) => 12 * monthlyBill(kWh / 12, plan);

  const scale = inputs.panelWatts / apiPanelWatts;
  const systemKwDc = (config.panelsCount * inputs.panelWatts) / 1000;
  const acKwhYear1 = config.yearlyEnergyDcKwh * scale * inputs.dcToAcDerate;
  const installCost = systemKwDc * 1000 * inputs.costPerWatt;
  const rebate = solarRebate(systemKwDc, installCost, inputs.rebateEligible);
  const netCost = installCost - rebate;
  const billNoSolar = annualBill(C);

  const years: YearRow[] = [];
  let cumulative = -netCost;
  let npv = -netCost;
  let paybackYears: number | null = null;
  let year1: ScenarioResult['year1'] | null = null;

  for (let t = 0; t < inputs.lifetimeYears; t++) {
    const prod = acKwhYear1 * inputs.degradation ** t;
    const self = selfUsed(prod, C, inputs.daytimeLoadShare);
    const exported = prod - self;
    const selfUsedValue = billNoSolar - annualBill(C - self);
    const exportValue = exported * inputs.exportRate;
    const savings = selfUsedValue * inputs.costIncrease ** t + exportValue;

    const before = cumulative;
    cumulative += savings;
    npv += savings / inputs.discountRate ** t;
    if (paybackYears === null && cumulative >= 0 && savings > 0) {
      paybackYears = t + -before / savings;
    }
    if (t === 0) year1 = { selfUsedKwh: self, exportedKwh: exported, selfUsedValue, exportValue, total: savings };
    years.push({ year: t + 1, productionKwh: prod, selfUsedKwh: self, exportedKwh: exported, savings, cumulative });
  }

  const offsetPct = acKwhYear1 / C;
  const specificYield = systemKwDc > 0 ? acKwhYear1 / systemKwDc : 0;

  const warnings: ScenarioWarning[] = [];
  if (specificYield < INSTALL.sanityYieldMin || specificYield > INSTALL.sanityYieldMax) {
    warnings.push('SPECIFIC_YIELD_OUT_OF_RANGE');
  }
  if (offsetPct > 1) warnings.push('PRODUCES_MORE_THAN_USE');
  if (clamped) warnings.push('CLAMPED_INPUT');

  return {
    configIndex,
    panelsCount: config.panelsCount,
    systemKwDc,
    acKwhYear1,
    specificYield,
    offsetPct,
    installCost,
    rebate,
    netCost,
    billWithoutSolarYear1: billNoSolar,
    year1: year1 ?? { selfUsedKwh: 0, exportedKwh: 0, selfUsedValue: 0, exportValue: 0, total: 0 },
    paybackYears,
    lifetimeNetSavings: cumulative,
    npv,
    years,
    warnings,
  };
}
