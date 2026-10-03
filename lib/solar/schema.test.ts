import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildingInsightsSchema } from "./schema";

const southGable = () =>
  JSON.parse(readFileSync(path.join(process.cwd(), "fixtures/synthetic/south-gable.json"), "utf8"));

describe("buildingInsightsSchema", () => {
  it("defaults missing per-panel arrays to [] (tiny roofs)", () => {
    const raw = southGable();
    delete raw.solarPotential.roofSegmentStats;
    delete raw.solarPotential.solarPanels;
    delete raw.solarPotential.solarPanelConfigs;
    const sp = buildingInsightsSchema.parse(raw).solarPotential;
    expect(sp.roofSegmentStats).toEqual([]);
    expect(sp.solarPanels).toEqual([]);
    expect(sp.solarPanelConfigs).toEqual([]);
  });

  it("defaults zero-valued fields Google omits (azimuth 0 = due north)", () => {
    const raw = southGable();
    delete raw.solarPotential.roofSegmentStats[1].azimuthDegrees;
    expect(buildingInsightsSchema.parse(raw).solarPotential.roofSegmentStats[1].azimuthDegrees).toBe(0);
  });

  it("strips fields we don't use", () => {
    const raw = { ...southGable(), financialAnalyses: [{ x: 1 }] };
    const parsed = buildingInsightsSchema.parse(raw) as Record<string, unknown>;
    expect(parsed._note).toBeUndefined();
    expect(parsed.statisticalArea).toBeUndefined();
    expect(parsed.financialAnalyses).toBeUndefined();
  });

  it("rejects an unknown imagery quality and a missing solarPotential", () => {
    expect(buildingInsightsSchema.safeParse({ ...southGable(), imageryQuality: "ULTRA" }).success).toBe(false);
    const { solarPotential: _sp, ...noPotential } = southGable();
    void _sp;
    expect(buildingInsightsSchema.safeParse(noPotential).success).toBe(false);
  });
});
