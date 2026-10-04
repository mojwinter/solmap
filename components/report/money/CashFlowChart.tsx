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
} from 'recharts';
import type { ScenarioResult } from '@/src/types/app';
import { breakEvenYear as yearOf, cad, signedCad } from '@/lib/format';
import { cashFlowPoints, cashFlowTicks, type CashFlowPoint } from './cashflow';

const AXIS_TEXT = { fill: 'var(--ink-tertiary)', fontSize: 12 };

/** Near either end of the x axis a centred label would run off the chart: anchor it inward instead. */
function labelAnchor(fraction: number): 'start' | 'middle' | 'end' {
  if (fraction < 0.25) return 'start';
  if (fraction > 0.75) return 'end';
  return 'middle';
}

/**
 * [P1, `charts` flag] Cumulative net savings for the selected size, from −netCost on install day
 * to the end of the panels' life: red while you're still paying it off, green once you're ahead,
 * break-even marked with its year. PaybackHero says in words when it never pays back; the summary
 * here is for screen readers. A "Year by year" table carries every number, so nothing depends on
 * colour or hovering.
 */
export function CashFlowChart({
  scenario,
  startYear,
}: {
  scenario: Pick<ScenarioResult, 'netCost' | 'years' | 'paybackYears'>;
  /** The install year, i.e. this calendar year. */
  startYear: number;
}) {
  const headingId = useId();
  const points = useMemo(() => cashFlowPoints(scenario), [scenario]);
  const ticks = useMemo(() => cashFlowTicks(points), [points]);
  const lastYear = points[points.length - 1].year;
  const final = points[points.length - 1].cumulative;
  const payback = scenario.paybackYears;
  const breakEvenYear = payback === null ? null : yearOf(startYear, payback);
  const xTicks = Array.from({ length: Math.floor(lastYear / 5) + 1 }, (_, i) => i * 5);

  const summary =
    breakEvenYear === null
      ? `Still ${cad(-final)} short after ${lastYear} years: it doesn't pay back within the panels' lifetime.`
      : `Pays for itself in ${breakEvenYear}, then you're ${cad(final)} ahead by ${startYear + lastYear}.`;

  return (
    <section aria-labelledby={headingId} className="grid gap-2">
      <h2 id={headingId} className="text-headline">
        Break-even chart
      </h2>

      {/* role="img" + summary for screen readers; the table below carries every number. Recharts'
          keyboard layer is off, as a focusable control inside role="img" would have no name. */}
      <div role="img" aria-label={`Cumulative net savings by year. ${summary}`} className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 22, right: 16, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke="var(--separator)" />
            <XAxis
              dataKey="year"
              type="number"
              domain={[0, lastYear]}
              ticks={xTicks}
              tickFormatter={(y: number) => String(startYear + y)}
              tick={AXIS_TEXT}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[ticks[0], ticks[ticks.length - 1]]}
              ticks={ticks}
              tickFormatter={cad}
              tick={AXIS_TEXT}
              tickLine={false}
              axisLine={false}
              width={64}
            />
            <ReferenceLine y={0} stroke="var(--control-border)" />
            <Tooltip
              content={({ active, payload }) => <CashFlowTooltip active={active} payload={payload} startYear={startYear} />}
              cursor={{ stroke: 'var(--control-border)', strokeWidth: 1 }}
              isAnimationActive={false}
            />
            <Area
              dataKey="below"
              type="linear"
              baseValue={0}
              stroke="var(--poor)"
              strokeWidth={2}
              fill="var(--poor)"
              fillOpacity={0.12}
              activeDot={false}
              isAnimationActive={false}
            />
            <Area
              dataKey="above"
              type="linear"
              baseValue={0}
              stroke="var(--good)"
              strokeWidth={2}
              fill="var(--good)"
              fillOpacity={0.12}
              activeDot={false}
              isAnimationActive={false}
            />
            {payback !== null && (
              <ReferenceLine
                x={payback}
                stroke="var(--ink-tertiary)"
                label={{
                  content: ({ viewBox }) =>
                    viewBox && 'x' in viewBox ? (
                      <text
                        x={viewBox.x}
                        y={viewBox.y - 8}
                        textAnchor={labelAnchor(payback / lastYear)}
                        fill="var(--ink-secondary)"
                        fontSize={12}
                        fontWeight={600}
                      >
                        Break-even {breakEvenYear}
                      </text>
                    ) : null,
                }}
              />
            )}
            {payback !== null && (
              <ReferenceDot x={payback} y={0} r={5} fill="var(--good)" stroke="var(--popover)" strokeWidth={2} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <details className="text-callout text-ink-secondary">
        <summary className="cursor-pointer select-none">Year by year</summary>
        <table className="mt-2 w-full tabular-nums">
          <thead>
            <tr className="text-left">
              <th className="py-1 font-medium">Year</th>
              <th className="py-1 text-right font-medium">Net so far</th>
            </tr>
          </thead>
          <tbody>
            {points
              .filter((p) => Number.isInteger(p.year))
              .map((p) => (
                <tr key={p.year} className="border-t border-separator">
                  <td className="py-1">
                    {startYear + p.year}
                    {p.year === 0 && ' (install)'}
                  </td>
                  <td className={p.cumulative >= 0 ? 'py-1 text-right text-good-ink' : 'py-1 text-right text-poor-ink'}>
                    {signedCad(p.cumulative)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

function CashFlowTooltip({
  active,
  payload,
  startYear,
}: {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
  startYear: number;
}) {
  const point = payload?.[0]?.payload as CashFlowPoint | undefined;
  if (!active || !point) return null;
  const label = Number.isInteger(point.year)
    ? point.year === 0
      ? `${startYear} · install`
      : `${startYear + point.year} · year ${point.year}`
    : `Break-even · ${yearOf(startYear, point.year)}`;
  return (
    <div className="grid gap-0.5 rounded-md bg-popover px-3 py-2 shadow-(--elev-control)">
      <span className="font-rounded text-headline tabular-nums text-ink">{signedCad(point.cumulative)}</span>
      <span className="text-callout text-ink-secondary">{label}</span>
    </div>
  );
}
