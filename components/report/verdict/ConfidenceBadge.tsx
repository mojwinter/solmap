import type { BuildingResponse } from '@/src/types/app';
import { Icon } from '@/components/common/Icon';
import { imageryLabel, isLowConfidence } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Imagery quality + capture date ("High-res aerial · Aug 2024"). Lower-confidence imagery gets a warning glyph. */
export function ConfidenceBadge({ imagery }: { imagery: BuildingResponse['imagery'] }) {
  const low = isLowConfidence(imagery.quality);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill bg-fill-quiet px-2.5 py-1 text-callout text-ink-secondary',
        low && 'text-ink',
      )}
    >
      <Icon name={low ? 'alert' : 'layers'} size={14} />
      {imageryLabel(imagery.quality, imagery.date)}
    </span>
  );
}
