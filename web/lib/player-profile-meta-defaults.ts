/** Entspricht dem Rückgabewert von parsePersonProfileMeta in sfv-player-profile. */
export type PersonProfileMetaParsed = {
  height_cm: number | null;
  strong_foot: "left" | "right" | "both" | null;
  birth_year: number | null;
  profile_verified: boolean;
  primary_positions: string[];
  secondary_positions: string[];
  /** Manuelle „Heimat“-Mannschaft (UUID), nur wenn gültige aktuelle Membership existiert. */
  primary_team_id: string | null;
};

/** Bekannte Import-IDs aus älteren Manifesten (Meta-Migration). */
const OMER_KARAKUS_PERSON_IDS = new Set<string>([
  "oefb:person:legacy-9252940",
  "oefb:person:legacy-9447645",
]);

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .trim()
    .normalize("NFC")
    .toLocaleLowerCase("de-AT");
}

function isOemerKarakusProfile(
  personId: string,
  displayName: string,
  vorname: string | null,
  nachname: string | null,
): boolean {
  if (OMER_KARAKUS_PERSON_IDS.has(personId)) {
    return true;
  }
  const vn = norm(vorname);
  if (
    norm(nachname) === "karakus" &&
    (vn === "ömer" || vn === "oemer")
  ) {
    return true;
  }
  const dn = norm(displayName);
  if (dn === "ömer karakus" || dn === "oemer karakus") {
    return true;
  }
  return false;
}

/**
 * Ergänzt fehlende Profil-Meta-Felder mit den von ScoutBase vorgegebenen
 * Showcase-Daten (wirkt auch ohne ausgeführte DB-Migration / andere person_id).
 */
export function mergeScoutbaseProfileMeta(
  personId: string,
  displayName: string,
  vorname: string | null,
  nachname: string | null,
  parsed: PersonProfileMetaParsed,
): PersonProfileMetaParsed {
  if (!isOemerKarakusProfile(personId, displayName, vorname, nachname)) {
    return parsed;
  }

  return {
    height_cm: parsed.height_cm ?? 172,
    strong_foot: parsed.strong_foot ?? "left",
    birth_year: parsed.birth_year ?? 1994,
    profile_verified: true,
    primary_positions:
      parsed.primary_positions.length > 0 ? parsed.primary_positions : ["ZDM"],
    secondary_positions:
      parsed.secondary_positions.length > 0
        ? parsed.secondary_positions
        : ["LV"],
    primary_team_id: parsed.primary_team_id,
  };
}
