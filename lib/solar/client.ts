import "server-only";
/**
 * Thin wrapper around buildingInsights:findClosest. One function = one HTTP call to Google.
 * The call sequence (LOW, then the optional EXPANDED_COVERAGE retry) is `findClosestSteps`;
 * lib/solar/cache.ts walks it so each call can be cached on its own (docs/INFRA.md → Data sources).
 * SOLAR_API_KEY never leaves this file: it goes in a header, never in a URL we could log.
 */
import type { ImageryQuality } from "@/src/types/solar";
import { googleApiErrorSchema } from "./schema";

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

export async function callFindClosest(
  req: FindClosestRequest,
  opts: { apiKey?: string; fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<GoogleCallResult> {
  const apiKey = opts.apiKey ?? process.env.SOLAR_API_KEY;
  if (!apiKey) throw new UpstreamError("SOLAR_API_KEY is not set");

  const url = new URL(ENDPOINT);
  url.searchParams.set("location.latitude", String(req.lat));
  url.searchParams.set("location.longitude", String(req.lng));
  url.searchParams.set("requiredQuality", req.requiredQuality);
  for (const e of req.experiments) url.searchParams.append("experiments", e);

  let res: Response;
  try {
    res = await (opts.fetch ?? fetch)(url, {
      headers: { "X-Goog-Api-Key": apiKey },
      signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    throw new UpstreamError(`network error: ${e instanceof Error ? e.message : String(e)}`);
  }

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

  // 400 INVALID_ARGUMENT is our bug (bad param), 403 a key/restriction problem, 429 our quota.
  const err = googleApiErrorSchema.safeParse(body);
  const detail = err.success ? `${err.data.error.status} ${err.data.error.message}` : text.slice(0, 200);
  throw new UpstreamError(`Google ${res.status}: ${detail}`, res.status);
}
