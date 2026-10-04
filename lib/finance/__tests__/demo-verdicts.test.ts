import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import demo from "@/fixtures/demo-addresses.json";
import { DEFAULT_INPUTS } from "@/src/config/bc";
import type { BuildingResponse, RatePlan } from "@/src/types/app";
import { finance } from "@/lib/finance";

vi.mock("server-only", () => ({}));

import { GET } from "@/app/api/solar/building/route";

// B → C join: every fixture-mode demo address goes through the real route (synthetic roof lookup,
// schema, trim) and the engine, and must land on its `expectedVerdict` in fixtures/demo-addresses.json.
// The golden recommend cases copy configs by hand, so they can't catch a regenerated synthetic roof.

const cacheDir = mkdtempSync(path.join(tmpdir(), "demo-verdicts-"));
const env = { ...process.env };
let ipSeq = 0;

const resetSingletons = () => {
  const g = globalThis as { __solarStore?: unknown; __solarRateLimiter?: unknown; __solarDailyBudget?: unknown; __solarDiskQuota?: unknown };
  delete g.__solarStore;
  delete g.__solarRateLimiter;
  delete g.__solarDailyBudget;
  delete g.__solarDiskQuota;
};

beforeAll(() => {
  resetSingletons();
  process.env.SOLAR_SOURCE = "fixtures";
  process.env.SOLAR_CACHE_DIR = cacheDir; // never read a developer's real disk cache
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterAll(() => {
  process.env = env;
  resetSingletons();
  rmSync(cacheDir, { recursive: true, force: true });
});

function get(lat: number, lng: number) {
  const headers = { "x-forwarded-for": `192.0.2.${++ipSeq}` };
  return GET(new Request(`http://localhost/api/solar/building?lat=${lat}&lng=${lng}`, { headers }));
}

describe("demo addresses (SOLAR_SOURCE=fixtures)", () => {
  it.each(demo.fixtures)("$label → $expectedVerdict", async (f) => {
    const res = await get(f.lat, f.lng);
    if (f.expectedVerdict === "NO_COVERAGE") {
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ error: "NO_COVERAGE" });
      return;
    }
    expect(res.status).toBe(200);
    const building = (await res.json()) as BuildingResponse;
    const rec = finance.recommend(building, {
      ...DEFAULT_INPUTS,
      ratePlan: f.ratePlan as RatePlan,
      annualConsumptionKwh: f.annualKwh,
    });
    expect(rec.verdict).toBe(f.expectedVerdict);
  });
});
