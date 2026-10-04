'use client';

import { useId, type CSSProperties, type ReactNode } from 'react';
import type { FinanceInputs } from '@/src/types/app';
import { cents } from '@/lib/format';
import { cn } from '@/lib/utils';
import { DEFAULT_INPUTS, INPUT_RANGES, INSTALL, SELF_GENERATION } from '@/src/config/bc';
import styles from '@/components/common/Range.module.css';

type Knob = 'costPerWatt' | 'costIncrease' | 'daytimeLoadShare' | 'discountRate' | 'panelWatts';

/** A yearly multiplier as a percentage: 1.03 → "3%", 1.0375 → "3.75%". */
function pct(multiplier: number): string {
  const p = Math.round((multiplier - 1) * 10000) / 100;
  return `${Number.isInteger(p) ? p : p.toFixed(2).replace(/0$/, '')}%`;
}
const share = (n: number) => `${Math.round(n * 100)}%`;

/** Every editable assumption: its range (INPUT_RANGES, the engine clamps to the same), step, format and why. */
const KNOBS: Record<Knob, { label: string; step: number; format: (v: number) => string; hint: string }> = {
  costPerWatt: {
    label: 'Install cost',
    step: 0.05,
    format: (v) => `$${v.toFixed(2)} a watt`,
    hint: `BC Hydro: $${INSTALL.costPerKwDcLow / 1000}–$${INSTALL.costPerKwDcHigh / 1000} a watt installed. Use your quote once you have one.`,
  },
  costIncrease: {
    label: 'Power prices rise',
    step: 0.0025,
    format: (v) => `${pct(v)} a year`,
    hint: 'Recent BC Hydro increases were 3.75% a year. Faster rises make solar pay sooner.',
  },
  daytimeLoadShare: {
    label: 'Power you use while the sun’s up',
    step: 0.01,
    format: (v) => `${share(v)} of your use`,
    hint: 'The most solar you can use as it’s made. Home by day, or run laundry at noon? Go higher.',
  },
  discountRate: {
    label: 'What your money could earn',
    step: 0.0025,
    format: (v) => `${pct(v)} a year`,
    hint: 'Counts future savings for less in “value today”. Higher favours smaller systems.',
  },
  panelWatts: {
    label: 'Panel size',
    step: 5,
    format: (v) => `${Math.round(v)} W`,
    hint: 'Google lays out 400 W panels. Bigger panels make more from the same roof.',
  },
};

/**
 * [P1, `assumptions` flag] The assumptions drawer (DESIGN.md §3): every knob in FinanceInputs that's
 * ours to guess, with its range, BC default and why, and the fixed BC facts beside them. Every change
 * reruns the whole report. "Reset to BC defaults" puts the knobs back (your usage and plan stay).
 */
export function AssumptionsPanel({ inputs, onChange }: { inputs: FinanceInputs; onChange: (next: FinanceInputs) => void }) {
  const id = useId();
  const knobs = Object.keys(KNOBS) as Knob[];
  const changed = knobs.some((k) => inputs[k] !== DEFAULT_INPUTS[k]) || inputs.rebateEligible !== DEFAULT_INPUTS.rebateEligible;
  const reset = () =>
    onChange({
      ...inputs,
      ...Object.fromEntries(knobs.map((k) => [k, DEFAULT_INPUTS[k]])),
      rebateEligible: DEFAULT_INPUTS.rebateEligible,
    });

  return (
    <section aria-labelledby={id} className="grid gap-4 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 flex-1 basis-64 gap-1">
          <h2 id={id} className="text-headline">
            What we assumed
          </h2>
          <p className="text-callout text-pretty text-ink-secondary">
            Our best guesses for BC today. Move any of them and every number on this page updates.
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          disabled={!changed}
          className="inline-flex min-h-[32px] items-center rounded-pill bg-fill-quiet px-3 text-callout font-semibold text-ink hover:bg-fill-selected focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:opacity-45 motion-safe:active:scale-[.97]"
        >
          Reset to BC defaults
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {knobs.map((k) => (
          <KnobControl key={k} knob={k} value={inputs[k]} onChange={(v) => onChange({ ...inputs, [k]: v })} />
        ))}
        <Tile>
          <label className="flex items-start justify-between gap-3">
            <span className="grid gap-1">
              <span className="text-body">BC Hydro rebate</span>
              <span className="text-callout text-ink-secondary">
                Needs BC Hydro approval before you buy and an HPCN installer.
              </span>
            </span>
            <Switch checked={inputs.rebateEligible} onChange={(on) => onChange({ ...inputs, rebateEligible: on })} />
          </label>
        </Tile>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-md bg-fill-quiet p-3 text-callout sm:grid-cols-4">
        <Fact label="Sell-back rate" value={`${cents(SELF_GENERATION.exportRatePerKwh)}/kWh`} note={SELF_GENERATION.schedule} />
        <Fact label="Panels lose" value={`${(INSTALL.degradationPerYear * 100).toFixed(1)}% a year`} note="BC Hydro" />
        <Fact label="Panel life" value={`${inputs.lifetimeYears} years`} note="BC Hydro" />
        <Fact label="Usable after wiring" value={share(inputs.dcToAcDerate)} note="DC to AC" />
      </dl>
    </section>
  );
}

function Tile({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid content-start gap-2 rounded-md bg-fill-quiet p-3', className)}>{children}</div>;
}

function KnobControl({ knob, value, onChange }: { knob: Knob; value: number; onChange: (v: number) => void }) {
  const id = useId();
  const k = KNOBS[knob];
  const { min, max } = INPUT_RANGES[knob];
  const at = ((value - min) / (max - min)) * 100;
  const isDefault = value === DEFAULT_INPUTS[knob];
  return (
    <Tile>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-body">
          {k.label}
        </label>
        <span className="font-rounded text-headline whitespace-nowrap tabular-nums">{k.format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={k.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={k.format(value)}
        className={styles.range}
        style={{ '--pct': `${at}%` } as CSSProperties}
      />
      <p className="text-callout text-pretty text-ink-secondary">
        {k.hint}{' '}
        {!isDefault && (
          <button
            type="button"
            onClick={() => onChange(DEFAULT_INPUTS[knob])}
            className="rounded-sm text-sky-700 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            Back to {k.format(DEFAULT_INPUTS[knob])}
          </button>
        )}
      </p>
    </Tile>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <span className="relative mt-0.5 inline-flex flex-none">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer absolute inset-0 z-10 cursor-pointer opacity-0"
      />
      <span
        aria-hidden="true"
        className="h-[28px] w-[46px] rounded-pill bg-control-border/40 transition-colors peer-checked:bg-sky-600 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring"
      />
      <span
        aria-hidden="true"
        className="absolute top-[2px] left-[2px] size-6 rounded-full bg-white shadow-control transition-transform peer-checked:translate-x-[18px] motion-reduce:transition-none"
      />
    </span>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-ink-secondary">{label}</dt>
      <dd className="font-rounded text-headline tabular-nums">
        {value}
        <small className="ml-1 font-sans text-footnote text-ink-tertiary">{note}</small>
      </dd>
    </div>
  );
}
