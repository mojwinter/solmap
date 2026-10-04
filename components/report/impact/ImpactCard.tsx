import type { ScenarioResult } from '@/src/types/app';
import { Icon } from '@/components/common/Icon';
import { GRID_EMISSIONS } from '@/src/config/bc';
import { Card } from '../Card';

const fmt = new Intl.NumberFormat('en-CA');

/** CO₂ the panels avoid over their life (a year's is in the yearly stats). */
export function ImpactCard({ scenario }: { scenario: ScenarioResult }) {
  const perKwh = GRID_EMISSIONS.kgCo2ePerKwh;
  const lifetimeKg = scenario.years.reduce((sum, y) => sum + y.productionKwh, 0) * perKwh;
  const lifetime = scenario.years.length;

  return (
    <Card>
      <section aria-labelledby="impact-heading" className="grid gap-3">
        <h2 id="impact-heading" className="flex items-center gap-2 font-display text-metric">
          <span className="grid size-[30px] place-items-center rounded-sm bg-good-soft text-good-ink">
            <Icon name="leaf" size={18} />
          </span>
          Environmental impact
        </h2>
        {lifetime > 0 && (
          <dl className="grid gap-0.5 rounded-md bg-fill-quiet p-3">
            <dt className="text-callout text-ink-secondary">CO₂ emissions saved over {lifetime} years</dt>
            <dd className="font-rounded text-metric tabular-nums">
              {lifetimeKg >= 1000 ? (lifetimeKg / 1000).toFixed(1) : fmt.format(Math.round(lifetimeKg))}
              <small className="ml-1 font-sans text-callout text-ink-secondary">{lifetimeKg >= 1000 ? 'tonnes' : 'kg'}</small>
            </dd>
          </dl>
        )}
      </section>
    </Card>
  );
}
