"use client";

import { useEffect, useRef } from "react";
import { useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import type { SolarLayersResponse } from "@/src/types/app";
import { tween } from "./fade";

const OPACITY = 0.85;

/**
 * The annual sun-flux heatmap for one roof: B's same-origin PNG (/api/solar/heatmap) laid on the
 * map with GroundOverlay (DESIGN.md §6). It stays mounted once loaded and fades in or out with
 * `visible`, so switching Satellite ⇄ Sun exposure crossfades with the panels instead of jumping.
 */
export function FluxOverlay({ layers, visible }: { layers: SolarLayersResponse; visible: boolean }) {
  const map = useMap();
  const maps = useMapsLibrary("maps");
  const overlay = useRef<google.maps.GroundOverlay | null>(null);
  const opacity = useRef(0);
  const { heatmapUrl } = layers;
  const { sw, ne } = layers.bounds;

  useEffect(() => {
    if (!map || !maps) return;
    // Starts invisible; the effect below fades it in.
    opacity.current = 0;
    const o = new maps.GroundOverlay(
      heatmapUrl,
      { south: sw.lat, west: sw.lng, north: ne.lat, east: ne.lng },
      { opacity: 0, clickable: false },
    );
    o.setMap(map);
    overlay.current = o;
    return () => {
      o.setMap(null);
      overlay.current = null;
    };
  }, [map, maps, heatmapUrl, sw.lat, sw.lng, ne.lat, ne.lng]);

  useEffect(() => {
    const o = overlay.current;
    if (!o) return;
    const from = opacity.current;
    const to = visible ? OPACITY : 0;
    if (from === to) return;
    return tween((t) => {
      opacity.current = from + (to - from) * t;
      o.setOpacity(opacity.current);
    });
  }, [visible, map, maps, heatmapUrl, sw.lat, sw.lng, ne.lat, ne.lng]);

  return null;
}
