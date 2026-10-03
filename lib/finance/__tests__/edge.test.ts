import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import golden from "@/fixtures/finance-golden.json";
import { DEFAULT_INPUTS, INPUT_RANGES, REBATES, TUNING } from "@/src/config/bc";
import type { FinanceInputs } from "@/src/types/app";
import { finance } from "@/lib/finance";
import { reasonChips } from "@/lib/finance/verdict";
import { linearConfigs, segment, stubBuilding } from "./helpers";

const inputs = (o: Partial<FinanceInputs> = {}): FinanceInputs => ({ ...DEFAULT_INPUTS, ...o });
const cfg = { panelsCount: 10, yearlyEnergyDcKwh: 4600 };
const kinds = (r: { reasons: { kind: string }[] }) => r.reasons.map((c) => c.kind);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("bill edge cases", () => {
  it("a bill at or below the basic charge means 0 kWh", () => {
    expect(finance.annualKwhFromBill(5, 1, "tiered")).toBe(0);
    expect(finance.annualKwhFromBill(0, 2, "flat")).toBe(0);
  });

  it("0 kWh costs only the basic charge", () => {
    expect(finance.monthlyBill(0, "flat")).toBeCloseTo((365 / 12) * 0.25, 6);
  });
});

describe("evaluate edge cases", () => {
  it("clamps consumption below the range and warns", () => {
    const low = finance.evaluate(cfg, 0, 400, inputs({ annualConsumptionKwh: 500 }));
    const atMin = finance.evaluate(cfg, 0, 400, inputs({ annualConsumptionKwh: INPUT_RANGES.annualConsumptionKwh.min }));
    expect(low.warnings).toContain("CLAMPED_INPUT");
    expect(atMin.warnings).not.toContain("CLAMPED_INPUT");
    expect(low.npv).toBeCloseTo(atMin.npv, 6);
    expect(low.billWithoutSolarYear1).toBeCloseTo(atMin.billWithoutSolarYear1, 6);
  });

  it("clamps a 0% discount rate and an absurd cost per watt", () => {
    const r = finance.evaluate(cfg, 0, 400, inputs({ discountRate: 0.9, costPerWatt: 99 }));
    expect(r.warnings).toContain("CLAMPED_INPUT");
    expect(r.installCost).toBeCloseTo(4 * 1000 * INPUT_RANGES.costPerWatt.max, 6);
  });

  it("in-range defaults produce no CLAMPED_INPUT", () => {
    expect(finance.evaluate(cfg, 0, 400, inputs()).warnings).not.toContain("CLAMPED_INPUT");
  });

  it("production > consumption warns PRODUCES_MORE_THAN_USE", () => {
    const r = finance.evaluate({ panelsCount: 20, yearlyEnergyDcKwh: 9000 }, 0, 400, inputs({ annualConsumptionKwh: 5000 }));
    expect(r.offsetPct).toBeGreaterThan(1);
    expect(r.warnings).toContain("PRODUCES_MORE_THAN_USE");
    // Self-use never exceeds the daytime-load cap, and nothing goes negative.
    expect(r.year1.selfUsedKwh).toBeLessThanOrEqual(DEFAULT_INPUTS.daytimeLoadShare * 5000);
    expect(r.year1.exportedKwh).toBeGreaterThan(0);
  });

  it("flags specific yield outside the sanity band", () => {
    const r = finance.evaluate({ panelsCount: 16, yearlyEnergyDcKwh: 4800 }, 0, 400, inputs());
    expect(r.specificYield).toBeLessThan(700);
    expect(r.warnings).toContain("SPECIFIC_YIELD_OUT_OF_RANGE");
    expect(finance.evaluate(cfg, 0, 400, inputs()).warnings).not.toContain("SPECIFIC_YIELD_OUT_OF_RANGE");
  });

  it("rebateEligible=false → rebate 0 and net cost = install cost", () => {
    const r = finance.evaluate(cfg, 0, 400, inputs({ rebateEligible: false }));
    expect(r.rebate).toBe(0);
    expect(r.netCost).toBe(r.installCost);
  });

  it("rebate limited by 50% of cost: 4 kW at $1.60/W → $3,200", () => {
    const r = finance.evaluate(cfg, 0, 400, inputs({ costPerWatt: 1.6 }));
    expect(r.installCost).toBeCloseTo(6400, 6);
    expect(r.rebate).toBeCloseTo(3200, 6);
    expect(r.rebate).toBeLessThan(REBATES.solar.perKwDc * r.systemKwDc);
  });

  it("rebate capped at maxResidential for big systems", () => {
    const r = finance.evaluate({ panelsCount: 30, yearlyEnergyDcKwh: 13000 }, 0, 400, inputs());
    expect(r.rebate).toBe(REBATES.solar.maxResidential);
  });

  it("carries configIndex and builds 1-based year rows", () => {
    const r = finance.evaluate(cfg, 7, 400, inputs());
    expect(r.configIndex).toBe(7);
    expect(r.years[0].year).toBe(1);
    expect(r.years[0].savings).toBeCloseTo(r.year1.total, 6);
    expect(r.years[0].cumulative).toBeCloseTo(-r.netCost + r.year1.total, 6);
  });
});

describe("recommend edge cases", () => {
  it("0 configs → null index, not_recommended, roof_small", () => {
    const rec = finance.recommend(stubBuilding([]), inputs());
    expect(rec.recommendedIndex).toBeNull();
    expect(rec.verdict).toBe("not_recommended");
    expect(rec.scenarios).toEqual([]);
    expect(kinds(rec)[0]).toBe("roof_small");
    expect(rec.headline).toMatch(/roof/i);
  });

  it("all-negative NPV with no payback → index 0, not_recommended", () => {
    const rec = finance.recommend(stubBuilding(linearConfigs(4, 10, 150)), inputs({ costPerWatt: 5 }));
    expect(rec.scenarios.every((s) => s.paybackYears === null)).toBe(true);
    expect(rec.recommendedIndex).toBe(0);
    expect(rec.verdict).toBe("not_recommended");
    expect(rec.headline).toMatch(/doesn.t pay/i);
  });

  it("never returns more than 3 reasons", () => {
    for (const c of golden.recommend) {
      const rec = finance.recommend(stubBuilding(c.configs), inputs(c.inputs as Partial<FinanceInputs>));
      expect(rec.reasons.length).toBeLessThanOrEqual(3);
    }
  });
});

describe("reason chips", () => {
  const shaded = golden.recommend.find((c) => c.name === "synthetic_shaded_tiered_10MWh")!;
  const south = golden.recommend.find((c) => c.name === "synthetic_south_tiered_10MWh")!;

  it("shaded roof: Weak only because of the NPV floor → small_savings first, quoting lifetimeNetSavings", () => {
    const rec = finance.recommend(stubBuilding(shaded.configs), inputs());
    expect(rec.verdict).toBe("weak");
    const s = rec.scenarios[rec.recommendedIndex!];
    expect(s.paybackYears!).toBeLessThanOrEqual(TUNING.verdict.moderate.maxPaybackYears);
    expect(rec.reasons[0].kind).toBe("small_savings");
    expect(rec.reasons[0].tone).toBe("warn");
    expect(rec.reasons[0].text).toContain("$3,000"); // lifetimeNetSavings ≈ $2,993, rounded
  });

  it("strong south roof leads with a positive chip and mentions the rebate cap", () => {
    const building = stubBuilding(
      south.configs.map((c) => ({ ...c, segments: [{ segmentIndex: 0, panelsCount: c.panelsCount, yearlyEnergyDcKwh: c.yearlyEnergyDcKwh }] })),
      400,
      {
        segments: [segment(0, 180, [905, 1180, 1222, 1248, 1265, 1279, 1290, 1301, 1312, 1324, 1352])],
        roof: { areaMeters2: 160, maxPanels: 53, maxArrayAreaMeters2: 104, maxSunshineHoursPerYear: 1352, sunshineQuantiles: [] },
      },
    );
    const rec = finance.recommend(building, inputs());
    expect(rec.verdict).toBe("strong");
    expect(rec.reasons[0].tone).toBe("good");
    expect(kinds(rec)).toContain("rebate_cap"); // max config is 21.2 kW > 5 kW
    expect(kinds(rec)).not.toContain("shading");
  });

  it("shading, north-facing orientation and low sun are warnings", () => {
    const building = stubBuilding(linearConfigs(4, 12, 380), 400, {
      segments: [segment(0, 10, [300, 500, 600, 650, 700, 1000, 1050, 1100, 1150, 1200, 1250])],
      roof: { areaMeters2: 80, maxPanels: 12, maxArrayAreaMeters2: 24, maxSunshineHoursPerYear: 900, sunshineQuantiles: [] },
    });
    const rec = finance.recommend(building, inputs());
    const byKind = Object.fromEntries(rec.reasons.map((c) => [c.kind, c]));
    expect(rec.reasons.every((c) => c.tone === "warn")).toBe(true);
    expect(Object.keys(byKind)).toEqual(expect.arrayContaining(["shading"]));
  });

  it("export_share for an oversized recommendation, oversized when offset > 1", () => {
    // Tiny household + big cheap roof: the recommended size still exports most of its output.
    const building = stubBuilding(linearConfigs(20, 20, 450));
    const rec = finance.recommend(building, inputs({ annualConsumptionKwh: 3000 }));
    expect(kinds(rec)).toEqual(expect.arrayContaining(["export_share", "oversized"]));
  });

  it("export_share names the input export rate and doesn't suggest going smaller from the smallest size", () => {
    const building = stubBuilding(linearConfigs(20, 20, 450));
    const rec = finance.recommend(building, inputs({ annualConsumptionKwh: 3000, exportRate: 0.075 }));
    expect(rec.recommendedIndex).toBe(0);
    const chip = rec.reasons.find((c) => c.kind === "export_share")!;
    expect(chip.text).toContain("7.5¢");
    expect(chip.text).not.toMatch(/smaller pays back/);
  });

  it("export_share suggests going smaller when a smaller size exists", () => {
    const building = stubBuilding(linearConfigs(4, 20, 450));
    const all = inputs({ annualConsumptionKwh: 3000 });
    const scenarios = building.configs.map((c, i) => finance.evaluate(c, i, 400, all));
    const chips = reasonChips(building, 16, scenarios, "weak", all);
    expect(chips.find((c) => c.kind === "export_share")?.text).toMatch(/10¢; smaller pays back faster/);
  });

  it("rebate_cap uses the 50%-of-cost limit when cost per watt is under $2/W", () => {
    const building = stubBuilding(linearConfigs(10, 30, 460));
    const chipFor = (costPerWatt: number) => {
      const all = inputs({ costPerWatt });
      const scenarios = building.configs.map((c, i) => finance.evaluate(c, i, 400, all));
      return reasonChips(building, 0, scenarios, "moderate", all).find((c) => c.kind === "rebate_cap");
    };
    expect(chipFor(1.6)?.text).toBe("BC Hydro's rebate stops growing at 6.3 kW"); // $800/kW → 6.25 kW
    expect(chipFor(3)?.text).toBe("BC Hydro's rebate stops growing at 5 kW");
    expect(finance.evaluate({ panelsCount: 15, yearlyEnergyDcKwh: 6900 }, 0, 400, inputs({ costPerWatt: 1.6 })).rebate).toBeLessThan(
      REBATES.solar.maxResidential,
    ); // 6 kW at $1.60/W is still below the cap
  });

  it("headline ends with the lifetime in years", () => {
    const rec = finance.recommend(stubBuilding(linearConfigs(10, 20, 460)), inputs());
    expect(rec.headline).toMatch(/over \d+ years\.$/);
  });

  it("imagery chip for BASE quality or imagery older than the max age", () => {
    const cfgs = linearConfigs(10, 12, 460);
    const base = finance.recommend(stubBuilding(cfgs, 400, { imagery: { quality: "BASE", date: "2025-06-01" } }), inputs());
    const old = finance.recommend(stubBuilding(cfgs, 400, { imagery: { quality: "HIGH", date: "2019-06-01" } }), inputs());
    const fresh = finance.recommend(stubBuilding(cfgs, 400, { imagery: { quality: "HIGH", date: "2024-06-01" } }), inputs());
    expect(kinds(base)).toContain("imagery");
    expect(kinds(old)).toContain("imagery");
    expect(kinds(fresh)).not.toContain("imagery");
  });
});
