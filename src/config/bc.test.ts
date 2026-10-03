import { describe, expect, it } from "vitest";
import golden from "@/fixtures/finance-golden.json";
import { DEFAULT_INPUTS } from "@/src/config/bc";

describe("src/config/bc", () => {
  it("DEFAULT_INPUTS matches the defaults the golden cases were generated with", () => {
    expect(DEFAULT_INPUTS).toEqual(golden.defaults);
  });

  it("golden cases only override real FinanceInputs fields", () => {
    const known = Object.keys(DEFAULT_INPUTS);
    const overrides = [...golden.scenarios, ...golden.recommend].flatMap((c) => Object.keys(c.inputs));
    expect(overrides.filter((k) => !known.includes(k))).toEqual([]);
  });
});
