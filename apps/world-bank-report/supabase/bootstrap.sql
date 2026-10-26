-- ---------------------------------------------------------------------------
-- World Bank Economic Report — one-time database bootstrap.
--
-- Run ONCE in the Supabase SQL editor (as `postgres`), after replacing
-- <choose-a-strong-password>. Tables and functions are then applied by the
-- app's own role: `pnpm --filter world-bank-report db:migrate`.
--
-- `worldbank_app` owns schema `worldbank` and can use pgvector; it has no
-- rights on `public` (PrepSprint) or on the other POD apps' schemas.
-- ---------------------------------------------------------------------------

create extension if not exists vector with schema extensions;

create role worldbank_app login password '<choose-a-strong-password>' noinherit;
grant worldbank_app to postgres;

create schema if not exists worldbank authorization worldbank_app;
revoke all on schema worldbank from public;

grant usage on schema extensions to worldbank_app;

alter role worldbank_app set search_path = worldbank, extensions;
alter role worldbank_app set statement_timeout = '60s';
