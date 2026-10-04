"use client";

import { useEffect } from "react";
import { useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import type { SolarLayersResponse } from "@/src/types/app";

/**
 * The annual sun-flux heatmap for one roof: B's same-origin PNG (/api/solar/heatmap) laid on the
 * map with GroundOverlay (DESIGN.md §6). Removed when unmounted or when the layers change.
 */
export function FluxOverlay({ layers }: { layers: SolarLayersResponse }) {
  const map = useMap();
  const maps = useMapsLibrary("maps");
  const { heatmapUrl } = layers;
  const { sw, ne } = layers.bounds;

  useEffect(() => {
    if (!map || !maps) return;
    const overlay = new maps.GroundOverlay(
      heatmapUrl,
      { south: sw.lat, west: sw.lng, north: ne.lat, east: ne.lng },
      { opacity: 0.85, clickable: false },
    );
    overlay.setMap(map);
    return () => overlay.setMap(null);
  }, [map, maps, heatmapUrl, sw.lat, sw.lng, ne.lat, ne.lng]);

  return null;
}
