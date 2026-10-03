import type { ScenarioResult } from '@/src/types/app';
import { years } from '@/lib/format';

/**
 * The money answer: the year the selected size pays for itself, with the duration beside it
 * (the design leads with the year; people plan around years). Says so plainly when it never does.
 */
export function PaybackHero({
  scenario,
  startYear,
  lifetimeYears,
}: {
  scenario: Pick<ScenarioResult, 'paybackYears'>;
  /** The install year, i.e. this calendar year. */
  startYear: number;
  lifetimeYears: number;
}) {
  const payback = scenario.paybackYears;
  return (
    <section aria-labelledby="payback-heading" className="grid gap-1 rounded-[18px] bg-fill-quiet p-4">
      <h2 id="payback-heading" className="text-callout text-ink-secondary">
        {payback === null ? 'Payback' : 'Pays for itself in'}
      </h2>
      {payback === null ? (
        <>
          <p className="font-display text-title text-poor-ink">Not within {lifetimeYears} years</p>
          <p className="text-body text-ink-secondary">The panels wear out before they pay for themselves.</p>
        </>
      ) : (
        <p className="font-rounded text-metric-xl tabular-nums">
          {startYear + Math.round(payback)}
          <small className="ml-2 font-sans text-body font-medium tracking-normal text-ink-secondary">
            in {years(payback)} years
          </small>
        </p>
      )}
    </section>
  );
}
