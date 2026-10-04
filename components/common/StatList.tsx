import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from './Icon';

export interface StatItem {
  icon: IconName;
  label: string;
  /** Small grey unit beside the label ("kWh a year"): for units that read as a description. */
  unit?: string;
  value: ReactNode;
  /** Small grey unit after the number instead ("4,763 kWh"): for short units. */
  valueUnit?: string;
  /** sun = sunshine tile; sky = energy tile; good = savings tile. */
  tone?: 'sun' | 'sky' | 'good';
}

const TILE = {
  neutral: 'bg-fill-quiet text-ink-secondary',
  sun: 'bg-sun-500 text-on-sun-500',
  sky: 'bg-sky-600/15 text-sky-700',
  good: 'bg-good-soft text-good-ink',
};

/** The design's inset grouped list: icon tile, label + unit, value on the right. */
export function StatList({ items, className }: { items: StatItem[]; className?: string }) {
  return (
    <ul className={cn('rounded-md bg-fill-quiet px-3', className)}>
      {items.map((it, i) => (
        <li key={`${i}-${it.label}`} className="flex items-center gap-3 border-separator py-3 not-first:border-t">
          <span className={cn('grid size-[30px] flex-none place-items-center rounded-sm', TILE[it.tone ?? 'neutral'])}>
            <Icon name={it.icon} size={18} />
          </span>
          <span className="flex-1 text-body">
            {it.label}
            {it.unit && <span className="ml-1 text-callout text-ink-secondary">{it.unit}</span>}
          </span>
          <span className="font-rounded text-headline tabular-nums">
            {it.value}
            {it.valueUnit && <small className="ml-1 font-sans text-callout text-ink-secondary">{it.valueUnit}</small>}
          </span>
        </li>
      ))}
    </ul>
  );
}
