import type { BuildingResponse } from '@/src/types/app';
import { BC_SOLAR_YIELD, GRID_EMISSIONS, REBATES, SELF_GENERATION, TARIFFS } from '@/src/config/bc';
import { Attribution } from './Attribution';

const LINK =
  'text-sky-700 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring';

/**
 * The report's last lines: the data attribution Google requires wherever Solar data is shown
 * (CLAUDE.md rule 3), that this is an estimate, and where every rate and figure comes from.
 */
const SOURCES = [
  { label: 'BC Hydro rates', href: TARIFFS.tiered.source },
  { label: `${SELF_GENERATION.schedule} export rate`, href: SELF_GENERATION.source },
  { label: 'Solar rebate', href: REBATES.source },
  { label: 'NRCan solar data', href: BC_SOLAR_YIELD.source },
  { label: 'Grid emissions', href: GRID_EMISSIONS.source },
];

export function ReportFooter({ source }: { source: BuildingResponse['source'] }) {
  return (
    <footer className="grid gap-1.5 border-t border-separator pt-4 text-footnote text-ink-tertiary">
      <Attribution source={source} />
      <p className="flex flex-wrap gap-x-3 gap-y-1">
        <span>Estimate, not a quote.</span>
        {SOURCES.map((x) => (
          <a key={x.label} href={x.href} target="_blank" rel="noreferrer" className={LINK}>
            {x.label}
          </a>
        ))}
      </p>
    </footer>
  );
}
