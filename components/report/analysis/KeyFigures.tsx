import type { ReactNode } from 'react';
import type { ScenarioResult } from '@/src/types/app';
import { InfoPopover } from '@/components/common/InfoPopover';
import { cad, cents, MINUS } from '@/lib/format';
import { cn } from '@/lib/utils';
import { billImpact, lifetimeFigures } from './derive';

/**
 * Four headline figures for the size on screen, each with a small visual so it reads at a glance:
 * what year one saves, how much of the bill it covers, what your own solar costs per kWh next to
 * what it replaces, and what comes back for every dollar paid. The ⓘ on each says how it's worked out.
 * With a `baseline` (the recommended size, when another is on screen) each tile also says how it
 * differs from that, in green when it's better for you and red when it's worse.
 */
export function KeyFigures({ scenario, baseline }: { scenario: ScenarioResult; baseline?: ScenarioResult | null }) {
  const bill = billImpact(scenario);
  const life = lifetimeFigures(scenario);
  const base = baseline && baseline !== scenario ? { s: baseline, bill: billImpact(baseline), life: lifetimeFigures(baseline) } : null;
  const vs = base ? `vs ${base.s.panelsCount} panels` : '';
  const lifetime = scenario.years.length;
  const cut = Math.max(0, bill.cut);
  const solarCents = life.costPerKwh;
  const gridCents = bill.avoidedRatePerKwh;

  return (
    // Four across when its column is wide enough (container query), else two by two.
    <div className="@container">
      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
        <Figure
          label="Saved in year one"
          value={cad(scenario.year1.total)}
          delta={base && change(scenario.year1.total - base.s.year1.total, (d) => `${sign(d)}${cad(Math.abs(d))}`, 1, vs)}
          note={`${cad(scenario.year1.selfUsedValue)} used · ${cad(scenario.year1.exportValue)} sold`}
          info={
            <Rows
              rows={[
                ['Solar you use yourself', cad(scenario.year1.selfUsedValue)],
                ['Solar you sell back', cad(scenario.year1.exportValue)],
              ]}
              total={['First-year savings', cad(scenario.year1.total)]}
            />
          }
        >
          <Meter parts={[{ value: scenario.year1.selfUsedValue, color: 'var(--sky-600)' }, { value: scenario.year1.exportValue, color: 'var(--chart-sun)' }]} max={scenario.year1.total} />
        </Figure>
  
        <Figure
          label="Off your power bill"
          value={`${Math.round(cut * 100)}%`}
          delta={base && change(Math.round(cut * 100) - Math.round(Math.max(0, base.bill.cut) * 100), (d) => `${sign(d)}${Math.abs(d)} pts`, 1, vs)}
          note={`${cad(bill.before)} → ${cad(Math.max(0, bill.net))} a year`}
          info={
            <Rows
              rows={[
                ['Bill without solar', cad(bill.before)],
                ['Less solar you use', cad(-scenario.year1.selfUsedValue)],
                ['Less export credit', cad(-bill.exportCredit)],
              ]}
              total={['What you’d still pay', cad(bill.net)]}
              foot="Year one, before GST. Assumes your usage stays the same."
            />
          }
        >
          <Meter parts={[{ value: Math.min(cut, 1), color: 'var(--good)' }]} max={1} />
        </Figure>
  
        <Figure
          label="Your solar costs"
          value={solarCents === null ? '—' : cents(solarCents)}
          delta={
            base &&
            solarCents !== null &&
            base.life.costPerKwh !== null &&
            change(Math.round((solarCents - base.life.costPerKwh) * 1000) / 10, (d) => `${sign(d)}${Math.abs(d).toFixed(1)}¢`, -1, vs)
          }
          unit="per kWh"
          note={gridCents === null ? 'Over the panels’ life' : `vs ${cents(gridCents)} from BC Hydro`}
          info={
            <Rows
              rows={[
                ['You pay', cad(scenario.netCost)],
                [`Energy over ${lifetime} years`, `${Math.round(life.energyKwh).toLocaleString('en-CA')} kWh`],
              ]}
              total={['Cost per kWh', solarCents === null ? '—' : cents(solarCents)]}
              foot="What you pay after the rebate, spread over everything the panels make. Compare it with the rate the solar you use replaces."
            />
          }
        >
          {solarCents !== null && gridCents !== null && <CompareBars a={solarCents} b={gridCents} />}
        </Figure>
  
        <Figure
          label="Back for every $1"
          value={life.returnPerDollar === null ? '—' : `$${life.returnPerDollar.toFixed(2)}`}
          delta={
            base &&
            life.returnPerDollar !== null &&
            base.life.returnPerDollar !== null &&
            change(
              Math.round((life.returnPerDollar - base.life.returnPerDollar) * 100) / 100,
              (d) => `${sign(d)}$${Math.abs(d).toFixed(2)}`,
              1,
              vs,
            )
          }
          tone={life.returnPerDollar === null ? undefined : life.returnPerDollar >= 1 ? 'good' : 'poor'}
          note={`Over ${lifetime} years`}
          info={
            <Rows
              rows={[
                [`Savings over ${lifetime} years`, cad(life.grossSavings)],
                ['You pay', cad(scenario.netCost)],
              ]}
              total={['Back per $1 paid', life.returnPerDollar === null ? '—' : `$${life.returnPerDollar.toFixed(2)}`]}
              foot="Under $1.00 means the panels don’t earn back what they cost."
            />
          }
        >
          {life.returnPerDollar !== null && <Meter parts={[{ value: Math.min(life.returnPerDollar, 4), color: life.returnPerDollar >= 1 ? 'var(--good)' : 'var(--poor)' }]} max={4} mark={1} />}
        </Figure>
      </section>
    </div>
  );
}

function Figure({
  label,
  value,
  unit,
  note,
  tone,
  delta,
  info,
  children,
}: {
  label: string;
  value: string;
  unit?: string;
  note: string;
  tone?: 'good' | 'poor';
  /** How this differs from the recommended size, when another is on screen. */
  delta?: Delta | null | false;
  info: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="card grid content-start gap-1 rounded-lg p-4">
      <span className="flex items-center gap-1 text-callout text-ink-secondary">
        {label}
        <InfoPopover label={`How “${label.toLowerCase()}” is worked out`}>{info}</InfoPopover>
      </span>
      <span className={cn('font-rounded text-metric', tone === 'good' && 'text-good-ink', tone === 'poor' && 'text-poor-ink')}>
        {value}
        {unit && <small className="ml-1 font-sans text-callout text-ink-secondary">{unit}</small>}
      </span>
      {delta && (
        <span
          className={cn(
            'text-footnote font-semibold tabular-nums',
            delta.better === null ? 'text-ink-tertiary' : delta.better ? 'text-good-ink' : 'text-poor-ink',
          )}
        >
          {delta.text}
        </span>
      )}
      <div className="mt-1 mb-1">{children}</div>
      <span className="text-footnote text-ink-tertiary">{note}</span>
      <div className="hidden text-footnote text-ink-secondary print:block">{info}</div>
    </div>
  );
}

/** A thin pill meter: coloured parts on a quiet track, with an optional tick (e.g. $1 = break-even). */
function Meter({ parts, max, mark }: { parts: { value: number; color: string }[]; max: number; mark?: number }) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  return (
    <div aria-hidden="true" className="relative flex h-1.5 gap-0.5 overflow-hidden rounded-pill bg-fill-quiet">
      {parts.map((p, i) => (
        <span key={i} className="h-full first:rounded-l-pill last:rounded-r-pill" style={{ width: pct(p.value), background: p.color }} />
      ))}
      {mark !== undefined && <span className="absolute inset-y-0 w-0.5 bg-surface" style={{ left: pct(mark) }} />}
    </div>
  );
}

/** Two short bars on one scale: your solar's cost per kWh (sky) against the grid rate it replaces (quiet). */
function CompareBars({ a, b }: { a: number; b: number }) {
  const max = Math.max(a, b);
  return (
    <div aria-hidden="true" className="grid gap-0.5">
      <span className="h-1.5 rounded-pill bg-sky-600" style={{ width: `${(a / max) * 100}%` }} />
      <span className="h-1.5 rounded-pill bg-chart-muted" style={{ width: `${(b / max) * 100}%` }} />
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

interface Delta {
  text: string;
  /** null: no change. */
  better: boolean | null;
}

/** "+" or a true minus, by the sign of a (rounded) difference. */
const sign = (d: number) => (d > 0 ? '+' : d < 0 ? MINUS : '±');

/**
 * A tile's difference from the baseline: `d` already rounded to what the tile shows, `goodWhen` 1 when
 * more is better for you (savings), −1 when less is (cost per kWh).
 */
function change(d: number, format: (d: number) => string, goodWhen: 1 | -1, vs: string): Delta {
  if (d === 0) return { text: `Same as ${vs.replace(/^vs /, '')}`, better: null };
  return { text: `${format(d)} ${vs}`, better: Math.sign(d) === goodWhen };
}
