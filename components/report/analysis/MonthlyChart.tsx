'use client';

import { useId, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { BuildingResponse, ScenarioResult } from '@/src/types/app';
import { nearestYieldTown } from '@/lib/finance/manual';
import { kwh } from '@/lib/format';
import { AXIS_TEXT, axisWidth, ChartSection, GRID, Legend, NumbersTable, TooltipCard } from './chart';
import { monthlyProduction, monthlySplit, niceTicks, weightedPitch, type MonthSplit } from './derive';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * The first year month by month: BC's long summer days against its dark winters. The annual estimate is
 * spread by NRCan's monthly shape for the nearest town (derive.ts → monthlyProduction), each month split
 * into used at home and sold at 10¢ (monthlySplit: the model's self-use curve per month, adding up to the
 * year's figures), with your daytime use (the self-use cap) as the line the used part runs into.
 */
export function MonthlyChart({
  building,
  scenario,
  annualUseKwh,
  selfUseCapKwh,
}: {
  building: Pick<BuildingResponse, 'center' | 'segments' | 'configs'>;
  scenario: Pick<ScenarioResult, 'acKwhYear1' | 'configIndex' | 'year1'>;
  annualUseKwh: number;
  /** daytimeLoadShare × annual use: the most solar a year you could use as it's made. */
  selfUseCapKwh: number;
}) {
  const id = useId();
  // Under ~520px wide, three-letter months collide: use initials.
  const [narrow, setNarrow] = useState(false);
  const town = useMemo(() => nearestYieldTown(building.center), [building.center]);
  const months = useMemo(
    () =>
      monthlySplit(
        monthlyProduction(scenario.acKwhYear1, town, weightedPitch(building, scenario)),
        scenario.year1.selfUsedKwh,
        selfUseCapKwh,
      ),
    [scenario, town, building, selfUseCapKwh],
  );
  const perMonth = annualUseKwh / 12;
  const daytime = selfUseCapKwh / 12;
  const best = months.reduce((a, m) => (m.kwh > a.kwh ? m : a));
  const worst = months.reduce((a, m) => (m.kwh < a.kwh ? m : a));
  const ticks = niceTicks(0, Math.max(daytime, best.kwh), 4);

  const soldShare = (m: MonthSplit) => (m.kwh > 0 ? m.soldKwh / m.kwh : 0);
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const summary = `${MONTH_NAMES[best.month]} makes about ${kwh(best.kwh)} kWh, ${MONTH_NAMES[worst.month]} only ${kwh(worst.kwh)}. Of the ${kwh(
    perMonth,
  )} kWh you use in an average month, about ${kwh(daytime)} is while the sun’s up, so ${
    soldShare(best) > 0.05
      ? `in ${MONTH_NAMES[best.month]} about ${pct(soldShare(best))} of your solar sells at 10¢, while in ${MONTH_NAMES[worst.month]} you use ${
          soldShare(worst) < 0.05 ? 'nearly all of it' : pct(1 - soldShare(worst))
        }.`
      : 'you use nearly all of it as it’s made, every month.'
  } Monthly shape from NRCan solar data for ${town.name}; the split assumes even use through the year.`;

  return (
    <ChartSection
      id={id}
      title="Month by month"
      summary={summary}
      legend={
        <Legend
          items={[
            { label: 'Used at home', color: 'var(--sky-600)', shape: 'bar' },
            { label: 'Sold', color: 'var(--chart-sun)', shape: 'bar' },
            { label: 'Daytime use', color: 'var(--ink-secondary)', shape: 'line' },
          ]}
        />
      }
      table={
        <NumbersTable
          head={['Month', 'Solar made', 'Used at home', 'Sold']}
          rows={months.map((m) => [MONTH_NAMES[m.month], `${kwh(m.kwh)} kWh`, `${kwh(m.usedKwh)} kWh`, `${kwh(m.soldKwh)} kWh`])}
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
                const m = payload?.[0]?.payload as MonthSplit | undefined;
                if (!active || !m) return null;
                return (
                  <TooltipCard
                    value={`${kwh(m.kwh)} kWh`}
                    label={`${MONTH_NAMES[m.month]} · solar made`}
                    rows={[
                      { label: 'Used at home', value: `${kwh(m.usedKwh)} kWh` },
                      { label: 'Sold at 10¢', value: `${kwh(m.soldKwh)} kWh` },
                    ]}
                  />
                );
              }}
            />
            {/* Stacked: used at the baseline, sold on top; a 1px surface stroke keeps the two apart. */}
            <Bar dataKey="usedKwh" stackId="m" fill="var(--sky-600)" stroke="var(--surface)" strokeWidth={1} maxBarSize={24} isAnimationActive={false} />
            <Bar dataKey="soldKwh" stackId="m" fill="var(--chart-sun)" stroke="var(--surface)" strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
            <ReferenceLine y={daytime} stroke="var(--ink-secondary)" strokeWidth={1.5} ifOverflow="extendDomain" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartSection>
  );
}
