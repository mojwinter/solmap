import type { ReactNode } from 'react';
import type { ScenarioResult } from '@/src/types/app';
import { InfoPopover } from '@/components/common/InfoPopover';
import { cad, cents } from '@/lib/format';
import { cn } from '@/lib/utils';
import { billImpact, lifetimeFigures } from './derive';

/**
 * Four headline figures for the size on screen: what year one saves, how much of the bill it covers,
 * what your own solar costs per kWh, and what comes back for every dollar paid. Just the number and a
 * short label; the ⓘ on each shows how it's worked out (printed inline on paper).
 */
export function KeyFigures({ scenario }: { scenario: ScenarioResult }) {
  const bill = billImpact(scenario);
  const life = lifetimeFigures(scenario);
  const lifetime = scenario.years.length;
  const back = life.returnPerDollar;

  return (
    // Four across when its column is wide enough (container query), else two by two.
    <div className="@container">
      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
        <Figure
          label="Year 1 savings"
          value={cad(scenario.year1.total)}
          info={
            <Rows
              rows={[
                ['Solar you use yourself', cad(scenario.year1.selfUsedValue)],
                ['Solar you sell back', cad(scenario.year1.exportValue)],
              ]}
              total={['First-year savings', cad(scenario.year1.total)]}
            />
          }
        />
        <Figure
          label="Off your bill"
          value={`${Math.round(Math.max(0, bill.cut) * 100)}%`}
          info={
            <Rows
              rows={[
                ['Bill without solar', cad(bill.before)],
                ['Less solar you use', cad(-scenario.year1.selfUsedValue)],
                ['Less export credit', cad(-bill.exportCredit)],
              ]}
              total={['What you’d still pay', cad(bill.net)]}
              foot="Year one, before GST, same usage."
            />
          }
        />
        <Figure
          label="Cost per kWh"
          value={life.costPerKwh === null ? '—' : cents(life.costPerKwh)}
          info={
            <Rows
              rows={[
                ['You pay', cad(scenario.netCost)],
                [`Energy over ${lifetime} years`, `${Math.round(life.energyKwh).toLocaleString('en-CA')} kWh`],
                ...(bill.avoidedRatePerKwh === null ? [] : ([['BC Hydro rate it replaces', cents(bill.avoidedRatePerKwh)]] as [string, string][])),
              ]}
              total={['Cost per kWh', life.costPerKwh === null ? '—' : cents(life.costPerKwh)]}
            />
          }
        />
        <Figure
          label="Back per $1"
          value={back === null ? '—' : `$${back.toFixed(2)}`}
          tone={back === null ? undefined : back >= 1 ? 'good' : 'poor'}
          info={
            <Rows
              rows={[
                [`Savings over ${lifetime} years`, cad(life.grossSavings)],
                ['You pay', cad(scenario.netCost)],
              ]}
              total={['Back per $1 paid', back === null ? '—' : `$${back.toFixed(2)}`]}
              foot="Under $1.00 means the panels don’t earn back what they cost."
            />
          }
        />
      </section>
    </div>
  );
}

function Figure({ label, value, tone, info }: { label: string; value: string; tone?: 'good' | 'poor'; info: ReactNode }) {
  return (
    <div className="card grid content-start gap-0.5 rounded-lg p-4">
      <span className={cn('font-rounded text-metric', tone === 'good' && 'text-good-ink', tone === 'poor' && 'text-poor-ink')}>
        {value}
      </span>
      <span className="flex items-center gap-1 text-callout text-ink-secondary">
        {label}
        <InfoPopover label={`How “${label.toLowerCase()}” is worked out`}>{info}</InfoPopover>
      </span>
      <div className="hidden text-footnote text-ink-secondary print:block">{info}</div>
    </div>
  );
}

function Rows({ rows, total, foot }: { rows: [string, string][]; total: [string, string]; foot?: string }) {
  return (
    <div className="grid max-w-64 gap-1">
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 tabular-nums">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt>{k}</dt>
            <dd className="text-right">{v}</dd>
          </div>
        ))}
        <dt className="border-t border-separator pt-0.5 font-semibold">{total[0]}</dt>
        <dd className="border-t border-separator pt-0.5 text-right font-semibold">{total[1]}</dd>
      </dl>
      {foot && <p className="text-footnote text-ink-secondary">{foot}</p>}
    </div>
  );
}
