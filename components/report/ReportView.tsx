'use client';

import type { BuildingResponse } from '@/src/types/app';
import { Attribution } from './Attribution';
import { MapPlaceholder } from './MapPlaceholder';
import { MoneyBreakdown } from './money/MoneyBreakdown';
import { PaybackHero } from './money/PaybackHero';
import { ReportLayout } from './ReportLayout';
import { SizeSlider } from './size/SizeSlider';
import { ApiErrorState } from './states/ApiErrorState';
import { NoCoverage } from './states/NoCoverage';
import { ReportSkeleton } from './states/ReportSkeleton';
import { useBuilding } from './useBuilding';
import { useReportState } from './useReportState';
import { ConfidenceBadge } from './verdict/ConfidenceBadge';
import { VerdictCard } from './verdict/VerdictCard';

/** The report's only container: fetch → finance → props. Everything it renders is presentational. */
export function ReportView({ lat, lng, address }: { lat: number; lng: number; address?: string }) {
  const building = useBuilding(lat, lng);

  switch (building.status) {
    case 'loading':
      return (
        <ReportLayout map={<MapPlaceholder />}>
          <ReportSkeleton />
        </ReportLayout>
      );
    case 'no_coverage':
    case 'outside_bc':
      return (
        <ReportLayout map={<MapPlaceholder />}>
          <NoCoverage reason={building.status} />
        </ReportLayout>
      );
    case 'error':
      return (
        <ReportLayout map={<MapPlaceholder />}>
          <ApiErrorState message={building.message} onRetry={building.retry} />
        </ReportLayout>
      );
    case 'ready':
      return <Report building={building.data} address={address} />;
  }
}

function Report({ building, address }: { building: BuildingResponse; address?: string }) {
  const { inputs, recommendation, selectedIndex, selected, setSelectedIndex } = useReportState(building);
  const visibleCount = selected?.panelsCount ?? 0;
  const steps = recommendation.scenarios.map((s) => ({ panels: s.panelsCount, systemKwDc: s.systemKwDc }));

  return (
    <ReportLayout map={<MapPlaceholder building={building} visibleCount={visibleCount} />}>
      <div className="grid gap-6">
        <header className="grid gap-1.5">
          <h1 className="font-display text-title">{address ?? 'Your roof'}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {building.postalCode && <span className="text-callout text-ink-secondary">{building.postalCode}</span>}
            <ConfidenceBadge imagery={building.imagery} />
          </div>
        </header>

        <VerdictCard recommendation={recommendation} />

        {selected && selectedIndex !== null && (
          <>
            <PaybackHero
              scenario={selected}
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
          </>
        )}

        <Attribution source={building.source} />
      </div>
    </ReportLayout>
  );
}
