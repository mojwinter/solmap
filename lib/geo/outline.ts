/**
 * The selected-roof frame: a rounded rectangle around the building's bounding box, as a polygon
 * path (Google Maps has no rounded Rectangle). Pure, so it runs in Node tests.
 */
import type { LatLngLiteral } from "@/src/types/app";
import { degreesPerMeter } from "./meters";

export interface Bounds {
  sw: LatLngLiteral;
  ne: LatLngLiteral;
}

/** Corner radius as a share of the box's shorter side, capped so big buildings don't look like pills. */
const RADIUS_SHARE = 0.15;
const MAX_RADIUS_METERS = 2.5;
/** Points per quarter-circle: smooth at roof zoom without bloating the path. */
const STEPS_PER_CORNER = 8;

export function roundedRectPath(bounds: Bounds, steps = STEPS_PER_CORNER): LatLngLiteral[] {
  const { sw, ne } = bounds;
  // One scale both ways, so the path lands exactly on the box's edges.
  const deg = degreesPerMeter((sw.lat + ne.lat) / 2);
  const width = (ne.lng - sw.lng) / deg.lng;
  const height = (ne.lat - sw.lat) / deg.lat;
  const r = Math.min(MAX_RADIUS_METERS, RADIUS_SHARE * Math.min(width, height));
  const toLatLng = (x: number, y: number): LatLngLiteral => ({ lat: sw.lat + y * deg.lat, lng: sw.lng + x * deg.lng });

  // Corner centres in metres east/north of the SW corner, counter-clockwise from NE.
  const corners: [number, number, number][] = [
    [width - r, height - r, 0],
    [r, height - r, 90],
    [r, r, 180],
    [width - r, r, 270],
  ];
  const path: LatLngLiteral[] = [];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= steps; i++) {
      const a = ((start + (90 * i) / steps) * Math.PI) / 180;
      path.push(toLatLng(cx + r * Math.cos(a), cy + r * Math.sin(a)));
    }
  }
  return path;
}
