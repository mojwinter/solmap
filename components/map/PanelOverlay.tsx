"use client";

import { useEffect, useRef } from "react";
import { useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { panelPolygon, type OffsetFn } from "@/lib/geo/panels";
import type { BuildingResponse } from "@/src/types/app";

// Low → high yearly energy. Same light-to-dark indigo ramp as Google's sample (colors.ts, panelsPalette).
const LOW = [0xe8, 0xea, 0xf6];
const HIGH = [0x1a, 0x23, 0x7e];

function energyColor(t: number): string {
  const rgb = LOW.map((lo, i) => Math.round(lo + (HIGH[i] - lo) * t));
  return `rgb(${rgb.join(",")})`;
}

interface Props {
  /** Polygons are rebuilt when this object changes, so keep it referentially stable (state, not re-parsed per render). */
  building: BuildingResponse;
  /** Draw the best `visibleCount` panels (panels are best-first, so this is config.panelsCount). */
  visibleCount: number;
}

/**
 * Every panel of the building as a map polygon. Polygons are built once per building and the
 * count only toggles setMap, so dragging a size slider stays fast with 100+ panels.
 */
export function PanelOverlay({ building, visibleCount }: Props) {
  const map = useMap();
  const maps = useMapsLibrary("maps");
  const geometry = useMapsLibrary("geometry");
  const polygons = useRef<google.maps.Polygon[]>([]);

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

    polygons.current = building.panels.map(
      (panel) =>
        new maps.Polygon({
          paths: panelPolygon(panel, building.segments, dims, computeOffset),
          fillColor: energyColor((panel.yearlyEnergyDcKwh - min) / range),
          fillOpacity: 0.9,
          strokeColor: "#b0bec5",
          strokeWeight: 1,
          clickable: false,
        }),
    );
    return () => {
      polygons.current.forEach((p) => p.setMap(null));
      polygons.current = [];
    };
  }, [maps, geometry, building]);

  useEffect(() => {
    polygons.current.forEach((p, i) => p.setMap(i < visibleCount ? map : null));
  }, [map, maps, geometry, building, visibleCount]);

  return null;
}
