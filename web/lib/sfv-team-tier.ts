/**
 * KM vs. RES für Anzeige-Priorität (gleiche Logik wie scripts/lib/sfv-filters.mjs,
 * ohne Jugend/Frauen-Filter — Mannschaftsname kommt bereits gefiltert aus dem Import).
 */

function normalizeKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const SUBTITLE_SEP = " · ";

export function parseVereinTeamSubtitle(vereinTeam: string): {
  verein: string;
  team: string;
} {
  const s = vereinTeam.trim();
  const i = s.indexOf(SUBTITLE_SEP);
  if (i === -1) {
    return { verein: s, team: "" };
  }
  return {
    verein: s.slice(0, i).trim(),
    team: s.slice(i + SUBTITLE_SEP.length).trim(),
  };
}

/** Höher = bei Dubletten bevorzugt (KM vor neutral vor RES). */
export function kmResDisplayPreference(teamSegment: string): number {
  const s = String(teamSegment ?? "").trim();
  if (!s) {
    return 1;
  }
  if (isKmTeamLabel(s)) {
    return 2;
  }
  if (isReserveTeamLabel(s)) {
    return 0;
  }
  return 1;
}

function isKmTeamLabel(s: string): boolean {
  const upper = s.toUpperCase().replace(/\s+/g, "");
  if (upper === "KM") {
    return true;
  }
  if (/\bkampfmannschaft\b/i.test(s)) {
    return true;
  }
  return false;
}

function isReserveTeamLabel(s: string): boolean {
  const upper = s.toUpperCase().replace(/\s+/g, "");
  if (upper === "RES" || upper.startsWith("RES-") || upper.startsWith("RES.")) {
    return true;
  }
  if (/reserve/i.test(s)) {
    return true;
  }
  if (/^ii$|^iii$|^iv$/i.test(s.trim())) {
    return true;
  }
  if (/^1b$|^2b$/i.test(s.trim())) {
    return true;
  }
  return false;
}

export function playerDirectoryDedupKey(parts: {
  geburtsdatum: string | null;
  displayName: string;
  vereinTeam: string;
}): string {
  const { verein } = parseVereinTeamSubtitle(parts.vereinTeam);
  const birth = parts.geburtsdatum ?? "";
  return [
    birth,
    normalizeKey(parts.displayName),
    normalizeKey(verein),
  ].join("\t");
}
