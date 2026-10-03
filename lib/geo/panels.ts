/**
 * Panel centre + segment azimuth → the 4 polygon corners to draw on the map.
 * Pure: no React, no fetch, and no `google` global touched at import time, so it runs in Node tests.
 * Maths from docs/SOLAR_API.md → "Drawing a panel", plus pitch foreshortening (same doc, Prior art).
 */
import type { LatLngLiteral, PanelLite, SegmentLite } from "@/src/types/app";

/** Point `distanceMeters` away from `from` along `headingDegrees` (0 = north, clockwise). */
export type OffsetFn = (
  from: LatLngLiteral,
  distanceMeters: number,
  headingDegrees: number,
) => LatLngLiteral;

export interface PanelDims {
  widthMeters: number;
  heightMeters: number;
}

/** google.maps.geometry.spherical.computeOffset, looked up when called (needs the `geometry` library). */
const googleComputeOffset: OffsetFn = (from, distanceMeters, headingDegrees) => {
  const spherical = (globalThis as { google?: typeof google }).google?.maps?.geometry?.spherical;
  if (!spherical?.computeOffset) {
    throw new Error(
      "panelPolygon: google.maps.geometry is not loaded. Load the Maps 'geometry' library or pass computeOffset.",
    );
  }
  const p = spherical.computeOffset(from, distanceMeters, headingDegrees);
  return { lat: p.lat(), lng: p.lng() };
};

const toDegrees = (radians: number) => (radians * 180) / Math.PI;
const normalizeHeading = (deg: number) => ((deg % 360) + 360) % 360;

export function panelPolygon(
  panel: PanelLite,
  segments: SegmentLite[],
  panelDims: PanelDims,
  computeOffset: OffsetFn = googleComputeOffset,
): LatLngLiteral[] {
  const segment = segments[panel.segmentIndex];
  if (!segment) {
    throw new Error(
      `panelPolygon: segmentIndex ${panel.segmentIndex} not found (building has ${segments.length} segments)`,
    );
  }

  const halfW = panelDims.widthMeters / 2;
  const halfH = panelDims.heightMeters / 2;
  const [w, slopeH] = panel.landscape ? [halfH, halfW] : [halfW, halfH];
  // y runs downslope. Seen from above, a tilted panel is shorter by cos(pitch) in that direction
  // (≈13% on a 30° roof); without this, rows on a pitched roof overlap on the map.
  const h = slopeH * Math.cos((segment.pitchDegrees * Math.PI) / 180);
  const azimuth = segment.azimuthDegrees;
  const center = { lat: panel.lat, lng: panel.lng };

  const corners: [number, number][] = [
    [w, h],
    [w, -h],
    [-w, -h],
    [-w, h],
  ];
  return corners.map(([x, y]) => {
    const heading = normalizeHeading(toDegrees(Math.atan2(x, y)) + azimuth);
    const point = computeOffset(center, Math.hypot(x, y), heading);
    return { lat: point.lat, lng: point.lng };
  });
}
