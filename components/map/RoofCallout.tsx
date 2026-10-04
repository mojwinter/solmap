"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMap } from "@vis.gl/react-google-maps";
import { Icon } from "@/components/common/Icon";
import type { BuildingResponse } from "@/src/types/app";

const fmt = new Intl.NumberFormat("en-CA");

const DESKTOP = "(min-width: 768px)";

/**
 * Space above the spotlit roof the callout needs, so fitBounds keeps it on screen below the search
 * box. Desktop: the card sits above the edge. Phones (a short map strip): the pill straddles the
 * edge, so only its top half needs room.
 */
export const roofCalloutSpace = () => (window.matchMedia(DESKTOP).matches ? 68 : 28);

/**
 * The roof's sun-hours, pinned to the middle of the top edge of the roof's spotlight cut-out (the
 * building box): a glass-thin card sitting just above the roof. Moves with the map (a Google OverlayView in the float pane) and lets
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

  return createPortal(
    <div className="flex items-center gap-2 rounded-pill glass-thin py-1 pr-4 pl-1 whitespace-nowrap shadow-control motion-safe:animate-in motion-safe:fade-in motion-safe:duration-250 md:gap-3 md:rounded-lg md:py-2.5 md:pr-5 md:pl-2.5">
      <span className="grid size-8 flex-none place-items-center rounded-pill bg-sun-500 text-on-sun-500 md:size-11 md:rounded-sm">
        <Icon name="sun" size={20} className="md:size-7" />
      </span>
      <span className="font-rounded text-metric font-bold tabular-nums md:text-title md:font-bold">
        {fmt.format(Math.round(sunHours))}{" "}
        <span className="font-sans text-headline font-semibold text-ink-secondary md:text-metric md:font-semibold">sun-hours a year</span>
      </span>
    </div>,
    container,
  );
}
