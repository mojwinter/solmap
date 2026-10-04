import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import demo from "@/fixtures/demo-addresses.json";
import { buildingInsightsSchema } from "@/lib/solar/schema";
import { trimBuilding } from "@/lib/solar/trim";
import type { BuildingResponse } from "@/src/types/app";
import {
  accessHeaders,
  cacheFlag,
  clampMaxAgeDays,
  defaultList,
  evaluateRow,
  formatTable,
  skipReason,
  SLOW_MS,
  type CacheEntryMeta,
  type DemoRow,
} from "./demo-check";

const roof = (file: string, source: BuildingResponse["source"] = "fixture"): BuildingResponse =>
  trimBuilding(
    buildingInsightsSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "fixtures/synthetic", file), "utf8"))),
    source,
  );

const hero: DemoRow = { label: "hero", lat: 49.25, lng: -123.15, ratePlan: "tiered", annualKwh: 10000, expectedVerdict: "strong" };
const noCoverage: DemoRow = { ...hero, label: "none", expectedVerdict: "NO_COVERAGE" };
const ok = (body: unknown, ms = 120) => ({ status: 200, ms, body });

describe("evaluateRow", () => {
  it("passes the hero roof and fills in the finance columns", () => {
    const r = evaluateRow(hero, ok(roof("south-gable.json")), "fixtures");
    expect(r.flags).toEqual([]);
    expect(r.source).toBe("fixture");
    expect(r.configs).toBeGreaterThan(0);
    expect(r.finance?.verdict).toBe("strong");
    expect(r.finance?.panels).toBeGreaterThan(0);
    expect(r.finance?.exportShare).toBeGreaterThanOrEqual(0);
    expect(r.finance?.exportShare).toBeLessThanOrEqual(1);
  });

  it("flags a verdict that differs from expectedVerdict", () => {
    const r = evaluateRow({ ...hero, expectedVerdict: "weak" }, ok(roof("south-gable.json")), "fixtures");
    expect(r.flags).toEqual(["verdict strong, expected weak"]);
  });

  it("flags slow responses", () => {
    const r = evaluateRow(hero, ok(roof("south-gable.json"), SLOW_MS + 1), "fixtures");
    expect(r.flags).toHaveLength(1);
    expect(r.flags[0]).toMatch(/^slow/);
  });

  it("flags non-200s and Access pages", () => {
    expect(evaluateRow(hero, { status: 500, ms: 50, body: { error: "UPSTREAM" } }, "live").flags).toEqual(["HTTP 500 UPSTREAM"]);
    expect(evaluateRow(hero, { status: 302, ms: 50, body: undefined }, "live").flags).toEqual(["HTTP 302"]);
    expect(evaluateRow(hero, { status: 0, ms: 50, body: undefined, error: "timeout 15 s" }, "live").flags[0]).toMatch(/no response \(timeout/);
    expect(evaluateRow(hero, ok(undefined), "live").flags[0]).toMatch(/not a BuildingResponse/);
  });

  it("wants exactly a 404 for NO_COVERAGE rows", () => {
    expect(evaluateRow(noCoverage, { status: 404, ms: 30, body: { error: "NO_COVERAGE" } }, "fixtures").flags).toEqual([]);
    expect(evaluateRow(noCoverage, ok(roof("south-gable.json")), "fixtures").flags).toEqual(["expected 404 NO_COVERAGE, got 200"]);
    expect(evaluateRow(noCoverage, { status: 429, ms: 30, body: { error: "RATE_LIMITED" } }, "fixtures").flags).toEqual([
      "expected 404 NO_COVERAGE, got 429 RATE_LIMITED",
    ]);
  });

  it("on the live list, flags anything not served from the cache", () => {
    expect(evaluateRow(hero, ok(roof("south-gable.json", "cache")), "live").flags).toEqual([]);
    expect(evaluateRow(hero, ok(roof("south-gable.json", "live")), "live").flags).toEqual(["source live: not warmed into the cache"]);
    expect(evaluateRow(hero, ok(roof("south-gable.json", "fixture")), "live").flags).toEqual(["source fixture on the live list"]);
    // ...but not on the fixtures list, where "fixture" is the point.
    expect(evaluateRow(hero, ok(roof("south-gable.json", "live")), "fixtures").flags).toEqual([]);
  });

  it("flags specific yield outside the sanity band", () => {
    const b = roof("south-gable.json");
    const tripled: BuildingResponse = { ...b, configs: b.configs.map((c) => ({ ...c, yearlyEnergyDcKwh: c.yearlyEnergyDcKwh * 3 })) };
    const r = evaluateRow(hero, ok(tripled), "fixtures");
    expect(r.flags.some((f) => /^specific yield \d+ kWh\/kW outside 700–1400$/.test(f))).toBe(true);
  });

  it("flags a low yield on a strong row but not on a row expected to be weak", () => {
    const b = roof("shaded-gable.json");
    const weak = evaluateRow({ ...hero, expectedVerdict: "weak" }, ok(b), "fixtures");
    expect(weak.finance!.specificYield).toBeLessThan(700);
    expect(weak.flags).toEqual([]);
    const strong = evaluateRow(hero, ok(b), "fixtures");
    expect(strong.flags).toContain(`specific yield ${Math.round(weak.finance!.specificYield)} kWh/kW outside 700–1400`);
  });

  it("handles a roof with no configs (not_recommended, no finance columns)", () => {
    const r = evaluateRow({ ...hero, expectedVerdict: "not_recommended" }, ok(roof("tiny-roof.json")), "fixtures");
    expect(r.flags).toEqual([]);
    expect(r.finance).toBeUndefined();
    expect(r.verdict).toBe("not_recommended");
  });

  it("agrees with every committed fixtures row", () => {
    const files: Record<string, string> = {
      "49.25,-123.15": "south-gable.json",
      "49.2615,-123.1702": "shaded-gable.json",
      "49.2488,-122.98": "flat-roof.json",
      "48.4265,-123.3165": "east-west.json",
      "49.888,-119.496": "tiny-roof.json",
      "49.1666,-123.1336": "multi-unit.json",
      "50.6745,-120.3273": "base-quality.json",
    };
    for (const row of demo.fixtures as DemoRow[]) {
      const file = files[`${row.lat},${row.lng}`];
      const res = file ? ok(roof(file)) : { status: 404, ms: 10, body: { error: "NO_COVERAGE" } };
      expect(evaluateRow(row, res, "fixtures").flags, row.label).toEqual([]);
    }
  });
});

describe("skipReason / defaultList", () => {
  it("skips unfilled live rows", () => {
    expect(skipReason({ ...hero, address: "TODO", lat: 0, lng: 0 })).toMatch(/TODO/);
    expect(skipReason({ ...hero, lat: 0, lng: 0 })).toMatch(/0/);
    expect(skipReason({ ...hero, address: "123 Main St" })).toBeNull();
  });

  it("uses fixtures for localhost and live elsewhere", () => {
    expect(defaultList("http://127.0.0.1:3100")).toBe("fixtures");
    expect(defaultList("http://localhost:3000")).toBe("fixtures");
    expect(defaultList("http://[::1]:3000")).toBe("fixtures");
    expect(defaultList("https://solmap.yardstick.football")).toBe("live");
  });
});

describe("cacheFlag", () => {
  const DAY = 86_400_000;
  const now = Date.parse("2026-10-04T12:00:00Z");
  const entry = (daysAgo: number, file = `e${daysAgo}.json`): CacheEntryMeta => ({ file, fetchedAtMs: now - daysAgo * DAY, lat: hero.lat, lng: hero.lng });

  it("is quiet for a fresh entry, warns within 3 days of expiry and after it", () => {
    expect(cacheFlag(hero, [entry(10)], now, 25)).toBeNull();
    expect(cacheFlag(hero, [entry(23)], now, 25)).toMatch(/expires in 2\.0 days/);
    expect(cacheFlag(hero, [entry(26)], now, 25)).toMatch(/expired/);
  });

  it("judges the newest matching entry and ignores other roofs", () => {
    expect(cacheFlag(hero, [entry(24), entry(1)], now, 25)).toBeNull();
    const elsewhere = { ...entry(1), lat: hero.lat + 0.001 }; // ~110 m away
    expect(cacheFlag(hero, [entry(24), elsewhere], now, 25)).toMatch(/expires/);
    expect(cacheFlag(hero, [elsewhere], now, 25)).toMatch(/no disk-cache entry/);
  });

  it("clamps max age like lib/solar/cache.ts", () => {
    expect(clampMaxAgeDays(undefined)).toBe(25);
    expect(clampMaxAgeDays("")).toBe(25);
    expect(clampMaxAgeDays("40")).toBe(29);
    expect(clampMaxAgeDays("10")).toBe(10);
  });
});

describe("accessHeaders / formatTable", () => {
  it("sends the Access token only when both halves are set", () => {
    expect(accessHeaders({ CF_ACCESS_CLIENT_ID: "id" })).toEqual({});
    expect(accessHeaders({ CF_ACCESS_CLIENT_ID: "id", CF_ACCESS_CLIENT_SECRET: "s" })).toEqual({
      "CF-Access-Client-Id": "id",
      "CF-Access-Client-Secret": "s",
    });
  });

  it("prints one row per address and lists the flags under the table", () => {
    const out = formatTable([
      evaluateRow(hero, ok(roof("south-gable.json")), "fixtures"),
      evaluateRow({ ...hero, label: "wrong", expectedVerdict: "weak" }, ok(roof("south-gable.json")), "fixtures"),
      evaluateRow(noCoverage, { status: 404, ms: 9, body: { error: "NO_COVERAGE" } }, "fixtures"),
    ]);
    const lines = out.split("\n");
    expect(lines[0]).toMatch(/^#\s+address\s+HTTP/);
    expect(lines.slice(2, 5).map((l) => l.trim().split(/\s+/).at(-1))).toEqual(["ok", "FLAG", "ok"]);
    expect(out).toContain("NO_COVERAGE");
    expect(out).toContain("#2 wrong: verdict strong, expected weak");
  });
});
