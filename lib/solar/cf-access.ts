/**
 * Cloudflare Access check for proxy.ts. Prod is behind Access, but Caddy also answers anyone who hits
 * the VPS IP directly with the right Host header, skipping Cloudflare. So every request (except
 * /api/health) must carry a valid `Cf-Access-Jwt-Assertion`, which Cloudflare adds after login and
 * for service tokens. Off unless CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD are both set (laptops, CI,
 * the Docker smoke test).
 */
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export interface AccessConfig {
  /** e.g. https://mitchellwinter.cloudflareaccess.com, also the token issuer. */
  teamDomain: string;
  /** The Access application's AUD tag. */
  aud: string;
}

/** null = check disabled. Accepts the team domain with or without https://. */
export function accessConfigFromEnv(env: Record<string, string | undefined> = process.env): AccessConfig | null {
  const team = env.CF_ACCESS_TEAM_DOMAIN?.trim().replace(/\/+$/, "");
  const aud = env.CF_ACCESS_AUD?.trim();
  if (!team || !aud) return null;
  return { teamDomain: /^https:\/\//.test(team) ? team : `https://${team.replace(/^http:\/\//, "")}`, aud };
}

/** The container healthcheck and the deploy job call this on 127.0.0.1 without a token. */
export const isAccessExempt = (pathname: string) => pathname === "/api/health";

const jwksByTeam = new Map<string, JWTVerifyGetKey>();

/** Cloudflare's signing keys for the team, fetched once and cached (and refreshed on an unknown kid) by jose. */
export function accessJwks(teamDomain: string): JWTVerifyGetKey {
  let jwks = jwksByTeam.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    jwksByTeam.set(teamDomain, jwks);
  }
  return jwks;
}

/** True only for an RS256 token signed by the team's keys, issued by the team, for our AUD, not expired. */
export async function verifyAccessJwt(token: string | null | undefined, cfg: AccessConfig, keys: JWTVerifyGetKey = accessJwks(cfg.teamDomain)): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, keys, { issuer: cfg.teamDomain, audience: cfg.aud, algorithms: ["RS256"], clockTolerance: 30 });
    return true;
  } catch {
    return false;
  }
}
