import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { buildPalette, decodeGeoTiff, FLUX_SCALE, hasRoof, IRON_PALETTE, renderHeatmap } from "./raster";
import { deflateGeoTiff, makeLayerPair } from "./test-rasters";

const spec = { lat: 49.25, lng: -123.15, width: 40, height: 32, pixelMeters: 0.25 }; // 10 m × 8 m

describe("decodeGeoTiff", () => {
  it("reads band 0 and reprojects the UTM bounds to lat/lng", async () => {
    const { flux, mask } = makeLayerPair(spec);
    const r = await decodeGeoTiff(flux);
    expect([r.width, r.height]).toEqual([40, 32]);
    expect(r.values[1]).toBe(500);
    expect(r.values[39]).toBe(1300);
    expect(r.values[0]).toBe(-9999);

    // 10 m wide, 8 m tall, centred on the spec point
    const midLat = (r.bounds.sw.lat + r.bounds.ne.lat) / 2;
    const midLng = (r.bounds.sw.lng + r.bounds.ne.lng) / 2;
    expect(midLat).toBeCloseTo(49.25, 5);
    expect(midLng).toBeCloseTo(-123.15, 5);
    expect((r.bounds.ne.lat - r.bounds.sw.lat) * 111_195).toBeCloseTo(8, 0);
    expect((r.bounds.ne.lng - r.bounds.sw.lng) * 111_195 * Math.cos((49.25 * Math.PI) / 180)).toBeCloseTo(10, 0);

    const m = await decodeGeoTiff(mask);
    expect(m.bounds).toEqual(r.bounds);
    expect(hasRoof(m)).toBe(true);
  });
});

describe("renderHeatmap", () => {
  it("colours roof pixels on the fixed scale and leaves the rest transparent", async () => {
    const { flux, mask } = makeLayerPair(spec, FLUX_SCALE.min, FLUX_SCALE.max);
    const png = PNG.sync.read(renderHeatmap(await decodeGeoTiff(flux), await decodeGeoTiff(mask)));
    expect([png.width, png.height]).toEqual([40, 32]);
    const px = (x: number, y: number) => [...png.data.subarray((y * 40 + x) * 4, (y * 40 + x) * 4 + 4)];
    const palette = buildPalette(IRON_PALETTE);

    expect(px(0, 0)[3]).toBe(0); // off the roof
    expect(px(12, 16)).toEqual([palette[0], palette[1], palette[2], 255]); // shady half → first colour
    expect(px(28, 16)).toEqual([palette[765], palette[766], palette[767], 255]); // sunny half → last colour
  });

  it("samples a flux raster of a different size onto the mask grid", () => {
    const flux = { width: 2, height: 1, values: [400, 1400] };
    const mask = { width: 4, height: 2, values: new Uint8Array(8).fill(1) };
    const png = PNG.sync.read(renderHeatmap(flux, mask));
    expect([png.width, png.height]).toEqual([4, 2]);
    expect(png.data[3]).toBe(255);
  });

  it("palette goes from the first to the last stop", () => {
    const p = buildPalette(IRON_PALETTE);
    expect([...p.subarray(0, 3)]).toEqual([0x00, 0x00, 0x0a]);
    expect([...p.subarray(765)]).toEqual([0xff, 0xff, 0xf6]);
  });

  it("hasRoof is false for an empty mask", () => {
    expect(hasRoof({ width: 2, height: 2, values: [0, 0, 0, 0] })).toBe(false);
  });
});

describe("compressed rasters", () => {
  it("decodes a DEFLATE GeoTIFF to the same values as the uncompressed one", async () => {
    const { flux } = makeLayerPair(spec);
    const packed = deflateGeoTiff(flux);
    expect(packed.byteLength).toBeGreaterThan(flux.byteLength); // appended strip, sanity check
    const [a, b] = await Promise.all([decodeGeoTiff(flux), decodeGeoTiff(packed)]);
    expect(Array.from(b.values)).toEqual(Array.from(a.values));
    expect(b.bounds).toEqual(a.bounds);
  });
});
