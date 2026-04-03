# Import Workflow

## Was jetzt schon lokal fertig ist

- SQL-Migration fuer Supabase unter [20260316180000_init_oefb_amateur.sql](/Users/omerkarakus/Downloads/oefb-amateur-supabase-flicker/supabase/migrations/20260316180000_init_oefb_amateur.sql)
- Discovery-Manifest-Builder unter [build-discovery-manifest.mjs](/Users/omerkarakus/Downloads/oefb-amateur-supabase-flicker/scripts/build-discovery-manifest.mjs)
- vorbereiteter Discovery-Importer fuer Supabase unter [import-discovery-to-supabase.mjs](/Users/omerkarakus/Downloads/oefb-amateur-supabase-flicker/scripts/import-discovery-to-supabase.mjs)

## Lokaler Ablauf

```bash
cd /Users/omerkarakus/Downloads/oefb-amateur-supabase-flicker
node scripts/build-discovery-manifest.mjs
node scripts/build-competition-content-manifest.mjs --scope=current
node scripts/build-team-targets.mjs --scope=current
```

Dadurch entsteht:

- `data/derived/discovery-manifest.json`
- `data/derived/discovery-manifest.summary.json`
- `data/derived/competition-content-manifest.current.json`
- `data/derived/competition-content-manifest.current.summary.json`
- `data/derived/team-targets.current.json`
- `data/derived/team-targets.current.summary.json`

Danach koennen wir die aktuellen Teamseiten gesammelt ziehen:

```bash
node scripts/collect-team-pages.mjs --scope=current --limit=25
```

Dadurch entstehen zusaetzlich:

- `data/raw/team-pages/current/<type>/html/*.html`
- `data/raw/team-pages/current/<type>/preloads/*.json`
- `data/raw/team-pages/current/<type>/extracts/*.json`
- `data/derived/team-page-collection.current.json`
- `data/derived/team-page-collection.current.summary.json`

Danach folgt die erste Normalisierungsschicht:

```bash
node scripts/build-team-content-manifest.mjs --scope=current
```

Dadurch entstehen:

- `data/derived/team-content-manifest.current.json`
- `data/derived/team-content-manifest.current.summary.json`

Als naechste Crawl-Zielliste fuer Personenprofile:

```bash
node scripts/build-player-profile-targets.mjs --scope=current
```

Dadurch entstehen:

- `data/derived/player-profile-targets.current.json`
- `data/derived/player-profile-targets.current.summary.json`

Fuer die eigentlichen Profilseiten:

```bash
node scripts/collect-player-profiles.mjs --scope=current --limit=100
```

Dadurch entstehen:

- `data/raw/player-profiles/current/html/*.html`
- `data/raw/player-profiles/current/preloads/*.json`
- `data/raw/player-profiles/current/extracts/*.json`
- `data/derived/player-profile-collection.current.json`
- `data/derived/player-profile-collection.current.summary.json`

Danach folgt die Profil-Normalisierung:

```bash
node scripts/build-profile-content-manifest.mjs --scope=current
```

Dadurch entstehen:

- `data/derived/profile-content-manifest.current.json`
- `data/derived/profile-content-manifest.current.summary.json`

Danach koennen wir die Bild- und Logo-Ziele aufbauen:

```bash
node scripts/build-asset-targets.mjs --scope=current
```

Dadurch entstehen:

- `data/derived/asset-targets.current.json`
- `data/derived/asset-targets.current.summary.json`

Fuer den eigentlichen Asset-Download:

```bash
node scripts/collect-assets.mjs --scope=current --kinds=club_logo,team_logo --limit=100
```

Dadurch entstehen:

- `data/raw/assets/current/<asset-kind>/*.png`
- `data/derived/asset-collection.current.json`
- `data/derived/asset-collection.current.summary.json`

## Sobald du Supabase-Zugangsdaten gibst

1. Migration in Supabase einspielen
2. `.env` mit `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` fuellen
3. Discovery importieren:

```bash
node scripts/import-discovery-to-supabase.mjs
```

4. Tabellen und Spiele importieren:

```bash
node scripts/import-competition-content-to-supabase.mjs --scope=current
```

5. Teamdaten importieren:

```bash
node scripts/import-team-content-to-supabase.mjs --scope=current
```

6. Assets importieren:

```bash
node scripts/import-assets-to-supabase.mjs --scope=current
```

7. App-Views in Supabase einspielen:

Datei:

- `supabase/migrations/20260316193000_app_views.sql`

Diese Views sind die erste stabile Frontend-Schicht fuer Cursor bzw. die spaetere App:

- `app.player_index`
- `app.club_index`
- `app.team_index`
- `app.transfer_feed`

## Reihenfolge der naechsten Ausbaustufen

1. Discovery importieren
2. aktuelle Tabellen und Spielplaene importieren
3. aktuelle Team-Ziele und Teamseiten sammeln
4. Vereine, Teams, Personen, Memberships und Transfers normalisieren
5. Spielerprofile und Rollenbeziehungen vertiefen
6. Fotos und Logos sammeln und den Entitaeten zuordnen
7. danach Teamdaten nach Supabase importieren
8. historische Bewerb-Editionen und Teamseiten vollstaendig erfassen

## Erwartete erste Tabellenfuellung

Mit dem aktuellen Discovery-Stand sollten direkt importiert werden:

- 9 Verbaende
- 222 aktuelle Gruppen
- 208 relevante Amateur-Herrenbewerbe
- historische Saisonen je Bewerbsreihe
- aktuelle Runden je aktueller Bewerbsedition
- aktuelle Tabellen-Snapshots je aktueller Bewerbsedition
- aktuelle Spiele und Ergebnisse aus den Wettbewerbsseiten
- aktuelle Team-Zielseiten fuer Kader, Staff, Transfers und Team-Spielplaene
