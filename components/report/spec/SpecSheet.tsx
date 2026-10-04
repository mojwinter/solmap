import type { BuildingResponse, FinanceInputs, ScenarioResult } from '@/src/types/app';
import { Icon } from '@/components/common/Icon';
import { StatList } from '@/components/common/StatList';
import { imageryLabel, kw, kwh } from '@/lib/format';
import { INSTALL, REBATES } from '@/src/config/bc';

// Rule of thumb, not a BC number: inverters are commonly sized at about 1.2 kW of panels per kW AC.
const DC_TO_AC_RATIO = 1.2;

const m2 = (n: number) => kwh(n); // whole square metres, same grouping as kWh

/**
 * The printable spec sheet (DESIGN.md §3): the selected system, imagery and next steps (the roof's
 * faces are in RoofFaces beside it). Without a scenario (nothing fits) it shows only the roof facts.
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
      <p className="flex items-center gap-1.5 text-callout text-ink-secondary">
        <Icon name="layers" size={14} />
        Imagery: {imageryLabel(building.imagery.quality, building.imagery.date)}
      </p>

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
  const inYieldRange =
    scenario.specificYield >= INSTALL.sanityYieldMin && scenario.specificYield <= INSTALL.sanityYieldMax;
  const range = `${kwh(INSTALL.sanityYieldMin)}–${kwh(INSTALL.sanityYieldMax)}`;

  return (
    <>
      <StatList
        items={[
          { icon: 'bolt', label: 'System size', unit: 'kW DC', value: kw(scenario.systemKwDc) },
          { icon: 'panels', label: 'Panels', unit: `${inputs.panelWatts} W · ${panel.heightMeters.toFixed(2)} × ${panel.widthMeters.toFixed(2)} m`, value: scenario.panelsCount },
          { icon: 'roof', label: 'Array area', unit: 'm²', value: m2(arrayArea) },
          { icon: 'sun', tone: 'sun', label: 'Production', unit: 'kWh AC a year', value: kwh(scenario.acKwhYear1) },
          { icon: 'sun', label: 'Specific yield', unit: 'kWh per kW', value: kwh(scenario.specificYield) },
          { icon: 'bolt', label: 'Inverter', unit: `kW AC, rule of thumb (÷ ${DC_TO_AC_RATIO})`, value: kw(scenario.systemKwDc / DC_TO_AC_RATIO) },
        ]}
      />
      <p className="flex items-start gap-1.5 text-callout text-ink-secondary">
        <Icon name={inYieldRange ? 'check' : 'alert'} size={14} className="mt-0.5 flex-none" />
        {inYieldRange
          ? `${kwh(scenario.specificYield)} kWh per kW a year is inside BC’s usual ${range} range.`
          : `${kwh(scenario.specificYield)} kWh per kW a year is outside BC’s usual ${range} range. Have an installer check this roof.`}
      </p>

    </>
  );
}

function SubHeading({ children }: { children: string }) {
  return <h3 className="pt-1 text-callout text-ink-secondary">{children}</h3>;
}
