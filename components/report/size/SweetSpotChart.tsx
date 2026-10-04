'use client';

import { useId, useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import type { MouseHandlerDataParam } from 'recharts/types/synchronisation/types';
import { cad, compactCad, kw, panelsLabel, years } from '@/lib/format';
import type { ScenarioResult } from '@/src/types/app';
import { sweetSpotPoints, sweetSpotSummary, type SweetSpotPoint } from './sweetSpot';

// Daylight tokens, so Dusk (dark) gets its own steps without a second palette.
const LINE = 'var(--sky-600)';
const RECOMMENDED = 'var(--sun-500)';
const RING = 'var(--popover)';
const GRID = 'var(--separator)';
const MUTED = 'var(--ink-tertiary)';
const TICK = { fill: MUTED, fontSize: 12 };
const Y_WIDTH = 48; // same on both charts, so their x axes line up

/**
 * The sweet spot (#27, PLAN.md demo step 4): value and payback for every size the roof fits. Two small
 * multiples on one kW axis rather than one chart with two y-scales; a crosshair runs through both.
 * The sun dot is the recommended size, the vertical line the size on screen. Clicking a size picks it,
 * so the chart drives the slider too. Every number is also in the table under it.
 */
export function SweetSpotChart({
  scenarios,
  recommendedIndex,
  selectedIndex,
  onSelect,
  exportRate,
  lifetimeYears,
}: {
  scenarios: ScenarioResult[];
  recommendedIndex: number | null;
  selectedIndex: number;
  onSelect: (index: number) => void;
  exportRate: number;
  lifetimeYears: number;
}) {
  const ids = useId();
  const points = useMemo(() => sweetSpotPoints(scenarios), [scenarios]);
  if (points.length < 2) return null; // one size: nothing to compare

  const selected = points[selectedIndex];
  const recommended = recommendedIndex === null ? null : points[recommendedIndex];
  const anyPayback = points.some((p) => p.payback !== null);
  const xDomain: [number, number] = [points[0].kw, points[points.length - 1].kw];
  const pick = (state: MouseHandlerDataParam) => {
    const raw = state.activeTooltipIndex;
    const i = raw === null || raw === undefined || raw === '' ? NaN : Number(raw);
    if (Number.isInteger(i) && i >= 0 && i < points.length) onSelect(i);
  };
  const common = {
    data: points,
    syncId: ids,
    onClick: pick,
    margin: { top: 8, right: 12, bottom: 0, left: 0 },
    style: { cursor: 'pointer' },
  };
  const xAxis = (showTicks: boolean) => (
    <XAxis
      dataKey="kw"
      type="number"
      domain={xDomain}
      tick={showTicks ? TICK : false}
      tickFormatter={(v: number) => kw(v)}
      tickLine={false}
      axisLine={{ stroke: GRID }}
      height={showTicks ? 24 : 1}
      unit={showTicks ? ' kW' : undefined}
    />
  );
  const marker = (p: SweetSpotPoint | null | undefined, y: 'npv' | 'payback', fill: string) =>
    p && p[y] !== null ? <ReferenceDot x={p.kw} y={p[y]!} r={5} fill={fill} stroke={RING} strokeWidth={2} /> : null;

  return (
    <section aria-labelledby={`${ids}-heading`} className="grid gap-2">
      <h2 id={`${ids}-heading`} className="text-headline">
        Value by system size
      </h2>
      <p className="text-callout text-pretty text-ink-secondary">{sweetSpotSummary(points, exportRate, lifetimeYears, recommendedIndex)}</p>

      <div className="grid gap-1" aria-hidden="true">
        <p className="text-footnote text-ink-tertiary">Net value in today&rsquo;s dollars</p>
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart {...common}>
              <CartesianGrid vertical={false} stroke={GRID} />
              {xAxis(false)}
              <YAxis width={Y_WIDTH} tick={TICK} tickFormatter={compactCad} tickLine={false} axisLine={false} tickCount={4} />
              <ReferenceLine y={0} stroke={MUTED} strokeWidth={1} />
              <ReferenceLine x={selected.kw} stroke={MUTED} strokeWidth={1} />
              <Tooltip content={SizeTooltip} cursor={{ stroke: MUTED, strokeWidth: 1 }} isAnimationActive={false} />
              <Line dataKey="npv" type="monotone" stroke={LINE} strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 4, stroke: RING, strokeWidth: 2 }} />
              {marker(selected, 'npv', LINE)}
              {marker(recommended, 'npv', RECOMMENDED)}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <p className="mt-2 text-footnote text-ink-tertiary">
          Payback in years{anyPayback ? ` (a gap means it never pays back within ${lifetimeYears})` : ''}
        </p>
        <div className="h-28">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart {...common}>
              <CartesianGrid vertical={false} stroke={GRID} />
              {xAxis(true)}
              <YAxis width={Y_WIDTH} domain={[0, lifetimeYears]} tick={TICK} tickLine={false} axisLine={false} ticks={[0, 10, 20]} />
              <ReferenceLine y={lifetimeYears} stroke={MUTED} strokeWidth={1} label={{ value: 'Panel life', position: 'insideTopRight', fill: MUTED, fontSize: 12 }} />
              <ReferenceLine x={selected.kw} stroke={MUTED} strokeWidth={1} />
              {/* Cursor only: the value chart above carries the tooltip for both. */}
              <Tooltip content={() => null} cursor={{ stroke: MUTED, strokeWidth: 1 }} isAnimationActive={false} />
              <Line dataKey="payback" type="monotone" stroke={LINE} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} activeDot={{ r: 4, stroke: RING, strokeWidth: 2 }} />
              {marker(selected, 'payback', LINE)}
              {marker(recommended, 'payback', RECOMMENDED)}
            </LineChart>
          </ResponsiveContainer>
        </div>
        {!anyPayback && <p className="text-callout text-poor-ink">No size pays back within {lifetimeYears} years.</p>}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-footnote text-ink-secondary">
        {recommended && <Key color={RECOMMENDED} label={`Recommended · ${kw(recommended.kw)} kW`} />}
        <Key color={LINE} label={`On screen · ${kw(selected.kw)} kW`} />
      </div>

      <details className="text-callout">
        <summary className="cursor-pointer text-ink-secondary">Every size as a table</summary>
        <div className="mt-2 max-h-64 overflow-y-auto">
          <table className="w-full text-left tabular-nums">
            <thead className="text-footnote text-ink-tertiary">
              <tr>
                <th scope="col" className="py-1 font-normal">Size</th>
                <th scope="col" className="py-1 text-right font-normal">Net value</th>
                <th scope="col" className="py-1 text-right font-normal">Payback</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.index} className={p.index === selectedIndex ? 'bg-fill-selected' : undefined}>
                  <td className="py-1">
                    {panelsLabel(p.panels, p.kw)}
                    {p.index === recommendedIndex && <span className="text-ink-tertiary"> · recommended</span>}
                  </td>
                  <td className="py-1 text-right">{cad(p.npv)}</td>
                  <td className="py-1 text-right">{p.payback === null ? 'Never' : `${years(p.payback)} yrs`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function SizeTooltip({ active, payload }: TooltipContentProps) {
  const p = payload?.[0]?.payload as SweetSpotPoint | undefined;
  if (!active || !p) return null;
  return (
    <div className="grid gap-0.5 rounded-md bg-popover px-3 py-2 text-callout shadow-[var(--elev-control)]">
      <span className="font-semibold text-ink">{panelsLabel(p.panels, p.kw)}</span>
      <span className="text-ink-secondary">
        Net value <span className="tabular-nums text-ink">{cad(p.npv)}</span>
      </span>
      <span className="text-ink-secondary">
        Payback{' '}
        <span className="tabular-nums text-ink">{p.payback === null ? 'never' : `${years(p.payback)} years`}</span>
      </span>
    </div>
  );
}
