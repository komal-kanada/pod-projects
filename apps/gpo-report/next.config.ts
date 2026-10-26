import path from "node:path";
import type { NextConfig } from "next";

// The monorepo root. Turbopack only resolves files inside its root, and file
// tracing only bundles files inside its root, so both must see the shared
// packages in ../../packages.
const monorepoRoot = path.join(__dirname, "../..");

const nextConfig: NextConfig = {
  turbopack: { root: monorepoRoot },
  outputFileTracingRoot: monorepoRoot,
};

export default nextConfig;
