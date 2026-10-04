'use client';

import { useRouter } from 'next/navigation';
import { AddressSearch } from '@/components/map/AddressSearch';
import { MapsProvider } from '@/components/map/MapsProvider';
import { reportHref } from './reportHref';

/** The landing page's only call to action: A's AddressSearch, bare (no map), routing to the report. */
export function LandingSearch() {
  const router = useRouter();
  return (
    <MapsProvider>
      <AddressSearch
        variant="landing"
        onSelect={({ lat, lng, address }) => router.push(reportHref(lat, lng, address))}
      />
    </MapsProvider>
  );
}
