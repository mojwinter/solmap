/**
 * Data Layers GeoTIFFs → a coloured, roof-masked PNG plus its lat/lng bounds, so the map only needs a
 * google.maps.GroundOverlay. Pure: no fetch, no env, no key.
 *
 * Decoding, reprojection and the colour ramp follow Google's js-solar-potential sample
 * (https://github.com/googlemaps-samples/js-solar-potential, Apache-2.0: solar.ts downloadGeoTIFF,
 * visualize.ts renderPalette/createPalette, colors.ts ironPalette), moved server-side with pngjs
 * in place of a canvas.
 */
import { fromArrayBuffer } from "geotiff";
import { toProj4 } from "geotiff-geokeys-to-proj4";
import { PNG } from "pngjs";
import proj4 from "proj4";
import type { LatLngBounds } from "@/src/types/app";

/** One band of values, row-major from the north-west corner. */
export interface Grid {
  width: number;
  height: number;
  values: ArrayLike<number>;
}

export interface Raster extends Grid {
  bounds: LatLngBounds;
}

/**
 * Fixed colour scale for annual flux (kWh per kW per year), the same for every roof so two roofs can be
 * compared. Google's sample uses 0–1800, which squeezes BC roofs (~600–1,300) into the middle colours.
 * Provisional until we've seen a real BC roof's histogram.
 */
export const FLUX_SCALE = { min: 400, max: 1400, unit: "kWh/kW/yr" } as const;

/** Google's sample "iron" ramp: dark = shady, white-yellow = sunny. */
export const IRON_PALETTE = ["00000A", "91009C", "E64616", "FEB400", "FFFFF6"];

/** Data Layers marks pixels outside the analysis with a large negative value (e.g. -9999). */
const isValid = (v: number) => Number.isFinite(v) && v > -1000;

/** First band + lat/lng bounds of a GeoTIFF (Data Layers rasters are in a projected CRS, UTM in practice). */
export async function decodeGeoTiff(bytes: Uint8Array): Promise<Raster> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const image = await (await fromArrayBuffer(buffer)).getImage();
  const [band] = await image.readRasters({ samples: [0] });
  if (typeof band === "number") throw new Error("GeoTIFF band is not an array");

  const geoKeys = image.getGeoKeys();
  if (!geoKeys) throw new Error("GeoTIFF has no GeoKeys");
  const crs = toProj4(geoKeys as Parameters<typeof toProj4>[0]);
  if (Object.keys(crs.errors).length) throw new Error(`GeoTIFF CRS not understood: ${JSON.stringify(crs.errors)}`);
  const toWgs84 = proj4(crs.proj4, "WGS84");
  const [x0, y0, x1, y1] = image.getBoundingBox();
  const corner = (x: number, y: number) => {
    const c = crs.convertCoordinates({ x, y });
    return toWgs84.forward({ x: c.x, y: c.y });
  };
  const sw = corner(x0, y0);
  const ne = corner(x1, y1);

  return {
    width: image.getWidth(),
    height: image.getHeight(),
    values: band,
    bounds: { sw: { lat: sw.y, lng: sw.x }, ne: { lat: ne.y, lng: ne.x } },
  };
}

/** 256 RGB entries linearly interpolated through the hex stops (like the sample's createPalette). */
export function buildPalette(hexStops: string[]): Uint8Array {
  const stops = hexStops.map((h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)));
  const out = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const pos = (i / 255) * (stops.length - 1);
    const lo = Math.min(Math.floor(pos), stops.length - 2);
    const t = pos - lo;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.round(stops[lo][c] + (stops[lo + 1][c] - stops[lo][c]) * t);
  }
  return out;
}

const IRON = buildPalette(IRON_PALETTE);

/**
 * Colours `flux` on `scale`, transparent wherever `mask` is 0 or flux has no data. The output has the
 * mask's size; flux is sampled nearest-neighbour if its size differs (as in the sample's renderRGB).
 */
export function renderHeatmap(flux: Grid, mask: Grid, scale: { min: number; max: number } = FLUX_SCALE): Buffer {
  const { width, height } = mask;
  const png = new PNG({ width, height });
  const dx = flux.width / width;
  const dy = flux.height / height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = flux.values[Math.floor(y * dy) * flux.width + Math.floor(x * dx)];
      const o = (y * width + x) * 4;
      if (!mask.values[y * width + x] || !isValid(v)) {
        png.data[o + 3] = 0;
        continue;
      }
      const t = Math.min(1, Math.max(0, (v - scale.min) / (scale.max - scale.min)));
      const p = Math.round(t * 255) * 3;
      png.data[o] = IRON[p];
      png.data[o + 1] = IRON[p + 1];
      png.data[o + 2] = IRON[p + 2];
      png.data[o + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

/** True if any pixel is roof. A heatmap with no roof pixels is a 404, not a blank image. */
export const hasRoof = (mask: Grid) => Array.prototype.some.call(mask.values, (v: number) => v > 0);
