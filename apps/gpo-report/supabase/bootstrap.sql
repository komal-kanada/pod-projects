-- ---------------------------------------------------------------------------
-- GPO Annual Report — one-time database bootstrap.
--
-- Run ONCE in the Supabase SQL editor (as the default `postgres` user), after
-- replacing <choose-a-strong-password>. Everything after this — tables,
-- indexes, functions — is applied by the app's own role with
-- `pnpm --filter gpo-report db:migrate`.
--
-- Isolation: `gpo_app` owns schema `gpo` and can use pgvector in
-- `extensions`. It gets no rights on `public` (PrepSprint's data) or on the
-- other POD apps' schemas, and `gpo` is not exposed through the Data API, so
-- the anon key in PrepSprint's browser bundle can't reach it either.
-- ---------------------------------------------------------------------------

create extension if not exists vector with schema extensions;

create role gpo_app login password '<choose-a-strong-password>' noinherit;

-- Lets `postgres` create the schema on gpo_app's behalf and manage it later.
grant gpo_app to postgres;

create schema if not exists gpo authorization gpo_app;
revoke all on schema gpo from public;

grant usage on schema extensions to gpo_app;

alter role gpo_app set search_path = gpo, extensions;
alter role gpo_app set statement_timeout = '60s';

-- Check: should list only gpo / extensions / pg_catalog / information_schema.
-- select distinct table_schema from information_schema.tables
-- where has_table_privilege('gpo_app', quote_ident(table_schema)||'.'||quote_ident(table_name), 'select');
