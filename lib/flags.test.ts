import { describe, expect, it, vi } from "vitest";
import { FLAGS, parseFlags, type Flags } from "./flags";

const none: Flags = { heatmap: false, charts: false, assumptions: false, manual: false, battery: false, print: false };
const all: Flags = { heatmap: true, charts: true, assumptions: true, manual: true, battery: true, print: true };

describe("parseFlags", () => {
  it("lists exactly the six P1 flags", () => {
    expect([...FLAGS]).toEqual(["heatmap", "charts", "assumptions", "manual", "battery", "print"]);
  });

  it("unset: all off in production, all on elsewhere", () => {
    expect(parseFlags(undefined, { nodeEnv: "production" })).toEqual(none);
    expect(parseFlags(undefined, { nodeEnv: "development" })).toEqual(all);
    expect(parseFlags(undefined, { nodeEnv: "test" })).toEqual(all);
    expect(parseFlags(undefined)).toEqual(all);
  });

  it("empty or blank: all off, even in dev", () => {
    expect(parseFlags("", { nodeEnv: "development" })).toEqual(none);
    expect(parseFlags("  , ,", { nodeEnv: "development" })).toEqual(none);
    expect(parseFlags("none", { nodeEnv: "development" })).toEqual(none);
  });

  it("turns on only the listed flags", () => {
    expect(parseFlags("heatmap,charts", { nodeEnv: "production" })).toEqual({ ...none, heatmap: true, charts: true });
  });

  it("tolerates whitespace, spaces as separators and case", () => {
    expect(parseFlags("  Heatmap ,\tPRINT  battery\n", { nodeEnv: "production" })).toEqual({
      ...none,
      heatmap: true,
      print: true,
      battery: true,
    });
  });

  it("all turns everything on", () => {
    expect(parseFlags("all", { nodeEnv: "production" })).toEqual(all);
  });

  it("ignores unknown names with one warning", () => {
    const warn = vi.fn();
    expect(parseFlags("heatmap,heatmpa,lasers", { nodeEnv: "production", warn })).toEqual({ ...none, heatmap: true });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("heatmpa, lasers");
  });

  it("does not warn when every name is known", () => {
    const warn = vi.fn();
    parseFlags("charts", { warn });
    expect(warn).not.toHaveBeenCalled();
  });
});
