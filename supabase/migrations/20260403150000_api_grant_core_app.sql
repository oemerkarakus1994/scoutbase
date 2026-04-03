-- ScoutBase: API-Zugriff auf `core` / `app` für anon/authenticated.
-- Behebt u.a. PostgreSQL: "permission denied for schema core", wenn ältere DBs
-- ohne Migration 20260403140000 laufen oder Grants fehlen.
--
-- Zusätzlich (Hosted Supabase): Project Settings → API → "Exposed schemas":
--   core, app (neben public) eintragen — sonst meldet PostgREST u.a. PGRST106.
--
begin;

grant usage on schema core to anon, authenticated, service_role;
grant usage on schema app to anon, authenticated, service_role;

grant select on all tables in schema core to anon, authenticated;
grant select on all tables in schema app to anon, authenticated;

alter default privileges for role postgres in schema core
  grant select on tables to anon, authenticated;
alter default privileges for role postgres in schema app
  grant select on tables to anon, authenticated;

commit;
