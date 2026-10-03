import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import demo from "@/fixtures/demo-addresses.json";
import type { BuildingInsightsResponse, LatLng, LatLngBox } from "@/src/types/solar";
import { ROOFS, renderRoof } from "./synthetic-roofs";

const DIR = path.join(process.cwd(), "fixtures", "synthetic");
const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
const roofs = files.map((file) => ({
  file,
  text: readFileSync(path.join(DIR, file), "utf8"),
  json: JSON.parse(readFileSync(path.join(DIR, file), "utf8")) as BuildingInsightsResponse & { _note?: string },
}));

/** Great-circle distance in metres. */
function distanceM(a: LatLng, b: LatLng): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(r(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(r(a.latitude)) * Math.cos(r(b.latitude)) * Math.sin(r(b.longitude - a.longitude) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

const inBox = (p: LatLng, b: LatLngBox) =>
  p.latitude >= b.sw.latitude && p.latitude <= b.ne.latitude && p.longitude >= b.sw.longitude && p.longitude <= b.ne.longitude;

const ascending = (xs: number[]) => xs.every((x, i) => i === 0 || xs[i - 1] <= x);

describe("fixtures/synthetic", () => {
  it("has a file for every roof spec and a spec for every file", () => {
    expect(files).toEqual(ROOFS.map((r) => `${r.name}.json`).sort());
  });

  it("covers the edge cases the UI needs", () => {
    const sp = (name: string) => roofs.find((r) => r.file === `${name}.json`)!.json.solarPotential;
    expect(sp("tiny-roof").solarPanels).toEqual([]);
    expect(sp("tiny-roof")).not.toHaveProperty("solarPanelConfigs");
    expect(sp("multi-unit").maxArrayPanelsCount).toBeGreaterThan(150); // TUNING.largeBuildingPanels
    expect(roofs.find((r) => r.file === "base-quality.json")!.json.imageryQuality).toBe("BASE");
    expect(sp("east-west").roofSegmentStats!.map((s) => s.azimuthDegrees)).toEqual([90, 270]);
    expect(sp("flat-roof").roofSegmentStats!.every((s) => s.pitchDegrees >= 2 && s.pitchDegrees <= 5)).toBe(true);
  });

  describe.each(roofs)("$file", ({ file, text, json }) => {
    const sp = json.solarPotential;
    const panels = sp.solarPanels ?? [];
    const configs = sp.solarPanelConfigs ?? [];
    const segments = sp.roofSegmentStats ?? [];
    const kw = sp.panelCapacityWatts / 1000;

    it("is marked SYNTHETIC with a generated date, LF-only, and matches its generator spec", () => {
      expect(json._note).toMatch(/^SYNTHETIC\. .*NOT Google content.*Generated .* on \d{4}-\d{2}-\d{2}/);
      expect(json.name).toBe(`buildings/SYNTHETIC-${file.replace(/\.json$/, "")}`);
      expect(text).not.toContain("\r");
      const spec = ROOFS.find((r) => `${r.name}.json` === file)!;
      expect(text).toBe(renderRoof(spec));
    });

    it("lists solarPanels best-first", () => {
      expect(ascending(panels.map((p) => -p.yearlyEnergyDcKwh))).toBe(true);
    });

    it("has maxArrayPanelsCount === solarPanels.length", () => {
      expect(sp.maxArrayPanelsCount).toBe(panels.length);
    });

    it("gives every panel a valid segmentIndex", () => {
      for (const p of panels) {
        expect(Number.isInteger(p.segmentIndex)).toBe(true);
        expect(p.segmentIndex).toBeGreaterThanOrEqual(0);
        expect(p.segmentIndex).toBeLessThan(segments.length);
      }
    });

    it("has configs ascending by panelsCount, each the sum of its first panelsCount panels", () => {
      expect(ascending(configs.map((c) => c.panelsCount))).toBe(true);
      expect(new Set(configs.map((c) => c.panelsCount)).size).toBe(configs.length);
      for (const c of configs) {
        expect(c.panelsCount).toBeLessThanOrEqual(panels.length);
        const first = panels.slice(0, c.panelsCount);
        const sum = first.reduce((s, p) => s + p.yearlyEnergyDcKwh, 0);
        expect(Math.abs(c.yearlyEnergyDcKwh - sum)).toBeLessThanOrEqual(0.5);
        // roofSegmentSummaries split the same panels by segment
        expect(c.roofSegmentSummaries.reduce((s, r) => s + r.panelsCount, 0)).toBe(c.panelsCount);
        for (const r of c.roofSegmentSummaries) {
          const own = first.filter((p) => p.segmentIndex === r.segmentIndex);
          expect(r.panelsCount).toBe(own.length);
          expect(Math.abs(r.yearlyEnergyDcKwh - own.reduce((s, p) => s + p.yearlyEnergyDcKwh, 0))).toBeLessThanOrEqual(0.5);
        }
      }
    });

    it("has 11 ascending sunshineQuantiles everywhere", () => {
      for (const q of [sp.wholeRoofStats, sp.buildingStats, ...segments.map((s) => s.stats)].map((s) => s.sunshineQuantiles)) {
        expect(q).toHaveLength(11);
        expect(ascending(q)).toBe(true);
      }
      expect(sp.maxSunshineHoursPerYear).toBe(Math.max(...sp.wholeRoofStats.sunshineQuantiles));
    });

    it("keeps yields plausible for BC and consistent with the sun hours", () => {
      for (const p of panels) {
        const perKw = p.yearlyEnergyDcKwh / kw;
        expect(perKw).toBeGreaterThan(300);
        expect(perKw).toBeLessThan(1400);
        const q = segments[p.segmentIndex].stats.sunshineQuantiles;
        expect(perKw).toBeGreaterThanOrEqual(q[0]);
        expect(perKw).toBeLessThanOrEqual(q[10]);
      }
    });

    it("places the building centre and every panel inside the building bounding box", () => {
      expect(inBox(json.center, json.boundingBox)).toBe(true);
      for (const p of panels) expect(inBox(p.center, json.boundingBox)).toBe(true);
      for (const s of segments) expect(inBox(s.center, s.boundingBox)).toBe(true);
    });
  });

  it("keeps every fixture at least 1 km from every other one and from the no-coverage demo point", () => {
    const noCoverage = demo.fixtures
      .filter((f) => f.expectedVerdict === "NO_COVERAGE")
      .map((f) => ({ file: `no-coverage (${f.label})`, at: { latitude: f.lat, longitude: f.lng } }));
    expect(noCoverage.length).toBeGreaterThan(0);
    const points = [...roofs.map((r) => ({ file: r.file, at: r.json.center })), ...noCoverage];
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        expect(distanceM(points[i].at, points[j].at), `${points[i].file} ↔ ${points[j].file}`).toBeGreaterThanOrEqual(1000);
      }
    }
  });

  it("has every fixture-mode demo address within 250 m of a synthetic roof", () => {
    for (const f of demo.fixtures.filter((x) => x.expectedVerdict !== "NO_COVERAGE")) {
      const nearest = Math.min(...roofs.map((r) => distanceM({ latitude: f.lat, longitude: f.lng }, r.json.center)));
      expect(nearest, f.label).toBeLessThanOrEqual(250);
    }
  });
});
