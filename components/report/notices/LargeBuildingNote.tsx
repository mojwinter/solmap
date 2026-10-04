import { TUNING } from '@/src/config/bc';
import { Notice } from './Notice';

/** The roof holds more than a house's worth of panels (DESIGN.md §3 → States: multi-unit / huge roof). */
export function LargeBuildingNote({ maxPanels }: { maxPanels: number }) {
  if (maxPanels <= TUNING.largeBuildingPanels) return null;
  return (
    <Notice icon="roof">
      This looks like a large or multi-unit building; results assume one BC Hydro account.
    </Notice>
  );
}
