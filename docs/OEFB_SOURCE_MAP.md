# OeFB Source Map

## Ziel

Die Datenbasis soll moeglichst nah an den OeFB-/fussballoesterreich-Quellen bleiben, damit spaetere Updates, Verknuepfungen und Re-Imports nachvollziehbar bleiben.

## Verifizierte Quellen

### 1. Verbands-, Saison- und Bewerbs-Inventar

Diese Endpunkte sind direkt erreichbar und eignen sich gut fuer Discovery und Metadaten:

- `GET /datenservice/rest/oefb/datenservice/saisonen/{verbandId}`
- `GET /datenservice/rest/oefb/datenservice/gruppen/{verbandId};jahr={jahr2};homepage=1473983024629548524`
- `GET /datenservice/rest/oefb/datenservice/bewerbe/{gruppenId};homepage=1473983024629548524;runden=true`
- `GET /datenservice/rest/oefb/datenservice/{bewerbId};homepage=1473983024629548524`

Damit bekommen wir:

- Verbaende
- verfuegbare Saisonen je Verband
- Gruppen wie `Regionalliga`, `Oberliga`, `1. Klasse`, `2. Klasse`, Frauen, Cup usw.
- Bewerbe innerhalb dieser Gruppen
- verfuegbare historische Saisonen je Bewerb
- Runden je Bewerb

### 2. Tabellen

Direkt erreichbar:

- `GET /datenservice/rest/oefb/spielbetrieb/tabelleByPublicUid/{bewerbId}`

Typische Felder:

- Rang
- Mannschaft
- Mannschafts-Link
- Spiele
- Siege / Unentschieden / Niederlagen
- Tore erzielt / erhalten
- Tordifferenz
- Punkte
- Aufstieg / Abstieg / Relegation
- Rueckreihung / Strafsterne / Zurueckgezogen

### 3. Bewerbsseiten

Beispiel:

- `https://www.oefb.at/bewerbe/Bewerb/226635?Wiener-Stadtliga`

Wichtig:

- Die Seite selbst enthaelt viele Daten als `SG.container.appPreloads[...]`.
- Ueber die eingebundenen App-Skripte sieht man, welche OeFB-Module fuer Spielplan, Tabelle und Statistik verwendet werden.
- Spielplan/Ergebnisse sind technisch vorhanden, aber nicht jeder interne Endpunkt ist direkt ohne Proxy oeffentlich nutzbar. Deshalb ist das Extrahieren der Preloads aktuell die stabilere Schiene.

### 4. Vereins- und Mannschaftsseiten

Beispiele:

- `https://vereine.oefb.at/.../KM/Kader/`
- `https://vereine.oefb.at/.../KM/Trainer-Betreuer/`
- `https://vereine.oefb.at/.../KM/Spiele/`
- `https://vereine.oefb.at/.../KM/Tabellen/`
- `https://vereine.oefb.at/.../KM/Zu-Abgaenge/`
- `https://vereine.oefb.at/.../Verein/Funktionaere/`

Typische Daten:

- Mannschaftslisten je Saison
- Kader inkl. Spielername, Foto, Rueckennummer, Position, Einsaetze, Tore, Karten
- Trainer und Betreuer mit Funktion, seit wann, Mail, Telefon, Mobil
- Transfers mit Altverein, Neuverein, Transferdatum, Alter, Kategorie, Einsaetze
- Vereinsfunktionaere mit Rolle, Kontakt und Foto

### 5. Spielerprofile

Relevante Pfade:

- Legacy: `/netzwerk/spielerdetails/...`
- Neu: `/Profile/Spieler/{personId}?{slug}`

Typische Daten:

- Vorname, Nachname
- Geburtsdatum
- Nationalitaet
- Position
- Rueckennummer
- Aktueller Verein
- beim Verein seit
- Vereinshistorie (`vereine`)
- Bewerbe
- Statistik je Kategorie / Wettbewerb / Freundschaft / historisch
- Links zu weiteren Rollen, falls dieselbe Person auch Trainer / Funktionaer / Schiedsrichter ist

### 6. Match Center / Spielbericht

Beispiel:

- `https://www.oefb.at/bewerbe/Spiel/Spielbericht/{spielId}/`

Relevante Seitentypen:

- Spielinfo
- Spielbericht
- Aufstellung
- Liveticker
- Kaderliste
- Head-to-Head (Spieler / Teams / Trainer)
- Besetzung
- Spielort

Typische Daten:

- Spiel-ID
- Datum
- Spielort / Spielfeld
- Heim / Gast
- Ergebnis / Halbzeit
- Zuschauer
- Schiedsrichter
- Ereignisse wie Tore, Karten, Wechsel
- Submenue mit Links auf weitere matchbezogene Sichten

## Was bereits im Projektordner landet

- rohes HTML wichtiger Seitentypen
- relevante OeFB-JavaScripts
- extrahierte `appPreloads` als JSON
- aktuelles Ligainventar
- heuristisch gefilterte Zielmenge fuer den Herren-Amateurbereich

## Heuristik fuer den Zielbereich

Die aktuelle Filterung markiert Gruppen als relevant, wenn sie typischerweise in den Bereich `Regionalliga bis 2. Klasse` fallen, z. B.:

- Regionalliga
- Landesliga / Stadtliga / Eliteliga / Tirol Liga / Salzburger Liga / Burgenlandliga usw.
- 2. Landesliga
- Oberliga
- Unterliga / Gebietsliga / Bezirksliga
- 1. Klasse
- 2. Klasse

Explizit ausgeschlossen werden derzeit u. a.:

- Frauen / Maedchen
- Jugend / Nachwuchs / U-Mannschaften auf Gruppenebene
- Cupbewerbe
- Futsal
- Hobby / Hallen / Schulbewerbe

Reserve-Wettbewerbe wie `U23`, `U24`, `Reserve`, `1b` werden nicht ausgeschlossen, sondern separat markiert.

## Risiko / Rechte

Die Seiten enthalten Nutzungs- und Rechtehinweise. Technisch koennen wir viel erfassen, aber fuer eine produktive 1:1-Uebernahme sollten wir mindestens diese Punkte sauber klaeren:

- Logos und Spielerfotos
- eventuell gesondert geschuetzte Inhalte oder Widgets
- Umfang und Taktung automatischer Updates
- ob fuer ein produktives Mirror-/Indexing-Modell eine ausdrueckliche Freigabe noetig ist
