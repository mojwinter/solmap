import "server-only";
/**
 * Thin wrappers around buildingInsights:findClosest, dataLayers:get and geoTiff:get.
 * One function = one HTTP call to Google. The findClosest sequence (LOW, then the optional EXPANDED_COVERAGE retry) is `findClosestSteps`;
 * lib/solar/cache.ts walks it so each call can be cached on its own (docs/INFRA.md → Data sources).
 * SOLAR_API_KEY never leaves this file: it goes in a header, never in a URL we could log.
 */
import type { ImageryQuality } from "@/src/types/solar";
import { distanceMeters } from "./geo";
import { googleApiErrorSchema, type SolarBuilding } from "./schema";

/**
 * Minimum imagery quality for the first (and usually only) call. `requiredQuality` is a minimum,
 * so LOW still returns HIGH where it exists. LOW vs MEDIUM is pending the pre-event quality test
 * (PLAN.md → Pre-event checklist); change it here and nowhere else.
 */
export const REQUIRED_QUALITY: ImageryQuality = "LOW";
/** Pre-GA satellite imagery for Canada; only with experiments=EXPANDED_COVERAGE. */
export const EXPANDED_COVERAGE_QUALITY: ImageryQuality = "BASE";

const ENDPOINT = "https://solar.googleapis.com/v1/buildingInsights:findClosest";
const TIMEOUT_MS = 10_000;

export interface FindClosestRequest {
  lat: number;
  lng: number;
  requiredQuality: ImageryQuality;
  experiments: "EXPANDED_COVERAGE"[];
}

/** 200 = a building (body not yet validated); 404 = no imagery at that quality. Anything else throws. */
export type GoogleCallResult = { status: 200 | 404; body: unknown };

/** Google or the network failed in a way the user can't fix → our 502 UPSTREAM. Never cached. */
export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly upstreamStatus?: number,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

/** The calls findClosest makes, in order: one LOW call, plus the BASE retry on 404 when enabled. */
export function findClosestSteps(lat: number, lng: number, expandedCoverage: boolean): FindClosestRequest[] {
  const steps: FindClosestRequest[] = [{ lat, lng, requiredQuality: REQUIRED_QUALITY, experiments: [] }];
  if (expandedCoverage) {
    steps.push({ lat, lng, requiredQuality: EXPANDED_COVERAGE_QUALITY, experiments: ["EXPANDED_COVERAGE"] });
  }
  return steps;
}

type CallOptions = { apiKey?: string; fetch?: typeof fetch; timeoutMs?: number };

/** One authenticated GET to solar.googleapis.com. Network failures become UpstreamErrors. */
async function googleGet(url: URL, opts: CallOptions): Promise<Response> {
  const apiKey = opts.apiKey ?? process.env.SOLAR_API_KEY;
  if (!apiKey) throw new UpstreamError("SOLAR_API_KEY is not set");
  try {
    return await (opts.fetch ?? fetch)(url, {
      headers: { "X-Goog-Api-Key": apiKey },
      signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    throw new UpstreamError(`network error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Google's error JSON → UpstreamError. 400 INVALID_ARGUMENT is our bug, 403 the key, 429 our quota. */
function upstreamError(status: number, body: unknown, text: string): UpstreamError {
  const err = googleApiErrorSchema.safeParse(body);
  const detail = err.success ? `${err.data.error.status} ${err.data.error.message}` : text.slice(0, 200);
  return new UpstreamError(`Google ${status}: ${detail}`, status);
}

/** A JSON endpoint: 200 and 404 are answers (both cacheable), anything else throws. */
async function googleJson(url: URL, opts: CallOptions): Promise<GoogleCallResult> {
  const res = await googleGet(url, opts);
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // handled below
  }
  if (res.status === 200) {
    if (body === null) throw new UpstreamError("Google returned 200 with a non-JSON body", 200);
    return { status: 200, body };
  }
  if (res.status === 404) return { status: 404, body: body ?? {} };
  throw upstreamError(res.status, body, text);
}

export async function callFindClosest(req: FindClosestRequest, opts: CallOptions = {}): Promise<GoogleCallResult> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("location.latitude", String(req.lat));
  url.searchParams.set("location.longitude", String(req.lng));
  url.searchParams.set("requiredQuality", req.requiredQuality);
  for (const e of req.experiments) url.searchParams.append("experiments", e);
  return googleJson(url, opts);
}

/* ───────────── dataLayers (P1 sun heatmap) ───────────── */

const DATA_LAYERS_ENDPOINT = "https://solar.googleapis.com/v1/dataLayers:get";
/** Annual flux + mask (+ rgb/dsm URLs we never download). No monthly flux or hourly shade. */
export const LAYERS_VIEW = "IMAGERY_AND_ANNUAL_FLUX_LAYERS";
/** 0.25 m: a panel is ~8 px wide, files are ~6x smaller than the 0.1 m default. Google allows 0.1/0.25/0.5/1. */
export const LAYERS_PIXEL_SIZE_M = 0.25;
const LAYERS_MARGIN_M = 5;
const LAYERS_RADIUS_MIN_M = 15;
const LAYERS_RADIUS_MAX_M = 50;
/** A 50 m radius at 0.25 m is 400x400 float32 ≈ 0.6 MB; anything far bigger is not a raster we asked for. */
const MAX_GEOTIFF_BYTES = 20 * 1024 * 1024;

export interface DataLayersRequest {
  lat: number;
  lng: number;
  radiusMeters: number;
  view: typeof LAYERS_VIEW;
  pixelSizeMeters: number;
  requiredQuality: ImageryQuality;
  experiments: "EXPANDED_COVERAGE"[];
}

/**
 * The dataLayers call for a building: centred on it, radius = half its bbox diagonal + 5 m
 * (clamped 15–50 m; Google's sample uses half the diagonal), same quality rule as findClosest.
 * A BASE building only exists through EXPANDED_COVERAGE, so its layers need the same experiment.
 */
export function dataLayersRequestFor(b: Pick<SolarBuilding, "center" | "boundingBox" | "imageryQuality">): DataLayersRequest {
  const diagonal = distanceMeters(
    { lat: b.boundingBox.sw.latitude, lng: b.boundingBox.sw.longitude },
    { lat: b.boundingBox.ne.latitude, lng: b.boundingBox.ne.longitude },
  );
  const radius = Math.min(LAYERS_RADIUS_MAX_M, Math.max(LAYERS_RADIUS_MIN_M, Math.ceil(diagonal / 2 + LAYERS_MARGIN_M)));
  const expanded = b.imageryQuality === EXPANDED_COVERAGE_QUALITY;
  return {
    lat: b.center.latitude,
    lng: b.center.longitude,
    radiusMeters: radius,
    view: LAYERS_VIEW,
    pixelSizeMeters: LAYERS_PIXEL_SIZE_M,
    requiredQuality: expanded ? EXPANDED_COVERAGE_QUALITY : REQUIRED_QUALITY,
    experiments: expanded ? ["EXPANDED_COVERAGE"] : [],
  };
}

export async function callDataLayers(req: DataLayersRequest, opts: CallOptions = {}): Promise<GoogleCallResult> {
  const url = new URL(DATA_LAYERS_ENDPOINT);
  url.searchParams.set("location.latitude", String(req.lat));
  url.searchParams.set("location.longitude", String(req.lng));
  url.searchParams.set("radiusMeters", String(req.radiusMeters));
  url.searchParams.set("view", req.view);
  url.searchParams.set("pixelSizeMeters", String(req.pixelSizeMeters));
  url.searchParams.set("requiredQuality", req.requiredQuality);
  for (const e of req.experiments) url.searchParams.append("experiments", e);
  return googleJson(url, opts);
}

/**
 * The opaque id of a geoTiff:get URL from a dataLayers response, or null if the URL isn't one.
 * Only these URLs are ever fetched with our key, so a response can't point us anywhere else.
 */
export function geoTiffId(url: string): string | null {
  try {
    const u = new URL(url);
    const ok = u.protocol === "https:" && u.hostname === "solar.googleapis.com" && u.pathname === "/v1/geoTiff:get";
    return ok ? u.searchParams.get("id") || null : null;
  } catch {
    return null;
  }
}

/** Downloads one raster. URLs are only valid for an hour after the dataLayers call. */
export async function downloadGeoTiff(url: string, opts: CallOptions = {}): Promise<Uint8Array> {
  const id = geoTiffId(url);
  if (!id) throw new UpstreamError("dataLayers returned a raster URL that isn't solar.googleapis.com/v1/geoTiff:get");
  const target = new URL("https://solar.googleapis.com/v1/geoTiff:get");
  target.searchParams.set("id", id);
  const res = await googleGet(target, opts);
  if (res.status !== 200) {
    const text = await res.text();
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      // not JSON
    }
    throw upstreamError(res.status, body, text);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const tiffMagic = (bytes[0] === 0x49 && bytes[1] === 0x49) || (bytes[0] === 0x4d && bytes[1] === 0x4d);
  if (!tiffMagic) throw new UpstreamError("geoTiff:get returned something that isn't a TIFF", 200);
  if (bytes.byteLength > MAX_GEOTIFF_BYTES) throw new UpstreamError(`geoTiff:get returned ${bytes.byteLength} bytes`, 200);
  return bytes;
}
