import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server for the Docker image (docker/Dockerfile copies .next/standalone).
  output: "standalone",
};

export default nextConfig;
