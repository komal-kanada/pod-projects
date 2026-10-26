-- ---------------------------------------------------------------------------
-- Apple iMac Environmental Report — one-time database bootstrap.
--
-- Run ONCE in the Supabase SQL editor (as `postgres`), after replacing
-- <choose-a-strong-password>. Then: `pnpm --filter imac-report db:migrate`.
--
-- `imac_app` owns schema `imac` and can use pgvector; it has no rights on
-- `public` (PrepSprint) or on the other POD apps' schemas.
-- ---------------------------------------------------------------------------

create extension if not exists vector with schema extensions;

create role imac_app login password '<choose-a-strong-password>' noinherit;
grant imac_app to postgres;

create schema if not exists imac authorization imac_app;
revoke all on schema imac from public;

grant usage on schema extensions to imac_app;

alter role imac_app set search_path = imac, extensions;
alter role imac_app set statement_timeout = '60s';
