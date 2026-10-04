'use client';

import { useId, useMemo } from 'react';
import type { BuildingResponse, FinanceInputs, ScenarioResult } from '@/src/types/app';
import { signedCad, years } from '@/lib/format';
import { ChartSection, NumbersTable } from './chart';
import { sensitivity } from './derive';

/**
 * "How sure is this?": the payback for the size on screen with each assumption pushed to both ends of
 * its BC range, one bar per assumption (a tornado chart, biggest swing first). The line is today's
 * answer. Ends that never pay back sit in the "Never" strip past the panels' life.
 */
export function Sensitivity({
  building,
  scenario,
  inputs,
}: {
  building: Pick<BuildingResponse, 'configs' | 'panel'>;
  scenario: Pick<ScenarioResult, 'configIndex' | 'paybackYears'>;
  inputs: FinanceInputs;
}) {
  const id = useId();
  const config = building.configs[scenario.configIndex];
  const rows = useMemo(
    () => (config ? sensitivity(config, scenario.configIndex, building.panel.capacityWatts, inputs) : []),
    [config, scenario.configIndex, building.panel.capacityWatts, inputs],
  );
  if (rows.length === 0) return null;

  const life = inputs.lifetimeYears;
  const never = life + 3; // where "never pays back" sits, past the lifetime
  const span = never + 1;
  const at = (p: number | null) => ((p === null ? never : Math.min(p, life)) / span) * 100;
  const label = (p: number | null) => (p === null ? 'never' : `${years(p)} yrs`);
  const swing = (r: (typeof rows)[number]) => {
    const [a, b] = r.ends.map((e) => (e.payback === null ? never : e.payback));
    return Math.abs(a - b);
  };
  const sorted = [...rows].sort((a, b) => swing(b) - swing(a));
  const top = sorted[0];
  const now = scenario.paybackYears;
  const ticks = [0, 5, 10, 15, 20, 25].filter((t) => t <= life);

  const lo = top.ends.reduce((a, e) => (a.payback !== null && (e.payback === null || a.payback <= e.payback) ? a : e));
  const hi = top.ends.find((e) => e !== lo)!;
  const summary = `${top.label} moves your payback most: ${label(lo.payback)} at ${lo.setting}, ${label(hi.payback)} at ${hi.setting}. ${
    sorted.every((r) => r.ends.every((e) => e.payback !== null))
      ? 'Within these ranges it always pays back.'
      : 'At the bad end of some, it doesn’t pay back within the panels’ life.'
  }`;

  return (
    <ChartSection
      id={id}
      title="How sure is this?"
      summary={summary}
      table={
        <NumbersTable
          head={['Assumption', 'Setting', 'Payback', `Net over ${life} yrs`]}
          rows={sorted.flatMap((r) => r.ends.map((e) => [r.label, e.setting, label(e.payback), signedCad(e.net)]))}
        />
      }
    >
      <div role="img" aria-label={`Payback under each assumption’s range. ${summary}`} className="grid gap-1">
        {/* Axis: years, then the "never" strip. */}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,140px)_1fr]">
          <span className="hidden sm:block" />
          <div className="relative h-5 text-footnote text-ink-tertiary">
            {ticks.map((t) => (
              <span key={t} className={`absolute tabular-nums ${t > 0 ? '-translate-x-1/2' : ''}`} style={{ left: `${(t / span) * 100}%` }}>
                {t}
              </span>
            ))}
            <span className="absolute -translate-x-1/2" style={{ left: `${at(null)}%` }}>
              Never
            </span>
          </div>
        </div>
        {sorted.map((r) => {
          const [a, b] = r.ends;
          const left = Math.min(at(a.payback), at(b.payback));
          const right = Math.max(at(a.payback), at(b.payback));
          const loEnd = at(a.payback) <= at(b.payback) ? a : b;
          const hiEnd = loEnd === a ? b : a;
          return (
            <div key={r.key} className="grid gap-1 border-t border-separator py-2.5 sm:grid-cols-[minmax(0,140px)_1fr] sm:items-center sm:gap-3">
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 sm:grid">
                <span className="text-callout text-ink">{r.label}</span>
                <span className="text-footnote text-ink-tertiary">
                  {loEnd.setting} → {hiEnd.setting}
                </span>
              </span>
              <div className="relative h-9">
                {/* Gridlines and the never strip. */}
                {ticks.map((t) => (
                  <span key={t} aria-hidden="true" className="absolute inset-y-0 w-px bg-separator" style={{ left: `${(t / span) * 100}%` }} />
                ))}
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 right-0 rounded-sm bg-poor-soft opacity-60"
                  style={{ left: `${((life + 1) / span) * 100}%` }}
                />
                <span
                  aria-hidden="true"
                  className="absolute top-1.5 h-2.5 rounded-pill bg-sky-600/30"
                  style={{ left: `${left}%`, width: `${Math.max(right - left, 0.6)}%` }}
                />
                {[loEnd, hiEnd].map((e, i) => (
                  <span
                    key={i}
                    aria-hidden="true"
                    className="absolute top-[7px] size-3 -translate-x-1/2 rounded-full border-2 border-surface bg-sky-600"
                    style={{ left: `${at(e.payback)}%` }}
                  />
                ))}
                <span aria-hidden="true" className="absolute top-0 h-5 w-0.5 -translate-x-1/2 bg-ink" style={{ left: `${at(now)}%` }} />
                {/* The fast end's years sit left of its dot, the slow end's right of its dot (inside when at an edge). */}
                <span
                  className="absolute top-5 text-footnote whitespace-nowrap text-ink-secondary tabular-nums"
                  style={left < 12 ? { left: `${left}%` } : { right: `${100 - left}%` }}
                >
                  {label(loEnd.payback)}
                </span>
                {right - left > 0.6 && (
                  <span
                    className="absolute top-5 text-footnote whitespace-nowrap text-ink-secondary tabular-nums"
                    style={right > 88 ? { right: `${100 - right}%` } : { left: `${right}%` }}
                  >
                    {label(hiEnd.payback)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-footnote text-ink-tertiary">
          <span>Years to pay back</span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-3 w-0.5 bg-ink" />
            Now: {label(now)}, with everything else as it is
          </span>
        </p>
      </div>
    </ChartSection>
  );
}
