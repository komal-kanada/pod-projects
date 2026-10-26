/**
 * `pnpm db:migrate` — applies supabase/migrations/*.sql as this app's own
 * role. Run supabase/bootstrap.sql once (as postgres) before the first run.
 */
import path from "node:path";
import { migrate } from "@pod/db/migrate";
import { SCHEMA } from "../lib/config";
import { createDbFromEnv } from "../lib/services";

const sql = createDbFromEnv();
try {
  console.log(`Migrating schema "${SCHEMA}"`);
  await migrate(sql, { schema: SCHEMA, directory: path.resolve("supabase/migrations") });
} catch (error) {
  console.error(`\nMigration failed: ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
