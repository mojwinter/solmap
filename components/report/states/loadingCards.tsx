import type { ComponentProps } from 'react';
import { Card } from '../Card';
import { NextStep } from '../NextStep';
import type { ReportLayout } from '../ReportLayout';
import { ReportSkeleton } from './ReportSkeleton';

type Cards = Pick<ComponentProps<typeof ReportLayout>, 'summary' | 'controls' | 'analysis' | 'main' | 'side' | 'extras'>;

/**
 * Every card the report will show (ReportView → reportCards), as a placeholder of the same size in
 * the same slot, so the roof arriving swaps contents instead of popping new cards in. The route's
 * loading screen and ReportView's loading state both use this, so nothing changes when one replaces
 * the other. `charts`: the charts flag, as reportCards reads it. Keep the two in step.
 */
export function loadingCards(charts: boolean): Cards {
  return {
    summary: (
      <Card>
        <ReportSkeleton />
      </Card>
    ),
    controls: (
      <Card>
        <ReportSkeleton variant="slider" />
      </Card>
    ),
    analysis: (
      <div className="grid gap-5 md:gap-6">
        <ReportSkeleton variant="figures" />
        {charts && (
          <Card>
            {/* CashFlowChart: no legend row. */}
            <ReportSkeleton variant="chart" plot={220} />
          </Card>
        )}
      </div>
    ),
    main: charts
      ? [
          {
            key: 'monthly',
            order: 6,
            node: (
              <Card>
                <ReportSkeleton variant="chart" plot={220} legend />
              </Card>
            ),
          },
        ]
      : [],
    side: charts
      ? [
          {
            key: 'panels',
            order: 7,
            node: (
              <Card>
                <ReportSkeleton variant="chart" plot={230} legend />
              </Card>
            ),
          },
        ]
      : [],
    // NextStep needs no numbers, so it's the real thing from the start.
    extras: (
      <>
        <Card>
          <ReportSkeleton variant="impact" />
        </Card>
        <NextStep />
      </>
    ),
  };
}
