// GET /api/solar/building?lat&lng → BuildingResponse. Contract: DESIGN.md §6 "Our API contract".
import { getSolarStore } from "@/lib/solar/cache";
import { UpstreamError } from "@/lib/solar/client";
import { parseLatLng, rateLimited, reply, upstreamReply } from "@/lib/solar/http";
import { trimBuilding } from "@/lib/solar/trim";
import type { BuildingResponse } from "@/src/types/app";

export async function GET(request: Request) {
  const limited = rateLimited(request);
  if (limited) return limited;
  const point = parseLatLng(request);
  if (point instanceof Response) return point;

  try {
    const result = await getSolarStore().lookup(point.lat, point.lng);
    if (result.status === 404) {
      return reply({ error: "NO_COVERAGE", message: "We can't see this roof yet: there's no solar data for this spot." }, 404);
    }
    return reply<BuildingResponse>(trimBuilding(result.building, result.source), 200);
  } catch (e) {
    // UpstreamErrors were already logged by the store with their detail; anything else is our bug.
    if (!(e instanceof UpstreamError)) console.error("solar building: unexpected error", e);
    return upstreamReply();
  }
}
