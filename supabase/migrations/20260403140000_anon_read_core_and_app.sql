-- Öffentliches Lesen für ScoutBase (anon / authenticated). service_role umgeht RLS (Imports).
-- Hinweis: Schema `app` mit Views muss vorher existieren (Migration 20260316193000_app_views.sql).
begin;

create schema if not exists app;

grant usage on schema core to anon, authenticated;
grant usage on schema app to anon, authenticated;

revoke all on table raw.payloads from anon, authenticated;
revoke all on table sync.runs from anon, authenticated;
revoke all on table sync.checkpoints from anon, authenticated;

do $$
declare
  r record;
begin
  for r in
    select c.relname as tbl
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'core'
      and c.relkind = 'r'
  loop
    execute format(
      'alter table core.%I enable row level security',
      r.tbl
    );
    execute format(
      'drop policy if exists scoutbase_public_select on core.%I',
      r.tbl
    );
    execute format(
      'create policy scoutbase_public_select on core.%I for select using (true)',
      r.tbl
    );
    execute format(
      'grant select on table core.%I to anon, authenticated',
      r.tbl
    );
  end loop;
end $$;

grant select on all tables in schema app to anon, authenticated;

commit;
