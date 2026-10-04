'use client';

import type { BuildingResponse } from '@/src/types/app';
import { PrintButton, PrintHeader } from './PrintBar';
import { ConfidenceBadge, ConfidenceBadgePlaceholder } from './verdict/ConfidenceBadge';

/**
 * The address and its badges, above the house. The route's loading screen draws this too, from the
 * URL, so the house doesn't drop when the report replaces it. The badge row is always there: a
 * pulsing pill while the roof loads, an empty one of the same size when there's no roof to badge, so
 * the house doesn't drop again when the roof arrives.
 */
export function ReportTitle({
  address,
  imagery,
  loading = false,
  print = false,
}: {
  address: string;
  /** The roof's imagery, once it has loaded. */
  imagery?: BuildingResponse['imagery'];
  loading?: boolean;
  /** Show "Save as PDF" (the `print` flag) once there's a roof. */
  print?: boolean;
}) {
  return (
    <header className="grid gap-1.5">
      {imagery && <PrintHeader />}
      <h1 className="font-display text-title text-balance md:text-display">{address}</h1>
      <div className="flex flex-wrap items-center gap-2">
        {imagery ? <ConfidenceBadge imagery={imagery} /> : <ConfidenceBadgePlaceholder pulse={loading} />}
        {imagery && print && (
          <span className="ml-auto">
            <PrintButton />
          </span>
        )}
      </div>
    </header>
  );
}
