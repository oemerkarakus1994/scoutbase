/**
 * ÖFB Vereinsseiten: /{ClubSlug}/Sportplatz/ — Daten in SG.container.appPreloads
 * (App „Spielortinfos“, u. a. vhp3_spielortinfo).
 * @see https://vereine.oefb.at/UskElsbethen/Sportplatz/
 */

import { extractAllAppPreloads } from "./oefb-preloads.mjs";

function unwrapNestedPreload(value) {
  if (value == null) {
    return null;
  }
  if (Array.isArray(value)) {
    const first = value[0];
    if (Array.isArray(first)) {
      return first[0];
    }
    return first;
  }
  return value;
}

/**
 * Sucht das erste Preload-Objekt mit `spielfelder` (Spielort-Detail).
 */
export function findSpielortRow(preloads) {
  for (const raw of Object.values(preloads)) {
    const row = unwrapNestedPreload(raw);
    if (
      row &&
      typeof row === "object" &&
      Array.isArray(row.spielfelder) &&
      row.spielfelder.length > 0
    ) {
      return row;
    }
  }
  return null;
}

/**
 * Baut `vereine.meta`-Felder für ScoutBase (`parseVereinStadiumMeta` / SFV-Doku).
 */
export function buildVereinMetaFromSpielortRow(row, sportplatzUrl) {
  if (!row) {
    return null;
  }

  const first = row.spielfelder[0];
  const ort = typeof row.bezeichnung === "string" ? row.bezeichnung.trim() : "";
  const fName =
    first && typeof first.bezeichnung === "string"
      ? first.bezeichnung.trim()
      : "";

  const stadion_name =
    ort && fName
      ? `${ort} · ${fName}`
      : fName || ort || null;

  const plzOrt =
    typeof row.plzOrt === "string" ? row.plzOrt.trim() : "";
  const strasse =
    typeof row.strasseHausnummer === "string"
      ? row.strasseHausnummer.trim()
      : "";

  const spielortBezeichnung = [ort, plzOrt].filter(Boolean).join(", ");

  let capacity = null;
  let sumLst = 0;
  let hasLst = false;
  for (const sf of row.spielfelder) {
    if (typeof sf.lst === "number" && Number.isFinite(sf.lst) && sf.lst > 0) {
      sumLst += sf.lst;
      hasLst = true;
    }
  }
  if (hasLst) {
    capacity = sumLst;
  }

  const meta = {
    stadion_name: stadion_name ?? undefined,
    spielfeldBezeichnung: fName || undefined,
    spielortBezeichnung: spielortBezeichnung || undefined,
    spielort: strasse && plzOrt ? `${strasse}, ${plzOrt}` : plzOrt || undefined,
    kapazitaet: capacity ?? undefined,
    sportplatz_url: sportplatzUrl,
    sportplatz_imported_at: new Date().toISOString(),
    spielfelder_oefb: row.spielfelder.map((sf) => ({
      bezeichnung: sf.bezeichnung,
      rasenArt: sf.rasenArt,
      laenge: sf.laenge,
      breite: sf.breite,
      flutlichtVorhanden: sf.flutlichtVorhanden,
      lst: sf.lst,
    })),
  };

  for (const k of Object.keys(meta)) {
    if (meta[k] === undefined) {
      delete meta[k];
    }
  }

  return meta;
}

export function extractSpielortFromSportplatzHtml(html) {
  const preloads = extractAllAppPreloads(html);
  const row = findSpielortRow(preloads);
  return { preloads, row };
}
