"use client";

import { useEffect, useRef } from "react";
import { useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { panelPolygon, type OffsetFn } from "@/lib/geo/panels";
import type { BuildingResponse } from "@/src/types/app";
import { token } from "./tokens";

// DESIGN.md §4: dark blue panels, thin light stroke; opacity encodes yearly energy (brighter = more productive).
const MIN_OPACITY = 0.45;
const MAX_OPACITY = 0.95;

interface Props {
  /** Polygons are rebuilt when this object changes, so keep it referentially stable (state, not re-parsed per render). */
  building: BuildingResponse;
  /** Draw the best `visibleCount` panels (panels are best-first, so this is config.panelsCount). */
  visibleCount: number;
}

/**
 * Every panel of the building as a map polygon. Polygons are built once per building and a new
 * count only toggles the panels between the old and new count, so a size slider stays well under
 * 16 ms per step even with 100+ panels (docs/SOLAR_API.md, Gotcha 5).
 */
export function PanelOverlay({ building, visibleCount }: Props) {
  const map = useMap();
  const maps = useMapsLibrary("maps");
  const geometry = useMapsLibrary("geometry");
  const polygons = useRef<google.maps.Polygon[]>([]);
  /** How many polygons are on the map right now. Panels are best-first, so it's always the first N. */
  const shown = useRef(0);

  useEffect(() => {
    if (!maps || !geometry) return;
    const computeOffset: OffsetFn = (from, distance, heading) => {
      const p = geometry.spherical.computeOffset(from, distance, heading);
      return { lat: p.lat(), lng: p.lng() };
    };
    const dims = { widthMeters: building.panel.widthMeters, heightMeters: building.panel.heightMeters };
    const energies = building.panels.map((p) => p.yearlyEnergyDcKwh);
    const min = Math.min(...energies);
    const range = Math.max(...energies) - min || 1;

    // Opacity is normalised over all of the roof's panels, so resizing never changes a panel's shade.
    const fill = token("--sky-700");
    polygons.current = building.panels.map(
      (panel) =>
        new maps.Polygon({
          paths: panelPolygon(panel, building.segments, dims, computeOffset),
          fillColor: fill,
          fillOpacity: MIN_OPACITY + ((panel.yearlyEnergyDcKwh - min) / range) * (MAX_OPACITY - MIN_OPACITY),
          strokeColor: "#ffffff",
          strokeOpacity: 0.7,
          strokeWeight: 1,
          clickable: false,
        }),
    );
    shown.current = 0;
    return () => {
      polygons.current.forEach((p) => p.setMap(null));
      polygons.current = [];
      shown.current = 0;
    };
  }, [maps, geometry, building]);

  useEffect(() => {
    if (!map) return;
    const all = polygons.current;
    const next = Math.max(0, Math.min(visibleCount, all.length));
    for (let i = shown.current; i < next; i++) all[i].setMap(map);
    for (let i = next; i < shown.current; i++) all[i].setMap(null);
    shown.current = next;
  }, [map, maps, geometry, building, visibleCount]);

  return null;
}
