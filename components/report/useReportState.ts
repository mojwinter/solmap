'use client';

import { useMemo, useState } from 'react';
import { recommend } from '@/lib/finance';
import { DEFAULT_INPUTS } from '@/src/config/bc';
import type { BuildingResponse, FinanceInputs } from '@/src/types/app';

/**
 * Finance runs client-side (CLAUDE.md → Contracts): inputs + building → Recommendation, memoized,
 * so the slider stays instant. The selected size starts on the recommended one until the user moves it.
 */
export function useReportState(building: BuildingResponse) {
  // The usage inputs UI (#19) will call setInputs.
  const [inputs, setInputs] = useState<FinanceInputs>(DEFAULT_INPUTS);
  const recommendation = useMemo(() => recommend(building, inputs), [building, inputs]);
  const [picked, setPicked] = useState<number | null>(null);

  const last = recommendation.scenarios.length - 1;
  const selectedIndex =
    last < 0 ? null : picked === null ? recommendation.recommendedIndex : Math.min(Math.max(picked, 0), last);
  const selected = selectedIndex === null ? null : recommendation.scenarios[selectedIndex];

  return { inputs, setInputs, recommendation, selectedIndex, selected, setSelectedIndex: setPicked };
}
