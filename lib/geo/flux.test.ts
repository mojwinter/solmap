import { describe, expect, it } from "vitest";
import { IRON_PALETTE } from "@/lib/solar/raster";
import { FLUX_LEGEND_STOPS, fluxGradient } from "./flux";

describe("flux legend", () => {
  it("uses the same colour stops as the server-rendered heatmap PNG", () => {
    expect([...FLUX_LEGEND_STOPS]).toEqual(IRON_PALETTE);
  });

  it("builds a left-to-right CSS gradient, shady to sunny", () => {
    expect(fluxGradient(["000000", "FFFFFF"])).toBe("linear-gradient(to right, #000000, #FFFFFF)");
    expect(fluxGradient()).toMatch(/^linear-gradient\(to right, #00000A, .*#FFFFF6\)$/);
  });
});
