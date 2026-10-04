'use client';

import { useId, useState } from 'react';
import { Icon } from '@/components/common/Icon';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { cad, kwh } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PEAK_SAVER, REBATES } from '@/src/config/bc';
import type { FinanceInputs, ScenarioWarning } from '@/src/types/app';
import {
  adjustedInputs,
  atDefaults,
  BATTERY_SIZES,
  batteryInput,
  FACTS,
  KNOBS,
  knobRange,
  resetAssumptions,
  type BatteryDraft,
  type Knob,
} from './assumptions';

const LINK =
  'text-sky-700 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring';

/**
 * "Where do these numbers come from?" (#28). A collapsible section in the report panel: every assumption
 * with its BC default, unit and source, changeable within INPUT_RANGES, plus the BC Hydro facts behind
 * the numbers (read-only, each linked). Changes re-run the report live. With `battery`, the battery
 * choice (#32) sits here too. Usage and rate plan stay in "Your usage".
 */
export function AssumptionsDrawer({
  inputs,
  onChange,
  warnings,
  battery = false,
}: {
  inputs: FinanceInputs;
  onChange: (next: FinanceInputs) => void;
  /** The size on screen's warnings, to show CLAMPED_INPUT where the inputs are. */
  warnings: ScenarioWarning[];
  /** The `battery` flag. */
  battery?: boolean;
}) {
  const ids = useId();
  const adjusted = warnings.includes('CLAMPED_INPUT') ? adjustedInputs(inputs) : [];
  const changed = !atDefaults(inputs);

  return (
    <details className="group rounded-md bg-fill-quiet" aria-labelledby={`${ids}-heading`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 [&::-webkit-details-marker]:hidden">
        <span className="grid gap-0.5">
          <span id={`${ids}-heading`} className="text-headline">
            Assumptions
          </span>
          <span className="text-callout text-ink-secondary">
            {changed ? 'You changed some of these' : 'BC defaults · see and change what the numbers assume'}
          </span>
        </span>
        <Icon name="chevron" size={18} className="flex-none rotate-90 text-ink-secondary transition-transform group-open:-rotate-90" />
      </summary>

      <div className="grid gap-4 px-3 pb-3">
        {adjusted.length > 0 && (
          <p role="status" className="flex gap-2 rounded-md bg-fair-soft p-3 text-callout text-fair-ink">
            <Icon name="alert" size={16} className="mt-px flex-none" />
            <span>
              We adjusted {adjusted.map((a) => `${a.label.toLowerCase()} to ${shown(a.key, a.used)}`).join(', ')}, the nearest value we
              model.
            </span>
          </p>
        )}

        <ul className="grid gap-4">
          {KNOBS.map((k) => (
            <KnobRow key={k.key} knob={k} value={inputs[k.key]} onChange={(v) => onChange({ ...inputs, [k.key]: v })} />
          ))}
          <li className="grid gap-1">
            <label className="flex items-center justify-between gap-3 text-body">
              <span>I qualify for the BC Hydro solar rebate</span>
              <input
                type="checkbox"
                checked={inputs.rebateEligible}
                onChange={(e) => onChange({ ...inputs, rebateEligible: e.target.checked })}
                className="size-5 accent-sky-600"
              />
            </label>
            <details className="text-callout text-ink-secondary">
              <summary className="cursor-pointer">Who qualifies</summary>
              <ul className="mt-1 list-disc pl-5">
                {REBATES.conditions.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <a href={REBATES.source} target="_blank" rel="noreferrer" className={LINK}>
                BC Hydro solar and battery rebates
              </a>
            </details>
          </li>
        </ul>

        {battery && <BatteryChoice inputs={inputs} onChange={onChange} />}

        <section aria-labelledby={`${ids}-facts`} className="grid gap-1.5">
          <h3 id={`${ids}-facts`} className="text-callout font-semibold text-ink-secondary">
            BC Hydro facts we use
          </h3>
          <dl className="grid gap-1.5 text-callout">
            {FACTS.map((f) => (
              <div key={f.label} className="flex flex-wrap justify-between gap-x-3">
                <dt className="text-ink-secondary">{f.label}</dt>
                <dd className="text-right">
                  <a href={f.source} target="_blank" rel="noreferrer" className={LINK}>
                    {f.value}
                  </a>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <button
          type="button"
          disabled={!changed}
          onClick={() => onChange(resetAssumptions(inputs))}
          className="justify-self-start rounded-pill bg-fill-quiet px-3.5 py-1.5 text-callout font-semibold text-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:opacity-45"
        >
          Reset to BC defaults
        </button>
      </div>
    </details>
  );
}

/** An input value in the unit the drawer shows it in. */
function shown(key: keyof FinanceInputs, v: number): string {
  if (key === 'annualConsumptionKwh') return `${kwh(v)} kWh`;
  const k = KNOBS.find((x) => x.key === key);
  if (!k) return String(v);
  return k.unit === '$/kW' ? `${cad(k.toUi(v))} per kW` : `${k.toUi(v)} ${k.unit}`;
}

function KnobRow({ knob, value, onChange }: { knob: Knob; value: number; onChange: (v: number) => void }) {
  const id = useId();
  const range = knobRange(knob);
  const ui = knob.toUi(value);
  const isDefault = ui === range.default;
  return (
    <li className="grid gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-body">
          {knob.label}{' '}
          <span
            className={cn(
              'ml-1 rounded-pill px-1.5 py-px align-middle text-footnote font-semibold',
              knob.kind === 'assumption' ? 'bg-fair-soft text-fair-ink' : 'bg-fill-selected text-sky-700',
            )}
          >
            {knob.kind === 'assumption' ? 'Assumption' : 'Estimate'}
          </span>
        </label>
        <span className="font-rounded tabular-nums" aria-hidden="true">
          {knob.unit === '$/kW' ? cad(ui) : ui}
          <small className="ml-1 font-sans text-callout text-ink-secondary">{knob.unit === '$/kW' ? 'per kW' : knob.unit}</small>
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={range.min}
        max={range.max}
        step={knob.step}
        value={ui}
        aria-valuetext={`${knob.unit === '$/kW' ? cad(ui) + ' per kW' : `${ui} ${knob.unit}`}`}
        onChange={(e) => onChange(knob.fromUi(Number(e.target.value)))}
        className="w-full accent-sky-600"
      />
      <p className="text-footnote text-ink-tertiary">
        {knob.note} Default {knob.unit === '$/kW' ? `${cad(range.default)} per kW` : `${range.default} ${knob.unit}`}
        {isDefault ? ' (in use)' : ''}.
        {knob.source && (
          <>
            {' '}
            <a href={knob.source} target="_blank" rel="noreferrer" className={LINK}>
              Source
            </a>
          </>
        )}
      </p>
    </li>
  );
}

/** #32: an optional battery, priced from the user's quote (there's no default battery price). */
function BatteryChoice({ inputs, onChange }: { inputs: FinanceInputs; onChange: (next: FinanceInputs) => void }) {
  const ids = useId();
  const [draft, setDraft] = useState<BatteryDraft>(() => ({
    on: !!inputs.battery,
    kWh: inputs.battery?.kWh ?? 10,
    price: inputs.battery ? String(Math.round(inputs.battery.kWh * inputs.battery.costPerKwh)) : '',
    peakSaver: inputs.battery?.peakSaver ?? false,
  }));
  const update = (next: Partial<BatteryDraft>) => {
    const d = { ...draft, ...next };
    setDraft(d);
    onChange({ ...inputs, battery: batteryInput(d) });
  };
  const needsPrice = draft.on && !batteryInput(draft);

  return (
    <section aria-labelledby={`${ids}-heading`} className="grid gap-2 rounded-md bg-sky-050 p-3">
      <label className="flex items-center justify-between gap-3">
        <span id={`${ids}-heading`} className="text-body">
          Add a home battery{' '}
          <span className="ml-1 rounded-pill bg-fair-soft px-1.5 py-px align-middle text-footnote font-semibold text-fair-ink">
            Assumption
          </span>
        </span>
        <input type="checkbox" checked={draft.on} onChange={(e) => update({ on: e.target.checked })} className="size-5 accent-sky-600" />
      </label>

      {draft.on && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-callout text-ink-secondary">Battery size</span>
            <SegmentedControl
              label="Battery size"
              value={String(draft.kWh)}
              onChange={(v) => update({ kWh: Number(v) })}
              options={BATTERY_SIZES.map((s) => ({ value: String(s), label: `${s} kWh` }))}
            />
          </div>
          <label className="grid gap-1">
            <span className="text-callout text-ink-secondary">Installed price, from your quote</span>
            <span className="flex items-baseline gap-1 rounded-sm bg-fill-quiet px-3 py-2 focus-within:outline-2 focus-within:outline-focus-ring">
              <span className="font-rounded text-ink-secondary">$</span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={draft.price}
                placeholder="Battery price"
                onChange={(e) => update({ price: e.target.value })}
                className="w-full min-w-0 bg-transparent font-rounded tabular-nums text-ink outline-none placeholder:text-ink-tertiary"
              />
            </span>
          </label>
          {needsPrice && <p className="text-callout text-ink-secondary">Enter the battery price to add it to the numbers.</p>}
          <label className="flex items-start gap-2 text-callout">
            <input type="checkbox" checked={draft.peakSaver} onChange={(e) => update({ peakSaver: e.target.checked })} className="mt-0.5 size-4 accent-sky-600" />
            <span>
              Enrol in Peak Saver (higher battery rebate, ${PEAK_SAVER.batteryEnrollmentIncentive} to join, $
              {PEAK_SAVER.batterySeasonalReward} each winter). An enrolled battery can&rsquo;t opt out of winter peak events.{' '}
              <a href={PEAK_SAVER.terms} target="_blank" rel="noreferrer" className={LINK}>
                Terms
              </a>
            </span>
          </label>
          <p className="text-footnote text-ink-tertiary">
            Rebate: ${REBATES.battery.perKwh}/kWh, up to half the price and ${REBATES.battery.maxResidential.toLocaleString('en-CA')} ($
            {REBATES.battery.maxResidentialPeakSaver.toLocaleString('en-CA')} with Peak Saver), from {REBATES.battery.minKwh} kWh. We assume
            the battery lasts all {inputs.lifetimeYears} years with no replacement; most last 10&ndash;15, so this flatters it.
          </p>
        </>
      )}
    </section>
  );
}
