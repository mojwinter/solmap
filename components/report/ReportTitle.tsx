'use client';

import type { ReactNode } from 'react';
import type { BuildingResponse } from '@/src/types/app';
import { PrintButton, PrintHeader } from './PrintBar';
import { ConfidenceBadge, ConfidenceBadgePlaceholder } from './verdict/ConfidenceBadge';

/**
 * A pulsing bar in place of the address while it's found. Pass the heading's type classes: the bar
 * sits in a box of that line height, so the title doesn't move when the address replaces it.
 */
export function AddressSkeleton({
  className = '',
  twoLinesOnPhones = false,
}: {
  className?: string;
  /** A second line below `sm`: at phone width a street address with its city wraps to two. */
  twoLinesOnPhones?: boolean;
}) {
  const bar = 'h-[0.8em] animate-pulse rounded-md bg-fill-quiet motion-reduce:animate-none';
  return (
    <div role="status" aria-label="Finding the address" className={`grid ${className}`}>
      {/* A zero-width space gives each line the font's line height. */}
      <div className="flex items-center">
        <span aria-hidden="true">&#8203;</span>
        <span aria-hidden="true" className={`${bar} w-[min(26ch,80%)]`} />
      </div>
      {twoLinesOnPhones && (
        <div className="flex items-center sm:hidden">
          <span aria-hidden="true">&#8203;</span>
          <span aria-hidden="true" className={`${bar} w-[min(14ch,50%)]`} />
        </div>
      )}
    </div>
  );
}

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
  actions,
  actionsPending,
}: {
  /** The street address; missing while it's still being found (a skeleton line holds its place). */
  address?: string;
  /** The roof's imagery, once it has loaded. */
  imagery?: BuildingResponse['imagery'];
  loading?: boolean;
  /** Show "Save as PDF" (the `print` flag) once there's a roof. */
  print?: boolean;
  /** More buttons at the right end of the badge row (e.g. Advanced settings). */
  actions?: ReactNode;
  /**
   * While the roof loads, hold the place of the buttons that will join the badge row (Advanced
   * settings, Save as PDF): on phones they wrap to a second line, which pushed the page down.
   */
  actionsPending?: { settings?: boolean; pdf?: boolean };
}) {
  const pill = 'h-[26px] animate-pulse rounded-pill bg-fill-quiet motion-reduce:animate-none';
  return (
    <header className="grid gap-1.5">
      {imagery && <PrintHeader />}
      {address ? (
        <h1 className="font-display text-title text-balance md:text-display">{address}</h1>
      ) : (
        <AddressSkeleton className="font-display text-title md:text-display" twoLinesOnPhones />
      )}
      <div className="flex flex-wrap items-center gap-2">
        {imagery ? <ConfidenceBadge imagery={imagery} /> : <ConfidenceBadgePlaceholder pulse={loading} />}
        {imagery && (print || actions) && (
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {actions}
            {print && <PrintButton />}
          </span>
        )}
        {!imagery && (actionsPending?.settings || actionsPending?.pdf) && (
          // The buttons' sizes: Advanced settings 152 × 26px, Save as PDF 114 × 26px.
          <span aria-hidden="true" className="ml-auto flex flex-wrap items-center gap-2">
            {actionsPending.settings && <span className={`${pill} w-[152px]`} />}
            {actionsPending.pdf && <span className={`${pill} w-[114px]`} />}
          </span>
        )}
      </div>
    </header>
  );
}
