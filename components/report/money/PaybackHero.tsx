import type { ScenarioResult, Verdict } from '@/src/types/app';
import { breakEvenYear, years } from '@/lib/format';
import { VerdictBadge } from '../verdict/VerdictBadge';

/**
 * The money answer, first in the panel: the year the selected size pays for itself (the design leads
 * with the year; people plan around years), the verdict for that size, and C's one-line summary when
 * it applies. Says so plainly when the panels never pay for themselves.
 */
export function PaybackHero({
  scenario,
  verdict,
  headline,
  startYear,
  lifetimeYears,
}: {
  scenario: Pick<ScenarioResult, 'paybackYears'>;
  verdict: Verdict;
  /** Only passed when it describes the size on screen. */
  headline?: string;
  /** The install year, i.e. this calendar year. */
  startYear: number;
  lifetimeYears: number;
}) {
  const payback = scenario.paybackYears;
  return (
    <section aria-labelledby="payback-heading" className="grid gap-1">
      <div className="flex items-center justify-between gap-2">
        <h2 id="payback-heading" className="text-callout text-ink-secondary">
          {payback === null ? 'Payback' : 'Pays for itself in'}
        </h2>
        <VerdictBadge verdict={verdict} />
      </div>
      {payback === null ? (
        <>
          <p className="font-display text-title text-poor-ink">Not within {lifetimeYears} years</p>
          <p className="text-body text-ink-secondary">The panels wear out before they pay for themselves.</p>
        </>
      ) : (
        <>
          <p className="font-rounded text-metric-xl tabular-nums">
            {breakEvenYear(startYear, payback)}
            <small className="ml-2 font-sans text-body font-medium tracking-normal text-ink-secondary">
              in {years(payback)} years
            </small>
          </p>
          <LifeBar payback={payback} lifetimeYears={lifetimeYears} startYear={startYear} />
        </>
      )}
      {headline && <p className="mt-1 text-body text-pretty text-ink-secondary">{headline}</p>}
    </section>
  );
}

/**
 * The panels' life as one bar: paying them off (quiet), then ahead (green), split at the break-even
 * year, with the two lengths in words underneath so the colours are never the only cue.
 */
function LifeBar({ payback, lifetimeYears, startYear }: { payback: number; lifetimeYears: number; startYear: number }) {
  const share = Math.min(Math.max(payback / lifetimeYears, 0), 1);
  const ahead = Math.max(0, lifetimeYears - payback);
  return (
    <div className="mt-1 grid gap-1">
      <div aria-hidden="true" className="flex h-2 gap-0.5 overflow-hidden rounded-pill">
        <span className="h-full rounded-l-pill bg-chart-muted" style={{ width: `${share * 100}%` }} />
        {ahead > 0 && <span className="h-full flex-1 rounded-r-pill bg-good" />}
      </div>
      <div className="flex justify-between gap-2 text-footnote text-ink-secondary tabular-nums">
        <span>
          {startYear}: paying it off
        </span>
        <span>
          {ahead > 0 ? `${years(ahead)} years ahead, to ${startYear + lifetimeYears}` : `Panels last to ${startYear + lifetimeYears}`}
        </span>
      </div>
    </div>
  );
}
