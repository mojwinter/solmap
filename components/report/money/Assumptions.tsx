import type { FinanceInputs, ScenarioWarning } from '@/src/types/app';
import { Icon } from '@/components/common/Icon';
import { cad, kwh } from '@/lib/format';
import { WARNING_TEXT } from '../copy';

const pct = (multiplier: number) => `${Math.round((multiplier - 1) * 1000) / 10}%`;

/** Engine warnings for the size on screen, then what the numbers assume (CLAUDE.md rule 6). */
export function Assumptions({ warnings, inputs }: { warnings: ScenarioWarning[]; inputs: FinanceInputs }) {
  return (
    <>
      {warnings.length > 0 && (
        <ul className="grid gap-2">
          {warnings.map((w) => (
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
    </>
  );
}
