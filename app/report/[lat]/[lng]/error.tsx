'use client'; // Error boundaries must be Client Components

import { useEffect } from 'react';
import { MapPlaceholder } from '@/components/report/MapPlaceholder';
import { ReportLayout } from '@/components/report/ReportLayout';
import { ApiErrorState } from '@/components/report/states/ApiErrorState';

/** Catches render errors in the report (a bug, not an API failure: those are handled in ReportView). */
export default function ReportError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ReportLayout map={<MapPlaceholder />}>
      <ApiErrorState message="Something went wrong showing this report." onRetry={retry} />
    </ReportLayout>
  );
}
