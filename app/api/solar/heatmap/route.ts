// GET /api/solar/heatmap?id=… → image/png (P1 sun heatmap). `id` comes from /api/solar/layers and
// only ever resolves in our own cache; nothing from the query string is forwarded to Google.
import { NO_STORE, rateLimited, reply, upstreamReply } from "@/lib/solar/http";
import { getLayersStore, HEATMAP_ID_RE } from "@/lib/solar/layers-cache";
import { getLayersRateLimiter } from "@/lib/solar/ratelimit";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!HEATMAP_ID_RE.test(id)) return reply({ error: "BAD_REQUEST", message: "id must come from /api/solar/layers" }, 400);

  // A memory hit is free (#58). A miss means a disk read + decode + render: charge it to the stricter bucket (C1).
  const store = getLayersStore();
  if (!store.heatmapInMemory(id)) {
    const slow = rateLimited(request, getLayersRateLimiter());
    if (slow) return slow;
  }

  try {
    const png = await store.heatmap(id);
    if (!png) return reply({ error: "NO_COVERAGE", message: "This sun map has expired. Reload the layers." }, 404);
    return new Response(new Uint8Array(png), { status: 200, headers: { ...NO_STORE, "Content-Type": "image/png" } });
  } catch (e) {
    console.error("solar heatmap: unexpected error", e);
    return upstreamReply(e);
  }
}
