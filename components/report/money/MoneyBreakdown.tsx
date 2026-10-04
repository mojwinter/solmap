import type { FinanceInputs, ScenarioResult } from '@/src/types/app';
import { Stat } from '@/components/common/Stat';
import { StatList } from '@/components/common/StatList';
import { cad, cents, kwh, signedCad } from '@/lib/format';

/** Install cost → − rebate → what you pay → lifetime net, then year 1: solar you use vs solar you sell. */
export function MoneyBreakdown({ scenario, inputs }: { scenario: ScenarioResult; inputs: FinanceInputs }) {
  const { year1 } = scenario;
  const lifetime = scenario.years.length || inputs.lifetimeYears;
  const net = scenario.lifetimeNetSavings;
  const selfRate = year1.selfUsedKwh > 0 ? year1.selfUsedValue / year1.selfUsedKwh : 0;

  return (
    <>
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
      </section>

      <section aria-labelledby="year1-heading" className="grid gap-2">
        <h2 id="year1-heading" className="text-headline">
          Your first year
        </h2>
        <StatList
          items={[
            {
              icon: 'roof',
              label: 'Used at home',
              unit: selfRate > 0 ? `worth ${cents(selfRate)}/kWh` : undefined,
              value: cad(year1.selfUsedValue),
              tone: 'good',
            },
            {
              icon: 'bolt',
              label: 'Sold back',
              unit: `at ${cents(inputs.exportRate)}/kWh`,
              value: cad(year1.exportValue),
            },
            { icon: 'sun', label: 'Energy made', unit: 'kWh', value: kwh(scenario.acKwhYear1), tone: 'sun' },
            { icon: 'panels', label: 'Share of your use', value: `${Math.round(scenario.offsetPct * 100)}%` },
          ]}
        />
      </section>
    </>
  );
}
