'use client';

import { verdictFor } from '@/lib/finance';
import { FLAGS, type Flags } from '@/lib/flags';
import type { BuildingResponse } from '@/src/types/app';
import { Attribution } from './Attribution';
import { MapPlaceholder } from './MapPlaceholder';
import { Assumptions } from './money/Assumptions';
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
import { ReasonChips } from './verdict/ReasonChips';
import { VerdictCard } from './verdict/VerdictCard';

/**
 * The report's only container: fetch → finance → props. Everything it renders is presentational.
 * `flags` comes from the page (server-read SOLMAP_FLAGS): render each P1 feature only behind its flag,
 * e.g. `{flags.battery && <BatteryToggle … />}`, and add new names to lib/flags.ts first.
 */
export function ReportView({ lat, lng, address, flags }: { lat: number; lng: number; address?: string; flags: Flags }) {
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
      return <Report building={building.data} address={address} flags={flags} />;
  }
}

function Report({ building, address, flags }: { building: BuildingResponse; address?: string; flags: Flags }) {
  const { inputs, recommendation, selectedIndex, selected, setSelectedIndex } = useReportState(building);
  const visibleCount = selected?.panelsCount ?? 0;
  const steps = recommendation.scenarios.map((s) => ({ panels: s.panelsCount, systemKwDc: s.systemKwDc }));
  const onRecommended = selectedIndex === recommendation.recommendedIndex;

  return (
    <ReportLayout map={<MapPlaceholder building={building} visibleCount={visibleCount} />}>
      {/* No P1 UI on the report yet: gate the first ones (heatmap toggle, battery, charts, print) with `flags`.
          data-flags shows which are on, for ops and the E2E smoke test. */}
      <div className="grid gap-6" data-flags={FLAGS.filter((f) => flags[f]).join(' ')}>
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
    </ReportLayout>
  );
}
