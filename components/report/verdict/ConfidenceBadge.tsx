import type { BuildingResponse } from '@/src/types/app';
import { Icon } from '@/components/common/Icon';
import { imageryLabel, isLowConfidence } from '@/lib/format';
import { cn } from '@/lib/utils';

/** The pill's box, shared with the placeholder so the two are always the same height. */
const PILL = 'inline-flex items-center gap-1 rounded-pill bg-fill-quiet px-2.5 py-1 text-callout';

/** Imagery quality + capture date ("High-res aerial · Aug 2024"). Lower-confidence imagery gets a warning glyph. */
export function ConfidenceBadge({ imagery }: { imagery: BuildingResponse['imagery'] }) {
  const low = isLowConfidence(imagery.quality);
  return (
    <span className={cn(PILL, 'text-ink-secondary', low && 'text-ink')}>
      <Icon name={low ? 'alert' : 'layers'} size={14} />
      {imageryLabel(imagery.quality, imagery.date)}
    </span>
  );
}

/** Holds the badge's place before there's a roof: pulsing while it loads, else invisible. */
export function ConfidenceBadgePlaceholder({ pulse }: { pulse: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(PILL, 'text-transparent select-none', pulse ? 'animate-pulse motion-reduce:animate-none' : 'invisible')}
    >
      <span className="size-3.5" />
      High-res aerial · Aug 2024
    </span>
  );
}
