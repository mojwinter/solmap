import type { BuildingResponse } from '@/src/types/app';
import { ATTRIBUTION } from '@/src/config/bc';

/** Required wherever Google Solar data is shown (CLAUDE.md rule 3). Synthetic fixtures say what they are instead. */
export function Attribution({ source }: { source: BuildingResponse['source'] }) {
  const text =
    source === 'live' || source === 'cache'
      ? ATTRIBUTION
      : source === 'fixture'
        ? 'Sample roof: synthetic test data, not Google imagery.'
        : 'Rough estimate from the roof details you entered.';
  return <p className="text-footnote text-ink-tertiary">{text}</p>;
}
