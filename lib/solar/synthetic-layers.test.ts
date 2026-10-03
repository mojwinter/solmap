import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hasRoof } from "./raster";
import { buildingInsightsSchema } from "./schema";
import { syntheticLayers } from "./synthetic-layers";

const dir = path.join(process.cwd(), "fixtures/synthetic");
const load = (f: string) => buildingInsightsSchema.parse(JSON.parse(readFileSync(path.join(dir, f), "utf8")));
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

const meanFlux = (f: string) => {
  const { flux, mask } = syntheticLayers(load(f));
  let sum = 0;
  let n = 0;
  for (let i = 0; i < mask.values.length; i++) if (mask.values[i]) [sum, n] = [sum + flux.values[i], n + 1];
  return sum / n;
};

describe("syntheticLayers (every fixtures/synthetic/*.json)", () => {
  it.each(files)("%s: roof pixels, values from its quantiles, bounds around the building", (f) => {
    const b = load(f);
    const { flux, mask, bounds } = syntheticLayers(b);
    expect(flux.width * flux.height).toBe(mask.values.length);
    expect(hasRoof(mask)).toBe(true);

    const all = b.solarPotential.roofSegmentStats.flatMap((s) => s.stats.sunshineQuantiles);
    for (let i = 0; i < mask.values.length; i++) {
      if (!mask.values[i]) continue;
      expect(flux.values[i]).toBeGreaterThanOrEqual(Math.min(...all) - 1e-6);
      expect(flux.values[i]).toBeLessThanOrEqual(Math.max(...all) + 1e-6);
    }
    expect(bounds.sw.lat).toBeLessThan(b.boundingBox.sw.latitude);
    expect(bounds.ne.lng).toBeGreaterThan(b.boundingBox.ne.longitude);
  });

  it("the shaded roof is darker than the sunny one", () => {
    expect(meanFlux("shaded-gable.json")).toBeLessThan(meanFlux("south-gable.json") - 150);
  });
});
