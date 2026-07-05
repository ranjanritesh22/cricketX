import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    // Lint runs as its own script (`npm run lint`); the build gate is tsc + vitest.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
