// GET /api/solar/heatmap?id=… → image/png (P1 sun heatmap). `id` comes from /api/solar/layers and
// only ever resolves in our own cache; nothing from the query string is forwarded to Google.
import { NO_STORE, rateLimited, reply, upstreamReply } from "@/lib/solar/http";
import { getLayersStore, HEATMAP_ID_RE } from "@/lib/solar/layers-cache";

export async function GET(request: Request) {
  const limited = rateLimited(request);
  if (limited) return limited;

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!HEATMAP_ID_RE.test(id)) return reply({ error: "BAD_REQUEST", message: "id must come from /api/solar/layers" }, 400);

  try {
    const png = await getLayersStore().heatmap(id);
    if (!png) return reply({ error: "NO_COVERAGE", message: "This sun map has expired. Reload the layers." }, 404);
    return new Response(new Uint8Array(png), { status: 200, headers: { ...NO_STORE, "Content-Type": "image/png" } });
  } catch (e) {
    console.error("solar heatmap: unexpected error", e);
    return upstreamReply();
  }
}
