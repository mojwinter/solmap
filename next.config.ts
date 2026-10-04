import type { NextConfig } from "next";

// Sent on every response, pages and API routes alike.
const securityHeaders = [
  // One year. No preload yet: it covers every subdomain of sunscore.tech and is slow to undo.
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Clickjacking only. A full CSP (script-src etc.) would have to allow-list the Google Maps JS
  // API's scripts, workers and tiles, so it waits until the map is in.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
];

const nextConfig: NextConfig = {
  // Self-contained server for the Docker image (docker/Dockerfile copies .next/standalone).
  output: "standalone",
  async headers() {
    // `/:path*` matches `/` too (`*` = zero or more segments).
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
