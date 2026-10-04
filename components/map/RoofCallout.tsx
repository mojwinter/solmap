"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMap } from "@vis.gl/react-google-maps";
import { Icon } from "@/components/common/Icon";
import { TUNING } from "@/src/config/bc";
import type { BuildingResponse } from "@/src/types/app";

const fmt = new Intl.NumberFormat("en-CA");

const DESKTOP = "(min-width: 768px)";

/**
 * Space above the spotlit roof the callout needs, so fitBounds keeps it on screen below the search
 * box. Desktop: the two-line card + pointer sits above the edge. Phones (a short map strip): a
 * one-line pill straddles the edge, so only its top half needs room.
 */
export const roofCalloutSpace = () => (window.matchMedia(DESKTOP).matches ? 64 : 24);

/**
 * The roof's sun-hours, pinned to the middle of the top edge of the roof's spotlight cut-out (the
 * building box): a glass-thin card with a pointer down to the roof. Moves with the map (a Google OverlayView in the float pane) and lets
 * clicks through, so "click your roof" still works under it. Must render inside <Map>.
 */
export function RoofCallout({ building }: { building: BuildingResponse }) {
  const map = useMap();
  const sunHours = building.roof.maxSunshineHoursPerYear;
  const { ne, sw } = building.boundingBox;
  const anchor = useMemo(() => ({ lat: ne.lat, lng: (sw.lng + ne.lng) / 2 }), [ne.lat, sw.lng, ne.lng]);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!map) return;
    const div = document.createElement("div");
    div.style.position = "absolute";
    div.style.pointerEvents = "none";

    const overlay = new google.maps.OverlayView();
    // The card renders (through a portal) only while the overlay is on the map.
    overlay.onAdd = () => {
      overlay.getPanes()?.floatPane.appendChild(div);
      setContainer(div);
    };
    overlay.draw = () => {
      const point = overlay.getProjection()?.fromLatLngToDivPixel(anchor);
      if (!point) return;
      const desktop = window.matchMedia(DESKTOP).matches;
      div.style.left = `${point.x}px`;
      // Desktop: just above the edge. Phones: centred on the edge.
      div.style.top = `${desktop ? point.y - 8 : point.y}px`;
      div.style.transform = desktop ? "translate(-50%, -100%)" : "translate(-50%, -50%)";
    };
    overlay.onRemove = () => {
      div.remove();
      setContainer((c) => (c === div ? null : c));
    };
    overlay.setMap(map);
    return () => overlay.setMap(null);
  }, [map, anchor]);

  if (!container || !(sunHours > 0)) return null;
  const above = sunHours >= TUNING.bcReferenceSunHours;

  return createPortal(
    <div className="flex flex-col items-center motion-safe:animate-in motion-safe:fade-in motion-safe:duration-250">
      <div className="flex items-center gap-2 rounded-pill glass-thin py-1 pr-3 pl-1 whitespace-nowrap shadow-control md:gap-2.5 md:rounded-lg md:py-2 md:pr-4 md:pl-2">
        <span className="grid size-6 flex-none place-items-center rounded-pill bg-sun-500 text-on-sun-500 md:size-8 md:rounded-sm">
          <Icon name="sun" size={16} />
        </span>
        <span className="grid">
          <span className="font-rounded text-callout font-semibold tabular-nums md:text-headline">
            {fmt.format(Math.round(sunHours))} <span className="font-sans text-callout font-medium text-ink-secondary">sun-hours a year</span>
          </span>
          <span className="hidden text-footnote text-ink-secondary md:block">
            {above ? "Above" : "Below"} the BC typical ({fmt.format(TUNING.bcReferenceSunHours)})
          </span>
        </span>
      </div>
      {/* Pointer down to the roof (desktop, where the card sits above it). */}
      <span aria-hidden="true" className="-mt-px hidden size-0 border-x-8 border-t-8 border-x-transparent border-t-glass-thin md:block" />
    </div>,
    container,
  );
}
