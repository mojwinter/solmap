import { describe, expect, it } from "vitest";
import golden from "@/fixtures/finance-golden.json";
import { DEFAULT_INPUTS } from "@/src/config/bc";
import type { FinanceInputs, ScenarioResult } from "@/src/types/app";
import { finance } from "@/lib/finance";
import { stubBuilding } from "./helpers";

const TOL = golden.tolerance;

/** Relative tolerance; absolute 0.01 when the expected value is 0 (see golden `note`). */
function expectClose(actual: number, expected: number, label: string) {
  if (expected === 0) {
    expect(Math.abs(actual), label).toBeLessThanOrEqual(0.01);
  } else {
    expect(Math.abs(actual - expected) / Math.abs(expected), `${label}: ${actual} vs ${expected}`).toBeLessThanOrEqual(TOL);
  }
}

/** Walks the expected subset and compares numbers within tolerance, everything else exactly. */
function expectSubset(actual: unknown, expected: unknown, path: string) {
  if (expected === null) {
    expect(actual, path).toBeNull();
  } else if (typeof expected === "number") {
    expect(typeof actual, path).toBe("number");
    expectClose(actual as number, expected, path);
  } else if (typeof expected === "object") {
    for (const [k, v] of Object.entries(expected as Record<string, unknown>)) {
      expectSubset((actual as Record<string, unknown>)[k], v, `${path}.${k}`);
    }
  } else {
    expect(actual, path).toEqual(expected);
  }
}

const withDefaults = (overrides: Partial<FinanceInputs>): FinanceInputs => ({
  ...(golden.defaults as FinanceInputs),
  ...overrides,
});

describe("golden defaults", () => {
  it("equal DEFAULT_INPUTS", () => {
    expect(golden.defaults).toEqual(DEFAULT_INPUTS);
  });
});

describe("bill.monthlyBill", () => {
  it.each(golden.bill.monthlyBill)("$plan $monthlyKwh kWh", (c) => {
    expectClose(finance.monthlyBill(c.monthlyKwh, c.plan as FinanceInputs["ratePlan"]), c.expectedMonthlyBill, "bill");
  });
});

describe("bill.annualKwhFromBill", () => {
  it.each(golden.bill.annualKwhFromBill)("$plan $$billAmountInclGst / $periodMonths mo", (c) => {
    const kwh = finance.annualKwhFromBill(c.billAmountInclGst, c.periodMonths as 1 | 2, c.plan as FinanceInputs["ratePlan"]);
    expectClose(kwh, c.expectedAnnualKwh, "annualKwh");
  });

  it.each(golden.bill.monthlyBill)("is the exact inverse of monthlyBill ($plan $monthlyKwh kWh)", (c) => {
    const plan = c.plan as FinanceInputs["ratePlan"];
    const amount = finance.monthlyBill(c.monthlyKwh, plan) * 1.05 * 2;
    expect(finance.annualKwhFromBill(amount, 2, plan)).toBeCloseTo(c.monthlyKwh * 12, 6);
  });
});

describe("evaluate (scenarios)", () => {
  it.each(golden.scenarios)("$name", (c) => {
    const r: ScenarioResult = finance.evaluate(c.config, 0, c.apiPanelWatts, withDefaults(c.inputs as Partial<FinanceInputs>));
    expectSubset(r, c.expected, c.name);
    expect(r.panelsCount).toBe(c.config.panelsCount);
    expect(r.years).toHaveLength(DEFAULT_INPUTS.lifetimeYears);
    expect(r.years.at(-1)!.cumulative).toBeCloseTo(r.lifetimeNetSavings, 6);
  });
});

describe("recommend", () => {
  it.each(golden.recommend)("$name", (c) => {
    const building = stubBuilding(c.configs, c.apiPanelWatts);
    const rec = finance.recommend(building, withDefaults(c.inputs as Partial<FinanceInputs>));
    const e = c.expected;
    expect(rec.recommendedIndex).toBe(e.recommendedIndex);
    expect(rec.verdict).toBe(e.verdict);
    expect(rec.scenarios).toHaveLength(c.configs.length);
    const s = rec.scenarios[rec.recommendedIndex!];
    expect(s.panelsCount).toBe(e.panelsCount);
    expectClose(s.systemKwDc, e.systemKwDc, "systemKwDc");
    expectClose(s.npv, e.npv, "npv");
    if (e.paybackYears === null) expect(s.paybackYears).toBeNull();
    else expectClose(s.paybackYears!, e.paybackYears, "paybackYears");
  });
});
