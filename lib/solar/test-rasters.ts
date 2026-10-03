/**
 * Test helper (imported only by *.test.ts): GeoTIFFs shaped like Data Layers rasters, i.e. UTM zone 10N
 * (EPSG:32610, Vancouver), north-up, square pixels. Synthetic, not Google content.
 */
import { deflateSync } from "node:zlib";
import { writeArrayBuffer } from "geotiff";
import proj4 from "proj4";

export const UTM10 = "+proj=utm +zone=10 +datum=WGS84 +units=m +no_defs";

export interface TestRasterSpec {
  /** Centre of the raster. */
  lat: number;
  lng: number;
  width: number;
  height: number;
  pixelMeters: number;
}

/** UTM corner (north-west) of a raster centred on lat/lng. */
export function utmOrigin(s: TestRasterSpec) {
  const [e, n] = proj4("WGS84", UTM10).forward([s.lng, s.lat]);
  return { west: e - (s.width * s.pixelMeters) / 2, north: n + (s.height * s.pixelMeters) / 2 };
}

export function makeGeoTiff(s: TestRasterSpec, values: Float32Array | Uint8Array): Uint8Array {
  const { west, north } = utmOrigin(s);
  const buf = writeArrayBuffer(values, {
    width: s.width,
    height: s.height,
    ModelPixelScale: [s.pixelMeters, s.pixelMeters, 0],
    ModelTiepoint: [0, 0, 0, west, north, 0],
    GTModelTypeGeoKey: 1, // projected
    GTRasterTypeGeoKey: 1, // pixel is area
    ProjectedCSTypeGeoKey: 32610,
  } as Parameters<typeof writeArrayBuffer>[1]);
  return new Uint8Array(buf);
}

/**
 * Re-encodes a single-strip TIFF from makeGeoTiff with DEFLATE (Compression = 8), as real rasters may be:
 * the compressed strip is appended and the Compression / StripOffsets / StripByteCounts tags repointed.
 */
export function deflateGeoTiff(tiff: Uint8Array): Uint8Array {
  const dv = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const le = tiff[0] === 0x49;
  const u16 = (o: number) => dv.getUint16(o, le);
  const u32 = (o: number) => dv.getUint32(o, le);
  const ifd = u32(4);
  const tags = new Map<number, number>(); // tag → offset of its value field
  for (let i = 0; i < u16(ifd); i++) tags.set(u16(ifd + 2 + i * 12), ifd + 2 + i * 12 + 8);
  const value = (tag: number) => {
    const at = tags.get(tag)!;
    return u16(at - 6) === 3 ? u16(at) : u32(at); // SHORT or LONG, count 1
  };
  const strip = tiff.subarray(value(273), value(273) + value(279));
  const packed = new Uint8Array(deflateSync(strip));
  const out = new Uint8Array(tiff.byteLength + packed.byteLength);
  out.set(tiff);
  out.set(packed, tiff.byteLength);
  const odv = new DataView(out.buffer);
  const put = (tag: number, v: number) => {
    const at = tags.get(tag)!;
    if (u16(at - 6) === 3) odv.setUint16(at, v, le);
    else odv.setUint32(at, v, le);
  };
  put(259, 8);
  put(273, tiff.byteLength);
  put(279, packed.byteLength);
  return out;
}

/** A flux raster (left half `lo`, right half `hi`) and a mask with a roof rectangle in the middle. */
export function makeLayerPair(s: TestRasterSpec, lo = 500, hi = 1300) {
  const flux = new Float32Array(s.width * s.height);
  const mask = new Uint8Array(s.width * s.height);
  for (let y = 0; y < s.height; y++) {
    for (let x = 0; x < s.width; x++) {
      flux[y * s.width + x] = x < s.width / 2 ? lo : hi;
      const roof = x >= s.width / 4 && x < (3 * s.width) / 4 && y >= s.height / 4 && y < (3 * s.height) / 4;
      mask[y * s.width + x] = roof ? 1 : 0;
    }
  }
  flux[0] = -9999; // no-data corner
  return { flux: makeGeoTiff(s, flux), mask: makeGeoTiff(s, mask) };
}
