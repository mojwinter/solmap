import { Notice } from './Notice';

/** Same rule as the server's outsideBC (lib/solar/cache.ts): "BC" or "British Columbia" both count. */
export function looksOutsideBc(administrativeArea: string | undefined): boolean {
  const area = administrativeArea?.trim().toLowerCase();
  return area !== undefined && area !== '' && area !== 'bc' && area !== 'british columbia';
}

/**
 * Google placed this building outside BC (a point near the border). The API already answers these
 * with a "BC only" 404, so this is the fallback if one ever gets through (DESIGN.md §3 → States).
 */
export function OutsideBcBanner({ administrativeArea }: { administrativeArea?: string }) {
  if (!looksOutsideBc(administrativeArea)) return null;
  return (
    <Notice icon="pin">This tool uses BC Hydro rates; this address looks like it&rsquo;s outside BC.</Notice>
  );
}
