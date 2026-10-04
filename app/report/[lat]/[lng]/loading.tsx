'use client'; // Reads the URL, so the title is the one the report will show

import { useSearchParams } from 'next/navigation';
import { Card } from '@/components/report/Card';
import { HeaderSearchPlaceholder } from '@/components/report/HeaderSearch';
import { HOUSE_WINDOW, HouseCard } from '@/components/report/HouseCard';
import { MapPlaceholder } from '@/components/report/MapPlaceholder';
import { ReportLayout } from '@/components/report/ReportLayout';
import { ReportTitle } from '@/components/report/ReportTitle';
import { ReportSkeleton } from '@/components/report/states/ReportSkeleton';
import { parseReportQuery } from '@/components/report/urlState';

/**
 * The report's frame while the page loads: the same top bar and title the report opens with (the
 * address from the URL, else the address skeleton, as ReportView shows while it looks the address
 * up), so nothing above the house moves when the report replaces this.
 */
export default function Loading() {
  const { address } = parseReportQuery(Object.fromEntries(useSearchParams()));

  return (
    <ReportLayout
      search={<HeaderSearchPlaceholder />}
      title={<ReportTitle address={address} loading />}
      house={
        <HouseCard>
          <div className={HOUSE_WINDOW}>
            <MapPlaceholder />
          </div>
        </HouseCard>
      }
      summary={
        <Card>
          <ReportSkeleton />
        </Card>
      }
      controls={
        <Card>
          <ReportSkeleton variant="slider" />
        </Card>
      }
      analysis={<ReportSkeleton variant="figures" />}
    />
  );
}
