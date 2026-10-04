import { useId } from 'react';
import type { ScenarioResult } from '@/src/types/app';
import { cad, cents, kwh } from '@/lib/format';
import { SELF_GENERATION } from '@/src/config/bc';
import { billImpact } from './derive';

/**
 * Year one in two pictures: where the panels' power goes (used at home vs sold to BC Hydro, and what
 * each kWh is worth), then the yearly bill as a waterfall from "without solar" to what's left to pay.
 */
export function FirstYear({ scenario }: { scenario: ScenarioResult }) {
  return (
    // Side by side when the card is wide (under the house without charts), stacked in a narrow column.
    <div className="@container">
      <div className="grid gap-6 @3xl:grid-cols-2 @3xl:gap-8">
        <EnergySplit scenario={scenario} />
        <BillWaterfall scenario={scenario} />
      </div>
    </div>
  );
}

function EnergySplit({ scenario }: { scenario: ScenarioResult }) {
  const id = useId();
  const { selfUsedKwh, exportedKwh, selfUsedValue, exportValue } = scenario.year1;
  const made = selfUsedKwh + exportedKwh;
  const selfShare = made > 0 ? selfUsedKwh / made : 0;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const rate = selfUsedKwh > 0 ? selfUsedValue / selfUsedKwh : null;

  return (
    <section aria-labelledby={id} className="grid content-start gap-3 print:break-inside-avoid">
      <div className="grid gap-1">
        <h2 id={id} className="text-headline">
          Where your solar goes
        </h2>
        <p className="text-callout text-pretty text-ink-secondary">
          Power you use as it’s made saves your full rate. What you don’t use sells to BC Hydro at{' '}
          {cents(SELF_GENERATION.exportRatePerKwh)}/kWh, so the more you use yourself, the better it pays.
        </p>
      </div>

      <div aria-hidden="true" className="flex h-3 gap-0.5 overflow-hidden rounded-pill">
        <span className="h-full bg-sky-600" style={{ width: `${selfShare * 100}%` }} />
        <span className="h-full flex-1 bg-chart-sun" />
      </div>

      <dl className="grid grid-cols-2 gap-3">
        <Part
          color="var(--sky-600)"
          label="Used at home"
          share={pct(selfShare)}
          kwhValue={kwh(selfUsedKwh)}
          money={cad(selfUsedValue)}
          note={rate === null ? undefined : `saves ~${cents(rate)}/kWh`}
        />
        <Part
          color="var(--chart-sun)"
          label="Sold to BC Hydro"
          share={pct(1 - selfShare)}
          kwhValue={kwh(exportedKwh)}
          money={cad(exportValue)}
          note={`at ${cents(SELF_GENERATION.exportRatePerKwh)}/kWh`}
        />
      </dl>
    </section>
  );
}

function Part({
  color,
  label,
  share,
  kwhValue,
  money,
  note,
}: {
  color: string;
  label: string;
  share: string;
  kwhValue: string;
  money: string;
  note?: string;
}) {
  return (
    <div className="grid gap-0.5 rounded-md bg-fill-quiet p-3">
      <dt className="flex items-center gap-1.5 text-callout text-ink-secondary">
        <span aria-hidden="true" className="size-2.5 flex-none rounded-full" style={{ background: color }} />
        {label}
      </dt>
      <dd className="font-rounded text-metric tabular-nums">
        {share}
        <small className="ml-1.5 font-sans text-callout text-ink-secondary">{kwhValue} kWh</small>
      </dd>
      <dd className="text-callout text-ink-secondary">
        <span className="font-semibold text-ink tabular-nums">{money}</span> a year{note && ` · ${note}`}
      </dd>
    </div>
  );
}

/** Horizontal waterfall: bill without solar → minus solar used → minus export credit → what's left. */
function BillWaterfall({ scenario }: { scenario: ScenarioResult }) {
  const id = useId();
  const b = billImpact(scenario);
  const max = Math.max(b.before, 1);
  const pct = (n: number) => `${(Math.max(0, n) / max) * 100}%`;
  const net = Math.max(0, b.net);
  const credit = Math.min(b.exportCredit, b.afterSelfUse);
  const steps = [
    { label: 'Without solar', value: cad(b.before), left: 0, width: b.before, color: 'var(--chart-muted)' },
    { label: 'Solar you use', value: cad(-scenario.year1.selfUsedValue), left: b.afterSelfUse, width: scenario.year1.selfUsedValue, color: 'var(--sky-600)' },
    { label: 'Export credit', value: cad(-b.exportCredit), left: b.afterSelfUse - credit, width: credit, color: 'var(--chart-sun)' },
    { label: 'With solar', value: cad(net), left: 0, width: net, color: 'var(--good)', strong: true },
  ];

  return (
    <section aria-labelledby={id} className="grid content-start gap-3 print:break-inside-avoid">
      <div className="grid gap-1">
        <h2 id={id} className="text-headline">
          Your yearly power bill
        </h2>
        <p className="text-callout text-pretty text-ink-secondary">
          Year one, before GST, for the same usage. The bill drops by{' '}
          <span className="font-semibold text-good-ink">{Math.round(Math.min(1, b.cut) * 100)}%</span>.
          {b.net < 0 && ' Your export credits more than cover the rest.'}
        </p>
      </div>
      <ul className="grid gap-2">
        {steps.map((s) => (
          <li key={s.label} className="grid grid-cols-[104px_1fr_64px] items-center gap-3">
            <span className={s.strong ? 'text-callout font-semibold text-ink' : 'text-callout text-ink-secondary'}>{s.label}</span>
            <span aria-hidden="true" className="relative h-5">
              <span
                className="absolute inset-y-0 rounded-[4px]"
                style={{ left: pct(s.left), width: pct(s.width), background: s.color, minWidth: s.width > 0 ? 2 : 0 }}
              />
            </span>
            <span className={`text-right font-rounded tabular-nums ${s.strong ? 'text-headline' : 'text-callout'}`}>{s.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
