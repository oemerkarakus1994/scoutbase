/**
 * ScoutBase SFV: nur Herren-Feldspieler (Kampfmannschaft + Reserve), keine Jugend/Frauen.
 */

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Nur diese Wettbewerbs-Gruppen (ÖFB-Gruppennamen SFV, Saison 2025/26 …) */
const ALLOWED_SFV_GROUP_PATTERNS = [
  /^salzburger liga$/,
  /^1\. landesliga$/,
  /^2\. landesligen$/,
  /^1\. klassen$/,
  /^2\. klassen$/,
  /^reserven$/,
];

export function isAllowedSfvHerrenGroupName(groupName) {
  const n = normalizeText(groupName);
  return ALLOWED_SFV_GROUP_PATTERNS.some((re) => re.test(n));
}

export function isYouthOrWomenTeamSegment(teamSegment) {
  const v = normalizeText(teamSegment);
  if (!v) {
    return true;
  }
  if (/^u-?\d{1,2}$/.test(v)) {
    return true;
  }
  if (/\bu\d{1,2}\b/.test(v)) {
    return true;
  }
  if (/frauen|damen|madchen|girl|junior|jugend|nachwuchs|schueler|kids/.test(v)) {
    return true;
  }
  return false;
}

/**
 * KM = Kampfmannschaft, RES = Reserve (und gängige Schreibweisen).
 */
export function isKmOrResTeamSegment(teamSegment) {
  if (isYouthOrWomenTeamSegment(teamSegment)) {
    return false;
  }
  const s = String(teamSegment ?? "").trim();
  const upper = s.toUpperCase().replace(/\s+/g, "");
  if (upper === "KM") {
    return true;
  }
  if (upper === "RES" || upper.startsWith("RES-") || upper.startsWith("RES.")) {
    return true;
  }
  if (/reserve/i.test(s)) {
    return true;
  }
  if (/^ii$|^iii$|^iv$/i.test(s)) {
    return true;
  }
  if (/^1b$|^2b$/i.test(s)) {
    return true;
  }
  return false;
}
