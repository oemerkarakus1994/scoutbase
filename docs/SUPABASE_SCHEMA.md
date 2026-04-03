# Supabase Schema

## Zielbild

Die Datenbank ist in drei Schichten aufgeteilt:

- `raw`: 1:1-nahe OeFB-Payloads und Discovery-Dateien
- `core`: normalisierte Haupttabellen fuer Suche, Filter und Verknuepfungen
- `sync`: Laufstatus, Checkpoints und spaetere Delta-Updates

So behalten wir immer beide Ebenen:

- die Originalquelle fuer Re-Imports und Debugging
- eine saubere Anwendungsstruktur fuer die App

## ID-Strategie

Die Kernobjekte verwenden bewusst deterministische `text`-IDs statt zufaelliger UUIDs.

Beispiele:

- `oefb:verband:22793f390fce3e915783`
- `oefb:saison:2025-2026`
- `oefb:gruppe:1a0d0f70d60688dc06a3`
- `oefb:bewerb-serie:22793f390fce3e915783:1a0d0f70d60688dc06a3:1-klasse-a`
- `oefb:bewerb-edition:226633`
- `oefb:bewerb-runde:226633:26`

Das hilft bei:

- stabilen Upserts
- einfacher Importlogik
- spaeterem Wiederaufbau aus OeFB-Daten

## Bereits abgedeckte Tabellen

### `raw.payloads`

Speichert Discovery-Payloads und spaeter auch weitere importierte OeFB-Antworten.

Wichtige Spalten:

- `id`
- `payload_kind`
- `source_url`
- `source_id`
- `payload_json`
- `payload_hash`
- `meta`

### `core.verbaende`

Landesverbaende und deren Einstiegspunkte.

### `core.saisonen`

Globale Saisonen wie `2025/26`.

### `core.gruppen`

Wettbewerbsgruppen wie `Regionalliga`, `Oberliga`, `1. Klasse`, `2. Klasse`.

### `core.bewerb_serien`

Die Wettbewerbsreihe ueber mehrere Saisonen, verankert an der aktuell entdeckten OeFB-Bewerb-ID.

Das ist absichtlich eher 1:1 als "intelligent zusammengelegt", damit keine gleichnamigen Bewerbe versehentlich kollidieren.

### `core.bewerb_editionen`

Die saisonbezogene Wettbewerbsedition mit eigener OeFB-Bewerb-ID.

Wichtig:

- OeFB verwendet saisonbezogene Bewerb-IDs.
- Darum werden historische Saisonen als eigene `Editionen` gespeichert.

### `core.bewerb_runden`

Runden je Wettbewerbsedition.

## Bereits vorbereitete Zukunftstabellen

Die folgenden Tabellen sind im Schema schon vorgesehen, auch wenn wir sie in diesem Schritt noch nicht fuellen:

- `core.vereine`
- `core.teams`
- `core.personen`
- `core.person_rollen`
- `core.person_stationen`
- `core.person_team_history`
- `core.person_achievements`
- `core.person_statistiken`
- `core.media_assets`
- `core.entity_assets`
- `core.team_memberships`
- `core.transfers`
- `core.spiele`
- `core.spiel_ereignisse`
- `core.tabellen_snapshots`
- `core.tabellen_snapshot_rows`

## Sync-Schicht

### `sync.runs`

Ein Laufprotokoll pro Import.

### `sync.checkpoints`

Hier koennen wir spaeter je Pipeline den letzten erfolgreichen Stand speichern, z. B.:

- Discovery-Import fertig bis Verband X
- letzter Crawl fuer Bewerb Y
- letzte Runde / letzte Saison, die schon verarbeitet wurde

## Warum diese Struktur fuer dein Projekt passt

Du willst spaeter:

- Spieler, Trainer, Vereine und Amateurteams filtern
- Historien und Stationen verbinden
- Fotos und Logos stabil den Entitaeten zuordnen
- automatische Updates fahren
- OeFB-Daten moeglichst 1:1 behalten

Genau dafuer ist die Trennung aus `raw`, `core` und `sync` gedacht.
