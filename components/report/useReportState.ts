'use client';

import { useMemo, useState } from 'react';
import { recommend } from '@/lib/finance';
import { DEFAULT_INPUTS } from '@/src/config/bc';
import type { BuildingResponse, FinanceInputs } from '@/src/types/app';

/**
 * Finance runs client-side (CLAUDE.md → Contracts): inputs + building → Recommendation, memoized,
 * so the slider stays instant. The selected size starts on the recommended one until the user moves it.
 * `building` is null while loading or when there's no roof. Inputs carry over to a new roof; the
 * picked size doesn't.
 */
export function useReportState(building: BuildingResponse | null) {
  // The usage inputs UI (#19) will call setInputs.
  const [inputs, setInputs] = useState<FinanceInputs>(DEFAULT_INPUTS);
  const recommendation = useMemo(() => (building ? recommend(building, inputs) : null), [building, inputs]);
  const [picked, setPicked] = useState<number | null>(null);

  // A new roof starts on its own recommended size.
  const [pickedFor, setPickedFor] = useState(building);
  if (pickedFor !== building) {
    setPickedFor(building);
    setPicked(null);
  }

  const last = (recommendation?.scenarios.length ?? 0) - 1;
  const selectedIndex =
    !recommendation || last < 0
      ? null
      : picked === null
        ? recommendation.recommendedIndex
        : Math.min(Math.max(picked, 0), last);
  const selected = recommendation && selectedIndex !== null ? recommendation.scenarios[selectedIndex] : null;

  return { inputs, setInputs, recommendation, selectedIndex, selected, setSelectedIndex: setPicked };
}
