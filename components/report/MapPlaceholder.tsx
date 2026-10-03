import type { BuildingResponse } from '@/src/types/app';

/**
 * Stand-in for A's <SolarMap building visibleCount /> (#21) with the same props, so swapping it in
 * at integration (#20) is a one-line change in ReportView.
 */
export function MapPlaceholder({ building, visibleCount }: { building?: BuildingResponse; visibleCount?: number }) {
  return (
    <div
      className="flex size-full items-center justify-center bg-linear-to-b md:pr-[488px] from-sky-200 via-sky-100 to-sky-050"
      role="img"
      aria-label="Map placeholder"
    >
      <p className="rounded-pill glass-thin px-4 py-2 text-callout text-ink-secondary">
        {building
          ? `Map coming soon · ${visibleCount ?? 0} panels at ${building.center.lat.toFixed(4)}, ${building.center.lng.toFixed(4)}`
          : 'Map coming soon'}
      </p>
    </div>
  );
}
