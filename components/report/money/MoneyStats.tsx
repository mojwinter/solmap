import type { ScenarioResult } from '@/src/types/app';
import { InfoPopover } from '@/components/common/InfoPopover';
import { StatList } from '@/components/common/StatList';
import { cad, kwh, signedCad } from '@/lib/format';
import { GRID_EMISSIONS } from '@/src/config/bc';

/**
 * The answer card's two money tiles under the payback year: what you pay after the BC Hydro rebate
 * (ⓘ: the sum) and what the panels are worth over their lifetime. Number first, short label under
 * it, so the money reads at a glance.
 */
export function MoneyTiles({ scenario }: { scenario: ScenarioResult }) {
  const net = scenario.lifetimeNetSavings;
  const lifetime = scenario.years.length;
  return (
    <dl className="grid grid-cols-2 gap-2">
      <div className="grid rounded-md bg-fill-quiet p-3">
        <dd className="font-rounded text-metric tabular-nums">{cad(scenario.netCost)}</dd>
        <dt className="whitespace-nowrap text-callout text-ink-secondary">
          install cost
          <span className="ml-1 inline-block align-middle">
            <InfoPopover label="How the install cost is worked out">
              <CostMath scenario={scenario} />
            </InfoPopover>
          </span>
        </dt>
      </div>
      <div className="grid rounded-md bg-fill-quiet p-3">
        <dd className={`font-rounded text-metric tabular-nums ${net >= 0 ? "text-good-ink" : "text-poor-ink"}`}>{signedCad(net)}</dd>
        <dt className="text-callout text-ink-secondary">over {lifetime} years</dt>
      </div>
    </dl>
  );
}

/**
 * A year's sun on the roof's sunniest spot, production, what it saves (bill savings + export credit),
 * how much of average use it covers and the CO₂ it avoids.
 */
export function YearlyStats({ scenario, sunHours }: { scenario: ScenarioResult; sunHours: number }) {
  const co2Kg = scenario.acKwhYear1 * GRID_EMISSIONS.kgCo2ePerKwh;

  return (
    <section aria-labelledby="year1-heading" className="grid gap-2">
      <h2 id="year1-heading" className="text-headline">
        Yearly
      </h2>
      <StatList
        items={[
          { icon: 'sun', label: 'Sun hours', value: kwh(sunHours), tone: 'sun' },
          { icon: 'bolt', label: 'Energy generated', valueUnit: 'kWh', value: kwh(scenario.acKwhYear1), tone: 'sky' },
          { icon: 'dollar', label: 'Money saved', value: cad(scenario.year1.total), tone: 'good' },
          { icon: 'panels', label: 'Share of average use', value: `${Math.round(scenario.offsetPct * 100)}%` },
          { icon: 'leaf', label: 'CO₂ emissions saved', valueUnit: 'kg', value: Math.round(co2Kg).toLocaleString('en-CA'), tone: 'good' },
        ]}
      />
    </section>
  );
}

function CostMath({ scenario }: { scenario: ScenarioResult }) {
  return (
    <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 tabular-nums">
      <dt>Install cost</dt>
      <dd className="text-right">{cad(scenario.installCost)}</dd>
      <dt>BC Hydro rebate</dt>
      <dd className="text-right">{scenario.rebate > 0 ? cad(-scenario.rebate) : '$0'}</dd>
      <dt className="border-t border-separator pt-0.5 font-semibold">You pay</dt>
      <dd className="border-t border-separator pt-0.5 text-right font-semibold">{cad(scenario.netCost)}</dd>
    </dl>
  );
}
