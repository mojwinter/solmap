/**
 * Client-safe wrapper for GET /api/solar/building, so the report page and the map dev page turn
 * every failure into the same few states. Imports types only: nothing server-side (no key, no
 * `server-only`), so it's fine in a client component.
 *
 *   const r = await getBuilding(lat, lng, { signal });
 *   if (r.ok) render(r.building); else showError(r.error, r.message);
 *
 * Status → error: 400 BAD_REQUEST, 404 NO_COVERAGE, 429 RATE_LIMITED, 502/503 and anything else
 * (incl. a 403 from the Cloudflare Access check, a bad body, a network failure) UPSTREAM.
 * `reason: "outside-bc"` marks both ways a spot can be outside BC: a point outside BC's box (400) and a
 * building Google places outside BC (404 with the route's `X-Solmap-Reason` header). The route's 503
 * (today's Google budget is spent) gets its own message, since retrying won't help until tomorrow.
 * Aborting through `signal` rejects with the AbortError, as fetch does, so a cancelled lookup
 * never shows up as an error state.
 */
import type { ApiErrorCode, BuildingResponse } from "@/src/types/app";

export type GetBuildingResult =
  | { ok: true; building: BuildingResponse }
  | { ok: false; error: ApiErrorCode; message?: string; reason?: "outside-bc" };

/** Response header the building route sets on a 404 for a building outside BC. */
export const REASON_HEADER = "X-Solmap-Reason";

/** Shown when the server didn't send a message of its own. */
export const DEFAULT_ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  BAD_REQUEST: "That location isn't one we can look up. Sunscore covers BC addresses only.",
  NO_COVERAGE: "We can't see this roof yet: there's no solar data for this spot.",
  RATE_LIMITED: "Too many lookups in a minute. Wait a moment and try again.",
  UPSTREAM: "The solar data service didn't answer. Please try again in a minute.",
};

/** The route's 503: the daily Google budget is spent (docs/INFRA.md → Cost safety). */
export const DAILY_LIMIT_MESSAGE =
  "We've hit today's limit for new roof lookups. Please try again tomorrow.";

const errorForStatus = (status: number): ApiErrorCode =>
  status === 400 ? "BAD_REQUEST" : status === 404 ? "NO_COVERAGE" : status === 429 ? "RATE_LIMITED" : "UPSTREAM";

const fail = (error: ApiErrorCode, message?: string, reason?: "outside-bc"): GetBuildingResult => ({
  ok: false,
  error,
  message: message || DEFAULT_ERROR_MESSAGES[error],
  ...(reason && { reason }),
});

const isAbort = (e: unknown) => e instanceof Error && e.name === "AbortError";

export async function getBuilding(lat: number, lng: number, opts: { signal?: AbortSignal } = {}): Promise<GetBuildingResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fail("BAD_REQUEST");

  const query = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  let res: Response;
  try {
    res = await fetch(`/api/solar/building?${query}`, { signal: opts.signal, headers: { Accept: "application/json" } });
  } catch (e) {
    if (isAbort(e)) throw e;
    return fail("UPSTREAM", "Couldn't reach Sunscore. Check your connection and try again.");
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch (e) {
    if (isAbort(e)) throw e;
    body = undefined;
  }

  if (res.ok) {
    // The route always answers 200 with a BuildingResponse; anything else (e.g. an HTML page from a
    // proxy in front of us) is treated as the service not answering.
    const b = body as Partial<BuildingResponse> | undefined;
    if (b && typeof b === "object" && b.center && Array.isArray(b.configs)) return { ok: true, building: b as BuildingResponse };
    return fail("UPSTREAM");
  }

  const json = body && typeof body === "object" ? (body as { error?: unknown; message?: unknown }) : undefined;
  // A 503 from a proxy in front of us has no JSON body: that's the plain "didn't answer" case.
  if (res.status === 503 && json?.error === "UPSTREAM") return fail("UPSTREAM", DAILY_LIMIT_MESSAGE);
  const message = typeof json?.message === "string" ? json.message : undefined;
  const error = errorForStatus(res.status);
  const outsideBc = error === "BAD_REQUEST" || (error === "NO_COVERAGE" && res.headers.get(REASON_HEADER) === "outside-bc");
  return fail(error, message, outsideBc ? "outside-bc" : undefined);
}
