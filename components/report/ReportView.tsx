'use client';

import { useEffect, useState } from 'react';
import { UsageInputs } from '@/components/inputs/UsageInputs';
import { AddressSearch } from '@/components/map/AddressSearch';
import { MapControls } from '@/components/map/MapControls';
import { MapsProvider } from '@/components/map/MapsProvider';
import { SolarMap } from '@/components/map/SolarMap';
import { verdictFor } from '@/lib/finance';
import { FLAGS, type Flags } from '@/lib/flags';
import type { BuildingResponse } from '@/src/types/app';
import { Attribution } from './Attribution';
import { Assumptions } from './money/Assumptions';
import { CashFlowChart } from './money/CashFlowChart';
import { MoneyBreakdown } from './money/MoneyBreakdown';
import { PaybackHero } from './money/PaybackHero';
import { LargeBuildingNote } from './notices/LargeBuildingNote';
import { OutsideBcBanner } from './notices/OutsideBcBanner';
import { PrintButton, PrintHeader } from './PrintBar';
import { ReportLayout } from './ReportLayout';
import { ReportTabs } from './ReportTabs';
import { SizeSlider } from './size/SizeSlider';
import { SpecSheet } from './spec/SpecSheet';
import { ApiErrorState } from './states/ApiErrorState';
import { NoCoverage } from './states/NoCoverage';
import { ReportSkeleton } from './states/ReportSkeleton';
import { useBuilding, type BuildingState } from './useBuilding';
import { reportSearch, type ReportQuery } from './urlState';
import { useReportState } from './useReportState';
import { ConfidenceBadge } from './verdict/ConfidenceBadge';
import { ReasonChips } from './verdict/ReasonChips';
import { VerdictCard } from './verdict/VerdictCard';

/** The spot being reported on: from the URL, an address pick or a click on the map. */
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
 * presentational. One map lives through every state (loading, no coverage, error, ready), so a
 * new lookup doesn't reload it; a search or a click on the map swaps the place in state and
 * rewrites the URL without a navigation, so the report stays shareable. The size on screen, annual kWh
 * and rate plan ride along as `?panels=&kwh=&plan=` (only when they differ from the defaults).
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
      <ReportLayout
        map={
          <SolarMap
            location={{ lat: place.lat, lng: place.lng }}
            building={roof}
            visibleCount={report.selected?.panelsCount ?? 0}
            onMapClick={(p) => lookUp(p)}
            fitPadding="report"
            captions={false}
            className="h-full"
          >
            <MapControls />
          </SolarMap>
        }
        search={<AddressSearch onSelect={(p) => lookUp({ lat: p.lat, lng: p.lng, address: p.address || undefined })} />}
      >
        <Panel building={building} report={report} address={place.address} flags={flags} />
      </ReportLayout>
    </MapsProvider>
  );
}

function Panel({
  building,
  report,
  address,
  flags,
}: {
  building: BuildingState & { retry: () => void };
  report: ReturnType<typeof useReportState>;
  address?: string;
  flags: Flags;
}) {
  switch (building.status) {
    case 'loading':
      return <ReportSkeleton />;
    case 'no_coverage':
    case 'outside_bc':
      return <NoCoverage reason={building.status} />;
    case 'error':
      return <ApiErrorState message={building.message} onRetry={building.retry} />;
    case 'ready':
      return <Report building={building.data} report={report} address={address} flags={flags} />;
  }
}

function Report({
  building,
  report,
  address,
  flags,
}: {
  building: BuildingResponse;
  report: ReturnType<typeof useReportState>;
  address?: string;
  flags: Flags;
}) {
  const { inputs, setInputs, recommendation, selectedIndex, selected, setSelectedIndex } = report;
  // Always set when there's a roof; this only narrows the type.
  if (!recommendation) return null;
  const steps = recommendation.scenarios.map((s) => ({ panels: s.panelsCount, systemKwDc: s.systemKwDc }));
  const onRecommended = selectedIndex === recommendation.recommendedIndex;
  // Install year for PaybackHero and the chart, read once so they agree. The roof is fetched after
  // mount, so this only ever runs in the browser (the user's clock), never in server HTML.
  const startYear = new Date().getFullYear();

  return (
    // P1 UI renders only behind its flag (`flags.charts && …`; the print button is `flags.print`, print CSS always applies).
    // data-flags shows which are on, for ops and the E2E smoke test.
    <div className="grid gap-5" data-flags={FLAGS.filter((f) => flags[f]).join(' ')}>
      <PrintHeader />
      <header className="grid gap-1.5">
        <h1 className="font-display text-title">{address ?? 'Your roof'}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {building.postalCode && <span className="text-callout text-ink-secondary">{building.postalCode}</span>}
          <ConfidenceBadge imagery={building.imagery} />
          {flags.print && <span className="ml-auto"><PrintButton /></span>}
        </div>
      </header>
      <OutsideBcBanner administrativeArea={building.administrativeArea} />
      <LargeBuildingNote maxPanels={building.roof.maxPanels} />

      {selected && selectedIndex !== null ? (
        <>
          {/* Money first (design principle); the badge follows the size on screen. */}
          <PaybackHero
            scenario={selected}
            verdict={verdictFor(selected)}
            headline={onRecommended ? recommendation.headline : undefined}
            startYear={startYear}
            lifetimeYears={inputs.lifetimeYears}
          />
          <SizeSlider
            steps={steps}
            value={selectedIndex}
            recommendedIndex={recommendation.recommendedIndex}
            onChange={setSelectedIndex}
          />
          {/* The answer and the size stay in view; the detail is grouped in tabs so the panel isn't one long scroll. */}
          <ReportTabs
            tabs={[
              {
                value: 'savings',
                label: 'Savings',
                content: (
                  <>
                    <MoneyBreakdown scenario={selected} inputs={inputs} />
                    {flags.charts && <CashFlowChart scenario={selected} startYear={startYear} />}
                    <Assumptions warnings={selected.warnings} inputs={inputs} />
                  </>
                ),
              },
              { value: 'usage', label: 'Your usage', content: <UsageInputs inputs={inputs} onChange={setInputs} /> },
              {
                value: 'roof',
                label: 'Roof',
                content: (
                  <>
                    <ReasonChips reasons={recommendation.reasons} title="About this roof" />
                    <SpecSheet building={building} scenario={selected} inputs={inputs} />
                  </>
                ),
              },
            ]}
          />
        </>
      ) : (
        <>
          {/* No configs: nothing fits, so there's no money to show. */}
          <VerdictCard recommendation={recommendation} />
          <SpecSheet building={building} scenario={selected} inputs={inputs} />
        </>
      )}

      <Attribution source={building.source} />
    </div>
  );
}
