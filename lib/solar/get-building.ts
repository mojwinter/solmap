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
 * Aborting through `signal` rejects with the AbortError, as fetch does, so a cancelled lookup
 * never shows up as an error state.
 */
import type { ApiErrorCode, BuildingResponse } from "@/src/types/app";

export type GetBuildingResult =
  | { ok: true; building: BuildingResponse }
  | { ok: false; error: ApiErrorCode; message?: string };

/** Shown when the server didn't send a message of its own. */
export const DEFAULT_ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  BAD_REQUEST: "That location isn't one we can look up. Solmap covers BC addresses only.",
  NO_COVERAGE: "We can't see this roof yet: there's no solar data for this spot.",
  RATE_LIMITED: "Too many lookups in a minute. Wait a moment and try again.",
  UPSTREAM: "The solar data service didn't answer. Please try again in a minute.",
};

const errorForStatus = (status: number): ApiErrorCode =>
  status === 400 ? "BAD_REQUEST" : status === 404 ? "NO_COVERAGE" : status === 429 ? "RATE_LIMITED" : "UPSTREAM";

const fail = (error: ApiErrorCode, message?: string): GetBuildingResult => ({
  ok: false,
  error,
  message: message || DEFAULT_ERROR_MESSAGES[error],
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
    return fail("UPSTREAM", "Couldn't reach Solmap. Check your connection and try again.");
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

  const message = body && typeof body === "object" && typeof (body as { message?: unknown }).message === "string"
    ? (body as { message: string }).message
    : undefined;
  return fail(errorForStatus(res.status), message);
}
