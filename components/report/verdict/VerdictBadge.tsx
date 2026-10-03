import type { Verdict } from '@/src/types/app';
import { Icon } from '@/components/common/Icon';
import { cn } from '@/lib/utils';
import { VERDICT } from '../copy';

const TONE = {
  good: { badge: 'bg-good-soft text-good-ink', dot: 'bg-good' },
  fair: { badge: 'bg-fair-soft text-fair-ink', dot: 'bg-fair' },
  poor: { badge: 'bg-poor-soft text-poor-ink', dot: 'bg-poor' },
} as const;

/** The traffic-light verdict pill: coloured dot with a glyph, plus the word. */
export function VerdictBadge({ verdict, className }: { verdict: Verdict; className?: string }) {
  const v = VERDICT[verdict];
  const t = TONE[v.tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill py-1 pr-2.5 pl-1.5 text-callout font-semibold',
        t.badge,
        className,
      )}
    >
      <span className={cn('grid size-[18px] place-items-center rounded-full text-on-sun-500', t.dot)}>
        <Icon name={v.glyph} size={12} strokeWidth={2.5} />
      </span>
      {v.label}
    </span>
  );
}
