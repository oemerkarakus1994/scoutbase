# SFV / ÖFB: Bezeichnungen für Stadien und Spielorte

## Quelle

Die Salzburger Vereine und Spiele werden über den **ÖFB-Datenservice** bzw. **vereine.oefb.at** abgebildet. In den Spiel-/Bewerbs-JSONs (vgl. `data/derived/competition-content-manifest.sfv.json`) tauchen dieselben Feldnamen auf wie im SFV-/ÖFB-Umfeld landesweit.

## Typische Namensmuster (Salzburg & Österreich)

| Muster | Beispiele |
|--------|-----------|
| **…Stadion** | Alpenstadion, Steinbergstadion, Klammstadion, Seestadion, Mützenstadion |
| **Stadion …** | Stadion Grödig (Kunstrasenfeld), Max Aicher Stadion – Salzburg/Maxglan |
| **Arena** | Lungau Arena (vereinzelt) |
| **Sportplatz / Sportanlage** | Sportplatz …, ASV Sportanlage …, Sportanlage Schlatterberg |
| **Sportzentrum** | Sportzentrum Bergheim |
| **Zusatz im Namen** | `(Kunstrasenfeld)`, `(Naturrasen)`, Ortsname vorangestellt: `Tamsweg - Alpenstadion …` |

## JSON-Felder (ÖFB-Spielobjekte)

Reihenfolge von **präzise** zu **lang**:

| Feld | Bedeutung |
|------|-----------|
| **`spielfeldBezeichnung`** | Kurzname der Anlage (z. B. „Alpenstadion Tamsweg“) – oft die beste Anzeige. |
| **`spielortBezeichnung`** | Länger, oft mit Ort: „Tamsweg - Alpenstadion (…)“. |
| **`spielort`** | Vollständiger Ort-String inkl. Land, z. B. `…, Tamsweg, Österreich`. |
| **`spielortStadt`**, **`spielortLand`** | Aufschlüsselung (optional). |

In **Vereins-`meta`** (Import) können je nach Pipeline dieselben oder klassische Keys vorkommen:

- `stadion_name`, `stadion`, `stadium_name`, `stadium`
- `venue_name` (interne Manifeste)

## Umsetzung in ScoutBase

Die zentrale Auswertung liegt in `web/lib/sfv-stadium-meta.ts` (`parseVereinStadiumMeta`, `resolveStadionDisplay`).  
Priorität für die **Anzeige „Stadion“** auf Vereinsprofil & Liste:

1. `vereine.meta` (Keys wie oben)  
2. erstes gesetztes Stadion aus **`teams.meta`**  
3. **häufigster** `core.spiele.venue_name` bei Heimspielen (`home_team_id` = Team des Vereins)

Ohne importierte Spiele mit `venue_name` und ohne Meta bleibt die Spalte leer (—).

Siehe `stadion_label_priority` in `docs/sfv-stadium-meta-keys.json`.

Bei Erweiterung des Imports: neue Keys dort und in `parseVereinStadiumMeta` ergänzen.

## ÖFB-Seite „Sportplatz“ (Crawl)

Unter **`https://vereine.oefb.at/{ClubSlug}/Sportplatz/`** (Beispiel: [UskElsbethen/Sportplatz](https://vereine.oefb.at/UskElsbethen/Sportplatz/)) liefern die eingebetteten **`SG.container.appPreloads`** die App **Spielortinfos** (`vhp3_spielortinfo`): u. a. `bezeichnung`, Adresse, **`spielfelder`** (Bezeichnung, Rasenart, Länge/Breite, Flutlicht).

**Hinweis:** Dieselbe Preload-ID kann im HTML **doppelt** vorkommen (einmal voller JSON, einmal leeres `{}`). Der Parser in `scripts/lib/oefb-preloads.mjs` behält den **umfangreicheren** Wert.

### Skripte

| Befehl | Zweck |
|--------|--------|
| `node scripts/collect-sportplatz-meta.mjs` | Crawlt alle eindeutigen `club_slug` aus `data/derived/team-targets.sfv.json`, schreibt `data/derived/sportplatz-meta.sfv.json`. |
| `node scripts/collect-sportplatz-meta.mjs --limit=10` | Nur erste 10 Vereine. |
| `node scripts/collect-sportplatz-meta.mjs --slug=UskElsbethen` | Ein Verein. |
| `node scripts/import-sportplatz-meta-to-supabase.mjs` | Merged `meta_patch` in `core.vereine` (**Match:** `slug` = `club_slug`). Benötigt `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. |

Npm-Kurzformen: `npm run collect:sportplatz:sfv` und `npm run import:sportplatz:sfv` (siehe Root-`package.json`).

**Rechtliches:** Seiten von fussballoesterreich.at/ÖFB unterliegen Nutzungsbedingungen; Crawling nur im Rahmen eurer Freigaben / interner Datenaufbereitung.
