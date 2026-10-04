"use client";

import { useEffect, useRef, useState } from "react";
import { panelEnergyRange, panelGradient } from "@/lib/geo/panels";
import type { BuildingResponse } from "@/src/types/app";
import { useSolarMap } from "./SolarMap";

const fmt = new Intl.NumberFormat("en-CA");
/** Gap between the search card and the phone pill below it. */
const PILL_GAP = 8;

/**
 * What the panel shades mean: darker = more energy (the ramp panelColors() paints, Google's
 * panelsPalette). Render inside <SolarMap> next to <MapControls />. Shows only while panels are
 * drawn: not in Sun mode (the sun map has its own legend), while loading, or with no panels.
 *
 * Desktop: a slim vertical bar floating just left of the results card, top-aligned with it. The
 * offset follows ReportLayout's card (right-6 + w-[440px]) plus a 16px gap; keep them in step.
 * Phones: a small "Less → More" pill just under the search box (measured, since its height varies).
 */
export function PanelLegend({ building }: { building: BuildingResponse | null }) {
  const { layer } = useSolarMap();
  const range = building ? panelEnergyRange(building.panels) : null;
  const show = range !== null && layer !== "sun";
  const pill = useRef<HTMLDivElement>(null);
  const [pillTop, setPillTop] = useState<number | null>(null);

  // Keep the phone pill just under the search card (AddressSearch marks itself data-map-inset="top").
  useEffect(() => {
    const el = pill.current;
    const parent = el?.offsetParent;
    const search = document.querySelector<HTMLElement>('[data-map-inset="top"]:not([data-panel-legend])');
    if (!show || !el || !(parent instanceof HTMLElement) || !search) return;
    // ResizeObserver also fires once on observe, so this places the pill straight away.
    const observer = new ResizeObserver(() => {
      setPillTop(Math.max(PILL_GAP, search.getBoundingClientRect().bottom - parent.getBoundingClientRect().top + PILL_GAP));
    });
    observer.observe(search);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [show]);

  if (!show || !range) return null;

  const label = `Panel colours: darker panels make more energy, from ${fmt.format(range.min)} to ${fmt.format(
    range.max,
  )} kWh a year each`;

  return (
    <>
      <div
        role="img"
        aria-label={label}
        data-map-inset="right"
        data-panel-legend
        className="pointer-events-none absolute top-6 right-[480px] hidden w-[104px] flex-col items-center gap-1.5 rounded-lg glass-thin px-2 py-3 text-center md:flex motion-safe:animate-in motion-safe:fade-in motion-safe:duration-250"
      >
        <span className="text-footnote text-ink-secondary">More energy</span>
        <span className="font-rounded text-callout font-semibold text-ink tabular-nums">{fmt.format(range.max)}</span>
        <span className="h-40 w-2.5 rounded-pill" style={{ backgroundImage: panelGradient("to top") }} />
        <span className="font-rounded text-callout font-semibold text-ink tabular-nums">{fmt.format(range.min)}</span>
        <span className="text-footnote text-ink-secondary">Less</span>
        <span className="text-footnote text-ink-tertiary">kWh/yr per panel</span>
      </div>
      <div
        ref={pill}
        role="img"
        aria-label={label}
        data-map-inset="top"
        data-panel-legend
        style={{ top: pillTop ?? 72 }}
        className="pointer-events-none absolute right-4 flex items-center gap-1.5 rounded-pill glass-thin px-2.5 py-1 text-footnote text-ink-secondary md:hidden"
      >
        Less
        <span className="h-1.5 w-12 rounded-pill" style={{ backgroundImage: panelGradient("to right") }} />
        More
      </div>
    </>
  );
}
