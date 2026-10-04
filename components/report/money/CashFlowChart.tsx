'use client';

import { useId, useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import { cad, compactCad, signedCad } from '@/lib/format';
import type { ScenarioResult } from '@/src/types/app';
import { cashFlowPoints, cashFlowSummary, type CashFlowPoint } from './cashflow';

// Daylight tokens (Dusk gets its own steps). Loss and gain use the verdict colours, which mark money;
// the sun marks the break-even point (DESIGN.md §4).
const LOSS = 'var(--poor)';
const GAIN = 'var(--good)';
const BREAK_EVEN = 'var(--sun-500)';
const RING = 'var(--popover)';
const GRID = 'var(--separator)';
const MUTED = 'var(--ink-tertiary)';
const TICK = { fill: MUTED, fontSize: 12 };

/**
 * Cumulative net savings for the size on screen, from the install (year 0, −what you pay) to the end of
 * the panels' life (#30). Red wash below zero, green above, the break-even year marked. Follows the
 * slider because it reads the selected scenario. A sentence above says the same thing, and the table
 * under it has every year, so nothing depends on colour or hover.
 */
export function CashFlowChart({
  scenario,
  startYear,
  lifetimeYears,
}: {
  scenario: ScenarioResult;
  startYear: number;
  lifetimeYears: number;
}) {
  const ids = useId();
  const points = useMemo(() => cashFlowPoints(scenario, startYear), [scenario, startYear]);
  const breakEven = points.find((p) => p.breakEven);
  const last = points[points.length - 1];
  const ticks = [startYear, ...Array.from({ length: Math.floor(lifetimeYears / 5) }, (_, i) => startYear + (i + 1) * 5)];

  return (
    <section aria-labelledby={`${ids}-heading`} className="grid gap-2">
      <h2 id={`${ids}-heading`} className="text-headline">
        Money over time
      </h2>
      <p className="text-callout text-pretty text-ink-secondary">{cashFlowSummary(scenario, startYear, lifetimeYears)}</p>

      <div className="grid gap-1" aria-hidden="true">
        <p className="text-footnote text-ink-tertiary">Total saved minus what you paid</p>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 20, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis
                dataKey="year"
                type="number"
                domain={[startYear, last.year]}
                ticks={ticks}
                tick={TICK}
                tickLine={false}
                axisLine={false}
              />
              <YAxis width={48} tick={TICK} tickFormatter={compactCad} tickLine={false} axisLine={false} tickCount={4} />
              <ReferenceLine y={0} stroke={MUTED} strokeWidth={1} />
              <Tooltip content={YearTooltip} cursor={{ stroke: MUTED, strokeWidth: 1 }} isAnimationActive={false} />
              {/* Linear, like the engine's payback interpolation, so the two washes meet exactly at the crossing. */}
              <Area dataKey="below" type="linear" stroke={LOSS} strokeWidth={2} fill={LOSS} fillOpacity={0.12} baseValue={0} connectNulls={false} dot={false} activeDot={false} isAnimationActive={false} />
              <Area dataKey="above" type="linear" stroke={GAIN} strokeWidth={2} fill={GAIN} fillOpacity={0.12} baseValue={0} connectNulls={false} dot={false} activeDot={false} isAnimationActive={false} />
              {breakEven && (
                <>
                  <ReferenceLine
                    x={breakEven.year}
                    stroke={BREAK_EVEN}
                    strokeWidth={1}
                    label={{ value: `Break-even ${Math.round(breakEven.year)}`, position: 'insideTopLeft', fill: 'var(--ink-secondary)', fontSize: 12 }}
                  />
                  <ReferenceDot x={breakEven.year} y={0} r={5} fill={BREAK_EVEN} stroke={RING} strokeWidth={2} />
                </>
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <details className="text-callout">
        <summary className="cursor-pointer text-ink-secondary">Year by year</summary>
        <div className="mt-2 max-h-64 overflow-y-auto">
          <table className="w-full text-left tabular-nums">
            <thead className="text-footnote text-ink-tertiary">
              <tr>
                <th scope="col" className="py-1 font-normal">Year</th>
                <th scope="col" className="py-1 text-right font-normal">Saved that year</th>
                <th scope="col" className="py-1 text-right font-normal">Running total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-1">{startYear} (install)</td>
                <td className="py-1 text-right">{cad(-scenario.netCost)}</td>
                <td className="py-1 text-right">{signedCad(-scenario.netCost)}</td>
              </tr>
              {scenario.years.map((r) => (
                <tr key={r.year}>
                  <td className="py-1">{startYear + r.year}</td>
                  <td className="py-1 text-right">{cad(r.savings)}</td>
                  <td className="py-1 text-right">{signedCad(r.cumulative)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function YearTooltip({ active, payload }: TooltipContentProps) {
  const p = payload?.[0]?.payload as CashFlowPoint | undefined;
  if (!active || !p) return null;
  return (
    <div className="grid gap-0.5 rounded-md bg-popover px-3 py-2 text-callout shadow-[var(--elev-control)]">
      <span className="font-semibold text-ink">{p.breakEven ? `Break-even, ${Math.round(p.year)}` : p.t === 0 ? `${p.year}, install` : p.year}</span>
      <span className="text-ink-secondary">
        Running total <span className="tabular-nums text-ink">{signedCad(p.cumulative)}</span>
      </span>
    </div>
  );
}
