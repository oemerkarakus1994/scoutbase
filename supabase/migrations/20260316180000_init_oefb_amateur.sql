create extension if not exists pgcrypto;

create schema if not exists raw;
create schema if not exists core;
create schema if not exists sync;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists raw.payloads (
  id text primary key,
  source_system text not null,
  payload_kind text not null,
  source_url text,
  source_id text,
  payload_format text not null default 'json',
  payload_hash text,
  payload_json jsonb,
  payload_text text,
  meta jsonb not null default '{}'::jsonb,
  discovered_at timestamptz not null default timezone('utc', now()),
  fetched_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_raw_payloads_kind on raw.payloads (payload_kind);
create index if not exists idx_raw_payloads_source_id on raw.payloads (source_id);
create index if not exists idx_raw_payloads_payload_json on raw.payloads using gin (payload_json);

create table if not exists core.verbaende (
  id text primary key,
  source_system text not null,
  source_id text not null,
  slug text not null,
  name text not null,
  source_url text,
  current_discovery_url text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (source_system, source_id)
);

create table if not exists core.saisonen (
  id text primary key,
  source_system text not null,
  source_key text not null,
  name text not null,
  jahr1 integer not null,
  jahr2 integer not null,
  is_current boolean not null default false,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (source_system, source_key)
);

create table if not exists core.gruppen (
  id text primary key,
  verband_id text not null references core.verbaende (id) on delete cascade,
  current_saison_id text references core.saisonen (id),
  source_system text not null,
  source_id text not null,
  slug text not null,
  name text not null,
  source_url text,
  target_adult_amateur_group boolean not null default false,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (source_system, source_id)
);

create table if not exists core.bewerb_serien (
  id text primary key,
  verband_id text not null references core.verbaende (id) on delete cascade,
  gruppe_id text not null references core.gruppen (id) on delete cascade,
  source_system text not null,
  series_key text not null,
  title text not null,
  normalized_title text not null,
  competition_bucket text,
  reserve_competition boolean not null default false,
  target_adult_amateur_group boolean not null default false,
  current_source_id text,
  current_source_url text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (source_system, series_key)
);

create unique index if not exists idx_core_bewerb_serien_current_source_id
  on core.bewerb_serien (source_system, current_source_id)
  where current_source_id is not null;

create table if not exists core.bewerb_editionen (
  id text primary key,
  serie_id text not null references core.bewerb_serien (id) on delete cascade,
  saison_id text not null references core.saisonen (id),
  source_system text not null,
  source_id text not null,
  title text not null,
  source_url text not null,
  statistik_url text,
  is_current boolean not null default false,
  round_count integer,
  current_round_number integer,
  reserve_competition boolean not null default false,
  competition_bucket text,
  historical_season_count integer,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (source_system, source_id),
  unique (serie_id, saison_id)
);

create table if not exists core.bewerb_runden (
  id text primary key,
  bewerb_edition_id text not null references core.bewerb_editionen (id) on delete cascade,
  round_number integer not null,
  name text not null,
  source_url text,
  statistik_url text,
  date_label text,
  is_current boolean not null default false,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (bewerb_edition_id, round_number)
);

create table if not exists core.vereine (
  id text primary key,
  verband_id text references core.verbaende (id),
  source_system text not null,
  source_id text,
  verein_nr text,
  name text not null,
  short_name text,
  slug text,
  source_url text,
  homepage_url text,
  logo_public_uid text,
  address_text text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_core_vereine_source_id
  on core.vereine (source_system, source_id)
  where source_id is not null;

create table if not exists core.teams (
  id text primary key,
  verein_id text references core.vereine (id) on delete cascade,
  saison_id text references core.saisonen (id),
  source_system text not null,
  source_id text,
  name text not null,
  category_label text,
  team_type text,
  source_url text,
  logo_public_uid text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_core_teams_source_id
  on core.teams (source_system, source_id)
  where source_id is not null;

create table if not exists core.personen (
  id text primary key,
  source_system text not null,
  source_person_id text,
  display_name text not null,
  vorname text,
  nachname text,
  geburtsdatum date,
  nationalitaet text,
  foto_public_uid text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_core_personen_source_person_id
  on core.personen (source_system, source_person_id)
  where source_person_id is not null;

create table if not exists core.person_rollen (
  id text primary key,
  person_id text not null references core.personen (id) on delete cascade,
  source_system text not null,
  role_type text not null,
  source_role_id text,
  primary_source_url text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_core_person_rollen_source_role_id
  on core.person_rollen (source_system, role_type, source_role_id)
  where source_role_id is not null;

create table if not exists core.person_stationen (
  id text primary key,
  person_id text not null references core.personen (id) on delete cascade,
  verein_id text references core.vereine (id),
  source_system text not null,
  source_item_key text not null,
  verein_name text not null,
  started_on date,
  country_code text,
  country_label text,
  source_url text,
  logo_public_uid text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (person_id, source_item_key)
);

create table if not exists core.person_team_history (
  id text primary key,
  person_id text not null references core.personen (id) on delete cascade,
  team_id text references core.teams (id),
  source_system text not null,
  source_item_key text not null,
  team_name text not null,
  category_label text,
  source_team_public_uid text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (person_id, source_item_key)
);

create table if not exists core.person_achievements (
  id text primary key,
  person_id text not null references core.personen (id) on delete cascade,
  verein_id text references core.vereine (id),
  saison_id text references core.saisonen (id),
  source_system text not null,
  source_item_key text not null,
  verein_name text not null,
  category_label text,
  season_label text,
  achievement_text text,
  source_url text,
  logo_public_uid text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (person_id, source_item_key)
);

create table if not exists core.person_statistiken (
  id text primary key,
  person_id text not null references core.personen (id) on delete cascade,
  source_system text not null,
  source_item_key text not null,
  category_label text,
  label text,
  stats jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (person_id, source_item_key)
);

create table if not exists core.media_assets (
  id text primary key,
  source_system text not null,
  asset_kind text not null,
  source_asset_id text not null,
  source_url text,
  storage_path text,
  content_type text,
  file_size bigint,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (source_system, asset_kind, source_asset_id)
);

create index if not exists idx_core_media_assets_asset_kind
  on core.media_assets (asset_kind);

create table if not exists core.entity_assets (
  id text primary key,
  asset_id text not null references core.media_assets (id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  relation_type text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (asset_id, entity_type, entity_id, relation_type)
);

create index if not exists idx_core_entity_assets_entity
  on core.entity_assets (entity_type, entity_id);

create table if not exists core.team_memberships (
  id text primary key,
  team_id text not null references core.teams (id) on delete cascade,
  saison_id text references core.saisonen (id),
  person_id text references core.personen (id),
  role_type text not null,
  role_label text,
  source_item_key text not null,
  source_profile_url text,
  shirt_number text,
  position_label text,
  joined_on date,
  left_on date,
  stats jsonb not null default '{}'::jsonb,
  contact jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (team_id, source_item_key)
);

create table if not exists core.transfers (
  id text primary key,
  source_system text not null,
  source_key text not null,
  team_id text references core.teams (id),
  person_id text references core.personen (id),
  from_verein_id text references core.vereine (id),
  to_verein_id text references core.vereine (id),
  from_verein_name text,
  to_verein_name text,
  transfer_date date,
  age integer,
  category_label text,
  position_label text,
  appearances integer,
  source_profile_url text,
  source_person_url text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (source_system, source_key)
);

create table if not exists core.spiele (
  id text primary key,
  source_system text not null,
  source_id text not null,
  bewerb_edition_id text references core.bewerb_editionen (id),
  saison_id text references core.saisonen (id),
  round_number integer,
  round_label text,
  source_url text,
  kickoff_at timestamptz,
  status text,
  finished boolean not null default false,
  cancelled boolean not null default false,
  live boolean not null default false,
  home_team_id text references core.teams (id),
  away_team_id text references core.teams (id),
  home_team_name text not null,
  away_team_name text not null,
  venue_name text,
  result_full text,
  result_halftime text,
  home_goals integer,
  away_goals integer,
  attendance integer,
  referee_name text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (source_system, source_id)
);

create table if not exists core.spiel_ereignisse (
  id text primary key,
  spiel_id text not null references core.spiele (id) on delete cascade,
  source_event_key text not null,
  side_label text,
  event_type text not null,
  minute integer,
  minute_label text,
  primary_person_id text references core.personen (id),
  secondary_person_id text references core.personen (id),
  primary_person_name text,
  secondary_person_name text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (spiel_id, source_event_key)
);

create table if not exists core.tabellen_snapshots (
  id text primary key,
  bewerb_edition_id text not null references core.bewerb_editionen (id) on delete cascade,
  snapshot_kind text not null default 'overall',
  round_number integer,
  label text,
  source_url text,
  source_payload_id text references raw.payloads (id),
  captured_at timestamptz not null default timezone('utc', now()),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists core.tabellen_snapshot_rows (
  id text primary key,
  snapshot_id text not null references core.tabellen_snapshots (id) on delete cascade,
  rank integer not null,
  team_id text references core.teams (id),
  team_name text not null,
  team_short_name text,
  source_team_url text,
  played integer,
  wins integer,
  draws integer,
  losses integer,
  goals_for integer,
  goals_against integer,
  goal_difference integer,
  points integer,
  status_flags jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (snapshot_id, rank, team_name)
);

create table if not exists sync.runs (
  id uuid primary key default gen_random_uuid(),
  pipeline_name text not null,
  stage text,
  status text not null check (status in ('running', 'completed', 'failed', 'cancelled')),
  trigger_source text not null default 'manual',
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz,
  stats jsonb not null default '{}'::jsonb,
  error jsonb,
  meta jsonb not null default '{}'::jsonb
);

create table if not exists sync.checkpoints (
  id text primary key,
  pipeline_name text not null,
  checkpoint_key text not null,
  status text not null default 'pending',
  cursor_text text,
  cursor_json jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default timezone('utc', now()),
  last_success_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  unique (pipeline_name, checkpoint_key)
);

create index if not exists idx_sync_runs_pipeline_name on sync.runs (pipeline_name, started_at desc);
create index if not exists idx_sync_checkpoints_pipeline on sync.checkpoints (pipeline_name);

drop trigger if exists trg_core_verbaende_updated_at on core.verbaende;
create trigger trg_core_verbaende_updated_at
before update on core.verbaende
for each row execute function public.set_updated_at();

drop trigger if exists trg_core_saisonen_updated_at on core.saisonen;
create trigger trg_core_saisonen_updated_at
before update on core.saisonen
for each row execute function public.set_updated_at();

drop trigger if exists trg_core_gruppen_updated_at on core.gruppen;
create trigger trg_core_gruppen_updated_at
before update on core.gruppen
for each row execute function public.set_updated_at();

drop trigger if exists trg_core_bewerb_serien_updated_at on core.bewerb_serien;
create trigger trg_core_bewerb_serien_updated_at
before update on core.bewerb_serien
for each row execute function public.set_updated_at();

drop trigger if exists trg_core_bewerb_editionen_updated_at on core.bewerb_editionen;
create trigger trg_core_bewerb_editionen_updated_at
before update on core.bewerb_editionen
for each row execute function public.set_updated_at();

drop trigger if exists trg_core_bewerb_runden_updated_at on core.bewerb_runden;
create trigger trg_core_bewerb_runden_updated_at
before update on core.bewerb_runden
for each row execute function public.set_updated_at();

drop trigger if exists trg_core_vereine_updated_at on core.vereine;
create trigger trg_core_vereine_updated_at
before update on core.vereine
for each row execute function public.set_updated_at();

drop trigger if exists trg_core_teams_updated_at on core.teams;
create trigger trg_core_teams_updated_at
before update on core.teams
for each row execute function public.set_updated_at();

drop trigger if exists trg_core_personen_updated_at on core.personen;
create trigger trg_core_personen_updated_at
before update on core.personen
for each row execute function public.set_updated_at();

drop trigger if exists trg_core_person_rollen_updated_at on core.person_rollen;
create trigger trg_core_person_rollen_updated_at
before update on core.person_rollen
for each row execute function public.set_updated_at();

drop trigger if exists trg_core_person_stationen_updated_at on core.person_stationen;
create trigger trg_core_person_stationen_updated_at
before update on core.person_stationen
for each row execute function public.set_updated_at();

drop trigger if exists trg_core_person_team_history_updated_at on core.person_team_history;
create trigger trg_core_person_team_history_updated_at
before update on core.person_team_history
for each row execute function public.set_updated_at();

drop trigger if exists trg_core_person_achievements_updated_at on core.person_achievements;
create trigger trg_core_person_achievements_updated_at
before update on core.person_achievements
for each row execute function public.set_updated_at();

drop trigger if exists trg_core_person_statistiken_updated_at on core.person_statistiken;
create trigger trg_core_person_statistiken_updated_at
before update on core.person_statistiken
for each row execute function public.set_updated_at();

drop trigger if exists trg_core_media_assets_updated_at on core.media_assets;
create trigger trg_core_media_assets_updated_at
before update on core.media_assets
for each row execute function public.set_updated_at();

drop trigger if exists trg_core_entity_assets_updated_at on core.entity_assets;
create trigger trg_core_entity_assets_updated_at
before update on core.entity_assets
for each row execute function public.set_updated_at();

drop trigger if exists trg_core_team_memberships_updated_at on core.team_memberships;
create trigger trg_core_team_memberships_updated_at
before update on core.team_memberships
for each row execute function public.set_updated_at();

drop trigger if exists trg_core_transfers_updated_at on core.transfers;
create trigger trg_core_transfers_updated_at
before update on core.transfers
for each row execute function public.set_updated_at();

drop trigger if exists trg_core_spiele_updated_at on core.spiele;
create trigger trg_core_spiele_updated_at
before update on core.spiele
for each row execute function public.set_updated_at();

drop trigger if exists trg_core_spiel_ereignisse_updated_at on core.spiel_ereignisse;
create trigger trg_core_spiel_ereignisse_updated_at
before update on core.spiel_ereignisse
for each row execute function public.set_updated_at();

drop trigger if exists trg_core_tabellen_snapshots_updated_at on core.tabellen_snapshots;
create trigger trg_core_tabellen_snapshots_updated_at
before update on core.tabellen_snapshots
for each row execute function public.set_updated_at();

drop trigger if exists trg_core_tabellen_snapshot_rows_updated_at on core.tabellen_snapshot_rows;
create trigger trg_core_tabellen_snapshot_rows_updated_at
before update on core.tabellen_snapshot_rows
for each row execute function public.set_updated_at();
