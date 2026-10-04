'use client';

import { useId, useState } from 'react';
import type { FinanceInputs } from '@/src/types/app';
import { Icon } from '@/components/common/Icon';
import { kwh } from '@/lib/format';
import { cn } from '@/lib/utils';
import { DEFAULT_INPUTS } from '@/src/config/bc';
import { UsageInputs } from './UsageInputs';

const PLAN = { tiered: 'Tiered rate', flat: 'Flat rate' } as const;

/**
 * "Your home": one line saying which usage and rate plan the numbers use, and a Change button that opens
 * the bill / annual kWh / rate plan inputs in place. Closed by default so the report stays simple; the
 * inputs stay mounted while closed, so a typed bill survives closing and reopening.
 */
export function YourHome({ inputs, onChange }: { inputs: FinanceInputs; onChange: (next: FinanceInputs) => void }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const typical = Math.round(inputs.annualConsumptionKwh) === DEFAULT_INPUTS.annualConsumptionKwh;

  return (
    <section aria-labelledby={`${id}-heading`} className="grid gap-3 print:hidden">
      <div className="flex items-center gap-3">
        <span className="grid size-[30px] flex-none place-items-center rounded-sm bg-sky-600/15 text-sky-700">
          <Icon name="bolt" size={18} />
        </span>
        <div className="grid flex-1 gap-0.5">
          <h2 id={`${id}-heading`} className="text-headline">
            Your home
          </h2>
          <p className="text-callout text-ink-secondary">
            <span className="font-rounded tabular-nums text-ink">{kwh(inputs.annualConsumptionKwh)}</span> kWh a year ·{' '}
            {PLAN[inputs.ratePlan]}
            {typical && ' · typical BC home'}
          </p>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'inline-flex min-h-[32px] items-center gap-1 rounded-pill px-3 text-callout font-semibold',
            open ? 'bg-fill-quiet text-ink' : 'bg-sky-600 text-on-sky-600 shadow-control',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring motion-safe:active:scale-[.97]',
          )}
        >
          {open ? 'Done' : 'Change'}
        </button>
      </div>
      {typical && !open && (
        <p className="text-callout text-pretty text-ink-secondary">
          Enter your BC Hydro bill to make every number here yours.
        </p>
      )}
      <div id={`${id}-panel`} hidden={!open}>
        <UsageInputs inputs={inputs} onChange={onChange} />
      </div>
    </section>
  );
}
