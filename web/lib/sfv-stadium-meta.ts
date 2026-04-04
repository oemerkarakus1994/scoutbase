/**
 * SFV/ÖFB: Stadion- und Spielort-Felder aus `vereine.meta` bzw. Import-JSON.
 * @see docs/SFV_STADIUM_VENUE_NAMING.md
 * @see docs/sfv-stadium-meta-keys.json
 */

export type VereinStadiumParsed = {
  stadion_label: string | null;
  capacity: number | null;
  founded_year: number | null;
};

function trimStr(v: unknown): string | null {
  if (typeof v !== "string") {
    return null;
  }
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * `spielort` ist oft ein langer String („Ort - Stadion, Stadt, Land“).
 * Nur nutzen, wenn keine kürzere Bezeichnung existiert.
 */
function shortenSpielort(raw: string): string {
  let s = raw.trim();
  const lower = s.toLowerCase();
  if (lower.endsWith(", österreich")) {
    s = s.slice(0, -", österreich".length).trim();
  }
  if (lower.endsWith(", oesterreich")) {
    s = s.slice(0, -", oesterreich".length).trim();
  }
  return s;
}

/**
 * Liest Stadion/Kapazität/Gründung aus Vereins-meta (ÖFB/SFV-kompatibel).
 * Priorität Stadion: kurze Spielfeld-Bezeichnung vor langem `spielort`.
 */
export function parseVereinStadiumMeta(meta: unknown): VereinStadiumParsed {
  if (!meta || typeof meta !== "object") {
    return { stadion_label: null, capacity: null, founded_year: null };
  }
  const m = meta as Record<string, unknown>;

  const candidates: (unknown)[] = [
    m.spielfeldBezeichnung,
    m.stadion_name,
    m.stadion,
    m.stadium_name,
    m.stadium,
    m.venue_name,
    m.sportanlage_name,
    m.sportplatz_name,
    m.heimstaette,
    m.heimstätte,
    m.spielortBezeichnung,
  ];

  let stadion_label: string | null = null;
  for (const c of candidates) {
    stadion_label = trimStr(c);
    if (stadion_label) {
      break;
    }
  }

  if (!stadion_label) {
    const sp = trimStr(m.spielort);
    if (sp) {
      stadion_label = shortenSpielort(sp);
    }
  }

  let capacity: number | null = null;
  const capRaw =
    m.capacity ?? m.kapazitaet ?? m.stadium_capacity ?? m.stadion_kapazitaet;
  if (typeof capRaw === "number" && Number.isFinite(capRaw)) {
    capacity = capRaw;
  }

  let founded_year: number | null = null;
  const fy = m.gegruendet ?? m.founded_year ?? m.gruendungsjahr;
  if (typeof fy === "number" && Number.isFinite(fy)) {
    founded_year = Math.round(fy);
  } else if (typeof fy === "string" && /^\d{4}$/.test(fy.trim())) {
    founded_year = Number.parseInt(fy.trim(), 10);
  }

  return { stadion_label, capacity, founded_year };
}

/** Erstes gesetztes Stadion aus Team-`meta`-Zeilen (ÖFB-Struktur wie beim Verein). */
export function firstStadionLabelFromTeamMetas(
  teamMetas: { meta: unknown }[],
): string | null {
  for (const t of teamMetas) {
    const p = parseVereinStadiumMeta(t.meta);
    if (p.stadion_label) {
      return p.stadion_label;
    }
  }
  return null;
}

/** Häufigster Heim-Spielort aus `core.spiele.venue_name` pro Verein (über `home_team_id`). */
export function mergeSpieleHomeVenuesByVerein(
  teamIdToVerein: Map<string, string>,
  rows: { home_team_id: string | null; venue_name: string | null }[],
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!r.home_team_id || !r.venue_name?.trim()) {
      continue;
    }
    const vid = teamIdToVerein.get(r.home_team_id);
    if (!vid) {
      continue;
    }
    const label = r.venue_name.trim();
    const byVenue = out.get(vid) ?? new Map<string, number>();
    byVenue.set(label, (byVenue.get(label) ?? 0) + 1);
    out.set(vid, byVenue);
  }
  return out;
}

export function mostFrequentVenueLabel(
  counts: Map<string, number> | undefined,
): string | null {
  if (!counts?.size) {
    return null;
  }
  let best = "";
  let n = 0;
  for (const [name, c] of counts) {
    if (c > n) {
      n = c;
      best = name;
    }
  }
  return best || null;
}

/**
 * Reihenfolge: Vereins-meta → Team-meta → Spiel-Häufung `venue_name`.
 */
export function resolveStadionDisplay(
  vereinMeta: unknown,
  teamMetas: { meta: unknown }[],
  venueCountsForVerein: Map<string, number> | undefined,
): VereinStadiumParsed {
  const base = parseVereinStadiumMeta(vereinMeta);
  let stadion_label = base.stadion_label;
  let capacity = base.capacity;
  let founded_year = base.founded_year;

  if (!stadion_label) {
    stadion_label = firstStadionLabelFromTeamMetas(teamMetas);
  }
  if (!stadion_label) {
    stadion_label = mostFrequentVenueLabel(venueCountsForVerein);
  }

  if (capacity == null) {
    for (const t of teamMetas) {
      const p = parseVereinStadiumMeta(t.meta);
      if (p.capacity != null) {
        capacity = p.capacity;
        break;
      }
    }
  }
  if (founded_year == null) {
    for (const t of teamMetas) {
      const p = parseVereinStadiumMeta(t.meta);
      if (p.founded_year != null) {
        founded_year = p.founded_year;
        break;
      }
    }
  }

  return { stadion_label, capacity, founded_year };
}
