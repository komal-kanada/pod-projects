import { createDb, foreignReadableTables } from "./index";

/**
 * Used by every app's `check:setup`: connection, pgvector, the isolation
 * promise (this role can read nothing outside its schema), and tables.
 */
export async function checkDatabase(
  url: string,
  { schema, tables }: { schema: string; tables: string[] },
): Promise<{ ok: boolean; migrated: boolean; lines: string[] }> {
  const lines: string[] = [];
  let ok = true;
  let migrated = false;
  const sql = createDb(url, { max: 1 });
  try {
    const [who] = await sql<{ user: string }[]>`select current_user as user`;
    lines.push(`ok    connected as ${who.user}`);

    const [ext] = await sql<{ ok: boolean }[]>`select exists(select 1 from pg_extension where extname = 'vector') as ok`;
    if (ext.ok) lines.push("ok    pgvector installed");
    else {
      ok = false;
      lines.push("FAIL  pgvector missing → run supabase/bootstrap.sql");
    }

    const foreign = await foreignReadableTables(sql, schema);
    if (foreign.length === 0) lines.push(`ok    isolated: this role reads only "${schema}" (+ extensions)`);
    else {
      ok = false;
      lines.push(`FAIL  role can read outside "${schema}": ${foreign.slice(0, 5).join(", ")}${foreign.length > 5 ? "…" : ""} → connect as the app role, not postgres`);
    }

    const present = new Set(
      (await sql<{ table_name: string }[]>`select table_name from information_schema.tables where table_schema = ${schema}`).map((t) => t.table_name),
    );
    const missing = tables.filter((t) => !present.has(t));
    migrated = missing.length === 0;
    if (migrated) lines.push("ok    tables present");
    else {
      ok = false;
      lines.push(`FAIL  missing tables: ${missing.join(", ")} → pnpm db:migrate`);
    }
  } catch (error) {
    ok = false;
    lines.push(`FAIL  ${(error as Error).message}`);
  } finally {
    await sql.end();
  }
  return { ok, migrated, lines };
}
