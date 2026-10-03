import { BILL, TARIFFS } from '@/src/config/bc';
import type { RatePlan } from '@/src/types/app';

/** Days in a modelled month (FINANCIAL_MODEL.md → Simplifications). */
export const DAYS = 365 / 12;

const TIER_THRESHOLD = TARIFFS.tiered.thresholdKwhPerDay * DAYS;

/** Pre-tax bill for one month of `monthlyKwh`. */
export function monthlyBill(monthlyKwh: number, plan: RatePlan): number {
  const kWh = Math.max(0, monthlyKwh);
  if (plan === 'flat') {
    const t = TARIFFS.flat;
    return DAYS * t.basicPerDay + kWh * t.ratePerKwh;
  }
  const t = TARIFFS.tiered;
  return (
    DAYS * t.basicPerDay +
    Math.min(kWh, TIER_THRESHOLD) * t.tier1PerKwh +
    Math.max(0, kWh - TIER_THRESHOLD) * t.tier2PerKwh
  );
}

/** Exact inverse of monthlyBill. `billAmount` includes GST and covers `periodMonths` months. */
export function annualKwhFromBill(billAmount: number, periodMonths: 1 | 2, plan: RatePlan): number {
  const preTaxMonthly = billAmount / (1 + BILL.gstRate) / periodMonths;
  const t = plan === 'flat' ? TARIFFS.flat : TARIFFS.tiered;
  const energy = preTaxMonthly - DAYS * t.basicPerDay;
  if (!(energy > 0)) return 0;

  let monthlyKwh: number;
  if (plan === 'flat') {
    monthlyKwh = energy / TARIFFS.flat.ratePerKwh;
  } else {
    const { tier1PerKwh, tier2PerKwh } = TARIFFS.tiered;
    monthlyKwh =
      energy <= TIER_THRESHOLD * tier1PerKwh
        ? energy / tier1PerKwh
        : TIER_THRESHOLD + (energy - TIER_THRESHOLD * tier1PerKwh) / tier2PerKwh;
  }
  return 12 * monthlyKwh;
}
