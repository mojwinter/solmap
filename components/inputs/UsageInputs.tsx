'use client';

import { useId, useState } from 'react';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { annualKwhFromBill } from '@/lib/finance';
import { kwh } from '@/lib/format';
import { DEFAULT_INPUTS, TARIFFS } from '@/src/config/bc';
import type { FinanceInputs, RatePlan } from '@/src/types/app';

type Mode = 'bill' | 'kwh';
type Period = '1' | '2';

// BC Hydro's page on usage history: "View detailed consumption" in MyHydro shows recent or annual kWh.
const USAGE_HISTORY_URL = 'https://app.bchydro.com/accounts-billing/rates-energy-use/access-load-data.html';

/** "1,234.5" or "$250" → 1234.5; empty or junk → null. */
function parseAmount(raw: string): number | null {
  const n = Number(raw.replace(/[$,\s]/g, ''));
  return raw.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * "Your usage": a BC Hydro bill (monthly or every two months, as printed with GST) or annual kWh,
 * plus the rate plan. Every keystroke recomputes the report. Empty fields fall back to a typical BC
 * home. Only annual kWh leaves this component (DESIGN.md §2): the bill amount stays local.
 */
export function UsageInputs({ inputs, onChange }: { inputs: FinanceInputs; onChange: (next: FinanceInputs) => void }) {
  const typical = DEFAULT_INPUTS.annualConsumptionKwh;
  // Remounts (a new roof) keep the household's usage: show it as annual kWh, since the bill isn't stored.
  const carried = inputs.annualConsumptionKwh !== typical;
  const [mode, setMode] = useState<Mode>(carried ? 'kwh' : 'bill');
  const [bill, setBill] = useState('');
  const [period, setPeriod] = useState<Period>('1');
  const [annual, setAnnual] = useState(carried ? String(Math.round(inputs.annualConsumptionKwh)) : '');
  const ids = useId();

  // The one place usage turns into FinanceInputs.
  const apply = (next: { mode?: Mode; bill?: string; period?: Period; annual?: string; plan?: RatePlan }) => {
    const m = next.mode ?? mode;
    const plan = next.plan ?? inputs.ratePlan;
    const amount = parseAmount(m === 'bill' ? (next.bill ?? bill) : (next.annual ?? annual));
    const kwhPerYear =
      amount === null
        ? typical
        : m === 'bill'
          ? annualKwhFromBill(amount, Number(next.period ?? period) as 1 | 2, plan)
          : amount;
    onChange({ ...inputs, ratePlan: plan, annualConsumptionKwh: kwhPerYear });
  };

  const billAmount = parseAmount(bill);
  const fromBill = billAmount === null ? null : annualKwhFromBill(billAmount, Number(period) as 1 | 2, inputs.ratePlan);
  const entered = mode === 'bill' ? billAmount !== null : parseAmount(annual) !== null;

  return (
    // Not printed: the assumptions line under the money says which usage and plan the numbers use.
    <section aria-labelledby={`${ids}-heading`} className="grid gap-3 print:hidden">
      <h2 id={`${ids}-heading`} className="text-headline">
        Your usage
      </h2>

      <SegmentedControl
        label="Enter usage as"
        stretch
        value={mode}
        onChange={(m) => {
          setMode(m);
          apply({ mode: m });
        }}
        options={[
          { value: 'bill', label: 'My bill ($)' },
          { value: 'kwh', label: 'Annual usage (kWh)' },
        ]}
      />

      {mode === 'bill' ? (
        <div className="grid gap-3 rounded-md bg-fill-quiet p-3">
          <Field
            id={`${ids}-bill`}
            label="Bill amount"
            hint="As printed, including GST"
            prefix="$"
            inputMode="decimal"
            value={bill}
            placeholder="Amount on your bill"
            onChange={(v) => {
              setBill(v);
              apply({ bill: v });
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-callout text-ink-secondary">This bill covers</span>
            <SegmentedControl
              label="This bill covers"
              value={period}
              onChange={(p) => {
                setPeriod(p);
                apply({ period: p });
              }}
              options={[
                { value: '1', label: '1 month' },
                { value: '2', label: '2 months' },
              ]}
            />
          </div>
          {fromBill !== null && (
            <p className="text-callout text-ink-secondary" aria-live="polite">
              {fromBill > 0 ? (
                <>
                  About <span className="font-rounded tabular-nums text-ink">{kwh(fromBill)}</span> kWh a year
                </>
              ) : (
                'That’s about the basic charge alone. Check the amount, or enter your annual kWh instead.'
              )}
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-2 rounded-md bg-fill-quiet p-3">
          <Field
            id={`${ids}-kwh`}
            label="Electricity used in a year"
            unit="kWh"
            inputMode="numeric"
            value={annual}
            placeholder={kwh(typical)}
            onChange={(v) => {
              setAnnual(v);
              apply({ annual: v });
            }}
          />
          <p className="text-callout text-ink-secondary">
            The most accurate input. Find it in{' '}
            <a href={USAGE_HISTORY_URL} target="_blank" rel="noreferrer" className={LINK}>
              MyHydro under &ldquo;View detailed consumption&rdquo;
            </a>
            .
          </p>
        </div>
      )}

      {!entered && (
        <p className="text-callout text-ink-secondary">
          Using a typical BC home ({kwh(typical)} kWh a year). Enter your {mode === 'bill' ? 'bill' : 'usage'} for
          accuracy.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-callout text-ink-secondary">Rate plan</span>
        <SegmentedControl
          label="Rate plan"
          value={inputs.ratePlan}
          onChange={(plan) => apply({ plan })}
          options={[
            { value: 'tiered', label: 'Tiered' },
            { value: 'flat', label: 'Flat' },
          ]}
        />
      </div>
      <p className="text-callout text-ink-secondary">
        Electric heat? High-use homes may be on{' '}
        <a href={TARIFFS.flat.source} target="_blank" rel="noreferrer" className={LINK}>
          BC Hydro&rsquo;s flat rate
        </a>
        . Your bill says which plan you&rsquo;re on.
      </p>
    </section>
  );
}

const LINK =
  'text-sky-700 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring';

function Field({
  id,
  label,
  hint,
  prefix,
  unit,
  value,
  placeholder,
  inputMode,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  prefix?: string;
  unit?: string;
  value: string;
  placeholder?: string;
  inputMode: 'decimal' | 'numeric';
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-callout text-ink-secondary">
        {label}
        {hint && <span className="text-ink-tertiary"> · {hint}</span>}
      </label>
      <div className="flex items-baseline gap-1 rounded-sm bg-sky-050 px-3 py-2 outline-offset-2 focus-within:outline-2 focus-within:outline-focus-ring">
        {prefix && <span className="font-rounded text-metric text-ink-secondary">{prefix}</span>}
        <input
          id={id}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full min-w-0 bg-transparent font-rounded text-metric tabular-nums text-ink outline-none placeholder:text-ink-tertiary"
        />
        {unit && <span className="text-callout text-ink-secondary">{unit}</span>}
      </div>
    </div>
  );
}
