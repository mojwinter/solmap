import type { BuildingResponse } from '@/src/types/app';
import { BC_SOLAR_YIELD, GRID_EMISSIONS, REBATES, SELF_GENERATION, TARIFFS } from '@/src/config/bc';
import { Attribution } from './Attribution';

const LINK =
  'text-sky-700 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring';

/**
 * The report's last lines: the data attribution Google requires wherever Solar data is shown
 * (CLAUDE.md rule 3), that this is an estimate, and where every rate and figure comes from.
 */
export function ReportFooter({ source }: { source: BuildingResponse['source'] }) {
  return (
    <footer className="grid gap-1.5 border-t border-separator pt-4 text-footnote text-ink-tertiary">
      <Attribution source={source} />
      <p>
        An estimate, not a quote. Rates:{' '}
        <a href={TARIFFS.tiered.source} target="_blank" rel="noreferrer" className={LINK}>
          BC Hydro residential rates
        </a>
        ,{' '}
        <a href={SELF_GENERATION.source} target="_blank" rel="noreferrer" className={LINK}>
          {SELF_GENERATION.schedule} export rate
        </a>{' '}
        and the{' '}
        <a href={REBATES.source} target="_blank" rel="noreferrer" className={LINK}>
          solar rebate
        </a>
        . Monthly shape:{' '}
        <a href={BC_SOLAR_YIELD.source} target="_blank" rel="noreferrer" className={LINK}>
          NRCan photovoltaic potential
        </a>
        . Grid emissions:{' '}
        <a href={GRID_EMISSIONS.source} target="_blank" rel="noreferrer" className={LINK}>
          BC {GRID_EMISSIONS.year} electricity emission factor
        </a>
        .
      </p>
    </footer>
  );
}
