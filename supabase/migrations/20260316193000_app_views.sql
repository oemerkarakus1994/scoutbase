create schema if not exists app;

create or replace view app.player_index as
select
  p.id as person_id,
  p.display_name,
  p.vorname,
  p.nachname,
  p.geburtsdatum,
  p.nationalitaet,
  p.foto_public_uid,
  coalesce(
    jsonb_agg(
      distinct jsonb_build_object(
        'role_type', pr.role_type,
        'source_role_id', pr.source_role_id
      )
    ) filter (where pr.id is not null),
    '[]'::jsonb
  ) as rollen,
  coalesce(
    jsonb_agg(
      distinct jsonb_build_object(
        'team_id', t.id,
        'team_name', t.name,
        'team_type', t.team_type,
        'verein_id', v.id,
        'verein_name', v.name,
        'saison_id', tm.saison_id,
        'role_type', tm.role_type,
        'role_label', tm.role_label,
        'shirt_number', tm.shirt_number,
        'position_label', tm.position_label
      )
    ) filter (where tm.id is not null),
    '[]'::jsonb
  ) as aktuelle_teams,
  count(distinct ps.id) as station_count,
  count(distinct pa.id) as achievement_count,
  count(distinct pth.id) as team_history_count
from core.personen p
left join core.person_rollen pr on pr.person_id = p.id
left join core.team_memberships tm on tm.person_id = p.id and tm.left_on is null
left join core.teams t on t.id = tm.team_id
left join core.vereine v on v.id = t.verein_id
left join core.person_stationen ps on ps.person_id = p.id
left join core.person_achievements pa on pa.person_id = p.id
left join core.person_team_history pth on pth.person_id = p.id
group by
  p.id,
  p.display_name,
  p.vorname,
  p.nachname,
  p.geburtsdatum,
  p.nationalitaet,
  p.foto_public_uid;

create or replace view app.club_index as
select
  v.id as verein_id,
  v.name,
  v.short_name,
  v.slug,
  v.verband_id,
  vb.name as verband_name,
  v.logo_public_uid,
  v.source_url,
  count(distinct t.id) as team_count,
  count(distinct case when coalesce((t.meta ->> 'reserve_team')::boolean, false) then t.id end) as reserve_team_count,
  count(distinct case when tm.role_type = 'player' then tm.person_id end) as player_count,
  count(distinct case when tm.role_type in ('trainer', 'staff') then tm.person_id end) as staff_count
from core.vereine v
left join core.verbaende vb on vb.id = v.verband_id
left join core.teams t on t.verein_id = v.id
left join core.team_memberships tm on tm.team_id = t.id and tm.left_on is null
group by
  v.id,
  v.name,
  v.short_name,
  v.slug,
  v.verband_id,
  vb.name,
  v.logo_public_uid,
  v.source_url;

create or replace view app.team_index as
select
  t.id as team_id,
  t.name as team_name,
  t.category_label,
  t.team_type,
  t.saison_id,
  s.name as saison_name,
  t.logo_public_uid,
  t.source_url,
  coalesce((t.meta ->> 'reserve_team')::boolean, false) as reserve_team,
  v.id as verein_id,
  v.name as verein_name,
  v.verband_id,
  vb.name as verband_name,
  count(distinct case when tm.role_type = 'player' then tm.person_id end) as kader_count,
  count(distinct case when tm.role_type in ('trainer', 'staff') then tm.person_id end) as staff_count
from core.teams t
left join core.saisonen s on s.id = t.saison_id
left join core.vereine v on v.id = t.verein_id
left join core.verbaende vb on vb.id = v.verband_id
left join core.team_memberships tm on tm.team_id = t.id and tm.left_on is null
group by
  t.id,
  t.name,
  t.category_label,
  t.team_type,
  t.saison_id,
  s.name,
  t.logo_public_uid,
  t.source_url,
  t.meta,
  v.id,
  v.name,
  v.verband_id,
  vb.name;

create or replace view app.transfer_feed as
select
  tr.id as transfer_id,
  tr.transfer_date,
  tr.category_label,
  tr.position_label,
  tr.age,
  tr.appearances,
  p.id as person_id,
  p.display_name,
  p.foto_public_uid,
  tr.team_id,
  team.name as team_name,
  tr.from_verein_id,
  tr.from_verein_name,
  tr.to_verein_id,
  tr.to_verein_name,
  tr.source_profile_url,
  tr.source_person_url
from core.transfers tr
left join core.personen p on p.id = tr.person_id
left join core.teams team on team.id = tr.team_id;
