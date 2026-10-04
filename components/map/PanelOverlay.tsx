"use client";

import { useEffect, useRef } from "react";
import { useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { panelColors, panelPolygon, type OffsetFn } from "@/lib/geo/panels";
import type { BuildingResponse } from "@/src/types/app";

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
    // Styled like Google's js-solar-potential sample (BuildingInsightsSection.svelte): see panelColors.
    const colors = panelColors(building.panels);
    polygons.current = building.panels.map(
      (panel, i) =>
        new maps.Polygon({
          paths: panelPolygon(panel, building.segments, dims, computeOffset),
          fillColor: colors[i],
          fillOpacity: 0.9,
          strokeColor: "#B0BEC5",
          strokeOpacity: 0.9,
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
