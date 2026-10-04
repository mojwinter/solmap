/** Shared request/response plumbing for the /api/solar/* route handlers. */
import { z } from "zod";
import { BC_BOUNDS } from "@/src/config/bc";
import type { ApiError } from "@/src/types/app";
import { DailyBudgetError } from "./budget";
import { clientIp, gate, getSolarRateLimiter, RateLimitedError, type Gate, type RateLimiter } from "./ratelimit";

// Google's terms cap caching at 30 days, so no browser or CDN gets to decide.
export const NO_STORE = { "Cache-Control": "private, no-store" };

export const reply = <T>(body: T | ApiError, status: number, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...NO_STORE, ...headers } });

const tooMany = (retryAfterSeconds: number) =>
  reply({ error: "RATE_LIMITED" }, 429, { "Retry-After": String(retryAfterSeconds) });

/** Takes a token now: null if the caller still had one, otherwise the 429 to return. */
export function rateLimited(request: Request, limiter: RateLimiter = getSolarRateLimiter()): Response | null {
  const limit = limiter.take(clientIp(request.headers));
  return limit.ok ? null : tooMany(limit.retryAfterSeconds);
}

/** The caller's bucket as a Gate for a store, which runs it only when the lookup needs real work (#58). */
export const gateFor = (request: Request, limiter: RateLimiter = getSolarRateLimiter()): Gate =>
  gate(limiter, clientIp(request.headers));

const coordinate = (name: string, min: number, max: number) =>
  z
    .string({ error: `${name} is required` })
    .trim()
    .regex(/^-?\d+(\.\d+)?$/, `${name} must be a decimal number`)
    .transform(Number)
    .refine((v) => v >= min && v <= max, `${name} must be between ${min} and ${max} (inside BC)`);

const latLngSchema = z.object({
  lat: coordinate("lat", BC_BOUNDS.latMin, BC_BOUNDS.latMax),
  lng: coordinate("lng", BC_BOUNDS.lngMin, BC_BOUNDS.lngMax),
});

/** `?lat&lng` inside BC, or the 400 to return. */
export function parseLatLng(request: Request): { lat: number; lng: number } | Response {
  const params = new URL(request.url).searchParams;
  const query = latLngSchema.safeParse({ lat: params.get("lat") ?? undefined, lng: params.get("lng") ?? undefined });
  if (query.success) return query.data;
  return reply({ error: "BAD_REQUEST", message: query.error.issues.map((i) => i.message).join("; ") }, 400);
}

/** 429 when a Gate refused (#58), 503 once the daily Google budget is spent (C1), 502 for everything else upstream. */
export const upstreamReply = (e?: unknown) =>
  e instanceof RateLimitedError
    ? tooMany(e.retryAfterSeconds)
    : e instanceof DailyBudgetError
      ? reply({ error: "UPSTREAM", message: "daily limit reached" }, 503)
      : reply({ error: "UPSTREAM", message: "The solar data service didn't answer. Please try again in a minute." }, 502);
