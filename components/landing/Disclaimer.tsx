import { cents } from '@/lib/format';
import { SELF_GENERATION } from '@/src/config/bc';

// "2026-07-01" → "July 1, 2026". UTC so the time zone can't move the day.
const effective = new Intl.DateTimeFormat('en-CA', { dateStyle: 'long', timeZone: 'UTC' }).format(
  new Date(`${SELF_GENERATION.effective}T00:00:00Z`),
);

/** Landing small print: where the roof data comes from, what the numbers are and aren't, which rules apply. */
export function Disclaimer() {
  return (
    <p className="mx-auto max-w-[520px] text-center text-footnote text-ink-tertiary">
      Uses Google aerial imagery of your roof. Estimates only, not a quote. Based on BC Hydro&rsquo;s rules from{' '}
      {effective}: solar power you send back to the grid earns {cents(SELF_GENERATION.exportRatePerKwh)}/kWh.
    </p>
  );
}
