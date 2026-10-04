'use client';

import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { MapsProvider } from '@/components/map/MapsProvider';
import { AssumptionsPanel } from '@/components/inputs/AssumptionsPanel';
import { YourHome } from '@/components/inputs/YourHome';
import { verdictFor } from '@/lib/finance';
import { clampInputs } from '@/lib/finance/clamp';
import { rebateCapKw } from '@/lib/finance/project';
import { FLAGS, type Flags } from '@/lib/flags';
import type { BuildingResponse } from '@/src/types/app';
import { KeyFigures } from './analysis/KeyFigures';
import { FirstYear } from './analysis/FirstYear';
import { MonthlyChart } from './analysis/MonthlyChart';
import { PanelOutputChart } from './analysis/PanelOutputChart';
import { RoofFaces } from './analysis/RoofFaces';
import { Sensitivity } from './analysis/Sensitivity';
import { SizeSweepChart } from './analysis/SizeSweepChart';
import { Card } from './Card';
import { HeaderSearch } from './HeaderSearch';
import { HouseWindow } from './HouseWindow';
import { Assumptions } from './money/Assumptions';
import { CashFlowChart } from './money/CashFlowChart';
import { MoneyTiles } from './money/MoneyStats';
import { ImpactCard } from './impact/ImpactCard';
import { NextStep } from './NextStep';
import { SolarPotential } from './potential/SolarPotential';
import { PaybackHero } from './money/PaybackHero';
import { LargeBuildingNote } from './notices/LargeBuildingNote';
import { OutsideBcBanner } from './notices/OutsideBcBanner';
import { ReportFooter } from './ReportFooter';
import { ReportLayout } from './ReportLayout';
import { ReportTitle } from './ReportTitle';
import { SizeSlider } from './size/SizeSlider';
import { SpecSheet } from './spec/SpecSheet';
import { ApiErrorState } from './states/ApiErrorState';
import { NoCoverage } from './states/NoCoverage';
import { ReportSkeleton } from './states/ReportSkeleton';
import { useAddress } from './useAddress';
import { useBuilding, type BuildingState } from './useBuilding';
import { configIndexFor, reportSearch, type ReportQuery } from './urlState';
import { useReportState } from './useReportState';
import { ReasonChips } from './verdict/ReasonChips';
import { VerdictCard } from './verdict/VerdictCard';

/** The spot being reported on: from the URL or an address pick. */
interface Place {
  lat: number;
  lng: number;
  address?: string;
}

/** 6 decimals ≈ 0.1 m: plenty for a roof, and it keeps the URL short. */
const round = (n: number) => Math.round(n * 1e6) / 1e6;

function reportPath({ lat, lng, address }: Place, state: Omit<ReportQuery, 'address'> = {}) {
  return `/report/${lat}/${lng}${reportSearch({ address, ...state })}`;
}

/**
 * The report's only container: place → fetch → finance → props. Everything it renders is
 * presentational. The house window is a locked map (no panning, zooming or clicking: you came for
 * your own roof) that lives through every state (loading, no coverage, error, ready), so a new
 * lookup doesn't reload it; a search in the top bar swaps the place in state and rewrites the URL
 * without a navigation, so the report stays shareable. The size on screen, annual kWh and rate plan
 * ride along as `?panels=&kwh=&plan=` (only when they differ from the defaults).
 * `flags` comes from the page (server-read SOLMAP_FLAGS): render each P1 feature only behind its flag,
 * e.g. `{flags.battery && <BatteryToggle … />}`, and add new names to lib/flags.ts first.
 */
export function ReportView({ lat, lng, address, query = {}, flags }: Place & { query?: ReportQuery; flags: Flags }) {
  const [place, setPlace] = useState<Place>({ lat, lng, address });

  // A real navigation (e.g. a demo link in NoCoverage) brings new props: follow them.
  const [fromUrl, setFromUrl] = useState<Place>({ lat, lng, address });
  if (fromUrl.lat !== lat || fromUrl.lng !== lng || fromUrl.address !== address) {
    setFromUrl({ lat, lng, address });
    setPlace({ lat, lng, address });
  }

  const building = useBuilding(place.lat, place.lng);
  const roof = building.status === 'ready' ? building.data : null;
  const report = useReportState(roof, query);

  // One writer for the URL: place + the report's shareable state, replaced in place (no history entries).
  const href = reportPath(place, { panels: report.panelsInUrl, kwh: report.inputs.annualConsumptionKwh, plan: report.inputs.ratePlan });
  useEffect(() => {
    if (window.location.pathname + window.location.search !== href) window.history.replaceState(null, '', href);
  }, [href]);

  const lookUp = (next: Place) => setPlace({ lat: round(next.lat), lng: round(next.lng), address: next.address });

  return (
    <MapsProvider>
      <ReportPage place={place} building={building} report={report} flags={flags} lookUp={lookUp} />
    </MapsProvider>
  );
}

/** Everything on screen. Inside <MapsProvider>, so the address lookup can load the Places library. */
function ReportPage({
  place,
  building,
  report,
  flags,
  lookUp,
}: {
  place: Place;
  building: BuildingState & { retry: () => void };
  report: ReturnType<typeof useReportState>;
  flags: Flags;
  lookUp: (next: Place) => void;
}) {
  const roof = building.status === 'ready' ? building.data : null;
  const resolved = useAddress(place.lat, place.lng, place.address, roof?.buildingId);
  const address = resolved ?? `${place.lat}, ${place.lng}`;
  const { selected } = report;

  const house = (
    <HouseWindow
      location={{ lat: place.lat, lng: place.lng }}
      building={roof}
      visibleCount={selected?.panelsCount ?? 0}
      heatmap={flags.heatmap}
      onPick={lookUp}
      panel={<ExplorePanel building={building} report={report} address={address} />}
    />
  );

  const title = (
    <ReportTitle address={address} imagery={roof?.imagery} loading={building.status === 'loading'} print={flags.print} />
  );

  const cards = ((): Cards => {
    switch (building.status) {
      case 'loading':
        return {
          summary: (
            <Card>
              <ReportSkeleton />
            </Card>
          ),
          controls: (
            <Card>
              <ReportSkeleton variant="slider" />
            </Card>
          ),
          analysis: <ReportSkeleton variant="figures" />,
        };
      case 'no_coverage':
      case 'outside_bc':
        return {
          summary: (
            <Card>
              <NoCoverage reason={building.status} />
            </Card>
          ),
        };
      case 'error':
        return {
          summary: (
            <Card>
              <ApiErrorState message={building.message} onRetry={building.retry} />
            </Card>
          ),
        };
      case 'ready':
        return reportCards(building.data, report, flags);
    }
  })();

  return (
    <ReportLayout
        flags={FLAGS.filter((f) => flags[f]).join(' ')}
        search={<HeaderSearch onSelect={(p) => lookUp({ lat: p.lat, lng: p.lng, address: p.address || undefined })} />}
        title={title}
        notices={
          roof && (
            <>
              <OutsideBcBanner administrativeArea={roof.administrativeArea} />
              <LargeBuildingNote maxPanels={roof.roof.maxPanels} />
            </>
          )
        }
        house={house}
        {...cards}
        footer={roof && <ReportFooter source={roof.source} />}
      />
  );
}

type Cards = Pick<ComponentProps<typeof ReportLayout>, 'summary' | 'controls' | 'analysis' | 'extras' | 'details'>;

/**
 * The cards round the house once there's a roof: the answer top right with the size slider under it,
 * the yearly figures and savings chart under the house, then CO₂ and the next step.
 */
function reportCards(
  building: BuildingResponse,
  { inputs, setInputs, recommendation, selectedIndex, selected, setSelectedIndex }: ReturnType<typeof useReportState>,
  flags: Flags,
): Cards {
  // No configs: nothing fits, so there's no money to show.
  if (!recommendation || !selected || selectedIndex === null) {
    return {
      summary: recommendation && (
        <Card>
          <VerdictCard recommendation={recommendation} />
        </Card>
      ),
      analysis: (
        <div className="grid gap-5 md:grid-cols-2 md:gap-6">
          <Card>
            <RoofFaces building={building} scenario={null} />
          </Card>
          <Card>
            <SpecSheet building={building} scenario={selected} inputs={inputs} />
          </Card>
        </div>
      ),
    };
  }
  const steps = recommendation.scenarios.map((s) => ({ panels: s.panelsCount, acKwhYear1: s.acKwhYear1, value: s.npv }));
  // Install year for PaybackHero and the chart, read once so they agree. The roof is fetched after
  // mount, so this only ever runs in the browser (the user's clock), never in server HTML.
  const startYear = new Date().getFullYear();
  // The usage the engine actually ran (clamped to INPUT_RANGES), so charts drawn from inputs agree with the scenario.
  const modelled = clampInputs(inputs).inputs;
  const firstYear = (
    <Card>
      <FirstYear scenario={selected} />
    </Card>
  );
  const specSheet = (
    <Card>
      <SpecSheet building={building} scenario={selected} inputs={inputs} />
    </Card>
  );

  return {
    summary: (
      <SolarPotential>
        {/* The badge follows the size on screen. */}
        <PaybackHero
          scenario={selected}
          verdict={verdictFor(selected)}
          startYear={startYear}
          lifetimeYears={inputs.lifetimeYears}
        />
        <MoneyTiles scenario={selected} />
        <ReasonChips reasons={recommendation.reasons} />
      </SolarPotential>
    ),
    controls: (
      <div className="grid gap-5 md:gap-6">
        <Card>
          <SizeSlider steps={steps} value={selectedIndex} recommendedIndex={recommendation.recommendedIndex} onChange={setSelectedIndex} />
        </Card>
        <Card className="print:hidden">
          <YourHome inputs={inputs} onChange={setInputs} />
        </Card>
      </div>
    ),
    analysis: (
      <div className="grid gap-5 md:gap-6">
        <KeyFigures
          scenario={selected}
          baseline={recommendation.recommendedIndex === null ? null : recommendation.scenarios[recommendation.recommendedIndex]}
        />
        <Assumptions warnings={selected.warnings} />
        {/* Under the house: the savings chart, or without charts, the first year (so the column isn't short). */}
        {flags.charts ? (
          <Card>
            <CashFlowChart scenario={selected} startYear={startYear} />
          </Card>
        ) : (
          firstYear
        )}
      </div>
    ),
    extras: (
      <>
        <ImpactCard scenario={selected} />
        <NextStep />
      </>
    ),
    details: (
      <AnalysisGrid columns={flags.charts ? 3 : 2}>
        {flags.charts && (
          <Card className="lg:col-span-2">
            <SizeSweepChart
              scenarios={recommendation.scenarios}
              selectedIndex={selectedIndex}
              recommendedIndex={recommendation.recommendedIndex}
              lifetimeYears={inputs.lifetimeYears}
              discountRate={inputs.discountRate}
              onSelect={setSelectedIndex}
            />
          </Card>
        )}
        {flags.charts && firstYear}
        {flags.charts && (
          <Card className="lg:col-span-2">
            <Sensitivity building={building} scenario={selected} inputs={inputs} />
          </Card>
        )}
        {flags.charts && specSheet}
        {flags.charts && (
          <Card className="lg:col-span-2">
            <MonthlyChart
              building={building}
              scenario={selected}
              annualUseKwh={modelled.annualConsumptionKwh}
              selfUseCapKwh={modelled.daytimeLoadShare * modelled.annualConsumptionKwh}
            />
          </Card>
        )}
        <Card>
          <RoofFaces building={building} scenario={selected} />
        </Card>
        {!flags.charts && specSheet}
        {flags.charts && (
          <Card className="lg:col-span-full">
            <PanelOutputChart
              building={building}
              scenario={selected}
              scenarios={recommendation.scenarios}
              rebateCapKw={modelled.rebateEligible ? rebateCapKw(modelled.costPerWatt) : undefined}
              onPickPanels={(n) => setSelectedIndex(configIndexFor(building.configs, n))}
            />
          </Card>
        )}
        {flags.assumptions && (
          <Card className="lg:col-span-full print:hidden">
            <AssumptionsPanel inputs={inputs} onChange={setInputs} />
          </Card>
        )}
      </AnalysisGrid>
    ),
  };
}

/** The dashboard under the house: two or three columns on wide screens (charts span two), one on phones. */
function AnalysisGrid({ columns, children }: { columns: 2 | 3; children: ReactNode }) {
  return (
    <section
      aria-label="Analysis"
      className={`grid grid-cols-[minmax(0,1fr)] items-start gap-5 md:gap-6 ${columns === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} print:block`}
    >
      {children}
    </section>
  );
}

/**
 * The explore map's floating panel: the address and the answer for whichever roof is picked, with the
 * size slider, so clicking round the neighbourhood updates the numbers in place.
 */
function ExplorePanel({
  building,
  report,
  address,
}: {
  building: BuildingState & { retry: () => void };
  report: ReturnType<typeof useReportState>;
  address: string;
}) {
  const { inputs, recommendation, selectedIndex, selected, setSelectedIndex } = report;
  const body = (() => {
    switch (building.status) {
      case 'loading':
        return <ReportSkeleton />;
      case 'no_coverage':
      case 'outside_bc':
        return <NoCoverage reason={building.status} />;
      case 'error':
        return <ApiErrorState message={building.message} onRetry={building.retry} />;
      case 'ready':
        if (!recommendation) return null;
        if (!selected || selectedIndex === null) return <VerdictCard recommendation={recommendation} />;
        return (
          <>
            <SolarPotential plain>
              <PaybackHero
                scenario={selected}
                verdict={verdictFor(selected)}
                startYear={new Date().getFullYear()}
                lifetimeYears={inputs.lifetimeYears}
              />
              <MoneyTiles scenario={selected} />
            </SolarPotential>
            <SizeSlider
              steps={recommendation.scenarios.map((s) => ({ panels: s.panelsCount, acKwhYear1: s.acKwhYear1, value: s.npv }))}
              value={selectedIndex}
              recommendedIndex={recommendation.recommendedIndex}
              onChange={setSelectedIndex}
            />
          </>
        );
    }
  })();
  return (
    <div className="grid gap-5">
      <p className="font-display text-title text-balance">{address}</p>
      {body}
    </div>
  );
}
