'use client';

import { useEffect, useState, type ComponentProps } from 'react';
import { MapsProvider } from '@/components/map/MapsProvider';
import { verdictFor } from '@/lib/finance';
import { FLAGS, type Flags } from '@/lib/flags';
import type { BuildingResponse } from '@/src/types/app';
import { Attribution } from './Attribution';
import { Card } from './Card';
import { HouseWindow } from './HouseWindow';
import { Assumptions } from './money/Assumptions';
import { CashFlowChart } from './money/CashFlowChart';
import { CostStats, YearlyStats } from './money/MoneyStats';
import { ImpactCard } from './impact/ImpactCard';
import { NextStep } from './NextStep';
import { SolarPotential } from './potential/SolarPotential';
import { SearchDot } from './SearchDot';
import { PaybackHero } from './money/PaybackHero';
import { LargeBuildingNote } from './notices/LargeBuildingNote';
import { OutsideBcBanner } from './notices/OutsideBcBanner';
import { PrintButton, PrintHeader } from './PrintBar';
import { ReportLayout } from './ReportLayout';
import { SizeSlider } from './size/SizeSlider';
import { SpecSheet } from './spec/SpecSheet';
import { ApiErrorState } from './states/ApiErrorState';
import { NoCoverage } from './states/NoCoverage';
import { ReportSkeleton } from './states/ReportSkeleton';
import { useAddress } from './useAddress';
import { useBuilding, type BuildingState } from './useBuilding';
import { reportSearch, type ReportQuery } from './urlState';
import { useReportState } from './useReportState';
import { ConfidenceBadge } from './verdict/ConfidenceBadge';
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
      footer={
        roof && (
          <div className="px-3 pt-2 pb-1">
            <Attribution source={roof.source} />
          </div>
        )
      }
      panel={<ExplorePanel building={building} report={report} address={address} />}
    />
  );

  const title = (
    <header className="grid gap-1.5">
      {roof && <PrintHeader />}
      {/* The dot lines up with the address line (display: 44px, title: 32px). */}
      <div className="flex items-start gap-4 [&>:first-child]:mt-[-7px] md:[&>:first-child]:mt-[-1px]">
        <SearchDot onSelect={(p) => lookUp({ lat: p.lat, lng: p.lng, address: p.address || undefined })} />
        <div className="grid min-w-0 flex-1 gap-1.5">
          <h1 className="font-display text-title text-balance md:text-display">{address}</h1>
          {roof && (
            <div className="flex flex-wrap items-center gap-2">
              <ConfidenceBadge imagery={roof.imagery} />
              {flags.print && (
                <span className="ml-auto">
                  <PrintButton />
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
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
          analysis: (
            <Card>
              <ReportSkeleton variant="list" />
            </Card>
          ),
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
      />
  );
}

type Cards = Pick<ComponentProps<typeof ReportLayout>, 'summary' | 'controls' | 'analysis' | 'extras'>;

/**
 * The cards round the house once there's a roof: the answer top right with the size slider under it,
 * the money (and break-even chart) under the house, then CO₂ and the next step.
 */
function reportCards(
  building: BuildingResponse,
  { inputs, recommendation, selectedIndex, selected, setSelectedIndex }: ReturnType<typeof useReportState>,
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
        <Card>
          <SpecSheet building={building} scenario={selected} inputs={inputs} />
        </Card>
      ),
    };
  }
  const onRecommended = selectedIndex === recommendation.recommendedIndex;
  const steps = recommendation.scenarios.map((s) => ({ panels: s.panelsCount, systemKwDc: s.systemKwDc }));
  // Install year for PaybackHero and the chart, read once so they agree. The roof is fetched after
  // mount, so this only ever runs in the browser (the user's clock), never in server HTML.
  const startYear = new Date().getFullYear();

  return {
    summary: (
      <SolarPotential>
        {/* The badge follows the size on screen. */}
        <PaybackHero
          scenario={selected}
          verdict={verdictFor(selected)}
          headline={onRecommended ? recommendation.headline : undefined}
          startYear={startYear}
          lifetimeYears={inputs.lifetimeYears}
        />
        <YearlyStats scenario={selected} sunHours={building.roof.maxSunshineHoursPerYear} />
      </SolarPotential>
    ),
    controls: (
      <Card>
        <SizeSlider steps={steps} value={selectedIndex} recommendedIndex={recommendation.recommendedIndex} onChange={setSelectedIndex} />
      </Card>
    ),
    analysis: (
      <Card className="grid gap-5">
        <CostStats scenario={selected} inputs={inputs} />
        {flags.charts && (
          <div className="border-t border-separator pt-5">
            <CashFlowChart scenario={selected} startYear={startYear} />
          </div>
        )}
        <Assumptions warnings={selected.warnings} />
      </Card>
    ),
    extras: (
      <>
        <ImpactCard scenario={selected} />
        <NextStep />
      </>
    ),
  };
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
                headline={selectedIndex === recommendation.recommendedIndex ? recommendation.headline : undefined}
                startYear={new Date().getFullYear()}
                lifetimeYears={inputs.lifetimeYears}
              />
              <YearlyStats scenario={selected} sunHours={building.data.roof.maxSunshineHoursPerYear} />
            </SolarPotential>
            <SizeSlider
              steps={recommendation.scenarios.map((s) => ({ panels: s.panelsCount, systemKwDc: s.systemKwDc }))}
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
