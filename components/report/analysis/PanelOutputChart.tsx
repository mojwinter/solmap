'use client';

import { useId, useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { BuildingResponse, ScenarioResult } from '@/src/types/app';
import { kwh, signedCad } from '@/lib/format';
import { AXIS_TEXT, axisWidth, ChartSection, GRID, Legend, NumbersTable, TooltipCard } from './chart';
import { marginalNpv, niceTicks, panelBars, type PanelBar } from './derive';

/**
 * Every panel spot on the roof, best first, in first-year kWh: the ones in the system on screen in sky,
 * the rest quiet. It shows why the first panels are worth the most and where shade or a poor face
 * drags the last ones down. Clicking a bar sizes the system up to it, like the slider.
 */
export function PanelOutputChart({
  building,
  scenario,
  scenarios,
  rebateCapKw,
  onPickPanels,
}: {
  building: Pick<BuildingResponse, 'panels' | 'configs'>;
  scenario: Pick<ScenarioResult, 'configIndex' | 'panelsCount' | 'acKwhYear1' | 'systemKwDc'>;
  /** System size (kW DC) where the BC Hydro rebate stops growing, when you get one: named as the reason extra panels stop paying. */
  rebateCapKw?: number;
  /** Every layout's result (Recommendation.scenarios), for what each extra panel is worth. */
  scenarios?: readonly Pick<ScenarioResult, 'panelsCount' | 'npv'>[];
  /** Pick the smallest size with at least this many panels. */
  onPickPanels?: (panels: number) => void;
}) {
  const id = useId();
  const bars = useMemo(() => {
    const adds = scenarios ? marginalNpv(scenarios) : null;
    return panelBars(building, scenario).map((b) => ({ ...b, addsNpv: adds?.get(b.rank) ?? null }));
  }, [building, scenario, scenarios]);
  if (bars.length === 0) return null;
  // The first panel whose addition lowers the value in today's dollars (it stays lower from there, usually).
  const perPanelKw = scenario.panelsCount > 0 ? scenario.systemKwDc / scenario.panelsCount : 0;
  const firstLoss = bars.find((b) => b.addsNpv !== null && b.addsNpv !== undefined && b.addsNpv < 0);

  const best = bars[0];
  const lastUsed = bars[scenario.panelsCount - 1];
  const unused = bars.slice(scenario.panelsCount);
  const unusedAvg = unused.length ? unused.reduce((a, b) => a + b.kwh, 0) / unused.length : null;
  const worst = bars[bars.length - 1];
  const ticks = niceTicks(0, best.kwh, 5);
  const drop = (a: number, b: number) => Math.round((1 - b / a) * 100);

  const summary =
    `Your best spot makes ${kwh(best.kwh)} kWh a year` +
    (lastUsed && lastUsed !== best ? `; panel ${scenario.panelsCount}, the last in this size, ${kwh(lastUsed.kwh)} (${drop(best.kwh, lastUsed.kwh)}% less).` : '.') +
    (unusedAvg !== null
      ? ` The ${unused.length} spots left over average ${kwh(unusedAvg)}, down to ${kwh(worst.kwh)} on the weakest.`
      : ' Every spot on the roof is in use.') +
    (firstLoss
      ? ` From panel ${firstLoss.rank} on, adding a panel lowers the system’s value in today’s dollars${
          rebateCapKw !== undefined && Math.abs((firstLoss.rank - 1) * perPanelKw - rebateCapKw) < perPanelKw
            ? `: the rebate stops growing at ${rebateCapKw.toFixed(rebateCapKw % 1 ? 1 : 0)} kW, so each extra panel gets no rebate`
            : ''
        }.`
      : '');

  const tickEvery = bars.length > 60 ? 20 : bars.length > 24 ? 10 : 5;
  const xTicks = bars.filter((b) => b.rank === 1 || b.rank % tickEvery === 0).map((b) => b.rank);

  return (
    <ChartSection
      id={id}
      title="Panel by panel"
      summary={summary}
      legend={
        <Legend
          items={[
            { label: 'In this system', color: 'var(--sky-600)', shape: 'bar' },
            ...(unused.length ? [{ label: 'Unused', color: 'var(--chart-muted)', shape: 'bar' as const }] : []),
          ]}
        />
      }
      table={
        <NumbersTable
          head={['Panel', 'kWh a year', 'Adding it (today’s $)', 'In this system']}
          rows={bars.map((b) => [b.rank, kwh(b.kwh), b.addsNpv == null ? '—' : signedCad(b.addsNpv), b.used ? 'Yes' : '—'])}
        />
      }
    >
      <div role="img" aria-label={`First-year output of each panel spot, best first. ${summary}`} className={`h-[230px] ${onPickPanels ? 'cursor-pointer' : ''}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={bars}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            barCategoryGap={bars.length > 40 ? 0.5 : '18%'}
            accessibilityLayer={false}
            onClick={(state) => {
              const b = bars[Number(state?.activeTooltipIndex)];
              if (b && onPickPanels) onPickPanels(b.rank);
            }}
          >
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis
              dataKey="rank"
              ticks={xTicks}
              interval={0}
              tick={AXIS_TEXT}
              tickLine={false}
              axisLine={false}
              height={36}
              label={{ value: 'Panels, best first', position: 'insideBottom', fill: 'var(--ink-tertiary)', fontSize: 12 }}
            />
            <YAxis
              domain={[0, ticks[ticks.length - 1]]}
              ticks={ticks}
              tickFormatter={(v: number) => kwh(v)}
              tick={AXIS_TEXT}
              tickLine={false}
              axisLine={false}
              // Room for the rotated axis title beside the ticks.
              width={axisWidth(ticks, kwh) + 18}
              label={{ value: 'kWh a year', angle: -90, position: 'insideLeft', fill: 'var(--ink-tertiary)', fontSize: 12, style: { textAnchor: 'middle' } }}
            />
            <Tooltip
              cursor={{ fill: 'var(--fill-quiet)' }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const b = payload?.[0]?.payload as PanelBar | undefined;
                if (!active || !b) return null;
                return (
                  <TooltipCard
                    value={`${kwh(b.kwh)} kWh`}
                    label={`Panel ${b.rank}${b.used ? ' · in this system' : ''}`}
                    rows={[
                      { label: 'Vs your best panel', value: b.rank === 1 ? '—' : `−${drop(best.kwh, b.kwh)}%` },
                      ...(b.addsNpv == null ? [] : [{ label: 'Adding it, today’s $', value: signedCad(b.addsNpv) }]),
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="kwh" radius={bars.length > 40 ? [2, 2, 0, 0] : [4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
              {bars.map((b) => (
                <Cell key={b.rank} fill={b.used ? 'var(--sky-600)' : 'var(--chart-muted)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartSection>
  );
}
