'use client';

import { useState } from 'react';
import { AddressSearch } from '@/components/map/AddressSearch';
import { MapControls } from '@/components/map/MapControls';
import { MapsProvider } from '@/components/map/MapsProvider';
import { SolarMap } from '@/components/map/SolarMap';
import { verdictFor } from '@/lib/finance';
import type { BuildingResponse } from '@/src/types/app';
import { Attribution } from './Attribution';
import { Assumptions } from './money/Assumptions';
import { MoneyBreakdown } from './money/MoneyBreakdown';
import { PaybackHero } from './money/PaybackHero';
import { ReportLayout } from './ReportLayout';
import { SizeSlider } from './size/SizeSlider';
import { ApiErrorState } from './states/ApiErrorState';
import { NoCoverage } from './states/NoCoverage';
import { ReportSkeleton } from './states/ReportSkeleton';
import { useBuilding, type BuildingState } from './useBuilding';
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

function reportPath({ lat, lng, address }: Place) {
  return `/report/${lat}/${lng}${address ? `?address=${encodeURIComponent(address)}` : ''}`;
}

/**
 * The report's only container: place → fetch → finance → props. Everything it renders is
 * presentational. One map lives through every state (loading, no coverage, error, ready), so a
 * new lookup doesn't reload it; a search or a click on the map swaps the place in state and
 * rewrites the URL without a navigation, so the report stays shareable.
 */
export function ReportView({ lat, lng, address }: Place) {
  const [place, setPlace] = useState<Place>({ lat, lng, address });

  // A real navigation (e.g. a demo link in NoCoverage) brings new props: follow them.
  const [fromUrl, setFromUrl] = useState<Place>({ lat, lng, address });
  if (fromUrl.lat !== lat || fromUrl.lng !== lng || fromUrl.address !== address) {
    setFromUrl({ lat, lng, address });
    setPlace({ lat, lng, address });
  }

  const building = useBuilding(place.lat, place.lng);
  const roof = building.status === 'ready' ? building.data : null;
  const report = useReportState(roof);

  const lookUp = (next: Place) => {
    const rounded = { lat: round(next.lat), lng: round(next.lng), address: next.address };
    setPlace(rounded);
    window.history.replaceState(null, '', reportPath(rounded));
  };

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
        <Panel building={building} report={report} address={place.address} />
      </ReportLayout>
    </MapsProvider>
  );
}

function Panel({
  building,
  report,
  address,
}: {
  building: BuildingState & { retry: () => void };
  report: ReturnType<typeof useReportState>;
  address?: string;
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
      return <Report building={building.data} report={report} address={address} />;
  }
}

function Report({
  building,
  report,
  address,
}: {
  building: BuildingResponse;
  report: ReturnType<typeof useReportState>;
  address?: string;
}) {
  const { inputs, recommendation, selectedIndex, selected, setSelectedIndex } = report;
  // Always set when there's a roof; this only narrows the type.
  if (!recommendation) return null;
  const steps = recommendation.scenarios.map((s) => ({ panels: s.panelsCount, systemKwDc: s.systemKwDc }));
  const onRecommended = selectedIndex === recommendation.recommendedIndex;

  return (
    <div className="grid gap-6">
      <header className="grid gap-1.5">
        <h1 className="font-display text-title">{address ?? 'Your roof'}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {building.postalCode && <span className="text-callout text-ink-secondary">{building.postalCode}</span>}
          <ConfidenceBadge imagery={building.imagery} />
        </div>
      </header>

      {selected && selectedIndex !== null ? (
        <>
          {/* Money first (design principle); the badge follows the size on screen. */}
          <PaybackHero
            scenario={selected}
            verdict={verdictFor(selected)}
            headline={onRecommended ? recommendation.headline : undefined}
            startYear={new Date().getFullYear()}
            lifetimeYears={inputs.lifetimeYears}
          />
          <SizeSlider
            steps={steps}
            value={selectedIndex}
            recommendedIndex={recommendation.recommendedIndex}
            onChange={setSelectedIndex}
          />
          <MoneyBreakdown scenario={selected} inputs={inputs} />
          <ReasonChips reasons={recommendation.reasons} title="About this roof" />
          <Assumptions warnings={selected.warnings} inputs={inputs} />
        </>
      ) : (
        // No configs: nothing fits, so there's no money to show.
        <VerdictCard recommendation={recommendation} />
      )}

      <Attribution source={building.source} />
    </div>
  );
}
