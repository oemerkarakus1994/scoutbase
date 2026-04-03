# Cursor Handoff

## Ziel fuer Cursor

Baue die erste App-Oberflaeche auf Basis der lokalen Sample-Daten.

Frontend-Ziel:

- schneller Spieler-Explorer
- Vereins-Explorer
- Team-Explorer
- Transfer-Feed
- einfache Detailseiten fuer Spieler und Teams

## Datenquellen fuer den ersten UI-Bau

Nutze lokal diese Dateien:

- `/Users/omerkarakus/Downloads/oefb-amateur-supabase-flicker/data/app/current/player-index.sample.json`
- `/Users/omerkarakus/Downloads/oefb-amateur-supabase-flicker/data/app/current/club-index.sample.json`
- `/Users/omerkarakus/Downloads/oefb-amateur-supabase-flicker/data/app/current/team-index.sample.json`
- `/Users/omerkarakus/Downloads/oefb-amateur-supabase-flicker/data/app/current/transfer-feed.sample.json`
- `/Users/omerkarakus/Downloads/oefb-amateur-supabase-flicker/data/app/current/player-detail.sample.json`
- `/Users/omerkarakus/Downloads/oefb-amateur-supabase-flicker/data/app/current/team-detail.sample.json`

## Was zuerst gebaut werden soll

### 1. App Shell

- Navigation
- globale Suche
- Filterleiste
- Karten- und Tabellenlayout

### 2. Spieler-Explorer

Spalten / Felder:

- `foto_url`
- `display_name`
- `geburtsdatum`
- `nationalitaet`
- `rollen`
- `aktuelle_teams[0].verein_name`
- `aktuelle_teams[0].team_name`
- `station_count`

Filter:

- Name
- Nationalitaet
- Verein
- Team
- Rolle

### 3. Vereins-Explorer

Spalten / Felder:

- `logo_url`
- `name`
- `team_count`
- `reserve_team_count`
- `player_count`
- `staff_count`

Filter:

- Vereinsname
- Verband
- Reserve-Teams vorhanden

### 4. Team-Explorer

Spalten / Felder:

- `logo_url`
- `team_name`
- `verein_name`
- `team_type`
- `reserve_team`
- `kader_count`
- `staff_count`

Filter:

- Verein
- Teamtyp
- Reserve ja/nein

### 5. Transfer-Feed

Spalten / Felder:

- `transfer_date`
- `display_name`
- `foto_url`
- `from_verein_name`
- `to_verein_name`
- `category_label`
- `appearances`
- `direction`

Filter:

- Richtung
- Verein
- Datum

### 6. Detailseiten

#### Spieler-Detail

Datei:

- `player-detail.sample.json`

Sektionen:

- Kopf mit Foto und Basisdaten
- aktuelles Team
- Vereinshistorie
- Erfolge
- Statistikblöcke

#### Team-Detail

Datei:

- `team-detail.sample.json`

Sektionen:

- Kopf mit Teamlogo
- Kaderliste
- Staffliste
- Transfers

## Wichtige Contract-Regel

Cursor soll die Feldnamen aus den Sample-Dateien nicht umbenennen.
Die spaetere Supabase-Schicht wird dieselben Namen moeglichst eng nachbilden.

## Naechster Umstieg spaeter

Sobald Supabase live haengt, werden diese Sample-Dateien ersetzt durch:

- `app.player_index`
- `app.club_index`
- `app.team_index`
- `app.transfer_feed`

## Was Cursor erstmal nicht bauen muss

- Auth
- Admin
- Editierfunktionen
- historisches Deep Dive ueber alle Saisonen
- komplexe Compare-Features

## Designrichtung

Die App soll nicht wie ein generisches CRUD-Backend aussehen.

Richtung:

- sportlich
- datenlastig
- schnell filterbar
- eher Transfermarkt/Scout-Tool als Verbandsseite

## Was ich parallel hier weitermache

- restliche Personenfotos sammeln
- Supabase-Import komplett fertigziehen
- weitere `app`-Views fuer Details und Such-Performance vorbereiten
