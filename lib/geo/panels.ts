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

// Google's reference rendering (js-solar-potential, colors.ts panelsPalette): a light → dark blue
// ramp by yearly energy, so every panel is visible and the most productive ones are the darkest.
const LEAST = [0xe8, 0xea, 0xf6]; // #E8EAF6
const MOST = [0x1a, 0x23, 0x7e]; // #1A237E
const rgb = (c: number[]) => `rgb(${c.join(",")})`;

/** The panel ramp's ends, the same colours panelColors() paints, for legends. */
export const PANEL_LEAST = rgb(LEAST);
export const PANEL_MOST = rgb(MOST);

/** CSS gradient of the panel ramp; "to top" puts the most productive (darkest) at the top. */
export function panelGradient(direction: "to top" | "to right"): string {
  return `linear-gradient(${direction}, ${PANEL_LEAST}, ${PANEL_MOST})`;
}

/** The lowest and highest panel output on the roof (kWh/yr per panel), or null with no panels. */
export function panelEnergyRange(panels: Pick<PanelLite, "yearlyEnergyDcKwh">[]): { min: number; max: number } | null {
  if (panels.length === 0) return null;
  const energies = panels.map((p) => p.yearlyEnergyDcKwh);
  return { min: Math.min(...energies), max: Math.max(...energies) };
}

/**
 * One fill colour per panel, same order. Normalised over all of the roof's panels (not just the
 * visible ones), so resizing the system never recolours a panel. Equal energies → all lightest.
 */
export function panelColors(panels: Pick<PanelLite, "yearlyEnergyDcKwh">[]): string[] {
  if (panels.length === 0) return [];
  const energies = panels.map((p) => p.yearlyEnergyDcKwh);
  const min = Math.min(...energies);
  const range = Math.max(...energies) - min || 1;
  return energies.map((e) => {
    const t = (e - min) / range;
    return rgb(LEAST.map((lo, i) => Math.round(lo + (MOST[i] - lo) * t)));
  });
}
