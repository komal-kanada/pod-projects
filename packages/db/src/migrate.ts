import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Sql } from "./index";

/**
 * Applies `NNNN_name.sql` files in order, once each, recording them in
 * `<schema>.schema_migrations`. Runs as the app's own role, which owns its
 * schema — so `pnpm db:migrate` needs no admin key, and can't touch any
 * other app's schema even by mistake.
 *
 * Each file runs in its own transaction: a failing migration leaves nothing
 * half-applied.
 */
export async function migrate(
  sql: Sql,
  { schema, directory, log = console.log }: { schema: string; directory: string; log?: (line: string) => void },
): Promise<string[]> {
  await sql.unsafe(`
    create table if not exists ${schema}.schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const applied = new Set(
    (await sql.unsafe<{ name: string }[]>(`select name from ${schema}.schema_migrations`)).map(
      (row) => row.name,
    ),
  );

  const files = (await readdir(directory)).filter((file) => /^\d{4}_.+\.sql$/.test(file)).sort();
  const ran: string[] = [];

  for (const file of files) {
    if (applied.has(file)) continue;
    const body = await readFile(path.join(directory, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx.unsafe(`insert into ${schema}.schema_migrations (name) values ($1)`, [file]);
    });
    log(`  applied ${file}`);
    ran.push(file);
  }

  if (ran.length === 0) log("  up to date");
  return ran;
}
