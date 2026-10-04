import { describe, expect, it } from "vitest";
import { BC_BOUNDS, BC_SOLAR_YIELD, DEFAULT_INPUTS, INSTALL, MANUAL } from "@/src/config/bc";
import type { FinanceInputs, LatLngLiteral } from "@/src/types/app";
import { finance, manualBuilding } from "@/lib/finance";
import type { RoofFacing } from "@/lib/finance";
import { nearestYieldTown } from "@/lib/finance/manual";

const center = { lat: 49.25, lng: -123.15 }; // Vancouver: NRCan south 1025, flat 892 kWh/kW AC
const KELOWNA = { lat: 49.88, lng: -119.47 };
const PRINCE_RUPERT = { lat: 54.3, lng: -130.3 };
const estimate = (roofAreaM2: number, facing: RoofFacing = "S", at: LatLngLiteral = center) =>
  manualBuilding({ center: at, roofAreaM2, facing });
const roof = (roofAreaM2: number, facing: RoofFacing = "S", at: LatLngLiteral = center) => estimate(roofAreaM2, facing, at).building;
const inputs = (o: Partial<FinanceInputs> = {}): FinanceInputs => ({ ...DEFAULT_INPUTS, ...o });
/** Year-1 AC kWh per kW DC of a roof's biggest config, through the real engine at default inputs. */
const acYield = (b: ReturnType<typeof roof>) => finance.evaluate(b.configs.at(-1)!, b.configs.length - 1, b.panel.capacityWatts, inputs()).specificYield;

describe("manualBuilding sizing (FINANCIAL_MODEL.md → Manual estimate)", () => {
  it("40 m² south in Vancouver: 14 panels, 1025 / 0.85 × 0.4 kWh DC each, configs 4…14", () => {
    const b = roof(40);
    const dcPerPanel = (1025 / 0.85) * 0.4; // ≈ 482.4
    expect(b.roof.maxPanels).toBe(14); // floor(40 × 0.7 / (1.879 × 1.045)) = floor(14.26)
    expect(b.configs.map((c) => c.panelsCount)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(b.configs[0].yearlyEnergyDcKwh).toBeCloseTo(4 * dcPerPanel, 6);
    expect(b.configs.at(-1)!.yearlyEnergyDcKwh).toBeCloseTo(14 * dcPerPanel, 6);
  });

  it("scales the town's south yield by the orientation factor; flat uses the horizontal yield", () => {
    const perPanel = (f: RoofFacing) => roof(40, f).configs[0].yearlyEnergyDcKwh / 4;
    expect(perPanel("W")).toBeCloseTo(((1025 * 0.82) / 0.85) * 0.4, 6);
    expect(perPanel("SE")).toBeCloseTo(((1025 * 0.95) / 0.85) * 0.4, 6);
    expect(perPanel("N")).toBeCloseTo(((1025 * 0.6) / 0.85) * 0.4, 6);
    expect(perPanel("FLAT")).toBeCloseTo((892 / 0.85) * 0.4, 6);
  });

  it("each config sits wholly on segment 0", () => {
    for (const c of roof(40).configs) {
      expect(c.segments).toEqual([{ segmentIndex: 0, panelsCount: c.panelsCount, yearlyEnergyDcKwh: c.yearlyEnergyDcKwh }]);
    }
  });

  it("starts offering configs exactly when minPanels fit", () => {
    const threshold = (MANUAL.minPanels * MANUAL.panel.heightMeters * MANUAL.panel.widthMeters) / MANUAL.usableFraction; // ≈ 11.22 m²
    expect(roof(threshold - 0.01).configs).toEqual([]);
    expect(roof(threshold + 0.01).configs.map((c) => c.panelsCount)).toEqual([4]);
  });

  it("too small, zero, negative or non-numeric area → no configs", () => {
    for (const a of [10, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const b = roof(a);
      expect(b.configs).toEqual([]);
      expect(b.roof.maxPanels).toBe(0);
    }
    expect(roof(0).segments).toEqual([]);
    expect(roof(10).segments).toHaveLength(1); // a real roof, just too small
  });

  it("caps the area at MANUAL.maxRoofAreaM2", () => {
    const capped = roof(3000);
    expect(capped.roof.areaMeters2).toBe(MANUAL.maxRoofAreaM2);
    expect(capped.roof.maxPanels).toBe(roof(MANUAL.maxRoofAreaM2).roof.maxPanels);
    expect(capped.roof.maxPanels).toBe(106);
  });

  it("flags clamped area: too big, negative or not a number", () => {
    for (const a of [3000, MANUAL.maxRoofAreaM2 + 0.1, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(estimate(a).clamped).toBe(true);
    }
    for (const a of [0, 10, 40, MANUAL.maxRoofAreaM2]) {
      expect(estimate(a).clamped).toBe(false);
    }
  });
});

describe("manual yield by location (BC_SOLAR_YIELD, NRCan)", () => {
  it("picks the nearest NRCan town", () => {
    expect(nearestYieldTown(center).name).toBe("Vancouver");
    expect(nearestYieldTown(KELOWNA).name).toBe("Kelowna");
    expect(nearestYieldTown(PRINCE_RUPERT).name).toBe("Prince Rupert");
    expect(nearestYieldTown({ lat: 48.45, lng: -123.4 }).name).toBe("Victoria");
    expect(nearestYieldTown({ lat: 49.17, lng: -123.13 }).name).toBe("Vancouver"); // Richmond
  });

  it("at default inputs the AC yield is NRCan's (losses counted once)", () => {
    expect(acYield(roof(40))).toBeCloseTo(1025, 6);
    expect(acYield(roof(40, "FLAT"))).toBeCloseTo(892, 6);
    expect(acYield(roof(40, "S", KELOWNA))).toBeCloseTo(1150, 6);
    expect(estimate(40, "W").yieldFrom).toEqual({ town: "Vancouver", acKwhPerKw: 1025 * 0.82 });
  });

  it("a south roof in the Lower Mainland and the Okanagan lands in BC Hydro's 1,000–1,200 kWh/kW", () => {
    for (const at of [center, KELOWNA]) {
      const y = acYield(roof(40, "S", at));
      expect(y).toBeGreaterThanOrEqual(INSTALL.specificYieldKwhPerKwLow);
      expect(y).toBeLessThanOrEqual(INSTALL.specificYieldKwhPerKwHigh);
    }
  });

  it("the interior out-produces the north coast", () => {
    expect(acYield(roof(40, "S", KELOWNA))).toBeGreaterThan(acYield(roof(40)));
    expect(acYield(roof(40, "S", PRINCE_RUPERT))).toBeLessThan(acYield(roof(40)));
  });

  it("every town is inside BC_BOUNDS with plausible yields", () => {
    for (const t of BC_SOLAR_YIELD.towns) {
      expect(t.lat).toBeGreaterThan(BC_BOUNDS.latMin);
      expect(t.lat).toBeLessThan(BC_BOUNDS.latMax);
      expect(t.lng).toBeGreaterThan(BC_BOUNDS.lngMin);
      expect(t.lng).toBeLessThan(BC_BOUNDS.lngMax);
      expect(t.south).toBeGreaterThanOrEqual(INSTALL.sanityYieldMin);
      expect(t.south).toBeLessThanOrEqual(INSTALL.sanityYieldMax);
      expect(t.flat).toBeLessThan(t.south);
    }
  });
});

describe("manualBuilding shape", () => {
  it("is a manual BuildingResponse with no panels and Google's panel spec", () => {
    const b = roof(40);
    expect(b.source).toBe("manual");
    expect(b.buildingId).toBe("manual");
    expect(b.panels).toEqual([]);
    expect(b.center).toEqual(center);
    expect(b.panel).toEqual({ capacityWatts: 400, heightMeters: 1.879, widthMeters: 1.045, lifetimeYears: 20 });
    expect(b.roof.maxSunshineHoursPerYear).toBe(0);
    expect(b.roof.maxArrayAreaMeters2).toBeCloseTo(14 * 1.879 * 1.045, 6);
  });

  it("one segment facing the chosen way, 30° pitch (0° when flat)", () => {
    expect(roof(40, "S").segments[0]).toMatchObject({ index: 0, azimuthDegrees: 180, pitchDegrees: 30, areaMeters2: 40, sunshineQuantiles: [] });
    expect(roof(40, "E").segments[0].azimuthDegrees).toBe(90);
    expect(roof(40, "SW").segments[0].azimuthDegrees).toBe(225);
    expect(roof(40, "N").segments[0].azimuthDegrees).toBe(0);
    expect(roof(40, "FLAT").segments[0].pitchDegrees).toBe(0);
  });

  it("bounding box surrounds the center", () => {
    const { sw, ne } = roof(40).boundingBox;
    expect(sw.lat).toBeLessThan(center.lat);
    expect(sw.lng).toBeLessThan(center.lng);
    expect(ne.lat).toBeGreaterThan(center.lat);
    expect(ne.lng).toBeGreaterThan(center.lng);
  });
});

describe("recommend() on a manual roof", () => {
  const orientation = (r: ReturnType<typeof finance.recommend>) => r.reasons.find((c) => c.kind === "orientation");

  it("south roof: a recommendation within the BC sanity band, no imagery chip", () => {
    const r = finance.recommend(roof(40), inputs());
    expect(r.recommendedIndex).not.toBeNull();
    expect(r.scenarios).toHaveLength(11);
    const s = r.scenarios[r.recommendedIndex!];
    expect(s.warnings).not.toContain("SPECIFIC_YIELD_OUT_OF_RANGE");
    expect(r.reasons.map((c) => c.kind)).not.toContain("imagery");
    expect(r.reasons.map((c) => c.kind)).not.toContain("shading");
    expect(r.reasons.map((c) => c.kind)).not.toContain("sun");
  });

  it("orientation chip uses the entered facing and never the assumed pitch", () => {
    const big = inputs({ annualConsumptionKwh: 20000 });
    expect(orientation(finance.recommend(roof(40, "S"), big))).toEqual({ kind: "orientation", tone: "good", text: "Roof faces south" });
    expect(orientation(finance.recommend(roof(40, "SE"), big))?.text).toBe("Roof faces south-east");
    expect(orientation(finance.recommend(roof(40, "FLAT"), big))).toEqual({ kind: "orientation", tone: "good", text: "Flat roof" });
  });

  it("north roof: warns on orientation and flags the low yield", () => {
    const r = finance.recommend(roof(40, "N"), inputs({ annualConsumptionKwh: 20000 }));
    expect(r.verdict).not.toBe("strong");
    expect(r.scenarios[0].warnings).toContain("SPECIFIC_YIELD_OUT_OF_RANGE"); // 1025 × 0.6 ≈ 615 kWh/kW AC
    expect(orientation(r)).toEqual({ kind: "orientation", tone: "warn", text: "Roof faces north" });
  });

  it("too-small roof: not recommended with the roof_small chip", () => {
    const r = finance.recommend(roof(10), inputs());
    expect(r.recommendedIndex).toBeNull();
    expect(r.verdict).toBe("not_recommended");
    expect(r.reasons.map((c) => c.kind)).toEqual(["roof_small"]);
  });
});
