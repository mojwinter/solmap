import type { BuildingResponse, FinanceInputs, ScenarioResult } from '@/src/types/app';
import { Icon } from '@/components/common/Icon';
import { StatList, type StatItem } from '@/components/common/StatList';
import { compass, imageryLabel, kw, kwh } from '@/lib/format';
import { INSTALL, REBATES } from '@/src/config/bc';

// Rule of thumb, not a BC number: inverters are commonly sized at about 1.2 kW of panels per kW AC.
const DC_TO_AC_RATIO = 1.2;

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const m2 = (n: number) => kwh(n); // whole square metres, same grouping as kWh

/**
 * The printable spec sheet (DESIGN.md §3): the selected system, the roof faces it uses, the whole
 * roof, imagery and next steps. Without a scenario (nothing fits) it shows only the roof facts.
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

      <SubHeading>Whole roof</SubHeading>
      <StatList
        items={[
          { icon: 'roof', label: 'Roof area', unit: 'm²', value: m2(roof.areaMeters2) },
          { icon: 'panels', label: 'Max panels', value: kwh(roof.maxPanels) },
        ]}
      />
      <p className="flex items-center gap-1.5 text-callout text-ink-secondary">
        <Icon name="layers" size={14} />
        Imagery: {imageryLabel(building.imagery.quality, building.imagery.date)}
      </p>

      {scenario && (
        <>
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
        </>
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
  const config = building.configs[scenario.configIndex];
  const arrayArea = scenario.panelsCount * panel.heightMeters * panel.widthMeters;
  const inYieldRange =
    scenario.specificYield >= INSTALL.sanityYieldMin && scenario.specificYield <= INSTALL.sanityYieldMax;
  const range = `${kwh(INSTALL.sanityYieldMin)}–${kwh(INSTALL.sanityYieldMax)}`;

  // Per-face output on the same AC basis as the total: the config's DC kWh, scaled like the scenario.
  const acPerDc = config && config.yearlyEnergyDcKwh > 0 ? scenario.acKwhYear1 / config.yearlyEnergyDcKwh : 0;
  const faces: StatItem[] = (config?.segments ?? [])
    .filter((s) => s.panelsCount > 0)
    .sort((a, b) => b.yearlyEnergyDcKwh - a.yearlyEnergyDcKwh)
    .map((s) => {
      const seg = building.segments[s.segmentIndex];
      return {
        icon: 'roof',
        label: seg ? `${capitalise(compass(seg.azimuthDegrees))}, ${Math.round(seg.pitchDegrees)}° pitch` : 'Roof face',
        unit: `${s.panelsCount} ${s.panelsCount === 1 ? 'panel' : 'panels'} · kWh a year`,
        value: kwh(s.yearlyEnergyDcKwh * acPerDc),
      };
    });

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

      {faces.length > 0 && (
        <>
          <SubHeading>Roof faces used</SubHeading>
          <StatList items={faces} />
        </>
      )}
    </>
  );
}

function SubHeading({ children }: { children: string }) {
  return <h3 className="pt-1 text-callout text-ink-secondary">{children}</h3>;
}
