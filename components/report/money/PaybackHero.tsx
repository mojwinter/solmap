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
    <section aria-labelledby="payback-heading" className="grid gap-1 rounded-[18px] bg-fill-quiet p-4">
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
        <p className="font-rounded text-metric-xl tabular-nums">
          {breakEvenYear(startYear, payback)}
          <small className="ml-2 font-sans text-body font-medium tracking-normal text-ink-secondary">
            in {years(payback)} years
          </small>
        </p>
      )}
      {headline && <p className="mt-1 text-body text-pretty text-ink-secondary">{headline}</p>}
    </section>
  );
}
