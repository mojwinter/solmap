/**
 * Security review findings for lib/solar (C1 daily budget + layers limiter, H1 negative cache,
 * H2 nearby in-flight dedupe, M1 disk cap, L1–L4). Injected clock, fake Google, no network.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createDailyBudget, DailyBudgetError, dailyLimitsFromEnv } from "./budget";
import { createSolarStore, entryFileName, outsideBC, type LookupResult, type StoreOptions } from "./cache";
import { callFindClosest, downloadGeoTiff, UpstreamError, type FindClosestRequest, type GoogleCallResult } from "./client";
import { createDiskQuota, mapLimit } from "./disk";
import { createLayersStore } from "./layers-cache";
import { decodeGeoTiff, MAX_RASTER_PX } from "./raster";
import { buildingInsightsSchema } from "./schema";
import { makeGeoTiff, makeLayerPair } from "./test-rasters";

const T0 = Date.parse("2026-10-03T12:00:00Z");
const syntheticDir = path.join(process.cwd(), "fixtures/synthetic");
const southGable = () => JSON.parse(readFileSync(path.join(syntheticDir, "south-gable.json"), "utf8"));

/** A Google-shaped body centred on lat/lng (bbox ≈ ±6 m lat, ±9.5 m lng). */
function googleBody(lat: number, lng: number, over: Record<string, unknown> = {}) {
  const b = southGable();
  const dLat = lat - b.center.latitude;
  const dLng = lng - b.center.longitude;
  b.name = `buildings/T-${lat.toFixed(6)}-${lng.toFixed(6)}`;
  b.center = { latitude: lat, longitude: lng };
  for (const c of [b.boundingBox.sw, b.boundingBox.ne]) {
    c.latitude += dLat;
    c.longitude += dLng;
  }
  return { ...b, ...over };
}
const north = (p: { lat: number; lng: number }, m: number) => ({ lat: p.lat + m / 111_195, lng: p.lng });

let dir: string;
let t: number;
let logs: string[];
let calls: FindClosestRequest[];
let google: (req: FindClosestRequest) => Promise<GoogleCallResult>;

function store(over: Partial<StoreOptions> = {}) {
  return createSolarStore({
    source: "cache",
    cacheDir: dir,
    syntheticDir,
    maxAgeDays: 25,
    memoryTtlMs: 60_000,
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
const entryFiles = (sub = "building") => {
  try {
    return readdirSync(path.join(dir, sub));
  } catch {
    return [];
  }
};

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "solar-safety-"));
  t = T0;
  logs = [];
  calls = [];
  google = async (req) => ({ status: 200, body: googleBody(req.lat, req.lng) });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const P = { lat: 49.3, lng: -123.1 };

describe("C1: daily budget of Google calls", () => {
  it("counts per SKU, refuses past the cap, and resets at UTC midnight", () => {
    let now = Date.parse("2026-10-03T23:59:00Z");
    const lines: string[] = [];
    const b = createDailyBudget({ building: 2, layers: 1 }, () => now, (l) => lines.push(l));
    b.take("building");
    b.take("building");
    expect(() => b.take("building")).toThrow(DailyBudgetError);
    expect(() => b.take("building")).toThrow(/daily limit reached/);
    b.take("layers");
    expect(() => b.take("layers")).toThrow(DailyBudgetError);
    expect(lines.filter((l) => l.includes("EXHAUSTED"))).toHaveLength(2); // logged once per SKU per day

    now = Date.parse("2026-10-04T00:00:01Z");
    expect(b.used("building")).toBe(0);
    b.take("building");
    expect(b.used("building")).toBe(1);
  });

  it("reads SOLAR_DAILY_MAX_* with sane defaults", () => {
    expect(dailyLimitsFromEnv({})).toEqual({ building: 300, layers: 50 });
    expect(dailyLimitsFromEnv({ SOLAR_DAILY_MAX_BUILDING: "10", SOLAR_DAILY_MAX_LAYERS: "0" })).toEqual({ building: 10, layers: 0 });
    expect(dailyLimitsFromEnv({ SOLAR_DAILY_MAX_BUILDING: "lots", SOLAR_DAILY_MAX_LAYERS: "-1" })).toEqual({ building: 300, layers: 50 });
  });

  it("the building store stops calling Google at the cap; cached roofs still work; not negatively cached", async () => {
    const budget = createDailyBudget({ building: 2, layers: 0 }, () => t);
    const s = store({ budget });
    await s.lookup(49.3, -123.1);
    await s.lookup(49.31, -123.1);
    await expect(s.lookup(49.32, -123.1)).rejects.toBeInstanceOf(DailyBudgetError);
    expect(calls).toHaveLength(2);
    expect(logs.some((l) => l.includes("status=503"))).toBe(true);
    expect(await s.lookup(49.3, -123.1)).toMatchObject({ status: 200 }); // cached: no budget needed

    t = Date.parse("2026-10-04T00:00:01Z"); // next UTC day: the same roof works right away
    expect(await s.lookup(49.32, -123.1)).toMatchObject({ status: 200, layer: "google" });
  });

  it("the layers store stops calling Data Layers at its own cap", async () => {
    const budget = createDailyBudget({ building: 100, layers: 0 }, () => t);
    let layersCalls = 0;
    const building: LookupResult = { status: 200, building: buildingInsightsSchema.parse(googleBody(P.lat, P.lng)), source: "cache", layer: "disk" };
    const ls = createLayersStore({
      source: "cache",
      cacheDir: dir,
      maxAgeDays: 25,
      memoryTtlMs: 60_000,
      buildings: { lookup: async () => building },
      now: () => t,
      budget,
      fetchDataLayers: async () => {
        layersCalls++;
        return { status: 404, body: {} };
      },
      log: () => {},
    });
    await expect(ls.lookup(P.lat, P.lng)).rejects.toBeInstanceOf(DailyBudgetError);
    expect(layersCalls).toBe(0);
  });
});

describe("H1: failures are remembered, so retries don't re-bill", () => {
  it("a 200 that fails validation, looked up 3 times → 1 Google call", async () => {
    google = async () => ({ status: 200, body: { name: "buildings/broken" } });
    const s = store();
    for (let i = 0; i < 3; i++) await expect(s.lookup(P.lat, P.lng)).rejects.toBeInstanceOf(UpstreamError);
    expect(calls).toHaveLength(1);
    const near = north(P, 20); // a click 20 m away on the same broken roof
    await expect(s.lookup(near.lat, near.lng)).rejects.toBeInstanceOf(UpstreamError);
    expect(calls).toHaveLength(1);
  });

  it("layers: rasters are saved before rendering, so a render failure isn't bought again", async () => {
    const building: LookupResult = { status: 200, building: buildingInsightsSchema.parse(googleBody(P.lat, P.lng)), source: "cache", layer: "disk" };
    const good = makeLayerPair({ ...P, width: 20, height: 20, pixelMeters: 0.25 });
    let layersCalls = 0;
    const make = () =>
      createLayersStore({
        source: "cache",
        cacheDir: dir,
        maxAgeDays: 25,
        memoryTtlMs: 60_000,
        buildings: { lookup: async () => building },
        now: () => t,
        fetchDataLayers: async () => {
          layersCalls++;
          return {
            status: 200,
            body: {
              imageryDate: { year: 2024, month: 8, day: 15 },
              imageryQuality: "HIGH",
              annualFluxUrl: "https://solar.googleapis.com/v1/geoTiff:get?id=f",
              maskUrl: "https://solar.googleapis.com/v1/geoTiff:get?id=m",
            },
          };
        },
        // The mask is valid TIFF magic but garbage inside: the decode fails after we've paid.
        downloadGeoTiff: async (url) => (url.endsWith("=f") ? good.flux : new Uint8Array([0x49, 0x49, 42, 0, 1, 2, 3])),
        log: () => {},
      });
    const s = make();
    await expect(s.lookup(P.lat, P.lng)).rejects.toThrow(/render failed/);
    await expect(s.lookup(P.lat, P.lng)).rejects.toThrow(/render failed/);
    expect(layersCalls).toBe(1);
    expect(entryFiles("layers")).toHaveLength(1); // saved before the render
    expect(entryFiles("geotiff")).toHaveLength(2);

    await expect(make().lookup(P.lat, P.lng)).rejects.toThrow(/render failed/); // a new process: still no re-buy
    expect(layersCalls).toBe(1);
  });
});

describe("H2: nearby simultaneous lookups share one call", () => {
  it("5 concurrent clicks ~1 m apart on one roof → 1 Google call", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    google = async (req) => {
      await gate;
      return { status: 200, body: googleBody(req.lat, req.lng) };
    };
    const s = store();
    const lookups = [0, 1, 2, 3, 4].map((i) => {
      const q = north(P, i * 1.1);
      return s.lookup(q.lat, q.lng + i * 0.00001);
    });
    release();
    const results = await Promise.all(lookups);
    expect(calls).toHaveLength(1);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(results.filter((r) => r.layer === "memory")).toHaveLength(4);
  });

  it("a nearby in-flight lookup for a different building doesn't block the next one", async () => {
    google = async (req) => ({ status: 200, body: googleBody(req.lat, req.lng) });
    const s = store();
    const a = north(P, 0);
    const b = north(P, 25); // within 30 m, but outside a's ~6 m bbox
    await Promise.all([s.lookup(a.lat, a.lng), s.lookup(b.lat, b.lng)]);
    expect(calls).toHaveLength(2);
  });
});

describe("M1: disk cap and index scanning", () => {
  it("refuses writes past the file cap but still serves the answer", async () => {
    const quota = createDiskQuota({ cacheDir: dir, maxFiles: 1, maxBytes: 10 ** 9, now: () => t, log: (l) => logs.push(l) });
    const s = store({ quota });
    expect(await s.lookup(49.3, -123.1)).toMatchObject({ status: 200 });
    expect(await s.lookup(49.31, -123.1)).toMatchObject({ status: 200 }); // served…
    expect(entryFiles()).toHaveLength(1); // …but not saved
    expect(logs.some((l) => l.includes("cache FULL"))).toBe(true);
  });

  it("refuses writes past the byte cap", async () => {
    const quota = createDiskQuota({ cacheDir: dir, maxFiles: 100, maxBytes: 100, now: () => t, log: () => {} });
    await store({ quota }).lookup(49.3, -123.1);
    expect(entryFiles()).toHaveLength(0);
  });

  it("mapLimit never runs more than `limit` at once", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit(Array.from({ length: 50 }, (_, i) => i), 16, async (i) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 1));
      running--;
      return i * 2;
    });
    expect(peak).toBeLessThanOrEqual(16);
    expect(out[49]).toBe(98);
  });

  it("an entry written by another process after the first scan is still found (dir mtime changed)", async () => {
    const s = store();
    google = async () => ({ status: 404, body: {} });
    await s.lookup(49.4, -123.2); // first scan (and a 404 written)
    const other = { lat: 49.35, lng: -123.15 };
    const file = entryFileName(t, { ...other, requiredQuality: "LOW", experiments: [] });
    mkdirSync(path.join(dir, "building"), { recursive: true });
    writeFileSync(
      path.join(dir, "building", file),
      JSON.stringify({ fetchedAt: new Date(t).toISOString(), request: { ...other, requiredQuality: "LOW", experiments: [] }, status: 200, body: googleBody(other.lat, other.lng) }),
    );
    calls = [];
    expect(await s.lookup(other.lat, other.lng)).toMatchObject({ status: 200, layer: "disk" });
    expect(calls).toHaveLength(0);
  });
});

describe("L1–L4", () => {
  it("L1: Google fetches refuse redirects (the key would follow them)", async () => {
    let init: RequestInit | undefined;
    const fetchFn = (async (_u: unknown, i?: RequestInit) => {
      init = i;
      return new Response("{}", { status: 404 });
    }) as typeof fetch;
    await callFindClosest({ ...P, requiredQuality: "LOW", experiments: [] }, { apiKey: "k", fetch: fetchFn });
    expect(init?.redirect).toBe("error");
  });

  it("L2: an oversized GeoTIFF is refused from Content-Length, and while streaming", async () => {
    const url = "https://solar.googleapis.com/v1/geoTiff:get?id=x";
    let read = false;
    const declared = (async () =>
      new Response(
        new ReadableStream(
          {
            pull() {
              read = true;
            },
          },
          { highWaterMark: 0 }, // pull() only runs when someone actually reads
        ),
        { status: 200, headers: { "content-length": String(50 * 1024 * 1024) } },
      )) as typeof fetch;
    await expect(downloadGeoTiff(url, { apiKey: "k", fetch: declared })).rejects.toThrow(/max/);
    expect(read).toBe(false);

    const chunk = new Uint8Array(1024 * 1024).fill(0x49);
    let sent = 0;
    const streamed = (async () =>
      new Response(
        new ReadableStream({
          pull(c) {
            if (sent++ < 30) c.enqueue(chunk);
            else c.close();
          },
        }),
        { status: 200 },
      )) as typeof fetch;
    await expect(downloadGeoTiff(url, { apiKey: "k", fetch: streamed })).rejects.toThrow(/over/);
    expect(sent).toBeLessThan(30); // stopped early
  });

  it(`L2: rasters over ${MAX_RASTER_PX}px are refused before decoding`, async () => {
    const wide = makeGeoTiff({ ...P, width: MAX_RASTER_PX + 1, height: 1, pixelMeters: 0.25 }, new Uint8Array(MAX_RASTER_PX + 1));
    await expect(decodeGeoTiff(wide)).rejects.toThrow(/max/);
  });

  it("L3: a building Google places outside BC is a 404, and no Data Layers call is made for it", async () => {
    expect(outsideBC({ regionCode: "US", administrativeArea: "WA" })).toBe(true);
    expect(outsideBC({ regionCode: "CA", administrativeArea: "AB" })).toBe(true);
    expect(outsideBC({ regionCode: "CA", administrativeArea: "BC" })).toBe(false);
    expect(outsideBC({ regionCode: "CA", administrativeArea: "British Columbia" })).toBe(false);
    expect(outsideBC({})).toBe(false);

    google = async (req) => ({ status: 200, body: googleBody(req.lat, req.lng, { regionCode: "US", administrativeArea: "WA" }) });
    const s = store();
    expect(await s.lookup(48.99, -122.75)).toMatchObject({ status: 404, reason: "outside-bc" });
    expect(logs.some((l) => l.includes("reason=outside-bc"))).toBe(true);

    let layersCalls = 0;
    const ls = createLayersStore({
      source: "cache",
      cacheDir: dir,
      maxAgeDays: 25,
      memoryTtlMs: 0,
      buildings: s,
      now: () => t,
      fetchDataLayers: async () => {
        layersCalls++;
        return { status: 404, body: {} };
      },
      log: () => {},
    });
    expect(await ls.lookup(48.99, -122.75)).toMatchObject({ status: 404 });
    expect(layersCalls).toBe(0);
  });

  it("L4: logs show 3 decimals, not a home address", async () => {
    await store().lookup(49.261534, -123.162091);
    const line = logs.find((l) => l.startsWith("solar lat="))!;
    expect(line).toContain("lat=49.262 lng=-123.162");
    expect(line).not.toMatch(/49\.2615|123\.1620/);
  });
});
