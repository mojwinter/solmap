// GET /api/solar/building?lat&lng → BuildingResponse. Contract: DESIGN.md §6 "Our API contract".
import { z } from "zod";
import { getSolarStore } from "@/lib/solar/cache";
import { UpstreamError } from "@/lib/solar/client";
import { clientIp, getSolarRateLimiter } from "@/lib/solar/ratelimit";
import { trimBuilding } from "@/lib/solar/trim";
import { BC_BOUNDS } from "@/src/config/bc";
import type { ApiError, BuildingResponse } from "@/src/types/app";

// Google's terms cap caching at 30 days, so no browser or CDN gets to decide.
const NO_STORE = { "Cache-Control": "private, no-store" };

const reply = (body: BuildingResponse | ApiError, status: number, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...NO_STORE, ...headers } });

const coordinate = (name: string, min: number, max: number) =>
  z
    .string({ error: `${name} is required` })
    .trim()
    .regex(/^-?\d+(\.\d+)?$/, `${name} must be a decimal number`)
    .transform(Number)
    .refine((v) => v >= min && v <= max, `${name} must be between ${min} and ${max} (inside BC)`);

const querySchema = z.object({
  lat: coordinate("lat", BC_BOUNDS.latMin, BC_BOUNDS.latMax),
  lng: coordinate("lng", BC_BOUNDS.lngMin, BC_BOUNDS.lngMax),
});

export async function GET(request: Request) {
  const limit = getSolarRateLimiter().take(clientIp(request.headers));
  if (!limit.ok) {
    return reply({ error: "RATE_LIMITED" }, 429, { "Retry-After": String(limit.retryAfterSeconds) });
  }

  const params = new URL(request.url).searchParams;
  const query = querySchema.safeParse({
    lat: params.get("lat") ?? undefined,
    lng: params.get("lng") ?? undefined,
  });
  if (!query.success) {
    return reply({ error: "BAD_REQUEST", message: query.error.issues.map((i) => i.message).join("; ") }, 400);
  }

  try {
    const result = await getSolarStore().lookup(query.data.lat, query.data.lng);
    if (result.status === 404) {
      return reply({ error: "NO_COVERAGE", message: "We can't see this roof yet: there's no solar data for this spot." }, 404);
    }
    return reply(trimBuilding(result.building, result.source), 200);
  } catch (e) {
    // UpstreamErrors were already logged by the store with their detail; anything else is our bug.
    if (!(e instanceof UpstreamError)) console.error("solar building: unexpected error", e);
    return reply({ error: "UPSTREAM", message: "The solar data service didn't answer. Please try again in a minute." }, 502);
  }
}
