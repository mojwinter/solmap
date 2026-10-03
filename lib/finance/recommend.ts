import { TUNING } from '@/src/config/bc';
import type { BuildingResponse, FinanceInputs, Recommendation, ScenarioResult } from '@/src/types/app';
import { clampInputs } from './clamp';
import { evaluate } from './project';
import { headline, reasonChips, verdictFor } from './verdict';

/** FINANCIAL_MODEL.md → Recommendation. */
export function pickIndex(scenarios: ScenarioResult[]): number | null {
  if (scenarios.length === 0) return null;
  const best = Math.max(...scenarios.map((s) => s.npv));
  if (best >= 0) {
    return scenarios.findIndex((s) => s.npv >= best - TUNING.recommendNpvTolerance);
  }
  let idx = 0;
  let shortest = Infinity;
  scenarios.forEach((s, i) => {
    if (s.paybackYears !== null && s.paybackYears < shortest) {
      shortest = s.paybackYears;
      idx = i;
    }
  });
  return idx;
}

export function recommend(building: BuildingResponse, inputs: FinanceInputs): Recommendation {
  const scenarios = building.configs.map((c, i) => evaluate(c, i, building.panel.capacityWatts, inputs));
  const recommendedIndex = pickIndex(scenarios);
  const verdict = recommendedIndex === null ? 'not_recommended' : verdictFor(scenarios[recommendedIndex]);
  return {
    recommendedIndex,
    verdict,
    headline: headline(recommendedIndex, scenarios),
    reasons: reasonChips(building, recommendedIndex, scenarios, verdict, clampInputs(inputs).inputs),
    scenarios,
  };
}
