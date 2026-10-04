// GET /api/solar/building?lat&lng → BuildingResponse. Contract: DESIGN.md §6 "Our API contract".
import { getSolarStore } from "@/lib/solar/cache";
import { UpstreamError } from "@/lib/solar/client";
import { gateFor, parseLatLng, reply, upstreamReply } from "@/lib/solar/http";
import { RateLimitedError } from "@/lib/solar/ratelimit";
import { trimBuilding } from "@/lib/solar/trim";
import type { BuildingResponse } from "@/src/types/app";

export async function GET(request: Request) {
  const point = parseLatLng(request);
  if (point instanceof Response) return point;

  try {
    // The per-IP limit is only charged when this lookup will call Google: cached roofs are free, so a
    // whole room on one venue IP can load them (#58).
    const result = await getSolarStore().lookup(point.lat, point.lng, gateFor(request));
    if (result.status === 404) {
      const message =
        result.reason === "outside-bc"
          ? "That building is outside BC, and Solmap only covers BC."
          : "We can't see this roof yet: there's no solar data for this spot.";
      return reply({ error: "NO_COVERAGE", message }, 404);
    }
    return reply<BuildingResponse>(trimBuilding(result.building, result.source), 200);
  } catch (e) {
    // UpstreamErrors were already logged by the store with their detail; a 429 isn't an error; anything else is our bug.
    if (!(e instanceof UpstreamError || e instanceof RateLimitedError)) console.error("solar building: unexpected error", e);
    return upstreamReply(e);
  }
}
