/**
 * An in-process Postgres (PGlite + pgvector) behind a real wire-protocol
 * socket, so integration tests exercise the exact SQL and the exact
 * postgres.js client the apps use in production — without Docker or a
 * Supabase project.
 *
 * Mirrors Supabase's layout: pgvector lives in the `extensions` schema.
 */
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

export async function startTestDatabase(schema: string) {
  const db = await PGlite.create({ extensions: { vector } });
  await db.exec(`
    create schema if not exists extensions;
    create extension if not exists vector with schema extensions;
    create schema if not exists ${schema};
    set search_path = ${schema}, extensions, public;
  `);

  const port = 50000 + Math.floor(Math.random() * 10000);
  const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1" });
  await server.start();

  return {
    url: `postgres://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`,
    async stop() {
      await server.stop();
      await db.close();
    },
  };
}
