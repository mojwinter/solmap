"use client";

import { useEffect } from "react";
import { APIProvider, Map, useMap } from "@vis.gl/react-google-maps";
import type { BuildingResponse } from "@/src/types/app";
import { PanelOverlay } from "./PanelOverlay";

const API_KEY = process.env.NEXT_PUBLIC_MAPS_API_KEY ?? "";
const MAP_ID = process.env.NEXT_PUBLIC_MAP_ID || undefined;

interface Props {
  building: BuildingResponse;
  /** How many of the best panels to draw. */
  visibleCount: number;
  /** Sizes the map itself (give it a height); the attribution line sits below it. */
  className?: string;
}

/** Satellite map fitted to the building, with its panels drawn on top. */
export function SolarMap({ building, visibleCount, className }: Props) {
  return (
    <div>
      <APIProvider apiKey={API_KEY}>
        <Map
          className={className}
          mapId={MAP_ID}
          defaultCenter={building.center}
          defaultZoom={20}
          mapTypeId="satellite"
          tilt={0}
          // The map sits in a scrolling page: plain scroll wheel scrolls the page, ctrl+scroll zooms.
          gestureHandling="cooperative"
          streetViewControl={false}
          mapTypeControl={false}
        >
          <FitBuilding bounds={building.boundingBox} />
          <PanelOverlay building={building} visibleCount={visibleCount} />
        </Map>
      </APIProvider>
      <p className="mt-1 text-xs text-zinc-500">
        {ATTRIBUTION[building.source]}
        {!API_KEY &&
          process.env.NODE_ENV !== "production" &&
          " · No NEXT_PUBLIC_MAPS_API_KEY set: Google shows the map in development mode."}
      </p>
    </div>
  );
}

// CLAUDE.md rule 3: Google's attribution wherever their Solar data is shown (live and cache only).
const ATTRIBUTION: Record<BuildingResponse["source"], string> = {
  live: "Source: Includes solar data from Google",
  cache: "Source: Includes solar data from Google",
  fixture: "Synthetic roof for development (not Google data).",
  manual: "Estimate from your inputs (no solar data for this roof).",
};

/** Re-fit the camera when the bounds change (a new address keeps the same map instance). */
function FitBuilding({ bounds }: { bounds: BuildingResponse["boundingBox"] }) {
  const map = useMap();
  const { sw, ne } = bounds;
  useEffect(() => {
    if (!map) return;
    const fit = () => map.fitBounds({ south: sw.lat, west: sw.lng, north: ne.lat, east: ne.lng }, 40);
    const div = map.getDiv();
    const hasSize = () => div.offsetWidth > 0 && div.offsetHeight > 0;
    if (hasSize()) {
      fit();
      return;
    }
    // fitBounds on a hidden (0×0) map zooms out to city level, so wait until it's laid out
    // (a collapsed section or tab that opens later).
    const observer = new ResizeObserver(() => {
      if (!hasSize()) return;
      observer.disconnect();
      fit();
    });
    observer.observe(div);
    return () => observer.disconnect();
  }, [map, sw.lat, sw.lng, ne.lat, ne.lng]);
  return null;
}
