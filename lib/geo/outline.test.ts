import { describe, expect, it } from "vitest";
import { metersBetween } from "./meters";
import { roundedRectPath } from "./outline";

// ~10 m × 22 m house box, like the screenshot roofs.
const bounds = { sw: { lat: 49.25, lng: -123.15 }, ne: { lat: 49.2502, lng: -123.14986 } };

describe("roundedRectPath", () => {
  const path = roundedRectPath(bounds);

  it("has 4 quarter-circles of steps + 1 points", () => {
    expect(path).toHaveLength(4 * 9);
  });

  it("stays inside the bounding box and touches every side", () => {
    const lats = path.map((p) => p.lat);
    const lngs = path.map((p) => p.lng);
    const eps = 1e-12;
    expect(Math.min(...lats)).toBeCloseTo(bounds.sw.lat, 10);
    expect(Math.max(...lats)).toBeCloseTo(bounds.ne.lat, 10);
    expect(Math.min(...lngs)).toBeCloseTo(bounds.sw.lng, 10);
    expect(Math.max(...lngs)).toBeCloseTo(bounds.ne.lng, 10);
    for (const p of path) {
      expect(p.lat).toBeGreaterThanOrEqual(bounds.sw.lat - eps);
      expect(p.lng).toBeLessThanOrEqual(bounds.ne.lng + eps);
    }
  });

  it("cuts the corners by the radius (15% of the short side, max 2.5 m)", () => {
    const width = metersBetween(bounds.sw, { lat: bounds.sw.lat, lng: bounds.ne.lng });
    const r = Math.min(2.5, 0.15 * width);
    // The NE arc's midpoint sits r·(√2 − 1) in from the square corner.
    const mid = path[4];
    expect(metersBetween(mid, bounds.ne)).toBeCloseTo(r * (Math.SQRT2 - 1), 2);
  });

  it("caps the radius on big buildings", () => {
    const big = { sw: { lat: 49.25, lng: -123.15 }, ne: { lat: 49.2505, lng: -123.1493 } };
    const mid = roundedRectPath(big)[4];
    expect(metersBetween(mid, big.ne)).toBeCloseTo(2.5 * (Math.SQRT2 - 1), 2);
  });

  it("winds counter-clockwise, so it cuts a hole in the clockwise spotlight ring", () => {
    // Shoelace with x = lng, y = lat: positive area = counter-clockwise.
    let twiceArea = 0;
    for (let i = 0; i < path.length; i++) {
      const a = path[i];
      const b = path[(i + 1) % path.length];
      twiceArea += a.lng * b.lat - b.lng * a.lat;
    }
    expect(twiceArea).toBeGreaterThan(0);
  });
});
