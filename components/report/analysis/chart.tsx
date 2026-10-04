import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Axis tick text: muted ink, small. Charts never colour text with a series colour. */
export const AXIS_TEXT = { fill: 'var(--ink-tertiary)', fontSize: 12 };
/** Gridlines: solid hairlines one step off the surface. */
export const GRID = 'var(--separator)';

/**
 * One chart's frame inside a card: heading, a sentence that says what to read from it, the plot, then
 * an optional "See the numbers" table so no value depends on hovering or colour. `aside` sits right of
 * the heading (a toggle or a legend).
 */
export function ChartSection({
  id,
  title,
  summary,
  aside,
  legend,
  table,
  children,
  className,
}: {
  id: string;
  title: string;
  /** The takeaway in words (also what a screen reader hears for the plot). */
  summary: ReactNode;
  aside?: ReactNode;
  legend?: ReactNode;
  /** The numbers behind the plot, shown in a closed disclosure. */
  table?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn('grid content-start gap-3 print:break-inside-avoid', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="grid min-w-0 flex-1 basis-56 gap-1">
          <h2 id={id} className="text-headline">
            {title}
          </h2>
          <p className="text-callout text-pretty text-ink-secondary">{summary}</p>
        </div>
        {aside && <div className="w-full flex-none sm:w-auto print:hidden">{aside}</div>}
      </div>
      {children}
      {legend}
      {table && (
        <details className="group text-callout text-ink-secondary">
          <summary className="w-fit cursor-pointer rounded-sm select-none hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
            See the numbers
          </summary>
          {/* Scrolls when long, so it takes focus: keyboard users can scroll it too. */}
          <div
            tabIndex={0}
            role="region"
            aria-label={`${title}: the numbers`}
            className="mt-2 max-h-72 overflow-y-auto rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            {table}
          </div>
        </details>
      )}
    </section>
  );
}

/** A legend row: a short key mark beside each label, in text colours. */
export function Legend({ items }: { items: { label: string; color: string; shape?: 'dot' | 'line' | 'bar' }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-callout text-ink-secondary">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn(
              'inline-block flex-none',
              it.shape === 'line' ? 'h-0.5 w-3.5 rounded-pill' : it.shape === 'bar' ? 'h-3 w-2 rounded-[2px]' : 'size-2.5 rounded-full',
            )}
            style={{ background: it.color }}
          />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

/** The hover card every chart uses: the value big, what it is underneath. */
export function TooltipCard({ value, label, rows }: { value: ReactNode; label: ReactNode; rows?: { label: string; value: string }[] }) {
  return (
    <div className="grid min-w-36 gap-0.5 rounded-md bg-popover px-3 py-2 shadow-(--elev-control)">
      <span className="font-rounded text-headline tabular-nums text-ink">{value}</span>
      <span className="text-callout text-ink-secondary">{label}</span>
      {rows && rows.length > 0 && (
        <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-3 border-t border-separator pt-1 text-callout">
          {rows.map((r) => (
            <div key={r.label} className="contents">
              <dt className="text-ink-secondary">{r.label}</dt>
              <dd className="text-right tabular-nums text-ink">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** A plain numbers table for "See the numbers". */
export function NumbersTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full tabular-nums">
      <thead className="sticky top-0 bg-surface">
        <tr className="text-left">
          {head.map((h, i) => (
            <th key={h} className={cn('py-1 font-medium', i > 0 && 'text-right')}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri} className="border-t border-separator">
            {r.map((c, i) => (
              <td key={i} className={cn('py-1', i > 0 && 'text-right')}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A y-axis wide enough for its longest tick label at AXIS_TEXT size (≈7px a character, plus the tick gap). */
export function axisWidth(ticks: readonly number[], format: (v: number) => string): number {
  return Math.max(32, Math.ceil(Math.max(...ticks.map((t) => format(t).length)) * 7.2) + 10);
}
