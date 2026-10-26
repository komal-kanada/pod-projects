import path from "node:path";
import type { NextConfig } from "next";

// The monorepo root. Turbopack only resolves files inside its root, and file
// tracing only bundles files inside its root, so both must see the shared
// packages in ../../packages.
const monorepoRoot = path.join(__dirname, "../..");

const nextConfig: NextConfig = {
  turbopack: { root: monorepoRoot },
  outputFileTracingRoot: monorepoRoot,
  // The answer route reads element crops from public/ to send them to the
  // model (preset M4). public/ isn't in a function's filesystem unless traced.
  outputFileTracingIncludes: {
    "/api/ask": ["./public/report/crops/**"],
  },
  // Rendering libraries are only used by the offline scripts.
  serverExternalPackages: ["mupdf", "sharp"],
};

export default nextConfig;
