import { useId } from 'react';
import type { ScenarioResult } from '@/src/types/app';
import { cad } from '@/lib/format';
import { billImpact } from './derive';

/** Year one's power bill as a waterfall, from "without solar" to what's left to pay (before GST, same usage). */
export function FirstYear({ scenario }: { scenario: ScenarioResult }) {
  return (
    <BillWaterfall scenario={scenario} />
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
      <h2 id={id} className="text-headline">
        Your yearly power bill
      </h2>
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
