import type { ScenarioResult } from '@/src/types/app';
import { InfoPopover } from '@/components/common/InfoPopover';
import { cad, signedCad } from '@/lib/format';

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
