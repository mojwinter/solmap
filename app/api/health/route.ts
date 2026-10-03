// Called by scripts/deploy.sh and the Docker HEALTHCHECK. Keep it dependency-free.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true });
}
