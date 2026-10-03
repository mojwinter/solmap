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
          gestureHandling="greedy"
          streetViewControl={false}
          mapTypeControl={false}
        >
          <FitBuilding building={building} />
          <PanelOverlay building={building} visibleCount={visibleCount} />
        </Map>
      </APIProvider>
      <p className="mt-1 text-xs text-zinc-500">
        {building.source === "fixture"
          ? "Synthetic roof for development (not Google data)."
          : "Source: Includes solar data from Google"}
        {!API_KEY && " · No NEXT_PUBLIC_MAPS_API_KEY set: Google shows the map in development mode."}
      </p>
    </div>
  );
}

/** Re-fit the camera whenever the building changes (a new address keeps the same map instance). */
function FitBuilding({ building }: { building: BuildingResponse }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const { sw, ne } = building.boundingBox;
    map.fitBounds({ south: sw.lat, west: sw.lng, north: ne.lat, east: ne.lng }, 40);
  }, [map, building]);
  return null;
}
