import "server-only";

import { missingEnv } from "./env";
import { createServicesFromEnv, type Services } from "./services";
import { getActiveRun } from "./db/runs";
import type { IngestionRun } from "./types";

/**
 * Server-side entry point for routes and pages. The `server-only` import
 * makes the build fail if anything here is ever pulled into a client bundle.
 */
let services: Services | null = null;

export function getServices(): Services {
  services ??= createServicesFromEnv();
  return services;
}

export type AppStatus =
  | { state: "unconfigured"; missing: string[] }
  | { state: "db-error"; message: string }
  | { state: "not-ingested" }
  | { state: "ready"; run: IngestionRun };

/** What the UI should show: setup steps, an ingest prompt, or the app. */
export async function getAppStatus(): Promise<AppStatus> {
  const missing = missingEnv();
  if (missing.length) return { state: "unconfigured", missing };

  try {
    const run = await getActiveRun(getServices().sql);
    return run ? { state: "ready", run } : { state: "not-ingested" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[gpo] status check failed:", message);
    return {
      state: "db-error",
      message: /does not exist/.test(message)
        ? "The database is reachable but the tables are missing. Run the migrations."
        : "Couldn't reach the database. Check DATABASE_URL.",
    };
  }
}
