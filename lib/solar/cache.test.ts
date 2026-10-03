import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { UpstreamError, type FindClosestRequest, type GoogleCallResult } from "./client";
import {
  clampMaxAgeDays,
  createSolarStore,
  distanceMeters,
  entryFileName,
  storeOptionsFromEnv,
  type CacheEntry,
  type StoreOptions,
} from "./cache";

const DAY = 86_400_000;
const T0 = Date.parse("2026-10-03T12:00:00Z");
const syntheticDir = path.join(process.cwd(), "fixtures/synthetic");
const SOUTH = { lat: 49.25, lng: -123.15 }; // synthetic south-gable

/** A real-shaped Google body, moved so it can't be confused with the synthetic roof. */
function googleBody(lat: number, lng: number) {
  const b = JSON.parse(readFileSync(path.join(syntheticDir, "south-gable.json"), "utf8"));
  const dLat = lat - b.center.latitude;
  const dLng = lng - b.center.longitude;
  b.name = `buildings/TEST-${lat}-${lng}`;
  b.center = { latitude: lat, longitude: lng };
  for (const c of [b.boundingBox.sw, b.boundingBox.ne]) {
    c.latitude += dLat;
    c.longitude += dLng;
  }
  return b; // bbox ≈ ±6 m lat, ±9.5 m lng around the center
}

/** Metres → degrees north at BC latitudes. */
const north = (p: { lat: number; lng: number }, m: number) => ({ lat: p.lat + m / 111_195, lng: p.lng });

let dir: string;
let t: number;
let logs: string[];
const calls: FindClosestRequest[] = [];
let google: (req: FindClosestRequest) => Promise<GoogleCallResult>;

function store(over: Partial<StoreOptions> = {}) {
  return createSolarStore({
    source: "cache",
    cacheDir: dir,
    syntheticDir,
    maxAgeDays: 25,
    memoryTtlMs: 0, // most tests exercise the disk layer; memory tests opt in
    expandedCoverage: false,
    now: () => t,
    findClosest: (req) => {
      calls.push(req);
      return google(req);
    },
    log: (l) => logs.push(l),
    ...over,
  });
}

const entryFiles = () => {
  try {
    return readdirSync(path.join(dir, "building"));
  } catch {
    return [];
  }
};

function seed(entry: CacheEntry, file = entryFileName(Date.parse(entry.fetchedAt), { experiments: [], ...entry.request } as FindClosestRequest)) {
  mkdirSync(path.join(dir, "building"), { recursive: true });
  writeFileSync(path.join(dir, "building", file), JSON.stringify(entry));
  return file;
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "solar-cache-"));
  t = T0;
  logs = [];
  calls.length = 0;
  google = async (req) => ({ status: 200, body: googleBody(req.lat, req.lng) });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("helpers", () => {
  it("clamps max age to ≤ 29 days and defaults to 25", () => {
    expect(clampMaxAgeDays(undefined)).toBe(25);
    expect(clampMaxAgeDays("")).toBe(25);
    expect(clampMaxAgeDays("abc")).toBe(25);
    expect(clampMaxAgeDays("0")).toBe(25);
    expect(clampMaxAgeDays("10")).toBe(10);
    expect(clampMaxAgeDays("30")).toBe(29);
    expect(clampMaxAgeDays(365)).toBe(29);
    expect(storeOptionsFromEnv({ SOLAR_CACHE_MAX_AGE_DAYS: "45" }).maxAgeDays).toBe(29);
  });

  it("reads SOLAR_SOURCE, falling back to fixtures", () => {
    const env = (e: Record<string, string>) => storeOptionsFromEnv(e);
    expect(env({}).source).toBe("fixtures");
    expect(env({ SOLAR_SOURCE: "cache" }).source).toBe("cache");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(env({ SOLAR_SOURCE: "google" }).source).toBe("fixtures");
    expect(env({ SOLAR_EXPANDED_COVERAGE: "1" }).expandedCoverage).toBe(true);
  });

  it("names entries <date>_<lat.5f>_<lng.5f>.json", () => {
    const req: FindClosestRequest = { lat: 49.26, lng: -123.11, requiredQuality: "LOW", experiments: [] };
    expect(entryFileName(T0, req)).toBe("2026-10-03_49.26000_-123.11000.json");
    expect(entryFileName(T0, { ...req, requiredQuality: "BASE", experiments: ["EXPANDED_COVERAGE"] })).toBe(
      "2026-10-03_49.26000_-123.11000_expanded_coverage.json",
    );
  });

  it("measures metres", () => {
    expect(distanceMeters(SOUTH, north(SOUTH, 100))).toBeCloseTo(100, 0);
  });
});

describe("cache mode", () => {
  const P = { lat: 49.3, lng: -123.1 };

  it("calls Google once with requiredQuality=LOW and writes an atomic entry", async () => {
    const r = await store().lookup(P.lat, P.lng);
    expect(r).toMatchObject({ status: 200, source: "live", layer: "google" });
    expect(calls).toEqual([{ lat: P.lat, lng: P.lng, requiredQuality: "LOW", experiments: [] }]);

    const files = entryFiles();
    expect(files).toEqual(["2026-10-03_49.30000_-123.10000.json"]); // no temp files left behind
    const entry = JSON.parse(readFileSync(path.join(dir, "building", files[0]), "utf8"));
    expect(entry).toMatchObject({
      fetchedAt: "2026-10-03T12:00:00.000Z",
      request: { lat: P.lat, lng: P.lng, requiredQuality: "LOW", experiments: [] },
      status: 200,
    });
    expect(entry.body.name).toBe(`buildings/TEST-${P.lat}-${P.lng}`);
    expect(logs.some((l) => /source=live layer=google quality=HIGH status=200 ms=\d+/.test(l))).toBe(true);
  });

  it("serves a point inside the cached bbox from disk, without calling Google", async () => {
    await store().lookup(P.lat, P.lng);
    const fresh = store(); // new process: empty memory, same disk
    const r = await fresh.lookup(north(P, 5).lat, P.lng + 0.0001); // ~5 m N, ~7 m E: inside the bbox
    expect(r).toMatchObject({ status: 200, source: "cache", layer: "disk" });
    expect(calls).toHaveLength(1);
  });

  it("caches 404s and matches them only within 5 m of the original point", async () => {
    google = async () => ({ status: 404, body: { error: { code: 404, status: "NOT_FOUND" } } });
    expect(await store().lookup(P.lat, P.lng)).toMatchObject({ status: 404, source: "live", layer: "google" });
    expect(entryFiles()).toHaveLength(1);

    const near = north(P, 4);
    expect(await store().lookup(near.lat, near.lng)).toMatchObject({ status: 404, source: "cache", layer: "disk" });
    expect(calls).toHaveLength(1);

    const far = north(P, 6);
    await store().lookup(far.lat, far.lng);
    expect(calls).toHaveLength(2);
  });

  it("prefers the newest matching entry", async () => {
    const old = googleBody(P.lat, P.lng);
    old.name = "buildings/OLD";
    seed({ fetchedAt: new Date(T0 - 3 * DAY).toISOString(), request: { ...P, requiredQuality: "LOW" }, status: 200, body: old });
    const neu = googleBody(P.lat, P.lng);
    neu.name = "buildings/NEW";
    seed({ fetchedAt: new Date(T0 - DAY).toISOString(), request: { ...P, requiredQuality: "LOW" }, status: 200, body: neu });

    const r = await store().lookup(P.lat, P.lng);
    expect(r.status === 200 && r.building.name).toBe("buildings/NEW");
    expect(calls).toHaveLength(0);
  });

  it("ignores entries older than max age on read (fetchedAt, not mtime) and refetches", async () => {
    seed({ fetchedAt: new Date(T0 - 26 * DAY).toISOString(), request: { ...P, requiredQuality: "LOW" }, status: 200, body: googleBody(P.lat, P.lng) });
    const r = await store().lookup(P.lat, P.lng);
    expect(r).toMatchObject({ source: "live", layer: "google" });
    expect(calls).toHaveLength(1);
  });

  it("expires an entry once the injected clock passes max age", async () => {
    const s = store({ maxAgeDays: 10 });
    await s.lookup(P.lat, P.lng);
    t = T0 + 10 * DAY;
    expect(await s.lookup(P.lat, P.lng)).toMatchObject({ layer: "disk" });
    t = T0 + 10 * DAY + 1;
    expect(await s.lookup(P.lat, P.lng)).toMatchObject({ layer: "google" });
    expect(calls).toHaveLength(2);
  });

  it("never lets max age exceed 29 days", async () => {
    seed({ fetchedAt: new Date(T0 - 29 * DAY - 1).toISOString(), request: { ...P, requiredQuality: "LOW" }, status: 200, body: googleBody(P.lat, P.lng) });
    await store({ maxAgeDays: 60 }).lookup(P.lat, P.lng);
    expect(calls).toHaveLength(1);
  });

  it("prune deletes expired, unreadable and stale temp files; keeps fresh ones", async () => {
    // Temp-file age comes from mtime (real time), so put the injected clock 2 h after the real now.
    t = Date.now() + 2 * 3_600_000;
    const keep = seed({ fetchedAt: new Date(t - DAY).toISOString(), request: { ...P, requiredQuality: "LOW" }, status: 404, body: {} });
    seed({ fetchedAt: new Date(t - 26 * DAY).toISOString(), request: { lat: 49.4, lng: -123.2, requiredQuality: "LOW" }, status: 404, body: {} });
    writeFileSync(path.join(dir, "building", "garbage.json"), "{not json");
    writeFileSync(path.join(dir, "building", ".x.json.123.tmp"), "{}");

    expect(await store().prune()).toBe(3);
    expect(entryFiles()).toEqual([keep]);
  });

  it("does not cache upstream errors", async () => {
    google = async () => {
      throw new UpstreamError("Google 503: UNAVAILABLE", 503);
    };
    const s = store({ memoryTtlMs: 60_000 });
    await expect(s.lookup(P.lat, P.lng)).rejects.toBeInstanceOf(UpstreamError);
    expect(entryFiles()).toHaveLength(0);
    expect(logs.some((l) => l.includes("status=502"))).toBe(true);

    google = async (req) => ({ status: 200, body: googleBody(req.lat, req.lng) });
    expect(await s.lookup(P.lat, P.lng)).toMatchObject({ status: 200, layer: "google" });
  });

  it("treats a 200 that fails validation as upstream, and doesn't save it", async () => {
    google = async () => ({ status: 200, body: { name: "buildings/x" } });
    await expect(store().lookup(P.lat, P.lng)).rejects.toBeInstanceOf(UpstreamError);
    expect(entryFiles()).toHaveLength(0);
  });
});

describe("memory layer", () => {
  const P = { lat: 49.3, lng: -123.1 };

  it("shares the in-flight promise: two simultaneous lookups make one Google call", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    google = async (req) => {
      await gate;
      return { status: 200, body: googleBody(req.lat, req.lng) };
    };
    const s = store({ memoryTtlMs: 60_000 });
    const a = s.lookup(P.lat, P.lng);
    const b = s.lookup(P.lat, P.lng);
    release();
    expect(await a).toMatchObject({ source: "live", layer: "google" });
    expect(await b).toMatchObject({ source: "cache", layer: "memory" });
    expect(calls).toHaveLength(1);
  });

  it("answers bbox matches from memory until the TTL passes", async () => {
    const s = store({ memoryTtlMs: 60_000 });
    await s.lookup(P.lat, P.lng);
    const inside = north(P, 3);
    expect(await s.lookup(inside.lat, inside.lng)).toMatchObject({ layer: "memory", source: "cache" });
    t += 60_001;
    expect(await s.lookup(inside.lat, inside.lng)).toMatchObject({ layer: "disk" });
    expect(calls).toHaveLength(1);
  });
});

describe("live mode", () => {
  it("never touches disk", async () => {
    const s = store({ source: "live", memoryTtlMs: 60_000 });
    expect(await s.lookup(49.3, -123.1)).toMatchObject({ source: "live", layer: "google" });
    expect(await s.lookup(49.3, -123.1)).toMatchObject({ source: "cache", layer: "memory" });
    expect(entryFiles()).toHaveLength(0);
    expect(calls).toHaveLength(1);
  });
});

describe("fixtures mode", () => {
  it("serves the nearest synthetic roof within 250 m and never calls Google", async () => {
    const s = store({ source: "fixtures" });
    const r = await s.lookup(SOUTH.lat, SOUTH.lng);
    expect(r).toMatchObject({ status: 200, source: "fixture", layer: "synthetic" });
    expect(r.status === 200 && r.building.name).toBe("buildings/SYNTHETIC-south-gable");

    const p240 = north(SOUTH, 240);
    expect(await s.lookup(p240.lat, p240.lng)).toMatchObject({ status: 200, source: "fixture" });
    const p260 = north(SOUTH, 260);
    expect(await s.lookup(p260.lat, p260.lng)).toMatchObject({ status: 404, source: "fixture", layer: "none" });
    expect(await s.lookup(53.9171, -122.7497)).toMatchObject({ status: 404 });

    const shaded = await s.lookup(49.2615, -123.1702);
    expect(shaded.status === 200 && shaded.building.name).toBe("buildings/SYNTHETIC-shaded-gable");
    expect(calls).toHaveLength(0);
    expect(entryFiles()).toHaveLength(0);
  });

  it("serves fresh disk entries first, as source=cache", async () => {
    const P = { lat: 49.3, lng: -123.1 };
    seed({ fetchedAt: new Date(T0 - DAY).toISOString(), request: { ...P, requiredQuality: "LOW" }, status: 200, body: googleBody(P.lat, P.lng) });
    expect(await store({ source: "fixtures" }).lookup(P.lat, P.lng)).toMatchObject({ status: 200, source: "cache", layer: "disk" });
    expect(calls).toHaveLength(0);
  });
});

describe("SOLAR_EXPANDED_COVERAGE", () => {
  const P = { lat: 49.3, lng: -123.1 };
  const notFound = async () => ({ status: 404 as const, body: {} });

  it("off: one call, no retry", async () => {
    google = notFound;
    await store().lookup(P.lat, P.lng);
    expect(calls.map((c) => c.requiredQuality)).toEqual(["LOW"]);
  });

  it("on: one BASE retry with experiments=EXPANDED_COVERAGE, each call cached", async () => {
    google = async (req) => (req.requiredQuality === "LOW" ? { status: 404, body: {} } : { status: 200, body: googleBody(req.lat, req.lng) });
    const r = await store({ expandedCoverage: true }).lookup(P.lat, P.lng);
    expect(r).toMatchObject({ status: 200, source: "live" });
    expect(calls).toEqual([
      { ...P, requiredQuality: "LOW", experiments: [] },
      { ...P, requiredQuality: "BASE", experiments: ["EXPANDED_COVERAGE"] },
    ]);
    expect(entryFiles()).toHaveLength(2);

    expect(await store({ expandedCoverage: true }).lookup(P.lat, P.lng)).toMatchObject({ status: 200, layer: "disk" });
    expect(calls).toHaveLength(2);
  });

  it("a 404 cached with the flag off doesn't block the retry once it's on", async () => {
    google = notFound;
    await store().lookup(P.lat, P.lng);
    expect(calls).toHaveLength(1);

    await store({ expandedCoverage: true }).lookup(P.lat, P.lng);
    expect(calls.map((c) => c.requiredQuality)).toEqual(["LOW", "BASE"]);

    // both 404s cached now: no more calls
    await store({ expandedCoverage: true }).lookup(P.lat, P.lng);
    expect(calls).toHaveLength(2);
  });
});
