# OeFB Amateur Supabase Flicker

Dieses Verzeichnis ist die getrennte Arbeitsbasis fuer den neuen OeFB-Amateurdaten-Stack. Der bestehende Ordner `oefb-amateur-transfermarkt-mvp` bleibt unberuehrt.

Aktuell ist hier noch keine App implementiert. Dieser Stand deckt jetzt zwei Bereiche ab:

- Research und Quellensammlung
- lokale Vorbereitung fuer Supabase-Schema und Discovery-Import

Der erste Stand sammelt vor allem:

- verifizierte OeFB-Quellen und Seitentypen
- ein aktuelles Ligainventar ueber ganz Oesterreich
- Beispielseiten und Beispiel-JSON fuer Kader, Trainer, Transfers, Funktionaere, Spielerprofile und Spielberichte
- eine erste Heuristik fuer den Zielbereich "Regionalliga bis 2. Klasse", inklusive Reserve-Wettbewerben wenn sie in den Gruppen auftauchen
- aktuelle Tabellen, Spielplaene und daraus abgeleitete Team-Ziele fuer die naechste Crawl-Stufe

## Struktur

- `scripts/collect-oefb-research.mjs`: zieht Quellen, Inventar und Beispiel-Dateien von OeFB
- `scripts/build-discovery-manifest.mjs`: baut aus den Discovery-Dateien ein importfaehiges Supabase-Manifest
- `scripts/build-competition-content-manifest.mjs`: extrahiert aus Bewerbsseiten Tabellen und Spielplan/Ergebnisse
- `scripts/build-team-targets.mjs`: leitet aus Tabellen und Spielplan die relevanten Teamseiten fuer den naechsten Crawl ab
- `scripts/collect-team-pages.mjs`: sammelt aktuelle Teamseiten fuer Kader, Staff, Transfers und Team-Spielplaene
- `scripts/build-team-content-manifest.mjs`: normalisiert Teamseiten zu Vereinen, Teams, Personen, Rollen, Memberships und Transfers
- `scripts/import-discovery-to-supabase.mjs`: importiert das Discovery-Manifest spaeter direkt nach Supabase
- `scripts/import-competition-content-to-supabase.mjs`: importiert spaeter Tabellen-Snapshots und Spiele nach Supabase
- `docs/OEFB_SOURCE_MAP.md`: dokumentiert die wichtigsten Datenquellen und Seitentypen
- `docs/SUPABASE_SCHEMA.md`: beschreibt das Datenmodell in `raw`, `core` und `sync`
- `docs/IMPORT_WORKFLOW.md`: beschreibt den lokalen Ablauf bis zum spaeteren Live-Import
- `supabase/migrations/`: SQL-Migrationen fuer Supabase
- `data/discovery/`: aggregierte Ligalisten und Entdeckungsdaten
- `data/derived/`: lokal erzeugte Import-Manifeste
- `data/raw/`: rohe HTML-, JS- und JSON-Dateien
- `data/samples/`: extrahierte App-Preloads und Beispiel-URLs

## Schnellstart

```bash
cd /Users/omerkarakus/Downloads/oefb-amateur-supabase-flicker
node scripts/collect-oefb-research.mjs
node scripts/build-discovery-manifest.mjs
node scripts/build-competition-content-manifest.mjs --scope=current
node scripts/build-team-targets.mjs --scope=current
node scripts/build-team-content-manifest.mjs --scope=current
```

Wichtige Ausgaben danach:

- `data/discovery/collection-summary.json`
- `data/discovery/target-amateur-men-competitions.json`
- `data/discovery/target-amateur-men-competitions.csv`
- `data/raw/json/sample-wiener-stadtliga-table.json`
- `data/derived/discovery-manifest.summary.json`
- `data/derived/competition-content-manifest.current.summary.json`
- `data/derived/team-targets.current.summary.json`
- `data/derived/team-content-manifest.current.summary.json`

## Wichtige Hinweise

- Mehrere Datenbereiche liegen direkt als JSON-Endpunkte vor, andere nur als eingebettete `SG.container.appPreloads[...]` in HTML-Seiten.
- Tabellen und Bewerbs-Metadaten sind oeffentlich ueber `/datenservice/rest/...` erreichbar.
- Kader, Transfers, Spielerprofile und Spielberichte lassen sich stabil ueber HTML plus extrahierte Preloads erfassen.
- Die OeFB-/fussballoesterreich-Seiten enthalten Nutzungs- und Rechtehinweise. Vor einem produktiven 1:1-Import sollten wir besonders bei Fotos, Logos und urheberrechtlich sensiblen Inhalten klaeren, was technisch moeglich und rechtlich zulaessig ist.

## Supabase-Vorbereitung

Bevor wir live importieren, reicht lokal:

```bash
cp .env.example .env
```

Die Werte koennen erstmal leer bleiben. Sobald du mir die echten Zugangsdaten gibst, verwenden wir:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Dann sind die naechsten Befehle:

```bash
node scripts/build-discovery-manifest.mjs
node scripts/import-discovery-to-supabase.mjs
node scripts/import-competition-content-to-supabase.mjs --scope=current
```

## Naechster sinnvoller Schritt

Wenn du willst, bauen wir als Naechstes direkt darauf auf:

1. Migrationen in Supabase einspielen
2. Discovery-Daten live importieren
3. aktuelle Teamseiten fuer Kader, Staff, Transfers und Team-Spielplaene sammeln
4. danach Vereine, Teams, Kader, Transfers und Profile auf dieselbe Struktur aufsetzen
