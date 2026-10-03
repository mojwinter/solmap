import { INPUT_RANGES } from '@/src/config/bc';
import type { FinanceInputs } from '@/src/types/app';

type RangedKey = keyof typeof INPUT_RANGES;

/**
 * Clamps every user-editable input to INPUT_RANGES. `clamped` is true when any value moved
 * (→ CLAMPED_INPUT warning). Non-finite values clamp to the range minimum.
 */
export function clampInputs(inputs: FinanceInputs): { inputs: FinanceInputs; clamped: boolean } {
  const out = { ...inputs };
  let clamped = false;
  for (const key of Object.keys(INPUT_RANGES) as RangedKey[]) {
    const { min, max } = INPUT_RANGES[key];
    const v = inputs[key];
    const c = Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;
    if (c !== v) clamped = true;
    out[key] = c;
  }
  return { inputs: out, clamped };
}
