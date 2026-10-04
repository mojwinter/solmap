import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { InfoPopover } from './InfoPopover';

/** A stat tile on fill-quiet: small grey label over a big tabular number, with an optional ⓘ for how it was worked out. */
export function Stat({
  label,
  value,
  unit,
  tone,
  info,
  className,
}: {
  label: string;
  value: ReactNode;
  /** Small grey unit beside the number ("kWh", "yrs"). */
  unit?: string;
  /** Gains and losses only (design: verdict colours mark money). */
  tone?: 'good' | 'poor';
  /** How the number was worked out: an ⓘ beside the label on screen, printed under the number. */
  info?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-0.5 rounded-md bg-fill-quiet p-3', className)}>
      <span className="text-callout text-ink-secondary">
        {info ? (
          <>
            {/* The ⓘ is glued to the last word, so a label that wraps never leaves it alone on a line. */}
            {label.slice(0, label.lastIndexOf(' ') + 1)}
            <span className="whitespace-nowrap">
              {label.slice(label.lastIndexOf(' ') + 1)}
              <span className="ml-1 inline-block align-middle">
                <InfoPopover label={`How ${label.toLowerCase()} is worked out`}>{info}</InfoPopover>
              </span>
            </span>
          </>
        ) : (
          label
        )}
      </span>
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
      {info && <div className="hidden text-footnote text-ink-secondary print:block">{info}</div>}
    </div>
  );
}
