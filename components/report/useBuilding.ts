'use client';

import { useCallback, useEffect, useState } from 'react';
import { getBuilding } from '@/lib/solar/get-building';
import type { BuildingResponse } from '@/src/types/app';

export type BuildingState =
  | { status: 'loading' }
  | { status: 'ready'; data: BuildingResponse }
  | { status: 'no_coverage' }
  /** A point outside BC's bounding box (400), or a building Google places outside BC (404). */
  | { status: 'outside_bc' }
  /** Rate limit (429), today's Google budget spent (503), or the service didn't answer; `message` says which. */
  | { status: 'error'; message?: string };

/** GET /api/solar/building for one point, through getBuilding. `retry()` refetches. */
export function useBuilding(lat: number, lng: number): BuildingState & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const key = `${lat},${lng},${attempt}`;
  // Results are tagged with the request they answer, so a new point or a retry reads as loading
  // until its own answer arrives (no setState during render or at the top of the effect).
  const [result, setResult] = useState<{ key: string; state: BuildingState } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const settle = (state: BuildingState) => {
      if (!controller.signal.aborted) setResult({ key, state });
    };
    getBuilding(lat, lng, { signal: controller.signal })
      .then((r) => {
        if (r.ok) return settle({ status: 'ready', data: r.building });
        if (r.reason === 'outside-bc') return settle({ status: 'outside_bc' });
        if (r.error === 'NO_COVERAGE') return settle({ status: 'no_coverage' });
        settle({ status: 'error', message: r.message });
      })
      // Only an abort rejects, and settle ignores those.
      .catch(() => settle({ status: 'error' }));
    return () => controller.abort();
  }, [key, lat, lng]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  const state: BuildingState = result?.key === key ? result.state : { status: 'loading' };
  return { ...state, retry };
}
