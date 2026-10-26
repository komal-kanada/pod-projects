import "server-only";

import type { RunKind } from "./config";
import { getActiveRuns } from "./db/runs";
import { missingEnv } from "./env";
import { createServicesFromEnv, type Services } from "./services";
import type { IngestionRun } from "./types";

let services: Services | null = null;

export function getServices(): Services {
  services ??= createServicesFromEnv();
  return services;
}

export type AppStatus =
  | { state: "unconfigured"; missing: string[] }
  | { state: "db-error"; message: string }
  | { state: "not-ingested" }
  | { state: "ready"; runs: Partial<Record<RunKind, IngestionRun>> };

/** Ready as soon as any run kind is active; presets needing a missing kind say so. */
export async function getAppStatus(): Promise<AppStatus> {
  const missing = missingEnv();
  if (missing.length) return { state: "unconfigured", missing };
  try {
    const runs = await getActiveRuns(getServices().sql);
    return Object.keys(runs).length ? { state: "ready", runs } : { state: "not-ingested" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[worldbank] status check failed:", message);
    return {
      state: "db-error",
      message: /does not exist/.test(message)
        ? "The database is reachable but the tables are missing. Run the migrations."
        : "Couldn't reach the database. Check DATABASE_URL.",
    };
  }
}
