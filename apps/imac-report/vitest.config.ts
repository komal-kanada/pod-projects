import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    include: ["tests/**/*.test.ts"],
    // The DB test boots an in-memory Postgres; give it room.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    server: { deps: { inline: [/server-only/] } },
    alias: { "server-only": path.resolve(__dirname, "tests/empty.ts") },
  },
});
