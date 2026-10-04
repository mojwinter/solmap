import type { ReactNode } from 'react';
import type { ScenarioResult } from '@/src/types/app';
import { InfoPopover } from '@/components/common/InfoPopover';
import { cad, kwh } from '@/lib/format';
import { cn } from '@/lib/utils';
import { billImpact } from './derive';

/**
 * Four headline figures for the size on screen: what it makes in a year, the roof's sun hours, what
 * it saves a year (year one) and how much of the bill it covers. Just the number and a
 * short label; the ⓘ on each shows how it's worked out (printed inline on paper).
 */
export function KeyFigures({ scenario, sunHours }: { scenario: ScenarioResult; sunHours: number }) {
  const bill = billImpact(scenario);

  return (
    // Four across when its column is wide enough (container query), else two by two.
    <div className="@container">
      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
        <Figure
          label="kWh/yr"
          value={kwh(scenario.acKwhYear1)}
          info={<p className="max-w-64">First-year production after wiring losses (AC). Panels lose about 0.5% a year after that.</p>}
        />
        <Figure
          label="Sun hours/yr"
          value={kwh(sunHours)}
          info={<p className="max-w-64">Annual sunshine on the sunniest part of your roof, from Google’s aerial data.</p>}
        />
        <Figure
          label="Yearly savings"
          value={cad(scenario.year1.total)}
          info={
            <Rows
              rows={[
                ['Solar you use yourself', cad(scenario.year1.selfUsedValue)],
                ['Solar you sell back', cad(scenario.year1.exportValue)],
              ]}
              total={['First-year savings', cad(scenario.year1.total)]}
              foot="Year one. It grows a little each year as power prices rise, less about 0.5% a year as panels age."
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
      </section>
    </div>
  );
}

function Figure({ label, value, tone, info }: { label: string; value: string; tone?: 'good' | 'poor'; info: ReactNode }) {
  return (
    <div className="card relative grid content-start gap-0.5 rounded-lg p-3.5">
      <span className={cn('pr-5 font-rounded text-metric', tone === 'good' && 'text-good-ink', tone === 'poor' && 'text-poor-ink')}>
        {value}
      </span>
      <span className="text-callout text-ink-secondary">{label}</span>
      {/* In the corner, so the label keeps the tile's full width. */}
      <span className="absolute top-2.5 right-2.5">
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
