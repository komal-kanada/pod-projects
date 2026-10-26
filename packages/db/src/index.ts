import postgres from "postgres";

/**
 * Postgres access for the POD RAG apps.
 *
 * Each app connects with its **own login role** (`gpo_app`, `worldbank_app`,
 * `imac_app`) whose only rights are on its own schema plus `extensions`
 * (pgvector). So even inside one Supabase project, Postgres itself stops one
 * app from reading or writing another app's rows — isolation doesn't depend
 * on our code being bug-free.
 *
 * The connection string comes from the caller, never from the environment
 * here, so a shared package can't pick the wrong database.
 */

export type Sql = postgres.Sql;

const clients = new Map<string, Sql>();

export function createDb(url: string, { max = 3 }: { max?: number } = {}): Sql {
  // One pool per URL per process. In `next dev`, modules re-evaluate on every
  // edit; caching on globalThis stops each edit leaking a connection pool.
  const cache = ((globalThis as { __podDb?: Map<string, Sql> }).__podDb ??= clients);
  const existing = cache.get(url);
  if (existing) return existing;

  const sql = postgres(url, {
    // Supabase's transaction pooler (port 6543) can't hold prepared
    // statements across transactions.
    prepare: false,
    max,
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
  });
  // An ended pool must leave the cache, or the next createDb hands it back dead.
  const end = sql.end.bind(sql);
  sql.end = (options) => {
    if (cache.get(url) === sql) cache.delete(url);
    return end(options);
  };
  cache.set(url, sql);
  return sql;
}

/** pgvector's text form: "[0.1,0.2,…]". Cast with `::extensions.vector`. */
export function toVector(values: number[]): string {
  return `[${values.join(",")}]`;
}

export function fromVector(text: string): number[] {
  return text.replace(/^\[|\]$/g, "").split(",").map(Number);
}

/**
 * Lists tables outside the app's own schema that the current role can read.
 * `check:setup` fails if this isn't empty — the isolation promise, tested.
 */
export async function foreignReadableTables(sql: Sql, ownSchema: string): Promise<string[]> {
  // OIDs, not names: resolving "realtime.x" by name already fails without
  // USAGE on that schema. Reading needs both USAGE on the schema and SELECT.
  const rows = await sql<{ name: string }[]>`
    select n.nspname || '.' || c.relname as name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p', 'v', 'm', 'f')
      and n.nspname not in (${ownSchema}, 'extensions', 'pg_catalog', 'information_schema')
      and n.nspname not like 'pg\\_%'
      and has_schema_privilege(n.oid, 'usage')
      and has_table_privilege(c.oid, 'select')
    order by 1
  `;
  return rows.map((row) => row.name);
}
