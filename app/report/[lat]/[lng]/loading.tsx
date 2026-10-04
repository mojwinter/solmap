import { MapPlaceholder } from '@/components/report/MapPlaceholder';
import { ReportLayout } from '@/components/report/ReportLayout';
import { ReportSkeleton } from '@/components/report/states/ReportSkeleton';

export default function Loading() {
  return (
    <ReportLayout map={<MapPlaceholder />}>
      <ReportSkeleton />
    </ReportLayout>
  );
}
