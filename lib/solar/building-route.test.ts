import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GET } from "@/app/api/solar/building/route";
import { entryFileName } from "@/lib/solar/cache";
import { REASON_HEADER } from "@/lib/solar/get-building";

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

  it("never rate-limits an answer that doesn't call Google: 40 rapid requests from one IP all 200 (#58)", async () => {
    // RATE_LIMIT_PER_MINUTE is 5 here. A venue puts a whole room behind one IP.
    const statuses = [];
    for (let i = 0; i < 40; i++) statuses.push((await get(i % 2 ? "lat=49.25&lng=-123.15" : "lat=53.9171&lng=-122.7497", "203.0.113.9")).status);
    expect(statuses.filter((st) => st === 429)).toEqual([]);
    for (let i = 0; i < 10; i++) expect((await get("lat=abc&lng=1", "203.0.113.9")).status).toBe(400); // and nor is a bad request
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

describe("GET /api/solar/building rate limit (SOLAR_SOURCE=cache, #58)", () => {
  const ROOF = { lat: 49.3, lng: -123.1 };
  const IP = "203.0.113.20";

  beforeAll(() => {
    resetSingletons();
    process.env.SOLAR_SOURCE = "cache";
    process.env.RATE_LIMIT_PER_MINUTE = "5";
    delete process.env.SOLAR_DAILY_MAX_BUILDING;
    delete process.env.SOLAR_API_KEY; // a lookup that gets as far as Google fails (502) without a network call
    // A cached Google answer on disk, as on the VPS after a demo roof is warmed.
    const body = JSON.parse(readFileSync(path.join(process.cwd(), "fixtures/synthetic/south-gable.json"), "utf8"));
    const [dLat, dLng] = [ROOF.lat - body.center.latitude, ROOF.lng - body.center.longitude];
    body.name = "buildings/TEST-cached";
    body.center = { latitude: ROOF.lat, longitude: ROOF.lng };
    for (const c of [body.boundingBox.sw, body.boundingBox.ne]) [c.latitude, c.longitude] = [c.latitude + dLat, c.longitude + dLng];
    const request = { ...ROOF, requiredQuality: "LOW" as const, experiments: [] };
    const fetchedAt = new Date().toISOString();
    mkdirSync(path.join(cacheDir, "building"), { recursive: true });
    writeFileSync(path.join(cacheDir, "building", entryFileName(Date.parse(fetchedAt), request)), JSON.stringify({ fetchedAt, request, status: 200, body }));
  });

  it("40 rapid requests to a cached roof from one IP all return 200", async () => {
    const statuses = [];
    for (let i = 0; i < 40; i++) statuses.push((await get(`lat=${ROOF.lat}&lng=${ROOF.lng}`, IP)).status);
    expect(statuses).toEqual(Array(40).fill(200));
    expect((await (await get(`lat=${ROOF.lat}&lng=${ROOF.lng}`, IP)).json()).source).toBe("cache");
  });

  it("lookups that reach Google are still limited per IP: 5 a minute, then 429 with Retry-After", async () => {
    // Roofs ≥ 110 m apart, so no failure is shared through the 30 m negative cache.
    const uncached = (i: number, ip = IP) => get(`lat=${(49.4 + i * 0.001).toFixed(3)}&lng=-123.2`, ip);
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await uncached(i)).status);
    expect(statuses).toEqual([502, 502, 502, 502, 502, 429]);
    const res = await uncached(6);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "RATE_LIMITED" });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await uncached(7, "203.0.113.21")).status).toBe(502); // another IP has its own bucket
    expect((await get(`lat=${ROOF.lat}&lng=${ROOF.lng}`, IP)).status).toBe(200); // the cached roof still loads
  });
});

describe("GET /api/solar/building for a building outside BC (SOLAR_SOURCE=cache)", () => {
  const ROOF = { lat: 48.99, lng: -122.75 }; // inside BC's box, but Google places the building in WA

  beforeAll(() => {
    resetSingletons();
    process.env.SOLAR_SOURCE = "cache";
    delete process.env.SOLAR_API_KEY;
    const body = JSON.parse(readFileSync(path.join(process.cwd(), "fixtures/synthetic/south-gable.json"), "utf8"));
    const [dLat, dLng] = [ROOF.lat - body.center.latitude, ROOF.lng - body.center.longitude];
    Object.assign(body, { name: "buildings/TEST-wa", regionCode: "US", administrativeArea: "WA" });
    body.center = { latitude: ROOF.lat, longitude: ROOF.lng };
    for (const c of [body.boundingBox.sw, body.boundingBox.ne]) [c.latitude, c.longitude] = [c.latitude + dLat, c.longitude + dLng];
    const request = { ...ROOF, requiredQuality: "LOW" as const, experiments: [] };
    const fetchedAt = new Date().toISOString();
    mkdirSync(path.join(cacheDir, "building"), { recursive: true });
    writeFileSync(path.join(cacheDir, "building", entryFileName(Date.parse(fetchedAt), request)), JSON.stringify({ fetchedAt, request, status: 200, body }));
  });

  it("404 NO_COVERAGE with the outside-BC reason header, so the report can say 'BC only'", async () => {
    const res = await get(`lat=${ROOF.lat}&lng=${ROOF.lng}`);
    expect(res.status).toBe(404);
    expect(res.headers.get(REASON_HEADER)).toBe("outside-bc");
    expect(await res.json()).toMatchObject({ error: "NO_COVERAGE" });
  });

  it("a plain no-coverage 404 has no reason header", async () => {
    process.env.SOLAR_SOURCE = "fixtures";
    resetSingletons();
    const res = await get("lat=53.9171&lng=-122.7497");
    expect(res.status).toBe(404);
    expect(res.headers.get(REASON_HEADER)).toBeNull();
  });
});
