import type { FinanceInputs, ScenarioResult } from '@/src/types/app';
import { Stat } from '@/components/common/Stat';
import { StatList } from '@/components/common/StatList';
import { cad, kwh, signedCad } from '@/lib/format';
import { GRID_EMISSIONS } from '@/src/config/bc';

/** The money for the size on screen, read left to right: before rebate − rebate = estimated install cost (ⓘ: the same sum), then the lifetime net. */
export function CostStats({ scenario, inputs }: { scenario: ScenarioResult; inputs: FinanceInputs }) {
  const lifetime = scenario.years.length || inputs.lifetimeYears;
  const net = scenario.lifetimeNetSavings;

  return (
    <section aria-labelledby="money-heading" className="grid gap-3">
      <h2 id="money-heading" className="font-display text-metric">
        Costs and savings
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Before rebate" value={cad(scenario.installCost)} />
        <Stat label="BC Hydro rebate" value={scenario.rebate > 0 ? cad(-scenario.rebate) : '$0'} />
        <Stat label="Estimated install cost" value={cad(scenario.netCost)} info={<CostMath scenario={scenario} />} />
        <Stat label={`${lifetime}-year net`} value={signedCad(net)} tone={net >= 0 ? 'good' : 'poor'} />
      </div>
    </section>
  );
}

/**
 * The answer card's two money tiles under the payback year: what the panels save in the first
 * year (bill savings + export credit) and what they're worth over their lifetime. Number first,
 * short label under it, so the money reads at a glance.
 */
export function MoneyTiles({ scenario }: { scenario: ScenarioResult }) {
  const net = scenario.lifetimeNetSavings;
  const lifetime = scenario.years.length;
  return (
    <dl className="grid grid-cols-2 gap-2">
      <div className="grid rounded-md bg-fill-quiet p-3">
        <dd className="font-rounded text-metric tabular-nums">{cad(scenario.year1.total)}</dd>
        <dt className="text-callout text-ink-secondary">saved a year</dt>
      </div>
      <div className="grid rounded-md bg-fill-quiet p-3">
        <dd className={`font-rounded text-metric tabular-nums ${net >= 0 ? "text-good-ink" : "text-poor-ink"}`}>{signedCad(net)}</dd>
        <dt className="text-callout text-ink-secondary">over {lifetime} years</dt>
      </div>
    </dl>
  );
}

/** A year's sun on the roof's sunniest spot, production, how much of average use it covers and the CO₂ it avoids. */
export function YearlyStats({ scenario, sunHours }: { scenario: ScenarioResult; sunHours: number }) {
  const co2Kg = scenario.acKwhYear1 * GRID_EMISSIONS.kgCo2ePerKwh;

  return (
    <section aria-labelledby="year1-heading" className="grid gap-2">
      <h3 id="year1-heading" className="text-headline">
        Yearly
      </h3>
      <StatList
        items={[
          { icon: 'sun', label: 'Sun hours', value: kwh(sunHours), tone: 'sun' },
          { icon: 'bolt', label: 'Energy generated', valueUnit: 'kWh', value: kwh(scenario.acKwhYear1), tone: 'sky' },
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
