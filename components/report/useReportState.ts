'use client';

import { useMemo, useState } from 'react';
import { recommend } from '@/lib/finance';
import { DEFAULT_INPUTS } from '@/src/config/bc';
import type { BuildingResponse, FinanceInputs } from '@/src/types/app';
import { configIndexFor, type ReportQuery } from './urlState';

/**
 * Finance runs client-side (CLAUDE.md → Contracts): inputs + building → Recommendation, memoized,
 * so the slider stays instant. The selected size starts on the recommended one until the user moves it.
 * `building` is null while loading or when there's no roof. Inputs carry over to a new roof; the
 * picked size doesn't.
 * `initial` comes from a shared link (`?panels=&kwh=&plan=`): kWh and plan seed the inputs, and the
 * panel count picks the size on the first roof that loads.
 */
export function useReportState(building: BuildingResponse | null, initial: ReportQuery = {}) {
  // UsageInputs (bill / annual kWh, rate plan) calls setInputs.
  const [inputs, setInputs] = useState<FinanceInputs>(() => ({
    ...DEFAULT_INPUTS,
    ...(initial.kwh !== undefined && { annualConsumptionKwh: initial.kwh }),
    ...(initial.plan && { ratePlan: initial.plan }),
  }));
  const recommendation = useMemo(() => (building ? recommend(building, inputs) : null), [building, inputs]);
  const [picked, setPicked] = useState<number | null>(null);
  // The link's panel count waits for the first roof, then becomes a pick.
  const [pendingPanels, setPendingPanels] = useState(initial.panels);

  // A new roof starts on its own recommended size (or the link's size, for the first one).
  const [pickedFor, setPickedFor] = useState<BuildingResponse | null>(null);
  if (pickedFor !== building) {
    setPickedFor(building);
    if (building && pendingPanels !== undefined) {
      setPicked(configIndexFor(building.configs, pendingPanels));
      setPendingPanels(undefined);
    } else {
      setPicked(null);
    }
  }

  const last = (recommendation?.scenarios.length ?? 0) - 1;
  const selectedIndex =
    !recommendation || last < 0
      ? null
      : picked === null
        ? recommendation.recommendedIndex
        : Math.min(Math.max(picked, 0), last);
  const selected = recommendation && selectedIndex !== null ? recommendation.scenarios[selectedIndex] : null;

  /** What `?panels=` should say: the link's count until a roof loads, then the size on screen if it isn't the recommended one. */
  const panelsInUrl =
    pendingPanels ?? (selected && selectedIndex !== recommendation?.recommendedIndex ? selected.panelsCount : undefined);

  return { inputs, setInputs, recommendation, selectedIndex, selected, setSelectedIndex: setPicked, panelsInUrl };
}
