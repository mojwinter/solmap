import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A stat tile on fill-quiet: small grey label over a big tabular number. */
export function Stat({
  label,
  value,
  unit,
  tone,
  className,
}: {
  label: string;
  value: ReactNode;
  /** Small grey unit beside the number ("kWh", "yrs"). */
  unit?: string;
  /** Gains and losses only (design: verdict colours mark money). */
  tone?: 'good' | 'poor';
  className?: string;
}) {
  return (
    <div className={cn('grid gap-0.5 rounded-md bg-fill-quiet p-3', className)}>
      <span className="text-callout text-ink-secondary">{label}</span>
      <span
        className={cn(
          'font-rounded text-metric tabular-nums',
          tone === 'good' && 'text-good-ink',
          tone === 'poor' && 'text-poor-ink',
        )}
      >
        {value}
        {unit && <small className="ml-1 font-sans text-callout text-ink-secondary">{unit}</small>}
      </span>
    </div>
  );
}
