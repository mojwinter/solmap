import { Card } from '@/components/report/Card';
import { HOUSE_WINDOW, HouseCard } from '@/components/report/HouseCard';
import { MapPlaceholder } from '@/components/report/MapPlaceholder';
import { ReportLayout } from '@/components/report/ReportLayout';
import { ReportSkeleton } from '@/components/report/states/ReportSkeleton';

export default function Loading() {
  return (
    <ReportLayout
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
      analysis={
        <Card>
          <ReportSkeleton variant="list" />
        </Card>
      }
    />
  );
}
