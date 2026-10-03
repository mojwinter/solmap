import type { FinanceInputs, ScenarioResult } from '@/src/types/app';
import { Icon } from '@/components/common/Icon';
import { Stat } from '@/components/common/Stat';
import { cad, cents, kwh, signedCad } from '@/lib/format';
import { WARNING_TEXT } from '../copy';

const pct = (multiplier: number) => `${Math.round((multiplier - 1) * 1000) / 10}%`;

/**
 * Install cost → − rebate → net cost → lifetime net, then the year-1 split between solar you use
 * and solar you sell, any engine warnings, and the assumptions behind the numbers (CLAUDE.md rule 6).
 */
export function MoneyBreakdown({ scenario, inputs }: { scenario: ScenarioResult; inputs: FinanceInputs }) {
  const { year1 } = scenario;
  const lifetime = scenario.years.length || inputs.lifetimeYears;
  const net = scenario.lifetimeNetSavings;
  const selfRate = year1.selfUsedKwh > 0 ? year1.selfUsedValue / year1.selfUsedKwh : 0;

  return (
    <section aria-labelledby="money-heading" className="grid gap-3">
      <h2 id="money-heading" className="sr-only">
        Costs and savings
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Install cost" value={cad(scenario.installCost)} />
        <Stat label="BC Hydro rebate" value={scenario.rebate > 0 ? cad(-scenario.rebate) : '$0'} />
        <Stat label="You pay" value={cad(scenario.netCost)} />
        <Stat label={`${lifetime}-year net`} value={signedCad(net)} tone={net >= 0 ? 'good' : 'poor'} />
      </div>

      <p className="text-body text-ink-secondary">
        In year 1 you use <span className="text-ink">{cad(year1.selfUsedValue)}</span> of your solar directly
        {selfRate > 0 && <> (worth about {cents(selfRate)}/kWh)</>} and sell{' '}
        <span className="text-ink">{cad(year1.exportValue)}</span> back at {cents(inputs.exportRate)}/kWh.
        That&rsquo;s {kwh(scenario.acKwhYear1)} kWh, or {Math.round(scenario.offsetPct * 100)}% of what you use.
      </p>

      {scenario.warnings.length > 0 && (
        <ul className="grid gap-2">
          {scenario.warnings.map((w) => (
            <li key={w} className="flex gap-2 rounded-md bg-fair-soft p-3 text-callout text-fair-ink">
              <Icon name="alert" size={16} className="mt-px flex-none" />
              {WARNING_TEXT[w]}
            </li>
          ))}
        </ul>
      )}

      <p className="text-footnote text-ink-tertiary">
        Estimate, not a quote. Assumes {cad(inputs.costPerWatt * 1000)} per kW installed,{' '}
        {kwh(inputs.annualConsumptionKwh)} kWh a year of household use, BC Hydro {inputs.ratePlan} rates rising{' '}
        {pct(inputs.costIncrease)} a year, {inputs.rebateEligible ? 'the BC Hydro solar rebate' : 'no rebate'} and a{' '}
        {inputs.lifetimeYears}-year panel life.
      </p>
    </section>
  );
}
