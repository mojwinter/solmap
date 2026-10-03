/**
 * Fake annual-flux + mask grids for the synthetic roofs, so SOLAR_SOURCE=fixtures has a heatmap to
 * show without Google. Built from the roof's own segments: the mask is each segment's bbox, and flux
 * walks that segment's sunshineQuantiles (darker at the edges, a gentle ripple across), so a south
 * face is bright, a north face dark, and shaded-gable looks shaded. Not Google content; never cached.
 */
import type { LatLngBounds } from "@/src/types/app";
import type { Grid } from "./raster";
import type { SolarBuilding } from "./schema";

export const SYNTHETIC_PIXEL_M = 0.25;
const MARGIN_M = 2;
const M_PER_DEG_LAT = 111_195;

export function syntheticLayers(b: SolarBuilding): { flux: Grid; mask: Grid; bounds: LatLngBounds } {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((b.center.latitude * Math.PI) / 180);
  const bounds: LatLngBounds = {
    sw: { lat: b.boundingBox.sw.latitude - MARGIN_M / M_PER_DEG_LAT, lng: b.boundingBox.sw.longitude - MARGIN_M / mPerDegLng },
    ne: { lat: b.boundingBox.ne.latitude + MARGIN_M / M_PER_DEG_LAT, lng: b.boundingBox.ne.longitude + MARGIN_M / mPerDegLng },
  };
  const width = Math.max(1, Math.round(((bounds.ne.lng - bounds.sw.lng) * mPerDegLng) / SYNTHETIC_PIXEL_M));
  const height = Math.max(1, Math.round(((bounds.ne.lat - bounds.sw.lat) * M_PER_DEG_LAT) / SYNTHETIC_PIXEL_M));
  const flux = new Float32Array(width * height).fill(-9999);
  const mask = new Uint8Array(width * height);
  const segments = b.solarPotential.roofSegmentStats;

  for (let y = 0; y < height; y++) {
    const lat = bounds.ne.lat - ((y + 0.5) / height) * (bounds.ne.lat - bounds.sw.lat); // row 0 = north
    for (let x = 0; x < width; x++) {
      const lng = bounds.sw.lng + ((x + 0.5) / width) * (bounds.ne.lng - bounds.sw.lng);
      const seg = segments.find(
        (s) =>
          lat >= s.boundingBox.sw.latitude &&
          lat <= s.boundingBox.ne.latitude &&
          lng >= s.boundingBox.sw.longitude &&
          lng <= s.boundingBox.ne.longitude,
      );
      if (!seg) continue;
      const u = (lng - seg.boundingBox.sw.longitude) / (seg.boundingBox.ne.longitude - seg.boundingBox.sw.longitude || 1);
      const v = (lat - seg.boundingBox.sw.latitude) / (seg.boundingBox.ne.latitude - seg.boundingBox.sw.latitude || 1);
      const edge = Math.min(u, 1 - u, v, 1 - v) * 2; // 0 at the segment's edge, 1 in the middle
      const t = Math.min(1, Math.max(0, Math.sqrt(edge) * (0.88 + 0.12 * Math.sin(9 * u + 5 * v))));
      mask[y * width + x] = 1;
      flux[y * width + x] = quantileAt(seg.stats.sunshineQuantiles, t);
    }
  }
  return { flux: { width, height, values: flux }, mask: { width, height, values: mask }, bounds };
}

/** Linear interpolation through 11 quantiles (min → max) at t ∈ [0, 1]. */
function quantileAt(q: number[], t: number): number {
  if (q.length === 0) return -9999;
  const pos = t * (q.length - 1);
  const lo = Math.min(Math.floor(pos), q.length - 2);
  return lo < 0 ? q[0] : q[lo] + (q[lo + 1] - q[lo]) * (pos - lo);
}
