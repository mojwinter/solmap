import "server-only";
/**
 * Where roof data comes from (SOLAR_SOURCE), exactly per docs/INFRA.md → Data sources:
 *
 *   fixtures  memory → disk cache → nearest synthetic roof ≤ 250 m → 404. Never calls Google, never writes.
 *   cache     memory → disk cache → Google once per call, saving 200s AND 404s to disk.
 *   live      memory → Google.
 *
 * Google's terms allow caching Building Insights for at most 30 days, so disk entries older than
 * SOLAR_CACHE_MAX_AGE_DAYS (default 25, clamped to ≤ 29) are ignored on read and deleted by prune(),
 * which runs at server start (instrumentation.ts) and hourly. Age comes from `fetchedAt` in the file.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { LatLngBounds, LatLngLiteral } from "@/src/types/app";
import { errText, inDir, listDir, STALE_TMP_MS, writeFileAtomic } from "./disk";
import { distanceMeters } from "./geo";
import { imageryQualitySchema, buildingInsightsSchema, type SolarBuilding } from "./schema";
import {
  callFindClosest,
  findClosestSteps,
  UpstreamError,
  type FindClosestRequest,
  type GoogleCallResult,
} from "./client";

export type SolarSourceMode = "fixtures" | "cache" | "live";
/** Which layer answered; logged so `grep -c layer=google` counts quota burn. */
export type Layer = "memory" | "disk" | "google" | "synthetic" | "none";
type Source = "live" | "cache" | "fixture";

export type LookupResult =
  | { status: 200; building: SolarBuilding; source: Source; layer: Layer }
  | { status: 404; source: Source; layer: Layer };

export interface SolarStore {
  lookup(lat: number, lng: number): Promise<LookupResult>;
  /** Deletes expired disk entries (and stale temp files). Returns how many files were deleted. */
  prune(): Promise<number>;
}

export interface StoreOptions {
  source: SolarSourceMode;
  /** Absolute. Entries live in `<cacheDir>/building/`. */
  cacheDir: string;
  /** Absolute. Hand-made roofs in the buildingInsights shape. */
  syntheticDir: string;
  maxAgeDays: number;
  memoryTtlMs: number;
  expandedCoverage: boolean;
  /** Injected for tests. Epoch ms. */
  now?: () => number;
  findClosest?: (req: FindClosestRequest) => Promise<GoogleCallResult>;
  log?: (line: string) => void;
}

const DAY_MS = 86_400_000;
export const DEFAULT_MAX_AGE_DAYS = 25;
export const MAX_AGE_CEILING_DAYS = 29;
export const MATCH_RADIUS_M = 5;
export const SYNTHETIC_RADIUS_M = 250;
const MEMORY_CAP = 500;
export const PRUNE_INTERVAL_MS = 3_600_000;
export { distanceMeters };

/* ───────────── pure helpers ───────────── */

/** Unset/invalid → 25; never above 29 (Google: ≤ 30 days). */
export function clampMaxAgeDays(value: string | number | undefined): number {
  const n = Number(value);
  if (value === undefined || value === "" || !Number.isFinite(n) || n <= 0) return DEFAULT_MAX_AGE_DAYS;
  return Math.min(n, MAX_AGE_CEILING_DAYS);
}

const inBox = (p: LatLngLiteral, b: LatLngBounds) =>
  p.lat >= b.sw.lat && p.lat <= b.ne.lat && p.lng >= b.sw.lng && p.lng <= b.ne.lng;

/** A cached answer matches if the point is in its building's bbox or ≤ 5 m from the point originally asked. */
export function entryMatches(entry: { request: LatLngLiteral; bbox?: LatLngBounds }, p: LatLngLiteral): boolean {
  return (entry.bbox !== undefined && inBox(p, entry.bbox)) || distanceMeters(entry.request, p) <= MATCH_RADIUS_M;
}

const bboxOf = (b: SolarBuilding): LatLngBounds => ({
  sw: { lat: b.boundingBox.sw.latitude, lng: b.boundingBox.sw.longitude },
  ne: { lat: b.boundingBox.ne.latitude, lng: b.boundingBox.ne.longitude },
});

/** A 404 only answers the call it was made for (same quality + experiments). */
const stepKey = (r: Pick<FindClosestRequest, "requiredQuality" | "experiments">) =>
  `${r.requiredQuality}|${[...r.experiments].sort().join(",")}`;

/** `<YYYY-MM-DD>_<lat.5f>_<lng.5f>[_<experiments>].json`. The suffix keeps the LOW 404 and its BASE retry apart. */
export function entryFileName(fetchedAtMs: number, req: FindClosestRequest): string {
  const day = new Date(fetchedAtMs).toISOString().slice(0, 10);
  const exp = req.experiments.length ? `_${[...req.experiments].sort().join("-").toLowerCase()}` : "";
  return `${day}_${req.lat.toFixed(5)}_${req.lng.toFixed(5)}${exp}.json`;
}

/* ───────────── disk entry format ───────────── */

const entrySchema = z.object({
  fetchedAt: z.string().refine((s) => Number.isFinite(Date.parse(s)), "fetchedAt must be an ISO date"),
  request: z.object({
    lat: z.number(),
    lng: z.number(),
    requiredQuality: imageryQualitySchema,
    experiments: z.array(z.literal("EXPANDED_COVERAGE")).default([]),
  }),
  status: z.union([z.literal(200), z.literal(404)]),
  body: z.unknown(),
});
export type CacheEntry = z.input<typeof entrySchema>;

interface DiskMeta {
  file: string;
  fetchedAtMs: number;
  request: FindClosestRequest;
  status: 200 | 404;
  bbox?: LatLngBounds;
}

/** What a lookup resolved to, before we know whether the caller got it from memory. */
interface Resolved {
  status: 200 | 404;
  building?: SolarBuilding;
  origin: "synthetic" | "disk" | "google" | "none";
  /** Google data only: when it was fetched. Bounds how long memory may keep it. */
  fetchedAtMs?: number;
}

interface MemoryEntry {
  point: LatLngLiteral;
  promise: Promise<Resolved>;
  settled?: Resolved;
  expiresAt: number;
}

/* ───────────── the store ───────────── */

export function createSolarStore(opts: StoreOptions): SolarStore {
  const now = opts.now ?? Date.now;
  const log = opts.log ?? ((line: string) => console.log(line));
  const fetchGoogle = opts.findClosest ?? ((req: FindClosestRequest) => callFindClosest(req));
  const maxAgeMs = clampMaxAgeDays(opts.maxAgeDays) * DAY_MS;
  // Every cache path goes through inDir() (turbopackIgnore'd; see disk.ts).
  const buildingDir = inDir(opts.cacheDir, "building");
  const inCache = (file: string) => inDir(buildingDir, file);

  const isExpired = (fetchedAtMs: number) => now() - fetchedAtMs > maxAgeMs;

  /* memory: LRU over a Map (insertion order), holding the in-flight promise */
  const memory = new Map<string, MemoryEntry>();
  const memKey = (p: LatLngLiteral) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;

  function memoryGet(p: LatLngLiteral): Promise<Resolved> | undefined {
    const t = now();
    let key: string | undefined = memKey(p);
    let hit = memory.get(key);
    if (hit && hit.expiresAt <= t) {
      memory.delete(key);
      hit = undefined;
    }
    if (!hit) {
      key = undefined;
      let best = -Infinity;
      for (const [k, e] of memory) {
        if (!e.settled || e.expiresAt <= t || e.settled.origin === "none") continue;
        const bbox = e.settled.building ? bboxOf(e.settled.building) : undefined;
        const ts = e.settled.fetchedAtMs ?? 0;
        if (ts > best && entryMatches({ request: e.point, bbox }, p)) {
          [key, hit, best] = [k, e, ts];
        }
      }
    }
    if (!hit || key === undefined) return undefined;
    memory.delete(key); // bump to most recent
    memory.set(key, hit);
    return hit.promise;
  }

  function memorySet(p: LatLngLiteral, promise: Promise<Resolved>) {
    const key = memKey(p);
    const entry: MemoryEntry = { point: p, promise, expiresAt: Infinity };
    memory.delete(key);
    memory.set(key, entry);
    while (memory.size > MEMORY_CAP) memory.delete(memory.keys().next().value!);
    promise.then(
      (r) => {
        entry.settled = r;
        const ttlEnd = now() + opts.memoryTtlMs;
        entry.expiresAt = r.fetchedAtMs === undefined ? ttlEnd : Math.min(ttlEnd, r.fetchedAtMs + maxAgeMs);
      },
      () => {
        if (memory.get(key) === entry) memory.delete(key); // errors are never cached
      },
    );
  }

  /* disk: an index of entry metadata, so a lookup reads only the file it needs */
  const index = new Map<string, DiskMeta | null>();

  async function readEntry(file: string): Promise<{ meta: DiskMeta; building?: SolarBuilding } | null> {
    try {
      const parsed = entrySchema.safeParse(JSON.parse(await fs.readFile(inCache(file), "utf8")));
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "invalid entry");
      const { fetchedAt, request, status, body } = parsed.data;
      const meta: DiskMeta = { file, fetchedAtMs: Date.parse(fetchedAt), request, status };
      if (status === 404) return { meta };
      const building = buildingInsightsSchema.parse(body);
      meta.bbox = bboxOf(building);
      return { meta, building };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      log(`solar cache unreadable file=${file} err=${errText(e)}`);
      return null;
    }
  }

  const listEntryFiles = () => listDir(buildingDir, log);

  async function refreshIndex(): Promise<DiskMeta[]> {
    const files = new Set((await listEntryFiles()).filter((f) => f.endsWith(".json")));
    for (const f of index.keys()) if (!files.has(f)) index.delete(f);
    const fresh = [...files].filter((f) => !index.has(f));
    await Promise.all(fresh.map(async (f) => index.set(f, (await readEntry(f))?.meta ?? null)));
    return [...index.values()].filter((m): m is DiskMeta => m !== null);
  }

  type DiskLookup =
    | { kind: "hit"; resolved: Resolved }
    | { kind: "miss"; nextStep: number; cached404?: Resolved };

  async function diskLookup(p: LatLngLiteral, steps: FindClosestRequest[]): Promise<DiskLookup> {
    const matches = (await refreshIndex())
      .filter((m) => !isExpired(m.fetchedAtMs) && entryMatches(m, p))
      // Ties → newest; at the same instant a building beats a 404 (the LOW 404 and its BASE retry).
      .sort((a, b) => b.fetchedAtMs - a.fetchedAtMs || a.status - b.status);

    for (const m of matches) {
      if (m.status === 200) {
        const read = await readEntry(m.file);
        if (!read?.building) {
          index.set(m.file, null);
          continue;
        }
        return { kind: "hit", resolved: { status: 200, building: read.building, origin: "disk", fetchedAtMs: m.fetchedAtMs } };
      }
      // Newest match is a 404. It answers the lookup only if every call we'd make has a cached 404,
      // so turning SOLAR_EXPANDED_COVERAGE on still tries the BASE call for roofs that 404'd at LOW.
      const covered = new Set(matches.filter((x) => x.status === 404).map((x) => stepKey(x.request)));
      const cached404: Resolved = { status: 404, origin: "disk", fetchedAtMs: m.fetchedAtMs };
      const nextStep = steps.findIndex((s) => !covered.has(stepKey(s)));
      return nextStep === -1 ? { kind: "hit", resolved: cached404 } : { kind: "miss", nextStep, cached404 };
    }
    return { kind: "miss", nextStep: 0 };
  }

  async function writeEntry(req: FindClosestRequest, res: GoogleCallResult, building: SolarBuilding | undefined, fetchedAtMs: number) {
    const file = entryFileName(fetchedAtMs, req);
    const entry: CacheEntry = { fetchedAt: new Date(fetchedAtMs).toISOString(), request: req, status: res.status, body: res.body };
    try {
      await writeFileAtomic(buildingDir, file, JSON.stringify(entry)); // warm-cache and the server may write concurrently
      index.set(file, { file, fetchedAtMs, request: req, status: res.status, bbox: building && bboxOf(building) });
    } catch (e) {
      // The user still gets their answer; we just pay for this roof again next time.
      log(`solar cache WRITE FAILED file=${file} err=${errText(e)}`);
    }
  }

  /* synthetic roofs: loaded once */
  let synthetic: Promise<SolarBuilding[]> | undefined;
  function loadSynthetic(): Promise<SolarBuilding[]> {
    synthetic ??= (async () => {
      const files = (await fs.readdir(opts.syntheticDir).catch(() => [] as string[])).filter((f) => f.endsWith(".json"));
      const roofs = await Promise.all(
        files.map(async (f) => {
          const parsed = buildingInsightsSchema.safeParse(JSON.parse(await fs.readFile(path.join(opts.syntheticDir, f), "utf8")));
          if (!parsed.success) log(`solar synthetic INVALID file=${f}`);
          return parsed.success ? parsed.data : null;
        }),
      );
      return roofs.filter((r): r is SolarBuilding => r !== null);
    })();
    return synthetic;
  }

  async function nearestSynthetic(p: LatLngLiteral): Promise<SolarBuilding | undefined> {
    let best: { b: SolarBuilding; d: number } | undefined;
    for (const b of await loadSynthetic()) {
      const d = distanceMeters(p, { lat: b.center.latitude, lng: b.center.longitude });
      if (d <= SYNTHETIC_RADIUS_M && (!best || d < best.d)) best = { b, d };
    }
    return best?.b;
  }

  async function resolve(p: LatLngLiteral): Promise<Resolved> {
    const steps = findClosestSteps(p.lat, p.lng, opts.expandedCoverage);
    let next = 0;
    let cached404: Resolved | undefined;

    if (opts.source !== "live") {
      const disk = await diskLookup(p, steps);
      if (disk.kind === "hit") return disk.resolved;
      ({ nextStep: next, cached404 } = disk);
    }

    if (opts.source === "fixtures") {
      if (cached404) return cached404;
      const roof = await nearestSynthetic(p);
      return roof ? { status: 200, building: roof, origin: "synthetic" } : { status: 404, origin: "none" };
    }

    let last: Resolved = { status: 404, origin: "google" };
    for (const req of steps.slice(next)) {
      const res = await fetchGoogle(req);
      const fetchedAtMs = now();
      let building: SolarBuilding | undefined;
      if (res.status === 200) {
        const parsed = buildingInsightsSchema.safeParse(res.body);
        if (!parsed.success) {
          throw new UpstreamError(`Google 200 failed validation: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`, 200);
        }
        building = parsed.data;
      }
      if (opts.source === "cache") await writeEntry(req, res, building, fetchedAtMs);
      last = { status: res.status, building, origin: "google", fetchedAtMs };
      if (res.status === 200) return last;
    }
    return last;
  }

  async function lookup(lat: number, lng: number): Promise<LookupResult> {
    const started = performance.now();
    const p = { lat, lng };
    const line = (source: string, layer: string, quality: string, status: number, extra = "") =>
      log(
        `solar lat=${lat.toFixed(5)} lng=${lng.toFixed(5)} source=${source} layer=${layer} quality=${quality} status=${status} ms=${Math.round(performance.now() - started)}${extra}`,
      );

    let fromMemory = true;
    let pending = memoryGet(p);
    if (!pending) {
      fromMemory = false;
      pending = resolve(p);
      memorySet(p, pending);
    }

    let r: Resolved;
    try {
      r = await pending;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      line(opts.source === "fixtures" ? "fixture" : "live", fromMemory ? "memory" : "google", "-", 502, ` err=${JSON.stringify(msg)}`);
      throw e instanceof UpstreamError ? e : new UpstreamError(msg);
    }

    const synthetic = r.origin === "synthetic" || r.origin === "none";
    const source: Source = synthetic ? "fixture" : r.origin === "google" && !fromMemory ? "live" : "cache";
    const layer: Layer = fromMemory ? "memory" : r.origin === "synthetic" ? "synthetic" : r.origin;
    line(source, layer, r.building?.imageryQuality ?? "-", r.status);
    return r.status === 200 && r.building
      ? { status: 200, building: r.building, source, layer }
      : { status: 404, source, layer };
  }

  async function prune(): Promise<number> {
    let deleted = 0;
    const t = now();
    for (const [k, e] of memory) if (e.expiresAt <= t) memory.delete(k);

    for (const file of await listEntryFiles()) {
      const full = inCache(file);
      try {
        if (file.endsWith(".tmp")) {
          if (t - (await fs.stat(full)).mtimeMs > STALE_TMP_MS) {
            await fs.rm(full, { force: true });
            deleted++;
          }
          continue;
        }
        if (!file.endsWith(".json")) continue;
        const meta = index.get(file) ?? (await readEntry(file))?.meta ?? null;
        // Unreadable entries have no provable age, so they go too (Google's 30-day limit).
        if (meta === null || isExpired(meta.fetchedAtMs)) {
          await fs.rm(full, { force: true });
          index.delete(file);
          deleted++;
        }
      } catch (e) {
        log(`solar cache prune failed file=${file} err=${errText(e)}`);
      }
    }
    log(`solar cache prune dir=${buildingDir} deleted=${deleted}`);
    return deleted;
  }

  return { lookup, prune };
}

/* ───────────── env wiring ───────────── */

export function storeOptionsFromEnv(env: Record<string, string | undefined> = process.env): StoreOptions {
  const raw = env.SOLAR_SOURCE ?? "fixtures";
  const source: SolarSourceMode = raw === "cache" || raw === "live" || raw === "fixtures" ? raw : "fixtures";
  if (source !== raw) console.warn(`solar SOLAR_SOURCE=${JSON.stringify(raw)} is not fixtures|cache|live; using fixtures`);
  const ttlSeconds = Number(env.SOLAR_CACHE_TTL_SECONDS);
  return {
    source,
    // Not traced into the build output: real Google responses must never ship in an image.
    cacheDir: path.resolve(/*turbopackIgnore: true*/ process.cwd(), env.SOLAR_CACHE_DIR || "fixtures/solar"),
    syntheticDir: path.join(process.cwd(), "fixtures/synthetic"),
    maxAgeDays: clampMaxAgeDays(env.SOLAR_CACHE_MAX_AGE_DAYS),
    memoryTtlMs: (Number.isFinite(ttlSeconds) && ttlSeconds >= 0 ? ttlSeconds : 900) * 1000,
    expandedCoverage: env.SOLAR_EXPANDED_COVERAGE === "1",
  };
}

const globalForSolar = globalThis as typeof globalThis & { __solarStore?: SolarStore };

/** The app-wide store. First call prunes the disk cache and schedules an hourly prune. */
export function getSolarStore(): SolarStore {
  if (!globalForSolar.__solarStore) {
    const store = createSolarStore(storeOptionsFromEnv());
    globalForSolar.__solarStore = store;
    void store.prune();
    setInterval(() => void store.prune(), PRUNE_INTERVAL_MS).unref();
  }
  return globalForSolar.__solarStore;
}
