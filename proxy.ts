// Next 16's request interceptor (formerly middleware). Runs on every request, static files included:
// requests that didn't come through Cloudflare Access are refused (lib/solar/cf-access.ts).
import { NextResponse, type NextRequest } from "next/server";
import { accessConfigFromEnv, isAccessExempt, verifyAccessJwt } from "@/lib/solar/cf-access";

export async function proxy(request: NextRequest) {
  const cfg = accessConfigFromEnv();
  const { pathname } = request.nextUrl;
  if (!cfg || isAccessExempt(pathname)) return NextResponse.next();
  if (await verifyAccessJwt(request.headers.get("cf-access-jwt-assertion"), cfg)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  }
  return new Response("403 Forbidden: open this site through https://sunscore.tech.\n", {
    status: 403,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}
