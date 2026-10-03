// Called by the Docker HEALTHCHECK, the compose healthcheck and the deploy job's health wait. Keep it dependency-free.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true });
}
