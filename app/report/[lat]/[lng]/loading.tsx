'use client'; // Reads the URL, so the title is the one the report will show

import { useSearchParams } from 'next/navigation';
import { HeaderSearchPlaceholder } from '@/components/report/HeaderSearch';
import { HOUSE_WINDOW, HouseCard } from '@/components/report/HouseCard';
import { MapPlaceholder } from '@/components/report/MapPlaceholder';
import { ReportLayout } from '@/components/report/ReportLayout';
import { ReportTitle } from '@/components/report/ReportTitle';
import { loadingCards } from '@/components/report/states/loadingCards';
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
      // As with the charts below: the title's buttons are assumed on, as on prod.
      title={<ReportTitle address={address} loading actionsPending={{ settings: true, pdf: true }} />}
      house={
        <HouseCard>
          <div className={HOUSE_WINDOW}>
            <MapPlaceholder />
          </div>
        </HouseCard>
      }
      // Charts assumed on (they are on prod): this client screen can't read the server-side flags,
      // and reading them here would make the screen wait for the server instead of showing at once.
      {...loadingCards(true)}
      fadeIn
    />
  );
}
