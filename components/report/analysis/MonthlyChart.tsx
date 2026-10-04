'use client';

import { useId, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { BuildingResponse, ScenarioResult } from '@/src/types/app';
import { nearestYieldTown } from '@/lib/finance/manual';
import { kwh } from '@/lib/format';
import { AXIS_TEXT, axisWidth, ChartSection, GRID, Legend, NumbersTable, TooltipCard } from './chart';
import { monthlyProduction, niceTicks, weightedPitch, type MonthBar } from './derive';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * The first year month by month: BC's long summer days against its dark winters. The annual estimate is
 * spread by NRCan's monthly shape for the nearest town (derive.ts → monthlyProduction), with your
 * average month's use as the line to beat. Months above it make more than you use; the extra sells at 10¢.
 */
export function MonthlyChart({
  building,
  scenario,
  annualUseKwh,
}: {
  building: Pick<BuildingResponse, 'center' | 'segments' | 'configs'>;
  scenario: Pick<ScenarioResult, 'acKwhYear1' | 'configIndex'>;
  annualUseKwh: number;
}) {
  const id = useId();
  // Under ~520px wide, three-letter months collide: use initials.
  const [narrow, setNarrow] = useState(false);
  const town = useMemo(() => nearestYieldTown(building.center), [building.center]);
  const months = useMemo(
    () => monthlyProduction(scenario.acKwhYear1, town, weightedPitch(building, scenario)),
    [scenario, town, building],
  );
  const perMonth = annualUseKwh / 12;
  const best = months.reduce((a, m) => (m.kwh > a.kwh ? m : a));
  const worst = months.reduce((a, m) => (m.kwh < a.kwh ? m : a));
  const over = months.filter((m) => m.kwh > perMonth);
  const ticks = niceTicks(0, Math.max(perMonth, best.kwh), 4);

  const summary = `${MONTH_NAMES[best.month]} makes about ${kwh(best.kwh)} kWh, ${MONTH_NAMES[worst.month]} only ${kwh(worst.kwh)}${
    worst.kwh > 0 ? ` (${Math.round(best.kwh / worst.kwh)}× less)` : ''
  }. ${
    over.length === 0
      ? 'Even the sunniest month makes less than you use in an average month, so almost all of it is yours to use.'
      : `In ${over.length} ${over.length === 1 ? 'month' : 'months'} the panels make more than your average month uses.`
  }`;

  return (
    <ChartSection
      id={id}
      title="Month by month"
      summary={summary}
      legend={
        <div className="grid gap-1">
          <Legend
            items={[
              { label: 'Solar made (first year)', color: 'var(--chart-sun)', shape: 'bar' },
              { label: `Your average month · ${kwh(perMonth)} kWh`, color: 'var(--ink-secondary)', shape: 'line' },
            ]}
          />
          <p className="text-footnote text-ink-tertiary">
            Shape from NRCan’s monthly solar data for {town.name}. Real homes use more in winter, so summer surplus is
            larger and winter cover smaller than an even split suggests.
          </p>
        </div>
      }
      table={
        <NumbersTable
          head={['Month', 'Solar made', 'Share of your average month']}
          rows={months.map((m) => [MONTH_NAMES[m.month], `${kwh(m.kwh)} kWh`, `${Math.round((m.kwh / perMonth) * 100)}%`])}
        />
      }
    >
      <div role="img" aria-label={`Solar made each month in the first year. ${summary}`} className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%" onResize={(w) => setNarrow(w < 520)}>
          <BarChart data={months} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%" accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis
              dataKey="month"
              tickFormatter={(m: number) => (narrow ? MONTHS[m][0] : MONTHS[m])}
              tick={AXIS_TEXT}
              tickLine={false}
              axisLine={false}
              interval={0}
              minTickGap={0}
            />
            <YAxis
              domain={[0, ticks[ticks.length - 1]]}
              ticks={ticks}
              tickFormatter={(v: number) => kwh(v)}
              tick={AXIS_TEXT}
              tickLine={false}
              axisLine={false}
              width={axisWidth(ticks, kwh)}
            />
            <Tooltip
              cursor={{ fill: 'var(--fill-quiet)' }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const m = payload?.[0]?.payload as MonthBar | undefined;
                if (!active || !m) return null;
                return (
                  <TooltipCard
                    value={`${kwh(m.kwh)} kWh`}
                    label={MONTH_NAMES[m.month]}
                    rows={[{ label: 'Of your average month', value: `${Math.round((m.kwh / perMonth) * 100)}%` }]}
                  />
                );
              }}
            />
            <Bar dataKey="kwh" fill="var(--chart-sun)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
            <ReferenceLine y={perMonth} stroke="var(--ink-secondary)" strokeWidth={1.5} ifOverflow="extendDomain" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartSection>
  );
}
