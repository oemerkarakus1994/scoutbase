# App Blueprint

## Ziel

Die App soll den OeFB-Amateurbereich wie eine Mischung aus Transfermarkt und Football Manager lesbar und filterbar machen:

- Spieler finden
- Vereine und Teams vergleichen
- Trainer und Staff durchsuchen
- Transfers und Stationen verfolgen
- Ergebnisse, Tabellen und Historien verknuepfen

## Produktlogik

Die Datenbasis bleibt in `raw` und `core` moeglichst nahe an OeFB.
Die App arbeitet spaeter nicht direkt auf diesen Tabellen, sondern auf einer duennen `app`-Schicht mit lesefertigen Views.

Damit bekommen wir:

- stabile Imports im Backend
- einfache Queries im Frontend
- weniger Logik doppelt in UI und Datenbank

## MVP Screens

### 1. Spieler-Explorer

Filter:

- Name
- Geburtsjahr
- Nationalitaet
- Verein
- Team
- Rolle
- Liga/Bewerb
- Saison

Listenfelder:

- Foto
- Name
- Geburtsdatum
- Nationalitaet
- aktueller Verein
- aktuelles Team
- Rollen
- Anzahl Stationen

### 2. Vereins-Explorer

Filter:

- Name
- Verband
- Liga
- Reserve-Teams ja/nein

Listenfelder:

- Logo
- Vereinsname
- Verband
- Teamanzahl
- Spieleranzahl
- Staffanzahl

### 3. Team-Explorer

Filter:

- Verein
- Saison
- Teamtyp
- Reserve/U23/U24/1b
- Liga/Bewerb

Listenfelder:

- Logo
- Teamname
- Verein
- Saison
- Teamtyp
- Kadergroesse
- Staffgroesse

### 4. Transfer-Feed

Filter:

- Saison
- Verein
- Richtung
- Position

Listenfelder:

- Spieler
- Alter
- Position
- von Verein
- zu Verein
- Datum
- Kategorie

### 5. Detailseiten

- Spielerprofil
- Vereinsprofil
- Teamprofil
- Trainerprofil

## Parallel mit Cursor

### Ich hier in Codex

- OeFB-Crawler
- Normalisierung
- Supabase-Schema
- `app`-Views fuer das Frontend
- Importer und Asset-Pipeline

### Cursor parallel

- App-Shell
- Routing
- Suchseiten
- Karten/Tabellen/Listen
- Detailseiten
- UX fuer Filter und Compare-Ansichten

## Gemeinsamer Vertrag

Cursor sollte fuer das Frontend zunaechst gegen folgende Views bauen:

- `app.player_index`
- `app.club_index`
- `app.team_index`
- `app.transfer_feed`

Solange Supabase noch nicht live angebunden ist, kann Cursor lokal gegen diese Sample-Dateien bauen:

- `data/app/current/player-index.sample.json`
- `data/app/current/club-index.sample.json`
- `data/app/current/team-index.sample.json`
- `data/app/current/transfer-feed.sample.json`
- `data/app/current/player-detail.sample.json`
- `data/app/current/team-detail.sample.json`

Wenn du spaeter echte Supabase-Zugangsdaten gibst, koennen dieselben Contracts live bleiben.

## Sinnvolle Reihenfolge ab jetzt

1. `app`-Views definieren
2. Supabase live anbinden
3. Discovery, Competitions, Teams, Profiles und Assets importieren
4. Cursor baut die UI auf Basis der `app`-Views
5. Danach Detailseiten und historische Layer ausbauen
