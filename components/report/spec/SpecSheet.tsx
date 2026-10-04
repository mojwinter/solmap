import type { BuildingResponse, FinanceInputs, ScenarioResult } from '@/src/types/app';
import { StatList } from '@/components/common/StatList';
import { kw, kwh } from '@/lib/format';
import { REBATES } from '@/src/config/bc';

const m2 = (n: number) => kwh(n); // whole square metres, same grouping as kWh

/**
 * The printable spec sheet (DESIGN.md §3): the selected system's size, panels, area and production,
 * and next steps on paper (the roof's faces are in RoofFaces beside it; imagery is badged under the
 * address). Without a scenario (nothing fits) it shows only the roof facts.
 */
export function SpecSheet({
  building,
  scenario,
  inputs,
}: {
  building: BuildingResponse;
  scenario: ScenarioResult | null;
  inputs: FinanceInputs;
}) {
  const { roof } = building;

  return (
    <section aria-labelledby="spec-heading" className="grid gap-3">
      <h2 id="spec-heading" className="text-headline">
        Spec sheet
      </h2>
      {scenario && <System building={building} scenario={scenario} inputs={inputs} />}

      {/* With a system, the roof's faces and size are in RoofFaces next to this. */}
      {!scenario && (
        <>
          <SubHeading>Whole roof</SubHeading>
          <StatList
            items={[
              { icon: 'roof', label: 'Roof area', unit: 'm²', value: m2(roof.areaMeters2) },
              { icon: 'panels', label: 'Max panels', value: kwh(roof.maxPanels) },
            ]}
          />
        </>
      )}

      {/* On screen the "Get real quotes" card says this; paper has no card, so it prints here. */}
      {scenario && (
        <div className="hidden gap-3 print:grid">
          <SubHeading>Next steps</SubHeading>
          <p className="rounded-md bg-fill-quiet p-3 text-body">
            Get 3 quotes from Home Performance Contractor Network members; apply for self-generation{' '}
            <strong>before</strong> buying equipment (
            <a
              href={REBATES.source}
              target="_blank"
              rel="noreferrer"
              className="text-sky-700 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              required for the rebate
            </a>
            ).
          </p>
        </div>
      )}
    </section>
  );
}

function System({
  building,
  scenario,
  inputs,
}: {
  building: BuildingResponse;
  scenario: ScenarioResult;
  inputs: FinanceInputs;
}) {
  const { panel } = building;
  const arrayArea = scenario.panelsCount * panel.heightMeters * panel.widthMeters;

  return (
    <>
      <StatList
        items={[
          { icon: 'bolt', label: 'System size', unit: 'kW DC', value: kw(scenario.systemKwDc) },
          { icon: 'panels', label: 'Panels', unit: `${inputs.panelWatts} W`, value: scenario.panelsCount },
          { icon: 'roof', label: 'Array area', unit: 'm²', value: m2(arrayArea) },
          { icon: 'sun', tone: 'sun', label: 'Production', unit: 'kWh a year', value: kwh(scenario.acKwhYear1) },
        ]}
      />
      {/* An out-of-range yield is flagged with the report's other warnings (SPECIFIC_YIELD_OUT_OF_RANGE). */}
    </>
  );
}

function SubHeading({ children }: { children: string }) {
  return <h3 className="pt-1 text-callout text-ink-secondary">{children}</h3>;
}
