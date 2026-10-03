// GET /api/solar/layers?lat&lng → SolarLayersResponse (P1 sun heatmap). Contract: DESIGN.md §6.
// Only called when someone opens the heatmap: Data Layers is the expensive SKU.
import { UpstreamError } from "@/lib/solar/client";
import { parseLatLng, rateLimited, reply, upstreamReply } from "@/lib/solar/http";
import { getLayersStore } from "@/lib/solar/layers-cache";
import { FLUX_SCALE } from "@/lib/solar/raster";
import type { SolarLayersResponse } from "@/src/types/app";

export async function GET(request: Request) {
  const limited = rateLimited(request);
  if (limited) return limited;
  const point = parseLatLng(request);
  if (point instanceof Response) return point;

  try {
    const r = await getLayersStore().lookup(point.lat, point.lng);
    if (r.status === 404) {
      return reply({ error: "NO_COVERAGE", message: "There's no sun map for this roof yet." }, 404);
    }
    return reply<SolarLayersResponse>(
      {
        buildingId: r.buildingId,
        imagery: r.imagery,
        bounds: r.bounds,
        heatmapUrl: `/api/solar/heatmap?id=${r.id}`,
        fluxScale: { ...FLUX_SCALE },
        source: r.source,
      },
      200,
    );
  } catch (e) {
    if (!(e instanceof UpstreamError)) console.error("solar layers: unexpected error", e);
    return upstreamReply();
  }
}
