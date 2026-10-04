'use client';

import { useEffect, useRef, type CSSProperties, type MouseEvent } from 'react';
import { Icon } from '@/components/common/Icon';
import { kwh, panelsLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import styles from './SizeSlider.module.css';

export interface SizeStep {
  panels: number;
  /** First-year AC production: the sum of these panels' own output, so each step adds a different amount. */
  acKwhYear1: number;
}

// Hold a stepper to keep stepping: a roof can have 50+ configs, too many to click through one by one.
const HOLD_DELAY_MS = 400;
const HOLD_REPEAT_MS = 70;

/**
 * System size picker. Moves through the roof's panel configs (not single panels), with −/+ steppers
 * for a precise step (hold to repeat), a caret under the track at the recommended size, and a line under
 * it that says you're on it or takes you back.
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
  const recommended = recommendedIndex === null ? null : steps[recommendedIndex];
  const onRecommended = recommendedIndex === value;
  // The thumb is 26px wide, so its centre runs from 13px to (100% − 13px) of the track.
  const thumbLeft = (i: number) => `calc(13px + (100% - 26px) * ${at(i) / 100})`;
  const step = (dir: -1 | 1) => (i: number) => Math.min(last, Math.max(0, i + dir));

  return (
    <section aria-labelledby="size-heading" className="grid gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="size-heading" className="text-body text-ink-secondary">
          System size
        </h2>
        <p className="font-rounded text-metric tabular-nums" aria-live="polite">
          {current.panels}
          <small className="ml-1 font-sans text-callout text-ink-secondary">
            {current.panels === 1 ? 'panel' : 'panels'} · {kwh(current.acKwhYear1)} kWh
          </small>
        </p>
      </div>

      <div className="flex items-center gap-3 print:hidden">
        <Stepper icon="minus" label="Fewer panels" value={value} next={step(-1)} disabled={value <= 0} onChange={onChange} />
        <div className="relative flex-1">
          <input
            type="range"
            min={0}
            max={last}
            step={1}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-label="System size"
            aria-valuetext={panelsLabel(current.panels, current.acKwhYear1) + (onRecommended ? ', recommended' : '')}
            className={styles.range}
            style={{ '--pct': `${at(value)}%` } as CSSProperties}
          />
          {recommendedIndex !== null && (
            // A caret pointing up at the spot, just under the thumb's reach so the thumb never covers it.
            <svg
              aria-hidden="true"
              viewBox="0 0 10 6"
              className="pointer-events-none absolute top-full h-1.5 w-2.5 -translate-x-1/2 fill-sky-600"
              style={{ left: thumbLeft(recommendedIndex) }}
            >
              <path d="M5 0.6 9.2 5.4H0.8z" strokeLinejoin="round" className="stroke-sky-600" strokeWidth={1.2} />
            </svg>
          )}
        </div>
        <Stepper icon="plus" label="More panels" value={value} next={step(1)} disabled={value >= last} onChange={onChange} />
      </div>

      {recommended &&
        (onRecommended ? (
          <p className="flex items-center gap-1 text-callout text-ink-secondary">
            <Icon name="check" size={14} strokeWidth={2} className="flex-none text-sky-600" />
            Recommended size
          </p>
        ) : (
          <button
            type="button"
            onClick={() => onChange(recommendedIndex!)}
            className={cn(
              'flex items-center gap-1 justify-self-start rounded-sm text-callout text-sky-700 hover:underline',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring print:hidden',
            )}
          >
            <Icon name="refresh" size={14} strokeWidth={2} className="flex-none" />
            Use recommended ({recommended.panels} panels)
          </button>
        ))}
    </section>
  );
}

function Stepper({
  icon,
  label,
  value,
  next,
  disabled,
  onChange,
}: {
  icon: 'plus' | 'minus';
  label: string;
  value: number;
  /** The index one step on from `i`, clamped to the ends. */
  next: (i: number) => number;
  disabled: boolean;
  onChange: (index: number) => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  // Reaching the end disables the button, and a disabled button never gets its pointerup.
  useEffect(() => {
    if (disabled) stop();
  }, [disabled]);

  // Pointer presses step at once, then repeat while held. Keyboard and assistive tech send a click
  // with no pointer press (detail 0), so those step from onClick instead.
  const start = () => {
    stop();
    let i = next(value);
    onChange(i);
    const repeat = (delay: number) => {
      timer.current = setTimeout(() => {
        const n = next(i);
        if (n === i) return stop();
        i = n;
        onChange(i);
        repeat(HOLD_REPEAT_MS);
      }, delay);
    };
    repeat(HOLD_DELAY_MS);
  };
  const onClick = (e: MouseEvent) => {
    if (e.detail === 0) onChange(next(value));
  };

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onPointerDown={(e) => {
        if (e.button === 0) start();
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onClick={onClick}
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        'grid size-9 flex-none touch-manipulation select-none place-items-center rounded-full bg-fill-quiet text-ink',
        'transition-[transform,background-color] duration-150 pointer-coarse:size-10',
        'hover:bg-fill-selected active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-40',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring motion-reduce:transition-none',
      )}
    >
      <Icon name={icon} size={16} strokeWidth={2} />
    </button>
  );
}
