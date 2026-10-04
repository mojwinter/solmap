import type { ReasonChip } from '@/src/types/app';
import { Icon } from '@/components/common/Icon';
import { cn } from '@/lib/utils';
import { REASON_ICON } from '../copy';

const TILE: Record<ReasonChip['tone'], string> = {
  good: 'bg-good-soft text-good-ink',
  neutral: 'bg-fill-quiet text-ink-secondary',
  warn: 'bg-fair-soft text-fair-ink',
};

/** The verdict's reasons as an inset grouped list: icon tile + C's sentence. */
export function ReasonChips({ reasons, title }: { reasons: ReasonChip[]; title?: string }) {
  if (reasons.length === 0) return null;
  const list = (
    <ul className="rounded-md bg-fill-quiet px-3" aria-label={title ? undefined : 'Why'}>
      {reasons.map((r) => (
        <li key={r.kind} className="flex items-center gap-3 border-separator py-2.5 not-first:border-t">
          <span className={cn('grid size-[30px] flex-none place-items-center rounded-sm', TILE[r.tone])}>
            <Icon name={REASON_ICON[r.kind]} size={18} />
          </span>
          <span className="text-body">{r.text}</span>
        </li>
      ))}
    </ul>
  );
  if (!title) return list;
  return (
    <section aria-labelledby="reasons-heading" className="grid gap-2">
      <h2 id="reasons-heading" className="text-headline">
        {title}
      </h2>
      {list}
    </section>
  );
}
