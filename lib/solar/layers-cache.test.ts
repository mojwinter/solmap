import { mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { LookupResult } from "./cache";
import { dataLayersRequestFor, UpstreamError, type DataLayersRequest, type GoogleCallResult } from "./client";
import { createLayersStore, type LayersStoreOptions } from "./layers-cache";
import { buildingInsightsSchema, type SolarBuilding } from "./schema";
import { makeLayerPair } from "./test-rasters";

const DAY = 86_400_000;
const T0 = Date.parse("2026-10-03T12:00:00Z");
const syntheticDir = path.join(process.cwd(), "fixtures/synthetic");
const roof = (f: string): SolarBuilding =>
  buildingInsightsSchema.parse(JSON.parse(readFileSync(path.join(syntheticDir, `${f}.json`), "utf8")));

/** A "real" building: the synthetic south gable renamed, as if Google had returned it. */
const REAL = { ...roof("south-gable"), name: "buildings/REAL-1" };
const P = { lat: REAL.center.latitude, lng: REAL.center.longitude };
const rasters = makeLayerPair({ lat: P.lat, lng: P.lng, width: 80, height: 80, pixelMeters: 0.25 });

const FLUX_URL = "https://solar.googleapis.com/v1/geoTiff:get?id=flux-abc";
const MASK_URL = "https://solar.googleapis.com/v1/geoTiff:get?id=mask-abc";
const layersBody = {
  imageryDate: { year: 2024, month: 8, day: 15 },
  imageryProcessedDate: { year: 2025, month: 3, day: 1 },
  imageryQuality: "HIGH",
  dsmUrl: "https://solar.googleapis.com/v1/geoTiff:get?id=dsm",
  rgbUrl: "https://solar.googleapis.com/v1/geoTiff:get?id=rgb",
  annualFluxUrl: FLUX_URL,
  maskUrl: MASK_URL,
};

let dir: string;
let t: number;
let logs: string[];
let building: LookupResult;
let layersCalls: DataLayersRequest[];
let downloads: string[];
let google: (req: DataLayersRequest) => Promise<GoogleCallResult>;

function store(over: Partial<LayersStoreOptions> = {}) {
  return createLayersStore({
    source: "cache",
    cacheDir: dir,
    maxAgeDays: 25,
    memoryTtlMs: 0,
    buildings: { lookup: async () => building },
    now: () => t,
    fetchDataLayers: (req) => {
      layersCalls.push(req);
      return google(req);
    },
    downloadGeoTiff: async (url) => {
      downloads.push(url);
      return url === FLUX_URL ? rasters.flux : rasters.mask;
    },
    log: (l) => logs.push(l),
    ...over,
  });
}

const files = (sub: string) => {
  try {
    return readdirSync(path.join(dir, sub)).sort();
  } catch {
    return [];
  }
};

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "solar-layers-"));
  t = T0;
  logs = [];
  layersCalls = [];
  downloads = [];
  building = { status: 200, building: REAL, source: "cache", layer: "disk" };
  google = async () => ({ status: 200, body: layersBody });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("dataLayersRequestFor", () => {
  it("centres on the building with a clamped radius and the findClosest quality", () => {
    const req = dataLayersRequestFor(REAL);
    expect(req).toMatchObject({
      lat: REAL.center.latitude,
      lng: REAL.center.longitude,
      view: "IMAGERY_AND_ANNUAL_FLUX_LAYERS",
      pixelSizeMeters: 0.25,
      requiredQuality: "LOW",
      experiments: [],
    });
    expect(req.radiusMeters).toBe(17); // ~22.5 m bbox diagonal → 11.3 + 5 m margin → 17

    const box = (m: number) => ({
      ...REAL,
      boundingBox: { sw: REAL.center, ne: { latitude: REAL.center.latitude + m / 111_195, longitude: REAL.center.longitude } },
    });
    expect(dataLayersRequestFor(box(4)).radiusMeters).toBe(15); // tiny → clamped up
    expect(dataLayersRequestFor(box(200)).radiusMeters).toBe(50); // huge → clamped down
  });

  it("asks for EXPANDED_COVERAGE when the building is BASE imagery", () => {
    expect(dataLayersRequestFor(roof("base-quality"))).toMatchObject({ requiredQuality: "BASE", experiments: ["EXPANDED_COVERAGE"] });
  });
});

describe("cache mode", () => {
  it("one dataLayers call + two raster downloads, saved as JSON + bytes", async () => {
    const r = await store().lookup(P.lat, P.lng);
    expect(r).toMatchObject({ status: 200, buildingId: "buildings/REAL-1", source: "live", layer: "google", imagery: { quality: "HIGH", date: "2024-08-15" } });
    expect(layersCalls).toHaveLength(1);
    expect(downloads.sort()).toEqual([FLUX_URL, MASK_URL]); // never dsm/rgb

    expect(files("layers")).toEqual([`2026-10-03_${P.lat.toFixed(5)}_${P.lng.toFixed(5)}.json`]);
    expect(files("geotiff")).toHaveLength(2);
    const entry = JSON.parse(readFileSync(path.join(dir, "layers", files("layers")[0]), "utf8"));
    expect(entry).toMatchObject({ fetchedAt: "2026-10-03T12:00:00.000Z", status: 200, request: { buildingId: "buildings/REAL-1" } });
    expect(files("geotiff")).toEqual([`${entry.tiffs.annualFlux}.tif`, `${entry.tiffs.mask}.tif`].sort());
    expect(JSON.stringify(entry)).not.toContain("key=");
    expect(logs.some((l) => /kind=layers .* source=live layer=google quality=HIGH status=200/.test(l))).toBe(true);
  });

  it("bounds come from the mask raster", async () => {
    const r = await store().lookup(P.lat, P.lng);
    if (r.status !== 200) throw new Error("expected 200");
    expect((r.bounds.sw.lat + r.bounds.ne.lat) / 2).toBeCloseTo(P.lat, 5);
    expect((r.bounds.ne.lat - r.bounds.sw.lat) * 111_195).toBeCloseTo(20, 0); // 80 px × 0.25 m
  });

  it("a fresh process serves the same building from disk without calling Google", async () => {
    await store().lookup(P.lat, P.lng);
    const r = await store().lookup(P.lat, P.lng);
    expect(r).toMatchObject({ status: 200, source: "cache", layer: "disk" });
    expect(layersCalls).toHaveLength(1);
    expect(downloads).toHaveLength(2);
  });

  it("matches by building id, not by point", async () => {
    await store().lookup(P.lat, P.lng);
    expect(await store().lookup(P.lat + 0.00003, P.lng)).toMatchObject({ layer: "disk" }); // same building, other point
    building = { status: 200, building: { ...REAL, name: "buildings/REAL-2" }, source: "cache", layer: "disk" };
    await store().lookup(P.lat, P.lng);
    expect(layersCalls).toHaveLength(2);
  });

  it("never calls dataLayers when there's no building", async () => {
    building = { status: 404, source: "cache", layer: "disk" };
    expect(await store().lookup(P.lat, P.lng)).toMatchObject({ status: 404 });
    expect(layersCalls).toHaveLength(0);
  });

  it("caches a dataLayers 404", async () => {
    google = async () => ({ status: 404, body: { error: { code: 404, status: "NOT_FOUND" } } });
    expect(await store().lookup(P.lat, P.lng)).toMatchObject({ status: 404, source: "live" });
    expect(await store().lookup(P.lat, P.lng)).toMatchObject({ status: 404, source: "cache", layer: "disk" });
    expect(layersCalls).toHaveLength(1);
    expect(files("geotiff")).toEqual([]);
  });

  it("ignores entries past max age and fetches again", async () => {
    await store({ maxAgeDays: 10 }).lookup(P.lat, P.lng);
    t = T0 + 10 * DAY + 1;
    expect(await store({ maxAgeDays: 10 }).lookup(P.lat, P.lng)).toMatchObject({ layer: "google" });
    expect(layersCalls).toHaveLength(2);
  });

  it("refuses raster URLs that aren't geoTiff:get, and saves nothing", async () => {
    google = async () => ({ status: 200, body: { ...layersBody, maskUrl: "https://evil.example/x.tif" } });
    await expect(store().lookup(P.lat, P.lng)).rejects.toBeInstanceOf(UpstreamError);
    expect(downloads).toEqual([]);
    expect(files("layers")).toEqual([]);
  });

  it("never writes upstream errors to disk; remembers them for 5 minutes (H1)", async () => {
    google = async () => {
      throw new UpstreamError("Google 429: RESOURCE_EXHAUSTED", 429);
    };
    const s = store({ memoryTtlMs: 60_000 });
    await expect(s.lookup(P.lat, P.lng)).rejects.toBeInstanceOf(UpstreamError);
    expect(files("layers")).toEqual([]);
    google = async () => ({ status: 200, body: layersBody });
    await expect(s.lookup(P.lat, P.lng)).rejects.toBeInstanceOf(UpstreamError);
    expect(layersCalls).toHaveLength(1);
    t += 5 * 60_000 + 1;
    expect(await s.lookup(P.lat, P.lng)).toMatchObject({ status: 200, layer: "google" });
    expect(layersCalls).toHaveLength(2);
  });

  it("shares the in-flight call between simultaneous lookups", async () => {
    const s = store({ memoryTtlMs: 60_000 });
    const [a, b] = await Promise.all([s.lookup(P.lat, P.lng), s.lookup(P.lat, P.lng)]);
    expect([a.layer, b.layer]).toEqual(["google", "memory"]);
    expect(layersCalls).toHaveLength(1);
  });
});

describe("heatmap(id)", () => {
  it("returns the PNG from memory, and from disk after a restart", async () => {
    const r = await store({ memoryTtlMs: 60_000 }).lookup(P.lat, P.lng);
    if (r.status !== 200) throw new Error("expected 200");
    expect(r.id).toMatch(/^[0-9a-f]{32}$/);

    const fresh = store();
    const png = await fresh.heatmap(r.id);
    expect(png).not.toBeNull();
    const img = PNG.sync.read(Buffer.from(png!));
    expect([img.width, img.height]).toEqual([80, 80]);
    expect(layersCalls).toHaveLength(1);
  });

  it("is null for unknown, malformed or expired ids", async () => {
    const r = await store().lookup(P.lat, P.lng);
    if (r.status !== 200) throw new Error("expected 200");
    expect(await store().heatmap("0".repeat(32))).toBeNull();
    expect(await store().heatmap("../../etc/passwd")).toBeNull();
    t = T0 + 26 * DAY;
    expect(await store().heatmap(r.id)).toBeNull();
  });
});

describe("fixtures mode", () => {
  it("draws a synthetic heatmap for a synthetic roof, without Google", async () => {
    building = { status: 200, building: roof("south-gable"), source: "fixture", layer: "synthetic" };
    const s = store({ source: "fixtures" });
    const r = await s.lookup(49.25, -123.15);
    expect(r).toMatchObject({ status: 200, source: "fixture", layer: "synthetic", buildingId: "buildings/SYNTHETIC-south-gable" });
    if (r.status !== 200) throw new Error("expected 200");
    const img = PNG.sync.read(Buffer.from((await s.heatmap(r.id))!));
    expect(img.width).toBeGreaterThan(10);
    expect(layersCalls).toHaveLength(0);
    expect(files("layers")).toEqual([]);
  });

  it("serves cached real layers, and 404s (without Google) when there are none", async () => {
    await store().lookup(P.lat, P.lng); // warm in cache mode
    expect(await store({ source: "fixtures" }).lookup(P.lat, P.lng)).toMatchObject({ status: 200, source: "cache", layer: "disk" });
    building = { status: 200, building: { ...REAL, name: "buildings/REAL-cold" }, source: "cache", layer: "disk" };
    expect(await store({ source: "fixtures" }).lookup(P.lat, P.lng)).toMatchObject({ status: 404, layer: "none" });
    expect(layersCalls).toHaveLength(1);
  });
});

describe("live mode", () => {
  it("never writes to disk", async () => {
    expect(await store({ source: "live" }).lookup(P.lat, P.lng)).toMatchObject({ status: 200, source: "live" });
    expect(files("layers")).toEqual([]);
    expect(files("geotiff")).toEqual([]);
  });
});

describe("prune", () => {
  it("deletes expired entries and rasters nothing references; keeps live ones and fresh orphans", async () => {
    // Raster age for orphans is the file mtime (real clock), so run the injected clock 2 h ahead.
    t = Date.now() + 2 * 3_600_000;
    await store().lookup(P.lat, P.lng); // live entry + 2 rasters
    const keep = [...files("layers"), ...files("geotiff")];

    // an expired entry whose rasters must go with it
    building = { status: 200, building: { ...REAL, name: "buildings/OLD", center: { latitude: 49.3, longitude: -123.1 } }, source: "cache", layer: "disk" };
    const t2 = t;
    t = t2 - 26 * DAY;
    google = async () => ({ status: 200, body: { ...layersBody, annualFluxUrl: FLUX_URL + "-old", maskUrl: MASK_URL + "-old" } });
    await store().lookup(49.3, -123.1);
    t = t2;
    expect(files("layers")).toHaveLength(2);
    expect(files("geotiff")).toHaveLength(4);

    // a stray orphan raster: old (deleted) and a brand-new one (kept: may belong to an entry being written)
    mkdirSync(path.join(dir, "geotiff"), { recursive: true });
    writeFileSync(path.join(dir, "geotiff", `${"a".repeat(64)}.tif`), "II*");
    writeFileSync(path.join(dir, "geotiff", `${"b".repeat(64)}.tif`), "II*");
    const future = new Date(t + 60_000);
    utimesSync(path.join(dir, "geotiff", `${"b".repeat(64)}.tif`), future, future);

    expect(await store().prune()).toBe(1 + 2 + 1); // old entry, its 2 rasters, the old orphan
    expect([...files("layers"), ...files("geotiff")].sort()).toEqual([...keep, `${"b".repeat(64)}.tif`].sort());
  });

  it("copes with a missing cache dir", async () => {
    expect(await store({ cacheDir: path.join(dir, "nope") }).prune()).toBe(0);
  });
});
