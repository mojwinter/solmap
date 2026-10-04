import type { ScenarioResult } from '@/src/types/app';
import { Icon } from '@/components/common/Icon';
import { GRID_EMISSIONS } from '@/src/config/bc';
import { Card } from '../Card';

const fmt = new Intl.NumberFormat('en-CA');
const oneDecimal = new Intl.NumberFormat('en-CA', { maximumFractionDigits: 1 });

/** "2.6 tonnes" / "109 kg". */
function mass(kg: number): { value: string; unit: string } {
  return kg >= 1000 ? { value: oneDecimal.format(kg / 1000), unit: 'tonnes' } : { value: fmt.format(Math.round(kg)), unit: 'kg' };
}

/**
 * CO₂ the grid power the panels replace would have emitted, a year and over their life. CLAUDE.md
 * rule 6 asks for a BC-grid caveat with these figures; one is coming in a follow-up.
 */
export function ImpactCard({ scenario }: { scenario: ScenarioResult }) {
  const perKwh = GRID_EMISSIONS.kgCo2ePerKwh;
  const lifetime = scenario.years.length;
  const lifetimeKg = scenario.years.reduce((sum, y) => sum + y.productionKwh, 0) * perKwh;
  const yearKg = scenario.acKwhYear1 * perKwh;
  const life = mass(lifetimeKg);
  const year = mass(yearKg);

  return (
    <Card>
      <section aria-labelledby="impact-heading" className="grid gap-3">
        <h2 id="impact-heading" className="flex items-center gap-2 text-headline">
          <span className="grid size-[30px] place-items-center rounded-sm bg-good-soft text-good-ink">
            <Icon name="leaf" size={18} />
          </span>
          Environmental impact
        </h2>
        {lifetime > 0 && (
          <dl className="grid grid-cols-2 gap-2">
            <div className="grid gap-0.5 rounded-md bg-fill-quiet p-3">
              <dt className="text-callout text-ink-secondary">CO₂ avoided a year</dt>
              <dd className="font-rounded text-metric tabular-nums">
                {year.value}
                <small className="ml-1 font-sans text-callout text-ink-secondary">{year.unit}</small>
              </dd>
            </div>
            <div className="grid gap-0.5 rounded-md bg-fill-quiet p-3">
              <dt className="text-callout text-ink-secondary">Over {lifetime} years</dt>
              <dd className="font-rounded text-metric tabular-nums">
                {life.value}
                <small className="ml-1 font-sans text-callout text-ink-secondary">{life.unit}</small>
              </dd>
            </div>
          </dl>
        )}
      </section>
    </Card>
  );
}
