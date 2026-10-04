'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiError, BuildingResponse } from '@/src/types/app';

export type BuildingState =
  | { status: 'loading' }
  | { status: 'ready'; data: BuildingResponse }
  | { status: 'no_coverage' }
  /** The API only answers inside BC's bounding box (400 BAD_REQUEST for a valid point outside it). */
  | { status: 'outside_bc' }
  | { status: 'error'; message?: string };

/** GET /api/solar/building for one point. `retry()` refetches. */
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
    fetch(`/api/solar/building?lat=${lat}&lng=${lng}`, { signal: controller.signal })
      .then(async (res) => {
        if (res.ok) return settle({ status: 'ready', data: (await res.json()) as BuildingResponse });
        const body = (await res.json().catch(() => null)) as ApiError | null;
        if (body?.error === 'NO_COVERAGE') return settle({ status: 'no_coverage' });
        if (body?.error === 'BAD_REQUEST') return settle({ status: 'outside_bc' });
        settle({ status: 'error', message: body?.message });
      })
      .catch(() => settle({ status: 'error' }));
    return () => controller.abort();
  }, [key, lat, lng]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  const state: BuildingState = result?.key === key ? result.state : { status: 'loading' };
  return { ...state, retry };
}
