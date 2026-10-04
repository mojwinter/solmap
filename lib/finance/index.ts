import type { FinanceEngine } from '@/src/types/app';
import { annualKwhFromBill, monthlyBill } from './bill';
import { evaluate } from './project';
import { recommend } from './recommend';

export const finance = {
  monthlyBill,
  annualKwhFromBill,
  evaluate,
  recommend,
} satisfies FinanceEngine;

export { annualKwhFromBill, evaluate, monthlyBill, recommend };
export { verdictFor } from './verdict';
export { manualBuilding } from './manual';
export type { ManualEstimate, ManualRoof, RoofFacing } from './manual';
