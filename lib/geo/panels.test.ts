import { describe, expect, it } from "vitest";
import type { LatLngLiteral, PanelLite, SegmentLite } from "@/src/types/app";
import { PANEL_LEAST, PANEL_MOST, panelColors, panelEnergyRange, panelGradient, panelPolygon, type OffsetFn } from "./panels";

// Fixture panel size (synthetic roofs / Google's default 400 W panel).
const DIMS = { widthMeters: 1.045, heightMeters: 1.879 };
const DIAGONAL = Math.hypot(0.5225, 0.9395);

// Flat by default so the rotation tests aren't mixed up with foreshortening.
const segment = (azimuthDegrees: number, index = 0, pitchDegrees = 0): SegmentLite => ({
  index,
  pitchDegrees,
  azimuthDegrees,
  areaMeters2: 50,
  sunshineQuantiles: [],
  center: { lat: 49.25, lng: -123.15 },
});

const panel = (overrides: Partial<PanelLite> = {}): PanelLite => ({
  lat: 49.25,
  lng: -123.15,
  landscape: false,
  segmentIndex: 0,
  yearlyEnergyDcKwh: 450,
  ...overrides,
});

/** Fake computeOffset: records every call and returns a distinct marker point. */
function recorder() {
  const calls: { from: LatLngLiteral; distance: number; heading: number }[] = [];
  const fn: OffsetFn = (from, distance, heading) => {
    calls.push({ from, distance, heading });
    return { lat: calls.length, lng: -calls.length };
  };
  return { fn, calls };
}

function expectHeadings(actual: number[], expected: number[]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((h, i) => expect(h).toBeCloseTo(expected[i], 2));
}

describe("panelPolygon", () => {
  it("portrait panel on a north-facing segment", () => {
    const { fn, calls } = recorder();
    panelPolygon(panel(), [segment(0)], DIMS, fn);

    expectHeadings(
      calls.map((c) => c.heading),
      [29.08, 150.92, 209.08, 330.92],
    );
    calls.forEach((c) => {
      expect(c.distance).toBeCloseTo(DIAGONAL, 6);
      expect(c.from).toEqual({ lat: 49.25, lng: -123.15 });
    });
  });

  it("south-facing segment shifts every heading by 180°", () => {
    const { fn, calls } = recorder();
    panelPolygon(panel(), [segment(180)], DIMS, fn);

    expectHeadings(
      calls.map((c) => c.heading),
      [209.08, 330.92, 29.08, 150.92],
    );
    calls.forEach((c) => expect(c.distance).toBeCloseTo(DIAGONAL, 6));
  });

  it("landscape panel swaps width and height", () => {
    const { fn, calls } = recorder();
    panelPolygon(panel({ landscape: true }), [segment(0)], DIMS, fn);

    expectHeadings(
      calls.map((c) => c.heading),
      [60.92, 119.08, 240.92, 299.08],
    );
    calls.forEach((c) => expect(c.distance).toBeCloseTo(DIAGONAL, 6));
  });

  it("foreshortens the downslope side by cos(pitch) on a 30° roof", () => {
    const { fn, calls } = recorder();
    panelPolygon(panel(), [segment(0, 0, 30)], DIMS, fn);

    // h = 0.9395 × cos 30° ≈ 0.8136, w unchanged → atan2(0.5225, 0.8136) ≈ 32.71°
    expectHeadings(
      calls.map((c) => c.heading),
      [32.71, 147.29, 212.71, 327.29],
    );
    calls.forEach((c) => expect(c.distance).toBeCloseTo(Math.hypot(0.5225, 0.9395 * Math.cos(Math.PI / 6)), 6));
  });

  it("foreshortens the downslope side for landscape panels too", () => {
    const { fn, calls } = recorder();
    panelPolygon(panel({ landscape: true }), [segment(0, 0, 30)], DIMS, fn);

    // Landscape: across = 0.9395, downslope = 0.5225 × cos 30° ≈ 0.4525
    expect(calls[0].heading).toBeCloseTo(64.28, 2);
    expect(calls[0].distance).toBeCloseTo(Math.hypot(0.9395, 0.5225 * Math.cos(Math.PI / 6)), 6);
  });

  it("uses the panel's own segment", () => {
    const { fn, calls } = recorder();
    panelPolygon(panel({ segmentIndex: 1 }), [segment(0, 0), segment(90, 1)], DIMS, fn);
    expect(calls[0].heading).toBeCloseTo(119.08, 2);
  });

  it("returns 4 plain {lat, lng} corners from computeOffset", () => {
    const { fn } = recorder();
    expect(panelPolygon(panel(), [segment(0)], DIMS, fn)).toEqual([
      { lat: 1, lng: -1 },
      { lat: 2, lng: -2 },
      { lat: 3, lng: -3 },
      { lat: 4, lng: -4 },
    ]);
  });

  it.each([5, -1])("throws on a missing segmentIndex (%i)", (segmentIndex) => {
    const { fn, calls } = recorder();
    expect(() => panelPolygon(panel({ segmentIndex }), [segment(0)], DIMS, fn)).toThrow(
      /segmentIndex/,
    );
    expect(calls).toHaveLength(0);
  });

  it("looks up google.maps lazily (module loads without it, call explains what's missing)", () => {
    expect((globalThis as { google?: unknown }).google).toBeUndefined();
    expect(() => panelPolygon(panel(), [segment(0)], DIMS)).toThrow(/geometry/);
  });
});

describe("panelColors", () => {
  const LIGHTEST = "rgb(232,234,246)"; // #E8EAF6
  const DARKEST = "rgb(26,35,126)"; // #1A237E
  const energies = (...kwh: number[]) => kwh.map((yearlyEnergyDcKwh) => panel({ yearlyEnergyDcKwh }));

  it("ramps from the lightest (least energy) to the darkest (most energy), in panel order", () => {
    expect(panelColors(energies(500, 300, 400))).toEqual([DARKEST, LIGHTEST, "rgb(129,135,186)"]);
  });

  it("normalises per roof, so the same relative energy gets the same colour on any roof", () => {
    expect(panelColors(energies(300, 400, 500))).toEqual(panelColors(energies(1000, 1050, 1100)));
  });

  it("colours a panel by the whole roof, so it never changes when the visible count does", () => {
    const all = energies(500, 450, 400, 350, 300);
    const colors = panelColors(all);
    // PanelOverlay colours every panel once and only toggles visibility.
    expect(colors.slice(0, 2)).not.toEqual(panelColors(all.slice(0, 2)));
    expect(colors[0]).toBe(DARKEST);
    expect(colors[4]).toBe(LIGHTEST);
  });

  it("gives equal-energy panels (and a lone panel) the lightest colour instead of NaN", () => {
    expect(panelColors(energies(400, 400, 400))).toEqual([LIGHTEST, LIGHTEST, LIGHTEST]);
    expect(panelColors(energies(400))).toEqual([LIGHTEST]);
  });

  it("returns no colours for a roof with no panels", () => {
    expect(panelColors([])).toEqual([]);
  });
});

describe("panel legend helpers", () => {
  const roof = (...kwh: number[]) => kwh.map((yearlyEnergyDcKwh) => ({ yearlyEnergyDcKwh }));

  it("uses exactly the colours panelColors() paints at its ends", () => {
    const colors = panelColors(roof(300, 500));
    expect(PANEL_LEAST).toBe(colors[0]);
    expect(PANEL_MOST).toBe(colors[1]);
  });

  it("builds the gradient from least to most, so 'to top' puts the darkest at the top", () => {
    expect(panelGradient("to top")).toBe(`linear-gradient(to top, ${PANEL_LEAST}, ${PANEL_MOST})`);
    expect(panelGradient("to right")).toBe(`linear-gradient(to right, ${PANEL_LEAST}, ${PANEL_MOST})`);
  });

  it("reports the roof's lowest and highest panel output", () => {
    expect(panelEnergyRange(roof(410, 512, 380, 450))).toEqual({ min: 380, max: 512 });
    expect(panelEnergyRange(roof(400, 400))).toEqual({ min: 400, max: 400 });
    expect(panelEnergyRange([])).toBeNull();
  });
});
