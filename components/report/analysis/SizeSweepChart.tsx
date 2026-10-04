'use client';

import { useId, useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ScenarioResult } from '@/src/types/app';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { cad, kw, signedCad, years } from '@/lib/format';
import { AXIS_TEXT, axisWidth, ChartSection, GRID, Legend, NumbersTable, TooltipCard } from './chart';
import { largestPayingIndex, niceTicks, peakIndex, sweep, type SweepPoint } from './derive';

/** value = savings in today's dollars (what the recommendation maximises); net = plain dollars; payback = years. */
type Metric = 'npv' | 'net' | 'payback';
type Money = Exclude<Metric, 'payback'>;

interface Row extends SweepPoint {
  /** The money measure at or above zero (the green part of the curve), else null. */
  gain: number | null;
  /** At or below zero (the red part), else null. */
  loss: number | null;
  /** An added point where the curve crosses zero, so green and red meet there; not a real size. */
  crossing?: boolean;
}

/** The sweep as chart rows for one money measure, with a zero point added wherever it changes sign. */
function rowsFor(points: SweepPoint[], key: Money): Row[] {
  const row = (p: SweepPoint, crossing = false): Row => ({
    ...p,
    gain: p[key] >= 0 ? p[key] : null,
    loss: p[key] <= 0 ? p[key] : null,
    crossing,
  });
  const out: Row[] = [];
  points.forEach((p, i) => {
    const prev = points[i - 1];
    if (prev && ((prev[key] < 0 && p[key] > 0) || (prev[key] > 0 && p[key] < 0))) {
      const t = prev[key] / (prev[key] - p[key]);
      out.push(row({ ...prev, kw: prev.kw + t * (p.kw - prev.kw), [key]: 0 }, true));
    }
    out.push(row(p));
  });
  return out;
}

const LABEL: Record<Metric, string> = { npv: 'Value today', net: 'Total saved', payback: 'Payback' };

/**
 * The sweet-spot chart (PLAN.md → P1): how the money changes as the system grows, one point per
 * layout the roof allows. One measure at a time, never two y-scales: savings in today's dollars (the
 * default: it's what the recommendation maximises, and it shows the rebate-cap peak), total dollars
 * over the panels' life, or years to pay back. The recommended size and the size on screen are marked;
 * clicking the chart picks that size, like the slider.
 */
export function SizeSweepChart({
  scenarios,
  selectedIndex,
  recommendedIndex,
  lifetimeYears,
  discountRate,
  onSelect,
}: {
  scenarios: ScenarioResult[];
  selectedIndex: number;
  recommendedIndex: number | null;
  lifetimeYears: number;
  /** FinanceInputs.discountRate (1.04 = 4% a year), for the "today's dollars" note. */
  discountRate: number;
  onSelect: (index: number) => void;
}) {
  const id = useId();
  const [metric, setMetric] = useState<Metric>('npv');
  const points = useMemo(() => sweep(scenarios), [scenarios]);
  const rows = useMemo(() => rowsFor(points, metric === 'payback' ? 'net' : metric), [points, metric]);
  if (points.length < 2) return null;

  const money: Money = metric === 'payback' ? 'net' : metric;
  const peak = points[peakIndex(points, money)!];
  const lastPaying = largestPayingIndex(points);
  const selected = points[selectedIndex];
  const recommended = recommendedIndex === null ? null : points[recommendedIndex];
  const first = points[0];
  const biggest = points[points.length - 1];
  const pct = Math.round((discountRate - 1) * 100);

  const xTicks = niceTicks(first.kw, biggest.kw, 5).filter((t) => t >= first.kw - 1e-9 && t <= biggest.kw + 1e-9);
  const values = points.map((p) => p[money]);
  const moneyTicks = niceTicks(Math.min(0, ...values), Math.max(0, ...values), 4);
  const paybacks = points.flatMap((p) => (p.payback === null ? [] : [p.payback]));
  const payTicks = niceTicks(0, Math.max(lifetimeYears, ...paybacks), 5);
  const yTicks = metric === 'payback' ? payTicks : moneyTicks;
  const yFormat = (v: number) => (metric === 'payback' ? `${v} yrs` : cad(v));

  const fallsAfter = biggest[money] < peak[money] - 500;
  const summary = (() => {
    if (metric === 'payback') {
      if (lastPaying === null) return `No size pays back within the panels’ ${lifetimeYears}-year life.`;
      return `Smaller systems pay back sooner: ${years(first.payback ?? 0)} years at ${kw(first.kw)} kW${
        lastPaying < points.length - 1
          ? `, and past ${kw(points[lastPaying].kw)} kW they never do`
          : `, ${years(biggest.payback ?? 0)} on a full roof`
      }.`;
    }
    if (peak[money] <= 0) return `No size comes out ahead here: every layout loses money over ${lifetimeYears} years.`;
    const top = `${metric === 'npv' ? 'Value' : 'Savings'} peak${metric === 'npv' ? 's' : ''} at ${kw(peak.kw)} kW (${peak.panels} panels, ${signedCad(peak[money])}${metric === 'npv' ? ' in today’s dollars' : ''}).`;
    const after = fallsAfter
      ? ` Past that, each extra panel mostly sells power at 10¢${biggest[money] < 0 ? ', and a full roof loses money' : ' and the total falls'}.`
      : ' Bigger sizes add little.';
    const why = metric === 'npv' ? ` Future savings count ${pct}% a year less, like money you could have invested instead.` : '';
    // recommend() takes the smallest size within a few dollars of the best value, so it can sit below the peak.
    const close =
      metric === 'npv' && recommended && recommended.index !== peak.index
        ? ` We recommend ${kw(recommended.kw)} kW: within ${cad(peak.npv - recommended.npv)} of the peak, for ${recommended.panels < peak.panels ? 'fewer panels' : 'a different size'}.`
        : '';
    return top + close + after + why;
  })();

  const valueOf = (p: SweepPoint) => (metric === 'payback' ? p.payback : p[metric]);
  const fmt = (p: SweepPoint) =>
    metric === 'payback' ? (p.payback === null ? 'Never pays back' : `${years(p.payback)} years`) : signedCad(p[metric]);

  const pick = (state: { activeTooltipIndex?: number | string | null | undefined }) => {
    const r = rows[Number(state?.activeTooltipIndex)];
    if (r && !r.crossing) onSelect(r.index);
  };

  const showSelected = selected && selectedIndex !== recommendedIndex;

  return (
    <ChartSection
      id={id}
      title="Which size pays best"
      summary={summary}
      aside={
        <SegmentedControl
          label="Measure"
          stretch
          value={metric}
          onChange={setMetric}
          options={(['npv', 'net', 'payback'] as const).map((m) => ({ value: m, label: LABEL[m] }))}
        />
      }
      legend={
        <Legend
          items={[
            ...(recommended ? [{ label: `Recommended · ${recommended.panels} panels`, color: 'var(--sky-600)' }] : []),
            ...(showSelected ? [{ label: `On screen · ${selected.panels} panels`, color: 'var(--ink)' }] : []),
          ]}
        />
      }
      table={
        <NumbersTable
          head={['Size', 'Panels', 'Value today', `Total over ${lifetimeYears} yrs`, 'Payback']}
          rows={points.map((p) => [
            `${kw(p.kw)} kW`,
            p.panels,
            signedCad(p.npv),
            signedCad(p.net),
            p.payback === null ? 'Never' : `${years(p.payback)} yrs`,
          ])}
        />
      }
    >
      <p className="sr-only">Click the chart to try that size.</p>
      <div role="img" aria-label={`${LABEL[metric]} by system size. ${summary}`} className="h-[240px] cursor-pointer">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 24, right: 12, bottom: 0, left: 0 }} onClick={pick} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis
              dataKey="kw"
              type="number"
              domain={[first.kw, biggest.kw]}
              ticks={xTicks}
              tickFormatter={(v: number) => `${Number.isInteger(v) ? v : kw(v)} kW`}
              tick={AXIS_TEXT}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[yTicks[0], yTicks[yTicks.length - 1]]}
              ticks={yTicks}
              tickFormatter={yFormat}
              tick={AXIS_TEXT}
              tickLine={false}
              axisLine={false}
              width={axisWidth(yTicks, yFormat)}
            />
            <Tooltip
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as Row | undefined;
                if (!active || !p || p.crossing) return null;
                return (
                  <TooltipCard
                    value={fmt(p)}
                    label={`${kw(p.kw)} kW · ${p.panels} panels`}
                    rows={[
                      ...(metric !== 'npv' ? [{ label: 'Value today', value: signedCad(p.npv) }] : []),
                      ...(metric !== 'net' ? [{ label: `Total over ${lifetimeYears} yrs`, value: signedCad(p.net) }] : []),
                      ...(metric !== 'payback' ? [{ label: 'Payback', value: p.payback === null ? 'Never' : `${years(p.payback)} yrs` }] : []),
                      { label: 'Sold back at 10¢', value: `${Math.round(p.exportShare * 100)}%` },
                    ]}
                  />
                );
              }}
              cursor={{ stroke: 'var(--control-border)', strokeWidth: 1 }}
              isAnimationActive={false}
            />
            {metric === 'payback' ? (
              <>
                <ReferenceLine
                  y={lifetimeYears}
                  stroke="var(--control-border)"
                  label={{ value: `Panel life · ${lifetimeYears} yrs`, position: 'insideTopRight', fill: 'var(--ink-tertiary)', fontSize: 12 }}
                />
                <Line dataKey="payback" type="monotone" stroke="var(--sky-600)" strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} connectNulls={false} />
              </>
            ) : (
              <>
                <ReferenceLine y={0} stroke="var(--control-border)" />
                <Area dataKey="loss" type="linear" baseValue={0} stroke="var(--poor)" strokeWidth={2} fill="var(--poor)" fillOpacity={0.1} activeDot={false} isAnimationActive={false} connectNulls={false} />
                <Area dataKey="gain" type="linear" baseValue={0} stroke="var(--good)" strokeWidth={2} fill="var(--good)" fillOpacity={0.1} activeDot={false} isAnimationActive={false} connectNulls={false} />
              </>
            )}
            {showSelected && <ReferenceLine x={selected.kw} stroke="var(--ink-tertiary)" strokeWidth={1} />}
            {showSelected && valueOf(selected) !== null && (
              <ReferenceDot x={selected.kw} y={valueOf(selected)!} r={5} fill="var(--ink)" stroke="var(--surface)" strokeWidth={2} />
            )}
            {recommended && valueOf(recommended) !== null && (
              <ReferenceDot
                x={recommended.kw}
                y={valueOf(recommended)!}
                r={6}
                fill="var(--sky-600)"
                stroke="var(--surface)"
                strokeWidth={2}
                label={{ value: 'Recommended', position: 'top', fill: 'var(--ink-secondary)', fontSize: 12, fontWeight: 600, offset: 10 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartSection>
  );
}
