import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// The remote JWKS (Cloudflare's certs URL) is replaced by a local key set: no network.
let localJwks: JWTVerifyGetKey;
const remoteUrls: string[] = [];
vi.mock("jose", async (importOriginal) => {
  const jose = await importOriginal<typeof import("jose")>();
  return {
    ...jose,
    createRemoteJWKSet: (url: URL) => {
      remoteUrls.push(url.href);
      return ((...args: Parameters<JWTVerifyGetKey>) => localJwks(...args)) as JWTVerifyGetKey;
    },
  };
});

import { proxy } from "@/proxy";
import { accessConfigFromEnv, verifyAccessJwt } from "./cf-access";

const TEAM = "https://mitchellwinter.cloudflareaccess.com";
const AUD = "790bde4c349072ec7781cd76da70fff35bf621bc114558f73108c1b6a146fbd9";
const cfg = { teamDomain: TEAM, aud: AUD };
let signKey: CryptoKey;
let otherKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  const other = await generateKeyPair("RS256");
  signKey = pair.privateKey;
  otherKey = other.privateKey;
  localJwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" }] });
});

const token = (over: { aud?: string; iss?: string; exp?: number | string; key?: CryptoKey } = {}) =>
  new SignJWT({ email: "someone@example.com" })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(over.iss ?? TEAM)
    .setAudience(over.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime(over.exp ?? "5m")
    .sign(over.key ?? signKey);

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

describe("verifyAccessJwt", () => {
  it("accepts a token signed by the team key for our AUD", async () => {
    expect(await verifyAccessJwt(await token(), cfg)).toBe(true);
  });

  it.each([
    ["wrong audience", { aud: "someone-elses-app" }],
    ["wrong issuer", { iss: "https://evil.cloudflareaccess.com" }],
    ["expired", { exp: Math.floor(Date.now() / 1000) - 120 }],
  ])("rejects a token with the %s", async (_name, over) => {
    expect(await verifyAccessJwt(await token(over), cfg)).toBe(false);
  });

  it("rejects a token signed by another key, a missing token and garbage", async () => {
    expect(await verifyAccessJwt(await token({ key: otherKey }), cfg)).toBe(false);
    expect(await verifyAccessJwt(null, cfg)).toBe(false);
    expect(await verifyAccessJwt("", cfg)).toBe(false);
    expect(await verifyAccessJwt("not.a.jwt", cfg)).toBe(false);
  });

  it("rejects an unsigned (alg: none) token", async () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${b64({ alg: "none" })}.${b64({ iss: TEAM, aud: AUD, exp: now + 300 })}.`;
    expect(await verifyAccessJwt(unsigned, cfg)).toBe(false);
  });
});

describe("accessConfigFromEnv", () => {
  it("is off unless both variables are set; normalises the team domain", () => {
    expect(accessConfigFromEnv({})).toBeNull();
    expect(accessConfigFromEnv({ CF_ACCESS_TEAM_DOMAIN: "mitchellwinter.cloudflareaccess.com" })).toBeNull();
    expect(accessConfigFromEnv({ CF_ACCESS_AUD: AUD })).toBeNull();
    expect(accessConfigFromEnv({ CF_ACCESS_TEAM_DOMAIN: "mitchellwinter.cloudflareaccess.com/", CF_ACCESS_AUD: ` ${AUD} ` })).toEqual(cfg);
    expect(accessConfigFromEnv({ CF_ACCESS_TEAM_DOMAIN: TEAM, CF_ACCESS_AUD: AUD })).toEqual(cfg);
  });
});

describe("proxy", () => {
  const req = (path: string, jwt?: string) =>
    new NextRequest(`http://localhost${path}`, { headers: jwt ? { "cf-access-jwt-assertion": jwt } : {} });
  const passes = (res: Response) => res.headers.get("x-middleware-next") === "1";
  const enable = () => {
    process.env.CF_ACCESS_TEAM_DOMAIN = "mitchellwinter.cloudflareaccess.com";
    process.env.CF_ACCESS_AUD = AUD;
  };

  it("skips the check when the env isn't set (laptops, CI, Docker smoke test)", async () => {
    delete process.env.CF_ACCESS_TEAM_DOMAIN;
    delete process.env.CF_ACCESS_AUD;
    expect(passes(await proxy(req("/api/solar/building?lat=49.25&lng=-123.15")))).toBe(true);
  });

  it("always lets /api/health through", async () => {
    enable();
    expect(passes(await proxy(req("/api/health")))).toBe(true);
  });

  it("passes a valid token and fetches the team's certs URL", async () => {
    enable();
    expect(passes(await proxy(req("/api/solar/building?lat=49.25&lng=-123.15", await token())))).toBe(true);
    expect(passes(await proxy(req("/", await token())))).toBe(true);
    expect(remoteUrls).toContain(`${TEAM}/cdn-cgi/access/certs`);
  });

  it("403 JSON for /api/* without a valid token", async () => {
    enable();
    for (const jwt of [undefined, await token({ aud: "other" }), await token({ key: otherKey })]) {
      const res = await proxy(req("/api/solar/layers?lat=49.25&lng=-123.15", jwt));
      expect(res.status).toBe(403);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(await res.json()).toEqual({ error: "FORBIDDEN" });
    }
  });

  it("plain 403 for pages and static files, and near-miss health paths aren't exempt", async () => {
    enable();
    for (const path of ["/", "/report/49.25/-123.15", "/_next/static/chunks/x.js", "/api/health/x", "/api/healthz"]) {
      const res = await proxy(req(path));
      expect(res.status).toBe(403);
    }
    const page = await proxy(req("/"));
    expect(page.headers.get("content-type")).toMatch(/^text\/plain/);
  });
});
