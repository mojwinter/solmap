'use client';

import type { CSSProperties } from 'react';
import { Icon } from '@/components/common/Icon';
import { kw, panelsLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import styles from './SizeSlider.module.css';

export interface SizeStep {
  panels: number;
  systemKwDc: number;
}

/**
 * System size picker. Moves through the roof's panel configs (not single panels), with −/+ steppers
 * for a precise step and a star above the recommended size.
 */
export function SizeSlider({
  steps,
  value,
  recommendedIndex,
  onChange,
}: {
  steps: SizeStep[];
  value: number;
  recommendedIndex: number | null;
  onChange: (index: number) => void;
}) {
  if (steps.length === 0) return null;
  const last = steps.length - 1;
  const at = (i: number) => (last === 0 ? 0 : (i / last) * 100);
  const current = steps[value];

  return (
    <section aria-labelledby="size-heading" className="grid gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="size-heading" className="text-body text-ink-secondary">
          System size
        </h2>
        <p className="font-rounded text-metric tabular-nums" aria-live="polite">
          {current.panels}
          <small className="ml-1 font-sans text-callout text-ink-secondary">
            {current.panels === 1 ? 'panel' : 'panels'} · {kw(current.systemKwDc)} kW
          </small>
        </p>
      </div>

      <div className="flex items-center gap-3 print:hidden">
        <Stepper icon="minus" label="Fewer panels" disabled={value <= 0} onClick={() => onChange(value - 1)} />
        <div className="relative flex-1 pt-3">
          {recommendedIndex !== null && (
            <span
              className="absolute top-0 -translate-x-1/2 text-sun-500"
              style={{ left: `calc(13px + (100% - 26px) * ${at(recommendedIndex) / 100})` }}
              title="Recommended size"
            >
              <Icon name="star" size={12} strokeWidth={2} className="fill-current" />
            </span>
          )}
          <input
            type="range"
            min={0}
            max={last}
            step={1}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-label="System size"
            aria-valuetext={panelsLabel(current.panels, current.systemKwDc)}
            className={styles.range}
            style={{ '--pct': `${at(value)}%` } as CSSProperties}
          />
        </div>
        <Stepper icon="plus" label="More panels" disabled={value >= last} onClick={() => onChange(value + 1)} />
      </div>

    </section>
  );
}

function Stepper({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: 'plus' | 'minus';
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid size-8 flex-none place-items-center rounded-full bg-fill-quiet text-ink transition-transform',
        'hover:bg-fill-selected active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-40',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
      )}
    >
      <Icon name={icon} size={16} strokeWidth={2} />
    </button>
  );
}
