import "server-only";
/**
 * Sun heatmap data (P1), through the same SOLAR_SOURCE rules as buildings (docs/INFRA.md → Data sources):
 *
 *   fixtures  memory → disk cache → synthetic heatmap for a synthetic roof → 404. Never calls Google.
 *   cache     memory → disk cache → Google once per building, saving the dataLayers JSON AND the raster bytes.
 *   live      memory → Google.
 *
 * Data Layers is the expensive SKU, so a lookup first resolves the building (normally a cache hit, since
 * the report already loaded it), never calls dataLayers for a roof we can't see, and caches by building id:
 * one dataLayers call per building per SOLAR_CACHE_MAX_AGE_DAYS. The raster URLs it returns only work
 * for an hour, so both rasters are downloaded straight away and kept as bytes:
 *
 *   <cacheDir>/layers/<YYYY-MM-DD>_<lat.5f>_<lng.5f>.json   { fetchedAt, request, status, body, tiffs }
 *   <cacheDir>/geotiff/<sha256 of Google's id>.tif
 *
 * A .tif lives exactly as long as the layers entry that references it: prune() deletes expired entries,
 * then any .tif no live entry references. What the browser gets is a rendered PNG (lib/solar/raster.ts)
 * behind an id that only ever resolves in our own cache, so /api/solar/heatmap is not a proxy.
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { z } from "zod";
import type { LatLngBounds } from "@/src/types/app";
import type { ImageryQuality } from "@/src/types/solar";
import {
  clampMaxAgeDays,
  getSolarStore,
  INDEX_RESCAN_MS,
  logCoord,
  NEGATIVE_TTL_MS,
  PRUNE_INTERVAL_MS,
  storeOptionsFromEnv,
  type Layer,
  type SolarSourceMode,
  type SolarStore,
} from "./cache";
import {
  callDataLayers,
  dataLayersRequestFor,
  downloadGeoTiff,
  geoTiffId,
  UpstreamError,
  type DataLayersRequest,
  type GoogleCallResult,
} from "./client";
import { DailyBudgetError, getDailyBudget, type DailyBudget } from "./budget";
import { dirMtime, errText, getDiskQuota, inDir, INDEX_CONCURRENCY, listDir, mapLimit, STALE_TMP_MS, writeFileAtomic, type DiskQuota } from "./disk";
import { RateLimitedError, type Gate } from "./ratelimit";
import { decodeGeoTiff, hasRoof, renderHeatmap } from "./raster";
import { dataLayersSchema, imageryQualitySchema, type SolarBuilding } from "./schema";
import { syntheticLayers } from "./synthetic-layers";

type Source = "live" | "cache" | "fixture";

export type LayersResult =
  | {
      status: 200;
      /** Opaque id for GET /api/solar/heatmap?id=…; 32 hex chars. */
      id: string;
      buildingId: string;
      imagery: { quality: ImageryQuality; date: string };
      bounds: LatLngBounds;
      source: Source;
      layer: Layer;
    }
  | { status: 404; source: Source; layer: Layer };

/** Rate limits for one layers lookup (#58); each runs only when its work is about to happen. */
export interface LayersGates {
  /** Passed to the building lookup: runs just before a Building Insights call. */
  building?: Gate;
  /** Runs on a memory miss, before a render (synthetic, or disk read + render) or a Data Layers call. */
  layers?: Gate;
}

export interface LayersStore {
  lookup(lat: number, lng: number, gates?: LayersGates): Promise<LayersResult>;
  /** The heatmap PNG for an id from lookup(), or null if unknown or expired. */
  heatmap(id: string): Promise<Uint8Array | null>;
  /** True if heatmap(id) can answer from memory (no disk read, no render). */
  heatmapInMemory(id: string): boolean;
  /** Deletes expired entries, unreferenced rasters and stale temp files. Returns files deleted. */
  prune(): Promise<number>;
}

export interface LayersStoreOptions {
  source: SolarSourceMode;
  cacheDir: string;
  maxAgeDays: number;
  memoryTtlMs: number;
  /** Resolves lat/lng → building first (normally the app-wide building store). */
  buildings: Pick<SolarStore, "lookup">;
  now?: () => number;
  fetchDataLayers?: (req: DataLayersRequest) => Promise<GoogleCallResult>;
  downloadGeoTiff?: (url: string) => Promise<Uint8Array>;
  log?: (line: string) => void;
  /** Daily cap on Data Layers calls (getDailyBudget() in the app). Absent = no cap. */
  budget?: DailyBudget;
  /** Disk cap (getDiskQuota() in the app). Absent = no cap. */
  quota?: DiskQuota;
  /** How long a failed lookup is remembered, so retries don't re-bill. Default 5 min. */
  negativeTtlMs?: number;
}

const DAY_MS = 86_400_000;
const MEMORY_CAP = 100; // rendered PNGs are ~10–150 KB each
export const HEATMAP_ID_RE = /^[0-9a-f]{32}$/;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const pad = (n: number) => String(n).padStart(2, "0");

/* ───────────── disk entry format ───────────── */

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const layersEntrySchema = z.object({
  fetchedAt: z.string().refine((s) => Number.isFinite(Date.parse(s)), "fetchedAt must be an ISO date"),
  request: z.object({
    buildingId: z.string(),
    lat: z.number(),
    lng: z.number(),
    radiusMeters: z.number(),
    view: z.literal("IMAGERY_AND_ANNUAL_FLUX_LAYERS"),
    pixelSizeMeters: z.number(),
    requiredQuality: imageryQualitySchema,
    experiments: z.array(z.literal("EXPANDED_COVERAGE")).default([]),
  }),
  status: z.union([z.literal(200), z.literal(404)]),
  body: z.unknown(),
  tiffs: z.object({ annualFlux: sha256Schema, mask: sha256Schema }).optional(),
});
type LayersEntry = z.input<typeof layersEntrySchema>;

interface DiskMeta {
  file: string;
  id: string;
  buildingId: string;
  fetchedAtMs: number;
  status: 200 | 404;
  tiffs?: { annualFlux: string; mask: string };
  imagery?: { quality: ImageryQuality; date: string };
}

interface Rendered {
  status: 200 | 404;
  origin: "synthetic" | "disk" | "google" | "none";
  fetchedAtMs?: number;
  id?: string;
  buildingId?: string;
  imagery?: { quality: ImageryQuality; date: string };
  bounds?: LatLngBounds;
  png?: Buffer;
}

interface MemoryEntry {
  promise: Promise<Rendered>;
  settled?: Rendered;
  failed?: boolean;
  expiresAt: number;
}

export function layersFileName(fetchedAtMs: number, req: { lat: number; lng: number }): string {
  return `${new Date(fetchedAtMs).toISOString().slice(0, 10)}_${req.lat.toFixed(5)}_${req.lng.toFixed(5)}.json`;
}

export function createLayersStore(opts: LayersStoreOptions): LayersStore {
  const now = opts.now ?? Date.now;
  const log = opts.log ?? ((line: string) => console.log(line));
  const fetchLayers = opts.fetchDataLayers ?? ((req: DataLayersRequest) => callDataLayers(req));
  const download = opts.downloadGeoTiff ?? ((url: string) => downloadGeoTiff(url));
  const maxAgeMs = clampMaxAgeDays(opts.maxAgeDays) * DAY_MS;
  const layersDir = inDir(opts.cacheDir, "layers");
  const tiffDir = inDir(opts.cacheDir, "geotiff");
  const isExpired = (fetchedAtMs: number) => now() - fetchedAtMs > maxAgeMs;

  /* memory: keyed by building id; holds the in-flight promise and the rendered PNG */
  const memory = new Map<string, MemoryEntry>();
  const memoryIds = new Map<string, string>(); // heatmap id → building id
  /** Synthetic roofs seen this process, so their heatmaps re-render after memory expiry. */
  const syntheticById = new Map<string, SolarBuilding>();

  function memoryGet(buildingId: string): Promise<Rendered> | undefined {
    const hit = memory.get(buildingId);
    if (!hit) return undefined;
    if (hit.expiresAt <= now()) {
      memory.delete(buildingId);
      return undefined;
    }
    memory.delete(buildingId); // bump
    memory.set(buildingId, hit);
    return hit.promise;
  }

  function memorySet(buildingId: string, promise: Promise<Rendered>) {
    const entry: MemoryEntry = { promise, expiresAt: Infinity };
    memory.delete(buildingId);
    memory.set(buildingId, entry);
    while (memory.size > MEMORY_CAP) memory.delete(memory.keys().next().value!);
    promise.then(
      (r) => {
        entry.settled = r;
        const ttlEnd = now() + opts.memoryTtlMs;
        entry.expiresAt = r.fetchedAtMs === undefined ? ttlEnd : Math.min(ttlEnd, r.fetchedAtMs + maxAgeMs);
        if (r.id) memoryIds.set(r.id, buildingId);
      },
      (e) => {
        // Remember failures (H1) so a retry doesn't buy the same Data Layers call again; not the daily cap
        // or a caller's rate limit.
        if (e instanceof DailyBudgetError || e instanceof RateLimitedError) {
          if (memory.get(buildingId) === entry) memory.delete(buildingId);
          return;
        }
        entry.failed = true;
        entry.expiresAt = now() + (opts.negativeTtlMs ?? NEGATIVE_TTL_MS);
      },
    );
  }

  /* rendering */
  async function renderFromTiffs(flux: Uint8Array, mask: Uint8Array): Promise<{ png: Buffer; bounds: LatLngBounds } | null> {
    const [f, m] = await Promise.all([decodeGeoTiff(flux), decodeGeoTiff(mask)]);
    return hasRoof(m) ? { png: renderHeatmap(f, m), bounds: m.bounds } : null;
  }

  function renderSynthetic(b: SolarBuilding): Rendered {
    const id = sha256(`synthetic|${b.name}`).slice(0, 32);
    syntheticById.set(id, b);
    const { flux, mask, bounds } = syntheticLayers(b);
    if (!hasRoof(mask)) return { status: 404, origin: "synthetic" };
    const d = b.imageryDate;
    return {
      status: 200,
      origin: "synthetic",
      id,
      buildingId: b.name,
      imagery: { quality: b.imageryQuality, date: `${d.year}-${pad(d.month)}-${pad(d.day)}` },
      bounds,
      png: renderHeatmap(flux, mask),
    };
  }

  /* disk */
  const index = new Map<string, DiskMeta | null>();

  async function readMeta(file: string): Promise<DiskMeta | null> {
    try {
      const parsed = layersEntrySchema.safeParse(JSON.parse(await fs.readFile(inDir(layersDir, file), "utf8")));
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "invalid entry");
      const { fetchedAt, request, status, body, tiffs } = parsed.data;
      const meta: DiskMeta = { file, id: sha256(`${request.buildingId}|${fetchedAt}`).slice(0, 32), buildingId: request.buildingId, fetchedAtMs: Date.parse(fetchedAt), status };
      if (status === 404) return meta;
      if (!tiffs) throw new Error("200 entry without tiffs");
      const layers = dataLayersSchema.parse(body);
      const d = layers.imageryDate;
      return { ...meta, tiffs, imagery: { quality: layers.imageryQuality, date: `${d.year}-${pad(d.month)}-${pad(d.day)}` } };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      log(`solar layers cache unreadable file=${file} err=${errText(e)}`);
      return null;
    }
  }

  let indexedMtime = -2;
  let indexedAt = -Infinity;

  /** Rescans only when the directory changed (mtime) or every INDEX_RESCAN_MS, 16 files at a time (M1). */
  async function refreshIndex(): Promise<DiskMeta[]> {
    const mtime = await dirMtime(layersDir);
    if (mtime !== indexedMtime || now() - indexedAt > INDEX_RESCAN_MS) {
      const files = new Set((await listDir(layersDir, log)).filter((f) => f.endsWith(".json")));
      for (const f of index.keys()) if (!files.has(f)) index.delete(f);
      const fresh = [...files].filter((f) => !index.has(f));
      await mapLimit(fresh, INDEX_CONCURRENCY, async (f) => index.set(f, await readMeta(f)));
      [indexedMtime, indexedAt] = [mtime, now()];
    }
    return [...index.values()].filter((m): m is DiskMeta => m !== null);
  }

  /** Decode + render, as an UpstreamError on failure so it's remembered (H1) instead of re-bought. */
  async function renderOrThrow(flux: Uint8Array, mask: Uint8Array): Promise<{ png: Buffer; bounds: LatLngBounds } | null> {
    try {
      return await renderFromTiffs(flux, mask);
    } catch (e) {
      throw new UpstreamError(`heatmap render failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * Renders a cached entry. null (entry forgotten, so it's fetched again) only if its rasters are missing
   * or unreadable; a render failure throws instead, because fetching again would just pay for the same bytes.
   */
  async function renderMeta(m: DiskMeta): Promise<Rendered | null> {
    if (m.status === 404) return { status: 404, origin: "disk", fetchedAtMs: m.fetchedAtMs };
    let flux: Buffer;
    let mask: Buffer;
    try {
      [flux, mask] = await Promise.all([
        fs.readFile(inDir(tiffDir, `${m.tiffs!.annualFlux}.tif`)),
        fs.readFile(inDir(tiffDir, `${m.tiffs!.mask}.tif`)),
      ]);
    } catch (e) {
      log(`solar layers cache unreadable rasters file=${m.file} err=${errText(e)}`);
      index.set(m.file, null);
      return null;
    }
    const r = await renderOrThrow(flux, mask);
    if (!r) return { status: 404, origin: "disk", fetchedAtMs: m.fetchedAtMs };
    return { status: 200, origin: "disk", fetchedAtMs: m.fetchedAtMs, id: m.id, buildingId: m.buildingId, imagery: m.imagery, ...r };
  }

  async function diskLookup(buildingId: string): Promise<Rendered | null> {
    const matches = (await refreshIndex())
      .filter((m) => m.buildingId === buildingId && !isExpired(m.fetchedAtMs))
      .sort((a, b) => b.fetchedAtMs - a.fetchedAtMs || a.status - b.status);
    for (const m of matches) {
      const r = await renderMeta(m);
      if (r) return r;
    }
    return null;
  }

  async function writeEntry(entry: LayersEntry, req: DataLayersRequest, fetchedAtMs: number, rasters?: { annualFlux: Uint8Array; mask: Uint8Array }) {
    const file = layersFileName(fetchedAtMs, req);
    const json = JSON.stringify(entry);
    const bytes = Buffer.byteLength(json) + (rasters ? rasters.annualFlux.byteLength + rasters.mask.byteLength : 0);
    if (opts.quota && !(await opts.quota.allow(bytes, rasters ? 3 : 1))) return; // cache full: serve, don't save
    try {
      // Rasters first: an entry on disk always has its bytes.
      if (rasters && entry.tiffs) {
        await writeFileAtomic(tiffDir, `${entry.tiffs.annualFlux}.tif`, rasters.annualFlux);
        await writeFileAtomic(tiffDir, `${entry.tiffs.mask}.tif`, rasters.mask);
      }
      await writeFileAtomic(layersDir, file, json);
      index.delete(file); // re-read on next refresh
    } catch (e) {
      log(`solar layers cache WRITE FAILED file=${file} err=${errText(e)}`);
    }
  }

  async function fetchFromGoogle(b: SolarBuilding): Promise<Rendered> {
    const req = dataLayersRequestFor(b);
    opts.budget?.take("layers"); // throws DailyBudgetError past today's cap (C1)
    const res = await fetchLayers(req);
    const fetchedAtMs = now();
    const fetchedAt = new Date(fetchedAtMs).toISOString();
    const base = { fetchedAt, request: { buildingId: b.name, ...req } };

    if (res.status === 404) {
      if (opts.source === "cache") await writeEntry({ ...base, status: 404, body: res.body }, req, fetchedAtMs);
      return { status: 404, origin: "google", fetchedAtMs };
    }
    const parsed = dataLayersSchema.safeParse(res.body);
    if (!parsed.success) throw new UpstreamError(`dataLayers 200 failed validation: ${parsed.error.issues[0]?.path.join(".")}`, 200);
    const fluxId = geoTiffId(parsed.data.annualFluxUrl);
    const maskId = geoTiffId(parsed.data.maskUrl);
    if (!fluxId || !maskId) throw new UpstreamError("dataLayers returned raster URLs that aren't geoTiff:get", 200);

    const [annualFlux, mask] = await Promise.all([download(parsed.data.annualFluxUrl), download(parsed.data.maskUrl)]);
    // Save what we paid for before rendering (H1): a render bug must not mean buying the same call again.
    const tiffs = { annualFlux: sha256(fluxId), mask: sha256(maskId) };
    if (opts.source === "cache") await writeEntry({ ...base, status: 200, body: res.body, tiffs }, req, fetchedAtMs, { annualFlux, mask });
    const rendered = await renderOrThrow(annualFlux, mask);
    if (!rendered) return { status: 404, origin: "google", fetchedAtMs };

    const d = parsed.data.imageryDate;
    return {
      status: 200,
      origin: "google",
      fetchedAtMs,
      id: sha256(`${b.name}|${fetchedAt}`).slice(0, 32),
      buildingId: b.name,
      imagery: { quality: parsed.data.imageryQuality, date: `${d.year}-${pad(d.month)}-${pad(d.day)}` },
      ...rendered,
    };
  }

  async function resolve(b: SolarBuilding, buildingSource: Source, layersGate?: Gate): Promise<Rendered> {
    layersGate?.(); // a memory miss: whatever comes next renders, and may buy a Data Layers call (C1, #58)
    if (buildingSource === "fixture") return renderSynthetic(b);
    if (opts.source !== "live") {
      const disk = await diskLookup(b.name);
      if (disk) return disk;
    }
    if (opts.source === "fixtures") return { status: 404, origin: "none" };
    return fetchFromGoogle(b);
  }

  async function lookup(lat: number, lng: number, gates: LayersGates = {}): Promise<LayersResult> {
    const started = performance.now();
    const line = (source: string, layer: string, quality: string, status: number, extra = "") =>
      log(
        `solar kind=layers lat=${logCoord(lat)} lng=${logCoord(lng)} source=${source} layer=${layer} quality=${quality} status=${status} ms=${Math.round(performance.now() - started)}${extra}`,
      );

    const building = await opts.buildings.lookup(lat, lng, gates.building); // UpstreamError → 502, already logged
    if (building.status === 404) {
      line(building.source, "none", "-", 404, " reason=no-building");
      return { status: 404, source: building.source, layer: "none" };
    }

    const key = building.building.name;
    let fromMemory = true;
    let r: Rendered;
    for (let attempt = 0; ; attempt++) {
      let pending = memoryGet(key);
      fromMemory = pending !== undefined;
      if (!pending) {
        pending = resolve(building.building, building.source, gates.layers);
        memorySet(key, pending);
      }
      try {
        r = await pending;
        break;
      } catch (e) {
        // As in the building store: a joined lookup refused by another caller's limit is retried once as ours.
        if (e instanceof RateLimitedError) {
          if (fromMemory && attempt === 0) continue;
          throw e;
        }
        const status = e instanceof DailyBudgetError ? 503 : 502;
        line(opts.source === "fixtures" ? "fixture" : "live", fromMemory ? "memory" : "google", "-", status, ` err=${errText(e)}`);
        throw e instanceof UpstreamError ? e : new UpstreamError(e instanceof Error ? e.message : String(e));
      }
    }

    const synthetic = r.origin === "synthetic" || r.origin === "none";
    const source: Source = synthetic ? "fixture" : r.origin === "google" && !fromMemory ? "live" : "cache";
    const layer: Layer = fromMemory ? "memory" : r.origin;
    line(source, layer, r.imagery?.quality ?? "-", r.status);
    if (r.status === 404 || !r.id) return { status: 404, source, layer };
    return { status: 200, id: r.id, buildingId: r.buildingId!, imagery: r.imagery!, bounds: r.bounds!, source, layer };
  }

  function memoryPng(id: string): Buffer | undefined {
    const key = memoryIds.get(id);
    const hit = key !== undefined ? memory.get(key) : undefined;
    return hit?.settled?.png && hit.settled.id === id && hit.expiresAt > now() ? hit.settled.png : undefined;
  }

  const heatmapInMemory = (id: string) => HEATMAP_ID_RE.test(id) && memoryPng(id) !== undefined;

  async function heatmap(id: string): Promise<Uint8Array | null> {
    if (!HEATMAP_ID_RE.test(id)) return null;
    const fromMemory = memoryPng(id);
    if (fromMemory) return fromMemory;

    const synthetic = syntheticById.get(id);
    if (synthetic) return renderSynthetic(synthetic).png ?? null;

    const meta = (await refreshIndex()).find((m) => m.id === id);
    if (!meta || isExpired(meta.fetchedAtMs)) return null;
    const r = await renderMeta(meta);
    if (!r?.png) return null;
    memorySet(meta.buildingId, Promise.resolve(r));
    return r.png;
  }

  async function prune(): Promise<number> {
    let deleted = 0;
    const t = now();
    for (const [k, e] of memory) if (e.expiresAt <= t) memory.delete(k);
    for (const [id, k] of memoryIds) if (!memory.has(k)) memoryIds.delete(id);

    const rm = async (dir: string, file: string, why: string) => {
      try {
        await fs.rm(inDir(dir, file), { force: true });
        deleted++;
      } catch (e) {
        log(`solar layers cache prune failed file=${file} why=${why} err=${errText(e)}`);
      }
    };
    const olderThanAnHour = async (dir: string, file: string) => {
      try {
        return t - (await fs.stat(inDir(dir, file))).mtimeMs > STALE_TMP_MS;
      } catch {
        return false;
      }
    };

    // 1. layers entries: expired, or unreadable (no provable age) → delete
    const referenced = new Set<string>();
    for (const file of await listDir(layersDir, log)) {
      if (file.endsWith(".tmp")) {
        if (await olderThanAnHour(layersDir, file)) await rm(layersDir, file, "tmp");
        continue;
      }
      if (!file.endsWith(".json")) continue;
      const meta = index.get(file) ?? (await readMeta(file));
      if (meta === null || isExpired(meta.fetchedAtMs)) {
        await rm(layersDir, file, meta ? "expired" : "unreadable");
        index.delete(file);
      } else if (meta.tiffs) {
        referenced.add(meta.tiffs.annualFlux).add(meta.tiffs.mask);
      }
    }

    // 2. rasters: kept only while a live entry references them. A brand-new .tif may belong to an
    //    entry still being written (by the server or by `pnpm solar:warm`), so unreferenced ones get an hour.
    for (const file of await listDir(tiffDir, log)) {
      if (file.endsWith(".tmp") || file.endsWith(".tif")) {
        const hash = file.endsWith(".tif") ? file.slice(0, -4) : "";
        if (!referenced.has(hash) && (await olderThanAnHour(tiffDir, file))) await rm(tiffDir, file, "unreferenced");
      }
    }

    log(`solar layers cache prune dir=${opts.cacheDir} deleted=${deleted}`);
    return deleted;
  }

  return { lookup, heatmap, heatmapInMemory, prune };
}

const globalForLayers = globalThis as typeof globalThis & { __solarLayersStore?: LayersStore };

/** The app-wide layers store (on top of getSolarStore()). First call prunes, then hourly. */
export function getLayersStore(): LayersStore {
  if (!globalForLayers.__solarLayersStore) {
    const o = storeOptionsFromEnv();
    const store = createLayersStore({
      source: o.source,
      cacheDir: o.cacheDir,
      maxAgeDays: o.maxAgeDays,
      memoryTtlMs: o.memoryTtlMs,
      buildings: getSolarStore(),
      budget: getDailyBudget(),
      quota: getDiskQuota(o.cacheDir),
    });
    globalForLayers.__solarLayersStore = store;
    void store.prune();
    setInterval(() => void store.prune(), PRUNE_INTERVAL_MS).unref();
  }
  return globalForLayers.__solarLayersStore;
}
