import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GET } from "@/app/api/solar/building/route";

const cacheDir = mkdtempSync(path.join(tmpdir(), "solar-route-"));
const env = { ...process.env };
let ipSeq = 0;

function get(query: string, ip = `192.0.2.${++ipSeq}`) {
  return GET(new Request(`http://localhost/api/solar/building?${query}`, { headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } }));
}

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
  process.env.RATE_LIMIT_PER_MINUTE = "5";
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterAll(() => {
  process.env = env;
  resetSingletons();
  rmSync(cacheDir, { recursive: true, force: true });
});

describe("GET /api/solar/building (SOLAR_SOURCE=fixtures)", () => {
  it("200 → BuildingResponse for the synthetic south gable", async () => {
    const res = await get("lat=49.25&lng=-123.15");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = await res.json();
    expect(body).toMatchObject({
      buildingId: "buildings/SYNTHETIC-south-gable",
      center: { lat: 49.25, lng: -123.1500206 },
      imagery: { quality: "HIGH", date: "2024-08-15" },
      source: "fixture",
    });
    expect(body.panels.length).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toMatch(/"latitude"/);
  });

  it("200 for the shaded gable", async () => {
    const body = await (await get("lat=49.2615&lng=-123.1702")).json();
    expect(body.buildingId).toBe("buildings/SYNTHETIC-shaded-gable");
  });

  it("404 NO_COVERAGE away from any roof", async () => {
    const res = await get("lat=53.9171&lng=-122.7497");
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toMatchObject({ error: "NO_COVERAGE", message: expect.any(String) });
  });

  it.each([
    ["missing lng", "lat=49.25"],
    ["not a number", "lat=abc&lng=-123.15"],
    ["exponent", "lat=4.925e1&lng=-123.15"],
    ["south of BC", "lat=47.6&lng=-122.3"],
    ["east of BC", "lat=50&lng=-113.9"],
    ["positive lng", "lat=49.25&lng=123.15"],
  ])("400 BAD_REQUEST: %s", async (_name, query) => {
    const res = await get(query);
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toMatchObject({ error: "BAD_REQUEST", message: expect.any(String) });
  });

  it("429 RATE_LIMITED per first X-Forwarded-For IP", async () => {
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await get("lat=49.25&lng=-123.15", "203.0.113.9")).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    const res = await get("lat=49.25&lng=-123.15", "203.0.113.9");
    expect(await res.json()).toEqual({ error: "RATE_LIMITED" });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await get("lat=49.25&lng=-123.15", "203.0.113.10")).status).toBe(200);
  });

  it("502 UPSTREAM when Google can't be reached (live mode, no key)", async () => {
    resetSingletons();
    process.env.SOLAR_SOURCE = "live";
    delete process.env.SOLAR_API_KEY;
    const res = await get("lat=49.3&lng=-123.1");
    expect(res.status).toBe(502);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toMatchObject({ error: "UPSTREAM" });
  });

  it("503 'daily limit reached' once the Google budget is spent (C1)", async () => {
    resetSingletons();
    process.env.SOLAR_SOURCE = "live";
    process.env.SOLAR_DAILY_MAX_BUILDING = "0";
    const res = await get("lat=49.31&lng=-123.1");
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ error: "UPSTREAM", message: "daily limit reached" });
  });
});
