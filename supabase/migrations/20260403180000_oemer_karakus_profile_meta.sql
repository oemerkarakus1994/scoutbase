-- ScoutBase Profil-Meta (personen.meta): Zertifizierung, Positionen, Körperdaten
-- für Ömer Karakus (bekannte Import-IDs aus dem SFV-Manifest).
begin;

update core.personen
set meta =
  coalesce(meta, '{}'::jsonb)
  || jsonb_build_object(
    'profile_verified', true,
    'birth_year', 1994,
    'height_cm', 172,
    'strong_foot', 'left',
    'primary_positions', jsonb_build_array('ZDM'),
    'secondary_positions', jsonb_build_array('LV')
  )
where id in (
  'oefb:person:legacy-9252940',
  'oefb:person:legacy-9447645'
)
or (
  lower(trim(nachname)) = 'karakus'
  and lower(trim(vorname)) in ('ömer', 'oemer')
);

commit;
