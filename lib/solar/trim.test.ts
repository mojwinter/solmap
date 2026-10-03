import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildingInsightsSchema } from "./schema";
import { trimBuilding } from "./trim";

const dir = path.join(process.cwd(), "fixtures/synthetic");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
const load = (f: string) => JSON.parse(readFileSync(path.join(dir, f), "utf8"));

describe("trimBuilding (every fixtures/synthetic/*.json)", () => {
  it("finds the committed synthetic roofs", () => {
    expect(files).toEqual(expect.arrayContaining(["south-gable.json", "shaded-gable.json"]));
  });

  it.each(files)("%s parses and trims into a consistent BuildingResponse", (f) => {
    const raw = buildingInsightsSchema.parse(load(f));
    const b = trimBuilding(raw, "fixture");

    expect(JSON.stringify(b)).not.toMatch(/"latitude"|"longitude"/);
    expect(b.source).toBe("fixture");
    expect(b.buildingId).toBe(raw.name);
    expect(b.center).toEqual({ lat: raw.center.latitude, lng: raw.center.longitude });
    expect(b.boundingBox.sw.lat).toBeLessThanOrEqual(b.boundingBox.ne.lat);
    expect(b.boundingBox.sw.lng).toBeLessThanOrEqual(b.boundingBox.ne.lng);
    expect(b.imagery.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    expect(b.segments).toHaveLength(raw.solarPotential.roofSegmentStats.length);
    b.segments.forEach((s, i) => expect(s.index).toBe(i));
    expect(b.panels).toHaveLength(raw.solarPotential.solarPanels.length);
    for (const p of b.panels) {
      expect(p.segmentIndex).toBeGreaterThanOrEqual(0);
      expect(p.segmentIndex).toBeLessThan(b.segments.length);
    }

    // configs ascending, and config i can be drawn from panels.slice(0, panelsCount)
    for (let i = 1; i < b.configs.length; i++) {
      expect(b.configs[i].panelsCount).toBeGreaterThan(b.configs[i - 1].panelsCount);
    }
    for (const c of b.configs) {
      expect(c.panelsCount).toBeLessThanOrEqual(b.panels.length);
      expect(c.segments.reduce((n, s) => n + s.panelsCount, 0)).toBe(c.panelsCount);
    }
  });

  it("south-gable maps the exact values", () => {
    const b = trimBuilding(buildingInsightsSchema.parse(load("south-gable.json")), "cache");
    expect(b).toMatchObject({
      buildingId: "buildings/SYNTHETIC-south-gable",
      center: { lat: 49.25, lng: -123.1500206 },
      boundingBox: { sw: { lat: 49.2499461, lng: -123.1501514 }, ne: { lat: 49.2500539, lng: -123.1498899 } },
      imagery: { quality: "HIGH", date: "2024-08-15" },
      postalCode: "V0V 0V0",
      administrativeArea: "BC",
      panel: { capacityWatts: 400, heightMeters: 1.879, widthMeters: 1.045, lifetimeYears: 20 },
      roof: { areaMeters2: 180.82, maxPanels: 53, maxArrayAreaMeters2: 104.07, maxSunshineHoursPerYear: 1352 },
      source: "cache",
    });
    expect(b.roof.sunshineQuantiles).toHaveLength(11);
    expect(b.segments[0]).toMatchObject({ index: 0, pitchDegrees: 30, azimuthDegrees: 180, areaMeters2: 80.83 });
    expect(b.panels[0]).toEqual({
      lat: 49.24999,
      lng: -123.1500791,
      landscape: false,
      segmentIndex: 0,
      yearlyEnergyDcKwh: 478,
    });
    expect(b.configs[0]).toEqual({
      panelsCount: 4,
      yearlyEnergyDcKwh: 1900,
      segments: [{ segmentIndex: 0, panelsCount: 4, yearlyEnergyDcKwh: 1900 }],
    });
  });

  it("shaded-gable is MEDIUM imagery", () => {
    const b = trimBuilding(buildingInsightsSchema.parse(load("shaded-gable.json")), "fixture");
    expect(b.imagery.quality).toBe("MEDIUM");
  });
});
