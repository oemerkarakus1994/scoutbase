import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveOefbClubSlug } from "./oefb-club-slug";
import {
  resolveSpielberichtUrl,
  spielberichtUrlFromMeta,
} from "./spiel-report-url";
import { mergeScoutbaseProfileMeta } from "./player-profile-meta-defaults";
import { bundeslandFromVerbandName } from "./oefb-bundesland";
import { scoutbaseRating99 } from "./player-rating";
import {
  mergeSpieleHomeVenuesByVerein,
  resolveStadionDisplay,
} from "./sfv-stadium-meta";
import { SFV_VERBAND_ROW_ID } from "./sfv";
import { fetchTeamTableRankContext } from "./team-table-rank";

const CLUB_EDITION_BATCH = 120;

type EditionRow = { id: string; title: string; is_current: boolean };

function collectCompetitionEditionIdsFromTeams(
  teams: { meta: unknown }[],
): string[] {
  const ids = new Set<string>();
  for (const t of teams) {
    const m = t.meta;
    if (!m || typeof m !== "object") {
      continue;
    }
    const raw = (m as Record<string, unknown>).competition_edition_ids;
    if (!Array.isArray(raw)) {
      continue;
    }
    for (const x of raw) {
      if (typeof x === "string" && x.trim()) {
        ids.add(x.trim());
      }
    }
  }
  return [...ids];
}

function ligaLabelFromTeamMeta(
  meta: unknown,
  editionById: Map<string, EditionRow>,
): string | null {
  if (!meta || typeof meta !== "object") {
    return null;
  }
  const m = meta as Record<string, unknown>;
  const idsRaw = m.competition_edition_ids;
  if (Array.isArray(idsRaw) && idsRaw.length > 0) {
    const editions: EditionRow[] = [];
    for (const x of idsRaw) {
      if (typeof x !== "string" || !x.trim()) {
        continue;
      }
      const row = editionById.get(x.trim());
      if (row) {
        editions.push(row);
      }
    }
    const current = editions.find((e) => e.is_current);
    const pick = current ?? editions[0];
    if (pick?.title?.trim()) {
      return pick.title.trim();
    }
  }
  const g = m.gruppe_name ?? m.gruppe ?? m.liga;
  if (typeof g === "string" && g.trim()) {
    return g.trim();
  }
  return null;
}

function bestLigaLabelForVerein(
  teamRows: { meta: unknown }[],
  editionById: Map<string, EditionRow>,
): string | null {
  const labels = new Set<string>();
  for (const t of teamRows) {
    const lab = ligaLabelFromTeamMeta(t.meta, editionById);
    if (lab) {
      labels.add(lab);
    }
  }
  if (labels.size === 0) {
    return null;
  }
  return [...labels].sort((a, b) => a.localeCompare(b, "de"))[0] ?? null;
}

export type SfvClubRow = {
  verein_id: string;
  name: string;
  short_name: string | null;
  slug: string | null;
  logo_public_uid: string | null;
  team_count: number;
  player_count: number;
  staff_count: number;
  region_label: string | null;
  liga_label: string | null;
  stadion_label: string | null;
  capacity: number | null;
  founded_year: number | null;
};

export function isPlayerRole(role: string | null): boolean {
  const r = (role ?? "").trim().toLowerCase();
  return r === "player" || r === "spieler";
}

export function isStaffRole(role: string | null): boolean {
  const r = (role ?? "").trim().toLowerCase();
  return (
    r === "trainer" ||
    r === "staff" ||
    r === "betreuer" ||
    r.includes("trainer")
  );
}

/** PostgREST liefert standardmäßig max. 1000 Zeilen — ohne Pagination fehlen Kaderzeilen (Trainer erst „hinten“). */
const MEMBERSHIP_PAGE_SIZE = 1000;

/**
 * Alle aktiven Mitgliedschaften für die gegebenen `team_id`s (paginiert).
 * Sortierung nach `id` für stabile `.range()`-Seiten.
 */
export async function fetchAllActiveMembershipsForTeams(
  supabase: SupabaseClient,
  teamIds: string[],
  select: string,
): Promise<Record<string, unknown>[]> {
  if (teamIds.length === 0) {
    return [];
  }
  const out: Record<string, unknown>[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .schema("core")
      .from("team_memberships")
      .select(select)
      .in("team_id", teamIds)
      .is("left_on", null)
      .order("id")
      .range(from, from + MEMBERSHIP_PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    out.push(...rows);
    if (rows.length < MEMBERSHIP_PAGE_SIZE) {
      break;
    }
    from += MEMBERSHIP_PAGE_SIZE;
  }
  return out;
}

/**
 * Lädt Vereine mit Zählern über Schema `core`.
 * Nutzt alle Vereine, die mindestens ein Team haben — im Import ist `verband_id`
 * oft NULL, daher kein Filter nur auf `verband_id`.
 */
export async function fetchSfvClubs(
  supabase: SupabaseClient,
): Promise<{ data: SfvClubRow[]; error: Error | null }> {
  const { data: teamRows, error: eTeams } = await supabase
    .schema("core")
    .from("teams")
    .select("verein_id");

  if (eTeams) {
    return { data: [], error: new Error(eTeams.message) };
  }

  const vereinIdSet = new Set(
    (teamRows ?? []).map((t) => t.verein_id).filter(Boolean) as string[],
  );
  const vereinIds = [...vereinIdSet];

  if (vereinIds.length === 0) {
    return { data: [], error: null };
  }

  const { data: vereine, error: e1 } = await supabase
    .schema("core")
    .from("vereine")
    .select("id,name,short_name,slug,verband_id,logo_public_uid,meta")
    .in("id", vereinIds)
    .order("name");

  if (e1) {
    return { data: [], error: new Error(e1.message) };
  }
  if (!vereine?.length) {
    return { data: [], error: null };
  }

  const { data: teams, error: e2 } = await supabase
    .schema("core")
    .from("teams")
    .select("id,verein_id,meta")
    .in("verein_id", vereinIds);

  if (e2) {
    return { data: [], error: new Error(e2.message) };
  }

  const teamsList = teams ?? [];

  const teamByVerein = new Map<string, string[]>();
  const teamRowsByVerein = new Map<string, { meta: unknown }[]>();
  for (const t of teamsList) {
    const list = teamByVerein.get(t.verein_id) ?? [];
    list.push(t.id);
    teamByVerein.set(t.verein_id, list);
    const rlist = teamRowsByVerein.get(t.verein_id) ?? [];
    rlist.push({ meta: t.meta });
    teamRowsByVerein.set(t.verein_id, rlist);
  }

  const verbandIds = [
    ...new Set(
      vereine.map((v) => v.verband_id).filter(Boolean),
    ),
  ] as string[];
  const verbandName = new Map<string, string>();
  for (let i = 0; i < verbandIds.length; i += 80) {
    const chunk = verbandIds.slice(i, i + 80);
    const { data: brows } = await supabase
      .schema("core")
      .from("verbaende")
      .select("id,name")
      .in("id", chunk);
    for (const b of brows ?? []) {
      verbandName.set(b.id, b.name);
    }
  }

  const editionIds = collectCompetitionEditionIdsFromTeams(teamsList);
  const editionById = new Map<string, EditionRow>();
  for (let i = 0; i < editionIds.length; i += CLUB_EDITION_BATCH) {
    const chunk = editionIds.slice(i, i + CLUB_EDITION_BATCH);
    const { data: erows } = await supabase
      .schema("core")
      .from("bewerb_editionen")
      .select("id,title,is_current")
      .in("id", chunk);
    for (const e of erows ?? []) {
      editionById.set(e.id, {
        id: e.id,
        title: e.title,
        is_current: Boolean(e.is_current),
      });
    }
  }

  const allTeamIds = teamsList.map((t) => t.id);
  let memberships: { team_id: string; role_type: string | null }[] = [];

  if (allTeamIds.length > 0) {
    const chunkSize = 500;
    for (let i = 0; i < allTeamIds.length; i += chunkSize) {
      const chunk = allTeamIds.slice(i, i + chunkSize);
      const { data: mems, error: e3 } = await supabase
        .schema("core")
        .from("team_memberships")
        .select("team_id,role_type")
        .in("team_id", chunk)
        .is("left_on", null);

      if (e3) {
        return { data: [], error: new Error(e3.message) };
      }
      memberships = memberships.concat(mems ?? []);
    }
  }

  const teamIdToVerein = new Map<string, string>();
  for (const t of teamsList) {
    teamIdToVerein.set(t.id, t.verein_id);
  }

  let venueCountsByVerein = new Map<string, Map<string, number>>();
  if (allTeamIds.length > 0) {
    const spieleChunk = 200;
    const spieleRows: { home_team_id: string | null; venue_name: string | null }[] =
      [];
    for (let i = 0; i < allTeamIds.length; i += spieleChunk) {
      const chunk = allTeamIds.slice(i, i + spieleChunk);
      const { data: srows, error: eSp } = await supabase
        .schema("core")
        .from("spiele")
        .select("home_team_id, venue_name")
        .in("home_team_id", chunk);
      if (eSp) {
        break;
      }
      for (const r of srows ?? []) {
        if (r.venue_name?.trim()) {
          spieleRows.push(r);
        }
      }
    }
    venueCountsByVerein = mergeSpieleHomeVenuesByVerein(
      teamIdToVerein,
      spieleRows,
    );
  }

  const playersByVerein = new Map<string, number>();
  const staffByVerein = new Map<string, number>();

  for (const m of memberships) {
    const vid = teamIdToVerein.get(m.team_id);
    if (!vid) {
      continue;
    }
    if (isPlayerRole(m.role_type)) {
      playersByVerein.set(vid, (playersByVerein.get(vid) ?? 0) + 1);
    } else if (isStaffRole(m.role_type)) {
      staffByVerein.set(vid, (staffByVerein.get(vid) ?? 0) + 1);
    }
  }

  const data: SfvClubRow[] = vereine.map((v) => {
    const vbName = v.verband_id
      ? (verbandName.get(v.verband_id) ?? null)
      : null;
    const region_label = bundeslandFromVerbandName(vbName);
    const liga_label = bestLigaLabelForVerein(
      teamRowsByVerein.get(v.id) ?? [],
      editionById,
    );
    const teamMetas = teamRowsByVerein.get(v.id) ?? [];
    const extra = resolveStadionDisplay(
      v.meta,
      teamMetas,
      venueCountsByVerein.get(v.id),
    );
    return {
      verein_id: v.id,
      name: v.name,
      short_name: v.short_name,
      slug: v.slug,
      logo_public_uid: v.logo_public_uid ?? null,
      team_count: teamByVerein.get(v.id)?.length ?? 0,
      player_count: playersByVerein.get(v.id) ?? 0,
      staff_count: staffByVerein.get(v.id) ?? 0,
      region_label,
      liga_label,
      stadion_label: extra.stadion_label,
      capacity: extra.capacity,
      founded_year: extra.founded_year,
    };
  });

  return { data, error: null };
}

export type VereinTeamRow = {
  team_id: string;
  team_name: string;
  team_type: string | null;
  reserve_team: boolean;
  kader_count: number;
  staff_count: number;
  saison_name: string | null;
};

export type VereinDetailClub = {
  name: string;
  short_name: string | null;
  /** Rohwert `core.vereine.slug` (Import; oft nur kleingeschrieben). */
  slug: string | null;
  /**
   * ÖFB-Pfadsegment mit korrekter Groß-/Kleinschreibung (z. B. `UskElsbethen`).
   * Aus `source_url`/`homepage_url`/`meta`/`team.source_url`, sonst `slug`.
   */
  oefb_slug: string | null;
  /** ÖFB-CDN-ID, gleiche URL-Logik wie in der Vereinsliste */
  logo_public_uid: string | null;
  verband_name: string | null;
  region_label: string | null;
  team_count: number;
  player_count: number;
  staff_count: number;
  founded_year: number | null;
  stadion_label: string | null;
  capacity: number | null;
};

export async function fetchVereinDetail(
  supabase: SupabaseClient,
  vereinId: string,
): Promise<{
  club: VereinDetailClub | null;
  teams: VereinTeamRow[];
  error: Error | null;
}> {
  const { data: v, error: e1 } = await supabase
    .schema("core")
    .from("vereine")
    .select(
      "id,name,short_name,slug,source_url,homepage_url,verband_id,meta,logo_public_uid",
    )
    .eq("id", vereinId)
    .maybeSingle();

  if (e1) {
    return { club: null, teams: [], error: new Error(e1.message) };
  }
  if (!v) {
    return { club: null, teams: [], error: null };
  }

  const { data: vb } = v.verband_id
    ? await supabase
        .schema("core")
        .from("verbaende")
        .select("name")
        .eq("id", v.verband_id)
        .maybeSingle()
    : { data: null };

  const { data: teamRows, error: e2 } = await supabase
    .schema("core")
    .from("teams")
    .select("id,name,team_type,meta,saison_id,source_url")
    .eq("verein_id", vereinId)
    .order("name");

  if (e2) {
    return { club: null, teams: [], error: new Error(e2.message) };
  }

  const teamsList = teamRows ?? [];
  const teamIds = teamsList.map((t) => t.id);

  const saisonIds = [
    ...new Set(teamsList.map((t) => t.saison_id).filter(Boolean)),
  ] as string[];
  const saisonMap = new Map<string, string>();
  if (saisonIds.length > 0) {
    const { data: saisons } = await supabase
      .schema("core")
      .from("saisonen")
      .select("id,name")
      .in("id", saisonIds);
    for (const s of saisons ?? []) {
      saisonMap.set(s.id, s.name);
    }
  }

  let memberships: { team_id: string; role_type: string | null }[] = [];
  if (teamIds.length > 0) {
    const { data: mems, error: e3 } = await supabase
      .schema("core")
      .from("team_memberships")
      .select("team_id,role_type")
      .in("team_id", teamIds)
      .is("left_on", null);
    if (e3) {
      return { club: null, teams: [], error: new Error(e3.message) };
    }
    memberships = mems ?? [];
  }

  const kaderByTeam = new Map<string, number>();
  const staffByTeam = new Map<string, number>();
  for (const m of memberships) {
    if (isPlayerRole(m.role_type)) {
      kaderByTeam.set(m.team_id, (kaderByTeam.get(m.team_id) ?? 0) + 1);
    } else if (isStaffRole(m.role_type)) {
      staffByTeam.set(m.team_id, (staffByTeam.get(m.team_id) ?? 0) + 1);
    }
  }

  let playerTotal = 0;
  let staffTotal = 0;
  for (const n of kaderByTeam.values()) {
    playerTotal += n;
  }
  for (const n of staffByTeam.values()) {
    staffTotal += n;
  }

  const teams: VereinTeamRow[] = teamsList.map((t) => {
    const meta = t.meta as { reserve_team?: boolean } | null;
    return {
      team_id: t.id,
      team_name: t.name,
      team_type: t.team_type,
      reserve_team: Boolean(meta?.reserve_team),
      kader_count: kaderByTeam.get(t.id) ?? 0,
      staff_count: staffByTeam.get(t.id) ?? 0,
      saison_name: t.saison_id ? (saisonMap.get(t.saison_id) ?? null) : null,
    };
  });

  let venueCountsForVerein: Map<string, number> | undefined;
  if (teamIds.length > 0) {
    const spieleChunk = 200;
    const spieleRows: { home_team_id: string | null; venue_name: string | null }[] =
      [];
    for (let i = 0; i < teamIds.length; i += spieleChunk) {
      const chunk = teamIds.slice(i, i + spieleChunk);
      const { data: srows, error: eSp } = await supabase
        .schema("core")
        .from("spiele")
        .select("home_team_id, venue_name")
        .in("home_team_id", chunk);
      if (eSp) {
        break;
      }
      for (const r of srows ?? []) {
        if (r.venue_name?.trim()) {
          spieleRows.push(r);
        }
      }
    }
    const teamToVerein = new Map<string, string>();
    for (const tid of teamIds) {
      teamToVerein.set(tid, vereinId);
    }
    const byV = mergeSpieleHomeVenuesByVerein(teamToVerein, spieleRows);
    venueCountsForVerein = byV.get(vereinId);
  }

  const teamMetasForStadion = teamsList.map((t) => ({ meta: t.meta }));
  const extra = resolveStadionDisplay(
    v.meta,
    teamMetasForStadion,
    venueCountsForVerein,
  );

  return {
    club: {
      name: v.name,
      short_name: v.short_name,
      slug: v.slug?.trim() ? v.slug.trim() : null,
      oefb_slug: resolveOefbClubSlug({
        slug: v.slug,
        meta: v.meta,
        source_url: v.source_url ?? null,
        homepage_url: v.homepage_url ?? null,
        team_source_urls: teamsList.map((t) => t.source_url),
      }),
      logo_public_uid: v.logo_public_uid ?? null,
      verband_name: vb?.name ?? null,
      region_label: bundeslandFromVerbandName(vb?.name ?? null),
      team_count: teams.length,
      player_count: playerTotal,
      staff_count: staffTotal,
      founded_year: extra.founded_year,
      stadion_label: extra.stadion_label,
      capacity: extra.capacity,
    },
    teams,
    error: null,
  };
}

function kaderNum(v: unknown): number {
  if (v == null) {
    return 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

type KaderMembershipStats = {
  goals: number;
  appearances: number;
  avg_minutes: number | null;
  minutes_total: number;
};

function kaderParseMembershipStats(stats: unknown): KaderMembershipStats {
  const s =
    stats && typeof stats === "object" ? (stats as Record<string, unknown>) : {};
  const avgRaw = s.minutes_per_game ?? s.avg_minutes_per_game ?? s.ø_minuten;
  let avg_minutes: number | null = null;
  if (typeof avgRaw === "number" && Number.isFinite(avgRaw)) {
    avg_minutes = avgRaw;
  }
  let minutes_total = kaderNum(
    s.minutes ?? s.einsatzminuten ?? s.einsatz_minuten ?? s.minutes_played,
  );
  const appearances = kaderNum(s.appearances);
  if (minutes_total <= 0 && appearances > 0 && avg_minutes != null) {
    minutes_total = Math.round(appearances * avg_minutes);
  }
  return {
    goals: kaderNum(s.goals),
    appearances,
    avg_minutes,
    minutes_total,
  };
}

function kaderMinutesTotalForRating(st: KaderMembershipStats): number {
  let m = st.minutes_total;
  if (st.appearances > 0 && m <= 0 && st.avg_minutes != null) {
    m = Math.round(st.appearances * st.avg_minutes);
  }
  if (m <= 0 && st.appearances > 0) {
    m = st.appearances * 90;
  }
  return m;
}

function editionIdsFromTeamMeta(meta: unknown): string[] {
  if (!meta || typeof meta !== "object") {
    return [];
  }
  const raw = (meta as Record<string, unknown>).competition_edition_ids;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((x): x is string => typeof x === "string" && x.trim() !== "")
    .map((x) => x.trim());
}

export function teamIsReserve(meta: unknown, teamName: string): boolean {
  if (meta && typeof meta === "object") {
    const m = meta as Record<string, unknown>;
    if (m.reserve_team === true) {
      return true;
    }
  }
  return /\bres(erve)?\b/i.test(teamName) || /\bzweite\b/i.test(teamName);
}

/**
 * Listen wie „Meiste Tore“: zwei Zeilen pro Verein wirken wie Duplikate, wenn
 * KM und Reserve denselben `teams.name` haben — Reserve explizit kennzeichnen.
 */
export function teamDisplayLabelForDashboard(
  name: string,
  meta: unknown,
): string {
  const n = name?.trim() || "Team";
  if (!teamIsReserve(meta, n)) {
    return n;
  }
  if (/\bres(erve)?\b/i.test(n) || /\bzweite\b/i.test(n)) {
    return n;
  }
  return `${n} · Reserve`;
}

function ageFromGeburtsdatum(iso: string | null): number | null {
  if (!iso) {
    return null;
  }
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) {
    return null;
  }
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const mo = today.getMonth() - d.getMonth();
  if (mo < 0 || (mo === 0 && today.getDate() < d.getDate())) {
    age -= 1;
  }
  return age >= 0 && age < 120 ? age : null;
}

function parsePersonMetaForKader(meta: unknown): {
  height_cm: number | null;
  strong_foot: "left" | "right" | "both" | null;
  birth_year: number | null;
  primary_positions: string[];
  primary_team_id: string | null;
} {
  if (!meta || typeof meta !== "object") {
    return {
      height_cm: null,
      strong_foot: null,
      birth_year: null,
      primary_positions: [],
      primary_team_id: null,
    };
  }
  const m = meta as Record<string, unknown>;
  const hRaw = m.height_cm ?? m.height;
  let height_cm: number | null = null;
  if (typeof hRaw === "number" && Number.isFinite(hRaw)) {
    height_cm = hRaw;
  } else if (typeof hRaw === "string" && /^\d{2,3}$/.test(hRaw.trim())) {
    height_cm = Number.parseInt(hRaw.trim(), 10);
  }

  const fRaw = m.strong_foot ?? m.preferred_foot;
  let strong_foot: "left" | "right" | "both" | null = null;
  if (typeof fRaw === "string") {
    const v = fRaw.trim().toLowerCase();
    if (v === "left" || v === "links" || v === "l") {
      strong_foot = "left";
    } else if (v === "right" || v === "rechts" || v === "r") {
      strong_foot = "right";
    } else if (v === "both" || v === "beide") {
      strong_foot = "both";
    }
  }

  let birth_year: number | null = null;
  const byRaw = m.birth_year ?? m.geburtsjahr;
  if (typeof byRaw === "number" && Number.isFinite(byRaw)) {
    birth_year = Math.round(byRaw);
  } else if (typeof byRaw === "string" && /^\d{4}$/.test(byRaw.trim())) {
    birth_year = Number.parseInt(byRaw.trim(), 10);
  }

  const primary_positions: string[] = [];
  const pr = m.primary_positions ?? m.primary_position;
  if (Array.isArray(pr)) {
    for (const x of pr) {
      if (typeof x === "string" && x.trim()) {
        primary_positions.push(x.trim());
      }
    }
  } else if (typeof pr === "string" && pr.trim()) {
    primary_positions.push(
      ...pr
        .split(/[,;/]/)
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }

  const ptRaw = m.scoutbase_primary_team_id ?? m.primary_team_id;
  const primary_team_id =
    typeof ptRaw === "string" && ptRaw.trim() ? ptRaw.trim() : null;

  return {
    height_cm,
    strong_foot,
    birth_year,
    primary_positions,
    primary_team_id,
  };
}

function footLabelDe(foot: "left" | "right" | "both" | null): string | null {
  if (foot === "left") {
    return "Links";
  }
  if (foot === "right") {
    return "Rechts";
  }
  if (foot === "both") {
    return "Beide";
  }
  return null;
}

export type VereinKaderPlayerRow = {
  person_id: string;
  team_id: string;
  team_name: string;
  segment: "km" | "res";
  shirt_number: string | null;
  display_name: string;
  position_label: string | null;
  age: number | null;
  height_cm: number | null;
  foot_label: string | null;
  rating: number;
  spiele: number;
  tore: number;
  foto_public_uid: string | null;
};

export async function fetchVereinKaderRows(
  supabase: SupabaseClient,
  vereinId: string,
): Promise<{ rows: VereinKaderPlayerRow[]; error: Error | null }> {
  const { data: teamRows, error: eTeams } = await supabase
    .schema("core")
    .from("teams")
    .select("id,name,meta")
    .eq("verein_id", vereinId)
    .order("name");

  if (eTeams) {
    return { rows: [], error: new Error(eTeams.message) };
  }

  const teamsList = teamRows ?? [];
  const teamIds = teamsList.map((t) => t.id);
  if (teamIds.length === 0) {
    return { rows: [], error: null };
  }

  const editionIds = collectCompetitionEditionIdsFromTeams(teamsList);
  const editionById = new Map<string, EditionRow>();
  for (let i = 0; i < editionIds.length; i += CLUB_EDITION_BATCH) {
    const chunk = editionIds.slice(i, i + CLUB_EDITION_BATCH);
    const { data: erows } = await supabase
      .schema("core")
      .from("bewerb_editionen")
      .select("id,title,is_current")
      .in("id", chunk);
    for (const e of erows ?? []) {
      editionById.set(e.id, {
        id: e.id,
        title: e.title,
        is_current: Boolean(e.is_current),
      });
    }
  }

  const rankByTeam = new Map<
    string,
    { rank: number | null; teamsInLeague: number | null }
  >();
  const ligaByTeam = new Map<string, string | null>();
  for (const t of teamsList) {
    const edIds = editionIdsFromTeamMeta(t.meta);
    const ctx = await fetchTeamTableRankContext(supabase, t.id, edIds);
    rankByTeam.set(t.id, {
      rank: ctx.rank,
      teamsInLeague: ctx.teamsInLeague,
    });
    ligaByTeam.set(t.id, ligaLabelFromTeamMeta(t.meta, editionById));
  }

  const mems = await fetchAllActiveMembershipsForTeams(
    supabase,
    teamIds,
    "team_id,shirt_number,position_label,role_type,stats,person_id",
  );

  const personIds = [
    ...new Set(
      mems
        .map((m) => m.person_id as string | null | undefined)
        .filter((x): x is string => typeof x === "string" && x.trim() !== ""),
    ),
  ];

  const personById = new Map<
    string,
    {
      id: string;
      display_name: string | null;
      vorname: string | null;
      nachname: string | null;
      geburtsdatum: string | null;
      foto_public_uid: string | null;
      meta: unknown;
    }
  >();

  const personChunk = 80;
  for (let i = 0; i < personIds.length; i += personChunk) {
    const chunk = personIds.slice(i, i + personChunk);
    const { data: persons, error: ep } = await supabase
      .schema("core")
      .from("personen")
      .select("id,display_name,vorname,nachname,geburtsdatum,foto_public_uid,meta")
      .in("id", chunk);
    if (ep) {
      return { rows: [], error: new Error(ep.message) };
    }
    for (const p of persons ?? []) {
      personById.set(p.id, p);
    }
  }

  const teamById = new Map(teamsList.map((t) => [t.id, t] as const));

  const rows: VereinKaderPlayerRow[] = [];

  for (const m of mems) {
    const role = (m.role_type as string | null | undefined) ?? null;
    if (!isPlayerRole(role)) {
      continue;
    }
    const teamId = m.team_id as string;
    const team = teamById.get(teamId);
    if (!team) {
      continue;
    }
    const personId = m.person_id as string | null | undefined;
    if (!personId) {
      continue;
    }
    const p = personById.get(personId);
    if (!p) {
      continue;
    }

    const segment = teamIsReserve(team.meta, team.name) ? "res" : "km";
    const st = kaderParseMembershipStats(m.stats);
    const displayName =
      p.display_name?.trim() ||
      [p.vorname, p.nachname].filter(Boolean).join(" ") ||
      "—";

    const parsedMeta = parsePersonMetaForKader(p.meta);
    const merged = mergeScoutbaseProfileMeta(
      p.id,
      displayName,
      p.vorname,
      p.nachname,
      {
        height_cm: parsedMeta.height_cm,
        strong_foot: parsedMeta.strong_foot,
        birth_year: parsedMeta.birth_year,
        profile_verified: false,
        primary_positions: parsedMeta.primary_positions,
        secondary_positions: [],
        primary_team_id: parsedMeta.primary_team_id,
      },
    );

    const age =
      ageFromGeburtsdatum(p.geburtsdatum) ??
      (merged.birth_year != null
        ? new Date().getFullYear() - merged.birth_year
        : null);

    const mt = kaderMinutesTotalForRating(st);
    const rk = rankByTeam.get(teamId);
    const rating = scoutbaseRating99({
      ligaLabel: ligaByTeam.get(teamId) ?? null,
      minutesTotal: mt,
      goals: st.goals,
      age,
      tablePosition: rk?.rank ?? null,
      teamsInLeague: rk?.teamsInLeague ?? null,
    });

    rows.push({
      person_id: p.id,
      team_id: teamId,
      team_name: team.name,
      segment,
      shirt_number: (m.shirt_number as string | null) ?? null,
      display_name: displayName,
      position_label: (m.position_label as string | null) ?? null,
      age,
      height_cm: merged.height_cm,
      foot_label: footLabelDe(merged.strong_foot),
      rating,
      spiele: st.appearances,
      tore: st.goals,
      foto_public_uid: p.foto_public_uid ?? null,
    });
  }

  rows.sort((a, b) => {
    const sa = Number.parseInt(a.shirt_number ?? "", 10);
    const sb = Number.parseInt(b.shirt_number ?? "", 10);
    const na = Number.isFinite(sa) ? sa : 999;
    const nb = Number.isFinite(sb) ? sb : 999;
    if (na !== nb) {
      return na - nb;
    }
    return a.display_name.localeCompare(b.display_name, "de");
  });

  return { rows, error: null };
}

export type VereinTabellenTeamRow = {
  team_id: string;
  team_name: string;
  segment: "km" | "res";
  liga_label: string | null;
  edition_id: string | null;
  edition_source_url: string | null;
  rank: number | null;
  played: number | null;
  points: number | null;
  goals_for: number | null;
  goals_against: number | null;
};

export type VereinSpielRow = {
  id: string;
  kickoff_at: string | null;
  home_team_name: string;
  away_team_name: string;
  result_full: string | null;
  home_goals: number | null;
  away_goals: number | null;
  our_side: "home" | "away";
  our_team_name: string;
};

export async function fetchVereinTabellenTeaser(
  supabase: SupabaseClient,
  vereinId: string,
): Promise<{ rows: VereinTabellenTeamRow[]; error: Error | null }> {
  const { data: teamRows, error: eTeams } = await supabase
    .schema("core")
    .from("teams")
    .select("id,name,meta")
    .eq("verein_id", vereinId)
    .order("name");

  if (eTeams) {
    return { rows: [], error: new Error(eTeams.message) };
  }

  const teamsList = teamRows ?? [];
  const teamIds = teamsList.map((t) => t.id);
  if (teamIds.length === 0) {
    return { rows: [], error: null };
  }

  const editionIds = collectCompetitionEditionIdsFromTeams(teamsList);
  const editionById = new Map<string, EditionRow>();
  const editionSourceUrlById = new Map<string, string>();

  for (let i = 0; i < editionIds.length; i += CLUB_EDITION_BATCH) {
    const chunk = editionIds.slice(i, i + CLUB_EDITION_BATCH);
    const { data: erows } = await supabase
      .schema("core")
      .from("bewerb_editionen")
      .select("id,title,is_current,source_url")
      .in("id", chunk);
    for (const e of erows ?? []) {
      editionById.set(e.id, {
        id: e.id,
        title: e.title,
        is_current: Boolean(e.is_current),
      });
      editionSourceUrlById.set(e.id, e.source_url);
    }
  }

  const firstSnapByEdition = new Map<string, string>();
  if (editionIds.length > 0) {
    const { data: snaps } = await supabase
      .schema("core")
      .from("tabellen_snapshots")
      .select("id,bewerb_edition_id,captured_at")
      .in("bewerb_edition_id", editionIds)
      .order("captured_at", { ascending: false });

    for (const s of snaps ?? []) {
      if (!firstSnapByEdition.has(s.bewerb_edition_id)) {
        firstSnapByEdition.set(s.bewerb_edition_id, s.id);
      }
    }
  }

  const snapshotIds = [...new Set(firstSnapByEdition.values())];
  const snapshotToEdition = new Map<string, string>();
  for (const [eid, sid] of firstSnapByEdition) {
    snapshotToEdition.set(sid, eid);
  }

  type SnapRow = {
    snapshot_id: string;
    team_id: string | null;
    rank: number;
    played: number | null;
    points: number | null;
    goals_for: number | null;
    goals_against: number | null;
  };

  const mapSnapTeam = new Map<string, Map<string, SnapRow>>();
  if (snapshotIds.length > 0 && teamIds.length > 0) {
    const { data: trows, error: eTr } = await supabase
      .schema("core")
      .from("tabellen_snapshot_rows")
      .select(
        "snapshot_id,team_id,rank,played,points,goals_for,goals_against",
      )
      .in("snapshot_id", snapshotIds)
      .in("team_id", teamIds);

    if (eTr) {
      return { rows: [], error: new Error(eTr.message) };
    }

    for (const r of trows ?? []) {
      if (!r.team_id) {
        continue;
      }
      let inner = mapSnapTeam.get(r.snapshot_id);
      if (!inner) {
        inner = new Map();
        mapSnapTeam.set(r.snapshot_id, inner);
      }
      inner.set(r.team_id, r as SnapRow);
    }
  }

  const out: VereinTabellenTeamRow[] = [];

  for (const t of teamsList) {
    const ordered = editionIdsFromTeamMeta(t.meta);
    let picked: SnapRow | null = null;
    let editionUsed: string | null = null;

    const tryEdition = (eid: string) => {
      const sid = firstSnapByEdition.get(eid);
      if (!sid) {
        return;
      }
      const row = mapSnapTeam.get(sid)?.get(t.id);
      if (row) {
        picked = row;
        editionUsed = eid;
      }
    };

    if (ordered.length > 0) {
      const currentFirst = [...ordered].sort((a, b) => {
        const ac = editionById.get(a)?.is_current ? 1 : 0;
        const bc = editionById.get(b)?.is_current ? 1 : 0;
        return bc - ac;
      });
      for (const eid of currentFirst) {
        tryEdition(eid);
        if (picked) {
          break;
        }
      }
    }

    if (!picked) {
      for (const sid of snapshotIds) {
        const row = mapSnapTeam.get(sid)?.get(t.id);
        if (row) {
          picked = row;
          editionUsed = snapshotToEdition.get(sid) ?? null;
          break;
        }
      }
    }

    out.push({
      team_id: t.id,
      team_name: t.name,
      segment: teamIsReserve(t.meta, t.name) ? "res" : "km",
      liga_label: ligaLabelFromTeamMeta(t.meta, editionById),
      edition_id: editionUsed,
      edition_source_url: editionUsed
        ? (editionSourceUrlById.get(editionUsed) ?? null)
        : null,
      rank: picked?.rank ?? null,
      played: picked?.played ?? null,
      points: picked?.points ?? null,
      goals_for: picked?.goals_for ?? null,
      goals_against: picked?.goals_against ?? null,
    });
  }

  return { rows: out, error: null };
}

export async function fetchVereinLetzteSpiele(
  supabase: SupabaseClient,
  vereinId: string,
  limit = 24,
): Promise<{ rows: VereinSpielRow[]; error: Error | null }> {
  const { data: teamRows, error: eTeams } = await supabase
    .schema("core")
    .from("teams")
    .select("id,name")
    .eq("verein_id", vereinId);

  if (eTeams) {
    return { rows: [], error: new Error(eTeams.message) };
  }

  const teamsList = teamRows ?? [];
  const teamIds = teamsList.map((t) => t.id);
  const nameById = new Map(teamsList.map((t) => [t.id, t.name] as const));
  if (teamIds.length === 0) {
    return { rows: [], error: null };
  }

  type SpielRow = {
    id: string;
    home_team_id: string | null;
    away_team_id: string | null;
    home_team_name: string;
    away_team_name: string;
    result_full: string | null;
    home_goals: number | null;
    away_goals: number | null;
    kickoff_at: string | null;
  };

  const byId = new Map<string, SpielRow>();
  const chunk = 120;
  for (let i = 0; i < teamIds.length; i += chunk) {
    const part = teamIds.slice(i, i + chunk);
    const { data: home, error: eh } = await supabase
      .schema("core")
      .from("spiele")
      .select(
        "id,home_team_id,away_team_id,home_team_name,away_team_name,result_full,home_goals,away_goals,kickoff_at",
      )
      .in("home_team_id", part)
      .eq("finished", true)
      .order("kickoff_at", { ascending: false })
      .limit(80);

    if (eh) {
      return { rows: [], error: new Error(eh.message) };
    }
    for (const r of home ?? []) {
      byId.set(r.id, r as SpielRow);
    }

    const { data: away, error: ea } = await supabase
      .schema("core")
      .from("spiele")
      .select(
        "id,home_team_id,away_team_id,home_team_name,away_team_name,result_full,home_goals,away_goals,kickoff_at",
      )
      .in("away_team_id", part)
      .eq("finished", true)
      .order("kickoff_at", { ascending: false })
      .limit(80);

    if (ea) {
      return { rows: [], error: new Error(ea.message) };
    }
    for (const r of away ?? []) {
      byId.set(r.id, r as SpielRow);
    }
  }

  const sorted = [...byId.values()].sort((a, b) => {
    const ta = a.kickoff_at ? new Date(a.kickoff_at).getTime() : 0;
    const tb = b.kickoff_at ? new Date(b.kickoff_at).getTime() : 0;
    return tb - ta;
  });

  const rows: VereinSpielRow[] = [];
  for (const r of sorted.slice(0, limit)) {
    const hid = r.home_team_id;
    const aid = r.away_team_id;
    const homeHit = hid && teamIds.includes(hid);
    const awayHit = aid && teamIds.includes(aid);
    if (homeHit) {
      rows.push({
        id: r.id,
        kickoff_at: r.kickoff_at,
        home_team_name: r.home_team_name,
        away_team_name: r.away_team_name,
        result_full: r.result_full,
        home_goals: r.home_goals,
        away_goals: r.away_goals,
        our_side: "home",
        our_team_name: nameById.get(hid!) ?? r.home_team_name,
      });
    } else if (awayHit) {
      rows.push({
        id: r.id,
        kickoff_at: r.kickoff_at,
        home_team_name: r.home_team_name,
        away_team_name: r.away_team_name,
        result_full: r.result_full,
        home_goals: r.home_goals,
        away_goals: r.away_goals,
        our_side: "away",
        our_team_name: aid ? (nameById.get(aid) ?? r.away_team_name) : r.away_team_name,
      });
    }
  }

  return { rows, error: null };
}

export type VereinLigaTabelleRow = {
  rank: number;
  team_id: string | null;
  /** ScoutBase `core.vereine.id`, wenn `team_id` einer Mannschaft zugeordnet ist */
  verein_id: string | null;
  team_name: string;
  played: number | null;
  wins: number | null;
  draws: number | null;
  losses: number | null;
  goals_for: number | null;
  goals_against: number | null;
  goal_difference: number | null;
  points: number | null;
  /** Immer 5 Einträge: letzte Spiele chronologisch; `null` = in den Importdaten kein Spiel gefunden. */
  form: ("S" | "U" | "N" | null)[];
};

export type VereinLigaTabelleData = {
  ligaTitle: string;
  saisonName: string | null;
  editionId: string | null;
  editionSourceUrl: string | null;
  focusTeamId: string;
  focusTeamName: string;
  rows: VereinLigaTabelleRow[];
};

export type VereinErgebnisRow = {
  id: string;
  kickoff_at: string | null;
  dateLabel: string;
  home_team_name: string;
  away_team_name: string;
  focus_team_name: string;
  opponent_name: string;
  is_home: boolean;
  our_goals: number;
  their_goals: number;
  result: "S" | "U" | "N";
  /** z. B. Liga, Pokal, Freundschaftsspiel (ÖFB `art` / Import-`meta`) */
  competition_kind_label: string | null;
  /** z. B. Wettbewerbsname (Landescup, …) */
  competition_detail: string | null;
  /** ÖFB/SFV Spielbericht (extern), wenn bekannt */
  report_url: string | null;
};

function isLigaErgebnisRow(r: VereinErgebnisRow): boolean {
  if (r.competition_kind_label === "Liga") {
    return true;
  }
  if (r.competition_kind_label) {
    return false;
  }
  const d = r.competition_detail?.trim() ?? "";
  if (!d) {
    return false;
  }
  return /(liga|klasse|regionalliga|oberliga|landesliga|stadtliga)/i.test(d);
}

/**
 * Letzte fünf **Liga**-Einträge aus `ergebnisse` → Formkurve S/U/N.
 * Sortiert nach `kickoff_at` absteigend (neueste zuerst), nimmt 5, Anzeige chronologisch (ältestes zuerst).
 */
export function formLettersFromLigaErgebnisse(
  rows: VereinErgebnisRow[],
): ("S" | "U" | "N")[] {
  const liga = rows.filter(isLigaErgebnisRow);
  const sorted = [...liga].sort(
    (a, b) => kickoffMs(b.kickoff_at) - kickoffMs(a.kickoff_at),
  );
  const last5 = sorted.slice(0, 5);
  last5.reverse();
  return last5.map((m) => m.result);
}

/** Wie `formLettersFromLigaErgebnisse`, aber immer Länge 5 (`null` = weniger als 5 Liga-Spiele). */
export function formLettersPaddedFromLigaErgebnisse(
  rows: VereinErgebnisRow[],
): ("S" | "U" | "N" | null)[] {
  const letters = formLettersFromLigaErgebnisse(rows);
  const out: ("S" | "U" | "N" | null)[] = [...letters];
  while (out.length < 5) {
    out.push(null);
  }
  return out.slice(0, 5);
}

function competitionKindFromSpielMeta(meta: unknown): {
  kind_label: string | null;
  detail: string | null;
} {
  if (!meta || typeof meta !== "object") {
    return { kind_label: null, detail: null };
  }
  const m = meta as Record<string, unknown>;
  const bew = typeof m.bewerb === "string" ? m.bewerb.trim() : null;
  const spielart = typeof m.spielart === "string" ? m.spielart.trim() : null;
  const detail = bew || null;

  if (bew && /freundschaft/i.test(bew)) {
    return { kind_label: "Freundschaftsspiel", detail };
  }
  if (spielart && /test/i.test(spielart)) {
    return { kind_label: "Freundschaftsspiel", detail };
  }
  if (bew && /(cup|pokal|landescup|öfb|stiegl)/i.test(bew)) {
    return { kind_label: "Pokal", detail };
  }
  if (
    bew &&
    /(liga|klasse|regionalliga|oberliga|landesliga|stadtliga)/i.test(bew)
  ) {
    return { kind_label: "Liga", detail };
  }
  return { kind_label: null, detail };
}

function isSpielAbgeschlossen(r: {
  finished?: boolean | null;
  status?: string | null;
}): boolean {
  if (r.finished === true) {
    return true;
  }
  const s = (r.status ?? "").trim().toLowerCase();
  return (
    s === "beendet" ||
    s === "abgeschlossen" ||
    s === "bestaetigt" ||
    s === "bestätigt" ||
    s === "strafverifiziert"
  );
}

function kickoffMs(iso: string | null): number {
  if (!iso) {
    return 0;
  }
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function normVereinTeamName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

/**
 * `core.teams.name` und ÖFB-Spielplan (`heimMannschaft`/`gastMannschaft`) weichen oft leicht ab;
 * Tabellen-Snapshot (`mannschaft`) passt meist zu `spiele.*_team_name`.
 */
export function spielNameMatchesOurTeam(
  spielNorm: string,
  nameNormSet: Set<string>,
): boolean {
  if (!spielNorm) {
    return false;
  }
  if (nameNormSet.has(spielNorm)) {
    return true;
  }
  for (const ref of nameNormSet) {
    if (!ref || ref.length < 4) {
      continue;
    }
    if (ref === spielNorm) {
      return true;
    }
    const longer = ref.length >= spielNorm.length ? ref : spielNorm;
    const shorter = ref.length >= spielNorm.length ? spielNorm : ref;
    if (shorter.length < 6) {
      continue;
    }
    if (longer.includes(shorter)) {
      return true;
    }
  }
  return false;
}

/**
 * ÖFB-Import setzt oft `home_team_id`/`away_team_id` auf null — dann per Teamnamen matchen.
 */
function resolveOurSpielSide(
  r: {
    home_team_id: string | null;
    away_team_id: string | null;
    home_team_name: string;
    away_team_name: string;
  },
  teamIds: string[],
  nameNormSet: Set<string>,
): { home: boolean } | null {
  if (r.home_team_id && teamIds.includes(r.home_team_id)) {
    return { home: true };
  }
  if (r.away_team_id && teamIds.includes(r.away_team_id)) {
    return { home: false };
  }
  const nh = normVereinTeamName(r.home_team_name);
  const na = normVereinTeamName(r.away_team_name);
  const homeMatch = spielNameMatchesOurTeam(nh, nameNormSet);
  const awayMatch = spielNameMatchesOurTeam(na, nameNormSet);
  if (homeMatch && !awayMatch) {
    return { home: true };
  }
  if (!homeMatch && awayMatch) {
    return { home: false };
  }
  if (homeMatch && awayMatch) {
    return { home: true };
  }
  return null;
}

type LigaSpielForForm = {
  id?: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team_name: string;
  away_team_name: string;
  home_goals: number | null;
  away_goals: number | null;
  kickoff_at: string | null;
};

const SPIELE_FORM_COLS =
  "id,home_team_id,away_team_id,home_team_name,away_team_name,home_goals,away_goals,kickoff_at" as const;

type SpielRowForForm = LigaSpielForForm & {
  status?: string | null;
  finished?: boolean | null;
  cancelled?: boolean | null; // optional in SELECT — Filter nur im Speicher
};

const FORM_FETCH_LIMIT = 120;

function filterLetzte5AbgeschlosseneSpiele(
  rows: SpielRowForForm[],
): LigaSpielForForm[] {
  const filtered = rows.filter(
    (r) =>
      r.cancelled !== true &&
      isSpielAbgeschlossen(r) &&
      r.home_goals != null &&
      r.away_goals != null,
  );
  filtered.sort(
    (x, y) => kickoffMs(y.kickoff_at) - kickoffMs(x.kickoff_at),
  );
  return filtered.slice(0, 5).map((r) => ({
    id: r.id,
    home_team_id: r.home_team_id,
    away_team_id: r.away_team_id,
    home_team_name: r.home_team_name,
    away_team_name: r.away_team_name,
    home_goals: r.home_goals,
    away_goals: r.away_goals,
    kickoff_at: r.kickoff_at,
  }));
}

/**
 * Letzte 5 **abgeschlossene** Spiele pro Mannschaft aus `core.spiele` (nur über
 * `heim_team_id`/`gast_team_id` bzw. Namens-Fallback), kein `spiel_typ`/`bewerb_edition_id`.
 * Neueste zuerst nach `kickoff_at`, in `formLettersFromTeamMatches` umgekehrt → **ältestes links**.
 */
async function fetchSpieleForGeneralTableForm(
  supabase: SupabaseClient,
  teamIds: string[],
  /** Alle Tabellen-Mannschaftsnamen — auch mit `team_id`, damit Spiele mit fehlenden IDs im Import gefunden werden. */
  allSnapshotTeamNames: string[],
): Promise<{
  /** Letzte bis zu 5 Spiele pro `core.teams.id` (Anzeige: ältestes zuerst in formLettersFromTeamMatches). */
  byTeamId: Map<string, LigaSpielForForm[]>;
  /** Fallback: gleiches pro normalisiertem Snapshot-`team_name`. */
  byNormName: Map<string, LigaSpielForForm[]>;
}> {
  try {
  const byTeamId = new Map<string, LigaSpielForForm[]>();
  const byNormName = new Map<string, LigaSpielForForm[]>();

  /** Kein `cancelled` in der Query: ältere DBs / fehlende Migration würden die Spiele-Abfrage brechen. */
  const SPIELE_FORM_SELECT =
    "id,home_team_id,away_team_id,home_team_name,away_team_name,home_goals,away_goals,kickoff_at,status,finished" as const;

  const selectSpieleForForm = () =>
    supabase
      .schema("core")
      .from("spiele")
      .select(SPIELE_FORM_SELECT)
      .not("home_goals", "is", null)
      .not("away_goals", "is", null);

  const fetchLast5ForTeamId = async (tid: string) => {
    const { data } = await selectSpieleForForm()
      .or(`home_team_id.eq.${tid},away_team_id.eq.${tid}`)
      .order("kickoff_at", { ascending: false })
      .limit(FORM_FETCH_LIMIT);
    byTeamId.set(tid, filterLetzte5AbgeschlosseneSpiele((data ?? []) as SpielRowForForm[]));
  };

  await Promise.all(teamIds.map((tid) => fetchLast5ForTeamId(tid)));

  for (const name of allSnapshotTeamNames) {
    const n = name.trim();
    if (!n) {
      continue;
    }
    const nk = normVereinTeamName(n);
    const [{ data: h }, { data: a }] = await Promise.all([
      selectSpieleForForm()
        .eq("home_team_name", n)
        .order("kickoff_at", { ascending: false })
        .limit(FORM_FETCH_LIMIT),
      selectSpieleForForm()
        .eq("away_team_name", n)
        .order("kickoff_at", { ascending: false })
        .limit(FORM_FETCH_LIMIT),
    ]);
    const mergedRaw = [...(h ?? []), ...(a ?? [])] as SpielRowForForm[];
    const dedup = new Map<string, SpielRowForForm>();
    for (const row of mergedRaw) {
      const id = row.id as string | undefined;
      if (id) {
        dedup.set(id, row);
      }
    }
    const slice = filterLetzte5AbgeschlosseneSpiele([...dedup.values()]);
    if (!byNormName.has(nk)) {
      byNormName.set(nk, slice);
    }
  }

  return { byTeamId, byNormName };
  } catch {
    return {
      byTeamId: new Map<string, LigaSpielForForm[]>(),
      byNormName: new Map<string, LigaSpielForForm[]>(),
    };
  }
}

/**
 * Vereins-ID für eine Tabellenzeile: `team_id` → `teams`, sonst exakter/ normalisierter
 * Abgleich mit `core.teams.name` und `core.vereine.name` (Snapshot-Namen weichen oft ab).
 */
function resolveVereinIdForLigaTableRow(
  teamId: string | null,
  teamName: string,
  vereinByTeamId: Map<string, string>,
  teamExactNameToVerein: Map<string, string>,
  normTeamNameToVerein: Map<string, string>,
  vereinExactNameToId: Map<string, string>,
  normVereinNameToId: Map<string, string>,
): string | null {
  if (teamId) {
    const v = vereinByTeamId.get(teamId);
    if (v) {
      return v;
    }
  }
  const t = teamName.trim();
  if (!t) {
    return null;
  }
  const byExactTeam = teamExactNameToVerein.get(t);
  if (byExactTeam) {
    return byExactTeam;
  }
  const nt = normVereinTeamName(t);
  const byNormTeam = normTeamNameToVerein.get(nt);
  if (byNormTeam) {
    return byNormTeam;
  }
  const byExactVerein = vereinExactNameToId.get(t);
  if (byExactVerein) {
    return byExactVerein;
  }
  return normVereinNameToId.get(nt) ?? null;
}

async function loadVereinIdLookupsForLigaTable(
  supabase: SupabaseClient,
  snapshotTeamNames: string[],
): Promise<{
  teamExactNameToVerein: Map<string, string>;
  normTeamNameToVerein: Map<string, string>;
  vereinExactNameToId: Map<string, string>;
  normVereinNameToId: Map<string, string>;
}> {
  const teamExactNameToVerein = new Map<string, string>();
  const normTeamNameToVerein = new Map<string, string>();
  const vereinExactNameToId = new Map<string, string>();
  const normVereinNameToId = new Map<string, string>();

  const nameChunk = 80;
  for (let i = 0; i < snapshotTeamNames.length; i += nameChunk) {
    const part = snapshotTeamNames.slice(i, i + nameChunk);
    if (part.length === 0) {
      continue;
    }
    const { data: trows } = await supabase
      .schema("core")
      .from("teams")
      .select("verein_id,name")
      .in("name", part)
      .not("verein_id", "is", null);
    for (const row of trows ?? []) {
      const r = row as { verein_id: string; name: string | null };
      const n = r.name?.trim();
      if (n) {
        teamExactNameToVerein.set(n, r.verein_id);
      }
    }
    const { data: vrows } = await supabase
      .schema("core")
      .from("vereine")
      .select("id,name")
      .in("name", part);
    for (const row of vrows ?? []) {
      const r = row as { id: string; name: string | null };
      const n = r.name?.trim();
      if (n) {
        vereinExactNameToId.set(n, r.id);
      }
    }
  }

  const { data: allTeams } = await supabase
    .schema("core")
    .from("teams")
    .select("verein_id,name")
    .not("verein_id", "is", null)
    .limit(15000);
  for (const row of allTeams ?? []) {
    const r = row as { verein_id: string; name: string | null };
    const nn = normVereinTeamName(r.name ?? "");
    if (nn && !normTeamNameToVerein.has(nn)) {
      normTeamNameToVerein.set(nn, r.verein_id);
    }
  }

  const { data: allVereine } = await supabase
    .schema("core")
    .from("vereine")
    .select("id,name")
    .limit(15000);
  for (const row of allVereine ?? []) {
    const r = row as { id: string; name: string | null };
    const nn = normVereinTeamName(r.name ?? "");
    if (nn && !normVereinNameToId.has(nn)) {
      normVereinNameToId.set(nn, r.id);
    }
  }

  return {
    teamExactNameToVerein,
    normTeamNameToVerein,
    vereinExactNameToId,
    normVereinNameToId,
  };
}

/**
 * Tabellenzeile ↔ Spiel: ID-Treffer, sonst Namensabgleich auf der Spielseite.
 * Wenn die DB ein falsches `*_team_id` hat, rettet der Vergleich mit `sideTeamName`
 * bzw. `teams.name` zu dieser ID (ÖFB-Import).
 */
function snapshotTeamMatchesSpielSide(
  rowTeamId: string | null,
  rowTeamName: string,
  sideTeamId: string | null,
  sideTeamName: string,
  teamIdToNormName: Map<string, string>,
): boolean {
  const rowNorm = normVereinTeamName(rowTeamName);
  const nameSet = new Set([rowNorm]);

  if (rowTeamId && sideTeamId && sideTeamId === rowTeamId) {
    return true;
  }
  if (spielNameMatchesOurTeam(normVereinTeamName(sideTeamName), nameSet)) {
    return true;
  }
  if (sideTeamId) {
    const official = teamIdToNormName.get(sideTeamId);
    if (official && spielNameMatchesOurTeam(official, nameSet)) {
      return true;
    }
  }
  return false;
}

function rowSideInLigaSpiel(
  m: LigaSpielForForm,
  rowTeamId: string | null,
  rowTeamName: string,
  teamIdToNormName: Map<string, string>,
): "home" | "away" | null {
  const home = snapshotTeamMatchesSpielSide(
    rowTeamId,
    rowTeamName,
    m.home_team_id,
    m.home_team_name,
    teamIdToNormName,
  );
  const away = snapshotTeamMatchesSpielSide(
    rowTeamId,
    rowTeamName,
    m.away_team_id,
    m.away_team_name,
    teamIdToNormName,
  );
  if (home && !away) {
    return "home";
  }
  if (away && !home) {
    return "away";
  }
  return null;
}

/**
 * Formkurve aus den **dieser Mannschaft** zugeordneten Spielen (max. 5),
 * neueste zuerst in `matches`, Anzeige chronologisch (ältestes zuerst).
 */
function formLettersFromTeamMatches(
  matches: LigaSpielForForm[],
  rowTeamId: string | null,
  rowTeamName: string,
  teamIdToNormName: Map<string, string>,
): ("S" | "U" | "N" | null)[] {
  const sorted = [...matches].sort(
    (a, b) => kickoffMs(b.kickoff_at) - kickoffMs(a.kickoff_at),
  );
  const last5 = sorted.slice(0, 5);
  last5.reverse();
  const letters: ("S" | "U" | "N" | null)[] = last5.map((m) => {
    const side = rowSideInLigaSpiel(
      m,
      rowTeamId,
      rowTeamName,
      teamIdToNormName,
    );
    if (!side) {
      return null;
    }
    const hg = m.home_goals ?? 0;
    const ag = m.away_goals ?? 0;
    const home = side === "home";
    const our = home ? hg : ag;
    const their = home ? ag : hg;
    if (our > their) {
      return "S";
    }
    if (our < their) {
      return "N";
    }
    return "U";
  });
  const out: ("S" | "U" | "N" | null)[] = [...letters];
  while (out.length < 5) {
    out.push(null);
  }
  return out.slice(0, 5);
}

/**
 * Volle Ligatabelle (Tabellen-Snapshot) für die gewählte Mannschaft (KM/RES) eines Vereins
 * inkl. Formkurve aus importierten Spielen derselben Bewerb-Edition.
 */
export async function fetchVereinLigaTabelle(
  supabase: SupabaseClient,
  vereinId: string,
  segment: "km" | "res",
): Promise<{ data: VereinLigaTabelleData | null; error: Error | null }> {
  const { data: teamRows, error: eTeams } = await supabase
    .schema("core")
    .from("teams")
    .select("id,name,meta")
    .eq("verein_id", vereinId)
    .order("name");

  if (eTeams) {
    return { data: null, error: new Error(eTeams.message) };
  }

  const teamsList = teamRows ?? [];
  if (teamsList.length === 0) {
    return { data: null, error: null };
  }

  const kmTeams = teamsList.filter((t) => !teamIsReserve(t.meta, t.name));
  const resTeams = teamsList.filter((t) => teamIsReserve(t.meta, t.name));

  const picked =
    segment === "res"
      ? (resTeams[0] ?? null)
      : (kmTeams[0] ?? null);

  if (!picked) {
    return { data: null, error: null };
  }

  const teamIdsAll = teamsList.map((t) => t.id);
  const editionFromMeta = collectCompetitionEditionIdsFromTeams(teamsList);
  const editionFromSpiele = new Set<string>();
  if (teamIdsAll.length > 0) {
    const spChunk = 80;
    for (let i = 0; i < teamIdsAll.length; i += spChunk) {
      const chunk = teamIdsAll.slice(i, i + spChunk);
      const { data: homeE } = await supabase
        .schema("core")
        .from("spiele")
        .select("bewerb_edition_id")
        .in("home_team_id", chunk)
        .not("bewerb_edition_id", "is", null)
        .limit(120);
      const { data: awayE } = await supabase
        .schema("core")
        .from("spiele")
        .select("bewerb_edition_id")
        .in("away_team_id", chunk)
        .not("bewerb_edition_id", "is", null)
        .limit(120);
      for (const r of [...(homeE ?? []), ...(awayE ?? [])]) {
        if (r.bewerb_edition_id) {
          editionFromSpiele.add(r.bewerb_edition_id);
        }
      }
    }
  }
  const editionIds = [
    ...new Set([...editionFromMeta, ...editionFromSpiele]),
  ];

  const editionById = new Map<string, EditionRow>();
  const editionSourceUrlById = new Map<string, string>();

  for (let i = 0; i < editionIds.length; i += CLUB_EDITION_BATCH) {
    const chunk = editionIds.slice(i, i + CLUB_EDITION_BATCH);
    const { data: erows } = await supabase
      .schema("core")
      .from("bewerb_editionen")
      .select("id,title,is_current,source_url")
      .in("id", chunk);
    for (const e of erows ?? []) {
      editionById.set(e.id, {
        id: e.id,
        title: e.title,
        is_current: Boolean(e.is_current),
      });
      editionSourceUrlById.set(e.id, e.source_url);
    }
  }

  const firstSnapByEdition = new Map<string, string>();
  if (editionIds.length > 0) {
    const { data: snaps } = await supabase
      .schema("core")
      .from("tabellen_snapshots")
      .select("id,bewerb_edition_id,captured_at")
      .in("bewerb_edition_id", editionIds)
      .order("captured_at", { ascending: false });

    for (const s of snaps ?? []) {
      if (!firstSnapByEdition.has(s.bewerb_edition_id)) {
        firstSnapByEdition.set(s.bewerb_edition_id, s.id);
      }
    }
  }

  type SnapRow = {
    snapshot_id: string;
    team_id: string | null;
    rank: number;
    played: number | null;
    points: number | null;
    goals_for: number | null;
    goals_against: number | null;
  };

  const snapshotIds = [...new Set(firstSnapByEdition.values())];
  const snapshotToEdition = new Map<string, string>();
  for (const [eid, sid] of firstSnapByEdition) {
    snapshotToEdition.set(sid, eid);
  }

  const mapSnapTeam = new Map<string, Map<string, SnapRow>>();
  /** Fallback, wenn `team_id` im Import fehlt oder nicht mit `core.teams` übereinstimmt */
  const mapSnapByNormName = new Map<string, SnapRow>();

  if (snapshotIds.length > 0) {
    const { data: trows, error: eTr } = await supabase
      .schema("core")
      .from("tabellen_snapshot_rows")
      .select(
        "snapshot_id,team_id,team_name,rank,played,points,goals_for,goals_against",
      )
      .in("snapshot_id", snapshotIds);

    if (eTr) {
      return { data: null, error: new Error(eTr.message) };
    }

    for (const r of trows ?? []) {
      const row = r as SnapRow;
      if (r.team_id) {
        let inner = mapSnapTeam.get(r.snapshot_id);
        if (!inner) {
          inner = new Map();
          mapSnapTeam.set(r.snapshot_id, inner);
        }
        inner.set(r.team_id, row);
      }
      const tn = (r as { team_name?: string }).team_name?.trim();
      if (tn) {
        mapSnapByNormName.set(
          `${r.snapshot_id}|${normVereinTeamName(tn)}`,
          row,
        );
      }
    }
  }

  const findPickedSnapshotRow = (sid: string): SnapRow | undefined => {
    const byId = mapSnapTeam.get(sid)?.get(picked.id);
    if (byId) {
      return byId;
    }
    return mapSnapByNormName.get(
      `${sid}|${normVereinTeamName(picked.name)}`,
    );
  };

  const ordered = editionIdsFromTeamMeta(picked.meta);
  let snapshotId: string | null = null;
  let editionUsed: string | null = null;

  const tryEdition = (eid: string) => {
    const sid = firstSnapByEdition.get(eid);
    if (!sid) {
      return;
    }
    const row = findPickedSnapshotRow(sid);
    if (row) {
      snapshotId = sid;
      editionUsed = eid;
    }
  };

  if (ordered.length > 0) {
    const currentFirst = [...ordered].sort((a, b) => {
      const ac = editionById.get(a)?.is_current ? 1 : 0;
      const bc = editionById.get(b)?.is_current ? 1 : 0;
      return bc - ac;
    });
    for (const eid of currentFirst) {
      tryEdition(eid);
      if (snapshotId) {
        break;
      }
    }
  }

  if (!snapshotId) {
    for (const sid of snapshotIds) {
      const row = findPickedSnapshotRow(sid);
      if (row) {
        snapshotId = sid;
        editionUsed = snapshotToEdition.get(sid) ?? null;
        break;
      }
    }
  }

  if (!snapshotId || !editionUsed) {
    return {
      data: {
        ligaTitle: ligaLabelFromTeamMeta(picked.meta, editionById) ?? "Liga",
        saisonName: null,
        editionId: null,
        editionSourceUrl: null,
        focusTeamId: picked.id,
        focusTeamName: picked.name,
        rows: [],
      },
      error: null,
    };
  }

  const { data: fullRows, error: eFull } = await supabase
    .schema("core")
    .from("tabellen_snapshot_rows")
    .select(
      "rank,team_id,team_name,played,wins,draws,losses,goals_for,goals_against,goal_difference,points",
    )
    .eq("snapshot_id", snapshotId)
    .order("rank", { ascending: true });

  if (eFull) {
    return { data: null, error: new Error(eFull.message) };
  }

  const teamIdsForTable = [
    ...new Set(
      (fullRows ?? [])
        .map((r) => r.team_id as string | null)
        .filter((x): x is string => Boolean(x)),
    ),
  ];
  const vereinByTeamId = new Map<string, string>();
  const teamIdToNormName = new Map<string, string>();
  if (teamIdsForTable.length > 0) {
    const { data: teamVereinRows } = await supabase
      .schema("core")
      .from("teams")
      .select("id,verein_id,name")
      .in("id", teamIdsForTable);
    for (const t of teamVereinRows ?? []) {
      const row = t as { id: string; verein_id?: string | null; name?: string | null };
      if (row.verein_id) {
        vereinByTeamId.set(row.id, row.verein_id);
      }
      teamIdToNormName.set(row.id, normVereinTeamName(row.name ?? ""));
    }
  }

  const snapshotTeamNamesForForm = [
    ...new Set(
      (fullRows ?? [])
        .map((r) =>
          String((r as { team_name?: string }).team_name ?? "").trim(),
        )
        .filter(Boolean),
    ),
  ];

  const { byTeamId: spieleByTeamId, byNormName: spieleByNormName } =
    await fetchSpieleForGeneralTableForm(
      supabase,
      teamIdsForTable,
      snapshotTeamNamesForForm,
    );

  const snapshotTeamNamesForLinks = snapshotTeamNamesForForm;
  const vereinLookups = await loadVereinIdLookupsForLigaTable(
    supabase,
    snapshotTeamNamesForLinks,
  );

  let saisonName: string | null = null;
  const { data: edRow } = await supabase
    .schema("core")
    .from("bewerb_editionen")
    .select("id,title,saison_id")
    .eq("id", editionUsed)
    .maybeSingle();

  if (edRow?.saison_id) {
    const { data: sa } = await supabase
      .schema("core")
      .from("saisonen")
      .select("name")
      .eq("id", edRow.saison_id)
      .maybeSingle();
    saisonName = sa?.name?.trim() ?? null;
  }

  const tableRows: VereinLigaTabelleRow[] = (fullRows ?? []).map((r) => {
    const tid = r.team_id as string | null;
    const tname = String((r as { team_name?: string }).team_name ?? "").trim();
    const tnorm = tname ? normVereinTeamName(tname) : "";
    let teamMatches: LigaSpielForForm[] = [];
    if (tid) {
      const fromId = spieleByTeamId.get(tid);
      if (fromId && fromId.length > 0) {
        teamMatches = fromId;
      }
    }
    if (teamMatches.length === 0 && tnorm) {
      teamMatches = spieleByNormName.get(tnorm) ?? [];
    }
    const form: ("S" | "U" | "N" | null)[] = tname
      ? formLettersFromTeamMatches(
          teamMatches,
          tid,
          tname,
          teamIdToNormName,
        )
      : [null, null, null, null, null];
    return {
      rank: r.rank,
      team_id: tid,
      verein_id: resolveVereinIdForLigaTableRow(
        tid,
        tname,
        vereinByTeamId,
        vereinLookups.teamExactNameToVerein,
        vereinLookups.normTeamNameToVerein,
        vereinLookups.vereinExactNameToId,
        vereinLookups.normVereinNameToId,
      ),
      team_name: r.team_name,
      played: r.played,
      wins: r.wins,
      draws: r.draws,
      losses: r.losses,
      goals_for: r.goals_for,
      goals_against: r.goals_against,
      goal_difference: r.goal_difference,
      points: r.points,
      form,
    };
  });

  return {
    data: {
      ligaTitle:
        edRow?.title?.trim() ??
        ligaLabelFromTeamMeta(picked.meta, editionById) ??
        "Liga",
      saisonName,
      editionId: editionUsed,
      editionSourceUrl: editionSourceUrlById.get(editionUsed) ?? null,
      focusTeamId: picked.id,
      focusTeamName: picked.name,
      rows: tableRows,
    },
    error: null,
  };
}

function formatDeDate(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) {
    return "—";
  }
  return d.toLocaleDateString("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function goalsFromSpielImport(r: {
  home_goals: number | null;
  away_goals: number | null;
  result_full: string | null;
  meta?: unknown;
}): { hg: number; ag: number } | null {
  if (r.home_goals != null && r.away_goals != null) {
    return { hg: r.home_goals, ag: r.away_goals };
  }
  if (r.meta && typeof r.meta === "object") {
    const m = r.meta as Record<string, unknown>;
    const pickNum = (v: unknown): number | null => {
      if (typeof v === "number" && Number.isFinite(v)) {
        return Math.trunc(v);
      }
      if (typeof v === "string" && /^\d+$/.test(v.trim())) {
        return Number.parseInt(v.trim(), 10);
      }
      return null;
    };
    const h =
      pickNum(m.home_goals) ??
      pickNum(m.homeGoals) ??
      pickNum(m.tore_heim) ??
      pickNum(m.score_home);
    const a =
      pickNum(m.away_goals) ??
      pickNum(m.awayGoals) ??
      pickNum(m.tore_aus) ??
      pickNum(m.score_away);
    if (h != null && a != null) {
      return { hg: h, ag: a };
    }
  }
  const raw = r.result_full?.trim();
  if (!raw) {
    return null;
  }
  const head = raw.split(/\s*[(\[]/)[0]?.trim() ?? raw;
  const m = /(\d+)\s*[-–:]\s*(\d+)/.exec(head);
  if (!m) {
    return null;
  }
  const hg = Number.parseInt(m[1]!, 10);
  const ag = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(hg) || !Number.isFinite(ag)) {
    return null;
  }
  return { hg, ag };
}

export type FetchVereinErgebnisseOptions = {
  /** Gleiche Bewerb-Edition wie die Ligatabelle — alle Saisonspiele (z. B. alle 16). */
  bewerbEditionId?: string | null;
  /** Max. Anzahl Ergebnisse (Default: alle bis 200). */
  limit?: number;
  /**
   * Name aus Tabellen-Snapshot (`mannschaft`) — oft identisch mit `spiele.home_team_name`/`away_team_name`,
   * während `core.teams.name` abweichen kann.
   */
  focusTeamNameSnapshot?: string | null;
};

export type VereinErgebnisseScope = {
  teamIds: string[];
  /** Normalisierte Namen (`core.teams`) — nötig wenn Import `home_team_id`/`away_team_id` leer lässt. */
  nameNorms: Set<string>;
  /** Exakte Namen für Fallback-Abfragen per `home_team_name`/`away_team_name`. */
  teamNamesExact: string[];
};

/**
 * Abgeschlossene Spiele für eine oder mehrere Mannschaften (Import SFV/ÖFB).
 * Lädt bei gesetzter Bewerb-Edition alle Spiele der Edition und filtert im Speicher,
 * damit auch Zeilen mit `home_team_id`/`away_team_id` = null (typisch ÖFB) erscheinen.
 */
export async function fetchVereinErgebnisseForTeams(
  supabase: SupabaseClient,
  scope: VereinErgebnisseScope,
  options?: FetchVereinErgebnisseOptions,
): Promise<{ rows: VereinErgebnisRow[]; error: Error | null }> {
  const maxRows = options?.limit ?? 200;
  const editionId = options?.bewerbEditionId ?? null;

  const teamIds = [...new Set(scope.teamIds.filter(Boolean))];
  const nameNorms = new Set(scope.nameNorms);
  const snap = options?.focusTeamNameSnapshot?.trim();
  if (snap) {
    nameNorms.add(normVereinTeamName(snap));
  }
  const teamNamesExact = [...new Set([...scope.teamNamesExact, ...(snap ? [snap] : [])])];

  type SpielRow = {
    id: string;
    home_team_id: string | null;
    away_team_id: string | null;
    home_team_name: string;
    away_team_name: string;
    home_goals: number | null;
    away_goals: number | null;
    result_full: string | null;
    kickoff_at: string | null;
    finished: boolean | null;
    source_url: string | null;
    meta: unknown;
  };

  const byId = new Map<string, SpielRow>();

  const pushRows = (list: SpielRow[] | null | undefined) => {
    for (const r of list ?? []) {
      byId.set(r.id, r);
    }
  };

  const selectCols =
    "id,home_team_id,away_team_id,home_team_name,away_team_name,home_goals,away_goals,result_full,kickoff_at,finished,source_url,meta" as const;

  const fetchForEdition = async (
    editionFilter: string | null,
  ): Promise<Error | null> => {
    if (editionFilter) {
      const pageSize = 1000;
      let offset = 0;
      const maxPages = 20;
      for (let p = 0; p < maxPages; p++) {
        const { data, error } = await supabase
          .schema("core")
          .from("spiele")
          .select(selectCols)
          .eq("bewerb_edition_id", editionFilter)
          .order("kickoff_at", { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (error) {
          return new Error(error.message);
        }
        const chunk = data ?? [];
        for (const r of chunk) {
          if (resolveOurSpielSide(r as SpielRow, teamIds, nameNorms) != null) {
            byId.set((r as SpielRow).id, r as SpielRow);
          }
        }
        if (chunk.length < pageSize) {
          break;
        }
        offset += pageSize;
      }
    }

    if (teamIds.length > 0) {
      const homeBuilder = () => {
        let q = supabase
          .schema("core")
          .from("spiele")
          .select(selectCols)
          .in("home_team_id", teamIds);
        if (editionFilter) {
          q = q.eq("bewerb_edition_id", editionFilter);
        }
        return q.order("kickoff_at", { ascending: false }).limit(500);
      };
      const awayBuilder = () => {
        let q = supabase
          .schema("core")
          .from("spiele")
          .select(selectCols)
          .in("away_team_id", teamIds);
        if (editionFilter) {
          q = q.eq("bewerb_edition_id", editionFilter);
        }
        return q.order("kickoff_at", { ascending: false }).limit(500);
      };
      const [{ data: home, error: eh }, { data: away, error: ea }] =
        await Promise.all([homeBuilder(), awayBuilder()]);
      if (eh) {
        return new Error(eh.message);
      }
      if (ea) {
        return new Error(ea.message);
      }
      pushRows(home as SpielRow[]);
      pushRows(away as SpielRow[]);
    }

    if (!editionFilter && teamNamesExact.length > 0) {
      const nameQueries = teamNamesExact.flatMap((name) => {
        const n = name.trim();
        if (!n) {
          return [];
        }
        return [
          supabase
            .schema("core")
            .from("spiele")
            .select(selectCols)
            .eq("home_team_name", n)
            .order("kickoff_at", { ascending: false })
            .limit(500),
          supabase
            .schema("core")
            .from("spiele")
            .select(selectCols)
            .eq("away_team_name", n)
            .order("kickoff_at", { ascending: false })
            .limit(500),
        ];
      });
      const results = await Promise.all(nameQueries);
      for (const res of results) {
        if (res.error) {
          return new Error(res.error.message);
        }
        pushRows(res.data as SpielRow[]);
      }
    }

    return null;
  };

  if (editionId) {
    const errE = await fetchForEdition(editionId);
    if (errE) {
      return { rows: [], error: errE };
    }
  }

  if (byId.size === 0) {
    const errF = await fetchForEdition(null);
    if (errF) {
      return { rows: [], error: errF };
    }
  }

  const sorted = [...byId.values()]
    .filter((r) => goalsFromSpielImport(r) != null)
    .sort((a, b) => kickoffMs(b.kickoff_at) - kickoffMs(a.kickoff_at));

  const rows: VereinErgebnisRow[] = [];
  for (const r of sorted.slice(0, maxRows)) {
    const g = goalsFromSpielImport(r);
    if (!g) {
      continue;
    }
    const side = resolveOurSpielSide(r, teamIds, nameNorms);
    if (!side) {
      continue;
    }
    const home = side.home;
    const hg = g.hg;
    const ag = g.ag;
    const our = home ? hg : ag;
    const their = home ? ag : hg;
    let result: "S" | "U" | "N" = "U";
    if (our > their) {
      result = "S";
    } else if (our < their) {
      result = "N";
    }
    const focus_team_name = home ? r.home_team_name : r.away_team_name;
    const opponent_name = home ? r.away_team_name : r.home_team_name;

    const ck = competitionKindFromSpielMeta(r.meta);
    const report_url =
      resolveSpielberichtUrl(r.source_url) ?? spielberichtUrlFromMeta(r.meta);
    rows.push({
      id: r.id,
      kickoff_at: r.kickoff_at,
      dateLabel: formatDeDate(r.kickoff_at),
      home_team_name: r.home_team_name,
      away_team_name: r.away_team_name,
      focus_team_name,
      opponent_name,
      is_home: home,
      our_goals: our,
      their_goals: their,
      result,
      competition_kind_label: ck.kind_label,
      competition_detail: ck.detail,
      report_url,
    });
  }

  if (rows.length === 0 && editionId) {
    return fetchVereinErgebnisseForTeams(supabase, scope, {
      limit: maxRows,
      bewerbEditionId: null,
    });
  }

  return { rows, error: null };
}

/**
 * Gleiche KM/RES-Zuordnung wie `fetchVereinLigaTabelle` — inkl. Namens-Match bei fehlenden Team-IDs im Import.
 */
export async function fetchVereinErgebnisseForVereinSegment(
  supabase: SupabaseClient,
  vereinId: string,
  segment: "km" | "res",
  options?: FetchVereinErgebnisseOptions,
): Promise<{ rows: VereinErgebnisRow[]; error: Error | null }> {
  const { data: teamRows, error: eTeams } = await supabase
    .schema("core")
    .from("teams")
    .select("id,name,meta")
    .eq("verein_id", vereinId)
    .order("name");

  if (eTeams) {
    return { rows: [], error: new Error(eTeams.message) };
  }

  const teamsList = teamRows ?? [];
  if (teamsList.length === 0) {
    return { rows: [], error: null };
  }

  const kmTeams = teamsList.filter((t) => !teamIsReserve(t.meta, t.name));
  const resTeams = teamsList.filter((t) => teamIsReserve(t.meta, t.name));
  const picked = segment === "res" ? resTeams : kmTeams;
  if (picked.length === 0) {
    return { rows: [], error: null };
  }

  const teamIds = picked.map((t) => t.id);
  const nameNorms = new Set(picked.map((t) => normVereinTeamName(t.name)));
  const teamNamesExact = picked.map((t) => t.name);

  return fetchVereinErgebnisseForTeams(
    supabase,
    { teamIds, nameNorms, teamNamesExact },
    options,
  );
}

/**
 * Abgeschlossene Spiele einer einzelnen Mannschaft (nach `core.teams.id`).
 */
export async function fetchVereinErgebnisseForTeam(
  supabase: SupabaseClient,
  teamId: string,
  options?: FetchVereinErgebnisseOptions,
): Promise<{ rows: VereinErgebnisRow[]; error: Error | null }> {
  const { data: team, error } = await supabase
    .schema("core")
    .from("teams")
    .select("id,name")
    .eq("id", teamId)
    .maybeSingle();

  if (error) {
    return { rows: [], error: new Error(error.message) };
  }
  if (!team?.name) {
    return { rows: [], error: null };
  }

  return fetchVereinErgebnisseForTeams(
    supabase,
    {
      teamIds: [teamId],
      nameNorms: new Set([normVereinTeamName(team.name)]),
      teamNamesExact: [team.name],
    },
    options,
  );
}

export type SfvPlayerListRow = {
  id: string;
  display_name: string | null;
  vorname: string | null;
  nachname: string | null;
  geburtsdatum: string | null;
  /** ÖFB/SFV-Portrait-ID (CDN unter oefb.at) */
  foto_public_uid: string | null;
};

/**
 * Spieler mit aktiver Spieler-Rolle in mindestens einem importierten Team (`core.teams`),
 * alphabetisch sortiert — gleicher Scope wie die Vereinsliste.
 */
export async function fetchSfvPlayers(
  supabase: SupabaseClient,
  options: { limit: number },
): Promise<{
  data: SfvPlayerListRow[];
  totalInScope: number;
  error: Error | null;
}> {
  const { limit } = options;

  const { data: teamRows, error: eTeams } = await supabase
    .schema("core")
    .from("teams")
    .select("id");

  if (eTeams) {
    return { data: [], totalInScope: 0, error: new Error(eTeams.message) };
  }

  const teamIds = (teamRows ?? []).map((t) => t.id);
  if (teamIds.length === 0) {
    return { data: [], totalInScope: 0, error: null };
  }

  const teamChunk = 60;
  const personIdSet = new Set<string>();

  for (let i = 0; i < teamIds.length; i += teamChunk) {
    const chunk = teamIds.slice(i, i + teamChunk);
    const { data: mems, error: eM } = await supabase
      .schema("core")
      .from("team_memberships")
      .select("person_id,role_type")
      .in("team_id", chunk)
      .is("left_on", null);

    if (eM) {
      return { data: [], totalInScope: 0, error: new Error(eM.message) };
    }
    for (const m of mems ?? []) {
      if (!m.person_id || !isPlayerRole(m.role_type)) {
        continue;
      }
      personIdSet.add(m.person_id);
    }
  }

  const personIds = [...personIdSet];
  const totalInScope = personIds.length;

  if (personIds.length === 0) {
    return { data: [], totalInScope: 0, error: null };
  }

  const idChunk = 400;
  let personRows: SfvPlayerListRow[] = [];

  for (let i = 0; i < personIds.length; i += idChunk) {
    const chunk = personIds.slice(i, i + idChunk);
    const { data: persons, error: eP } = await supabase
      .schema("core")
      .from("personen")
      .select("id,display_name,vorname,nachname,geburtsdatum,foto_public_uid")
      .in("id", chunk);

    if (eP) {
      return { data: [], totalInScope, error: new Error(eP.message) };
    }
    personRows = personRows.concat((persons ?? []) as SfvPlayerListRow[]);
  }

  const label = (p: SfvPlayerListRow) =>
    (p.display_name || [p.vorname, p.nachname].filter(Boolean).join(" ") || "")
      .toLowerCase();

  personRows.sort((a, b) => label(a).localeCompare(label(b), "de"));

  return {
    data: personRows.slice(0, limit),
    totalInScope,
    error: null,
  };
}

export type SfvPlayerMembershipRow = {
  membership_id: string;
  team_id: string;
  team_name: string;
  verein_id: string;
  verein_name: string;
  role_type: string | null;
  shirt_number: string | null;
  position_label: string | null;
};

export async function fetchSfvPlayerDetail(
  supabase: SupabaseClient,
  personId: string,
): Promise<{
  person: SfvPlayerListRow | null;
  memberships: SfvPlayerMembershipRow[];
  inSfvScope: boolean;
  error: Error | null;
}> {
  const { data: p, error: e1 } = await supabase
    .schema("core")
    .from("personen")
    .select("id,display_name,vorname,nachname,geburtsdatum,foto_public_uid")
    .eq("id", personId)
    .maybeSingle();

  if (e1) {
    return {
      person: null,
      memberships: [],
      inSfvScope: false,
      error: new Error(e1.message),
    };
  }
  if (!p) {
    return { person: null, memberships: [], inSfvScope: false, error: null };
  }

  const { data: teamRows } = await supabase
    .schema("core")
    .from("teams")
    .select("id");

  const teamIdSet = new Set((teamRows ?? []).map((t) => t.id));
  if (teamIdSet.size === 0) {
    return {
      person: p as SfvPlayerListRow,
      memberships: [],
      inSfvScope: false,
      error: null,
    };
  }

  const { data: memsRaw, error: e2 } = await supabase
    .schema("core")
    .from("team_memberships")
    .select("id,team_id,role_type,shirt_number,position_label")
    .eq("person_id", personId)
    .is("left_on", null);

  if (e2) {
    return {
      person: null,
      memberships: [],
      inSfvScope: false,
      error: new Error(e2.message),
    };
  }

  const list = (memsRaw ?? []).filter((m) => teamIdSet.has(m.team_id));
  const inSfvScope = list.some((m) => isPlayerRole(m.role_type));

  const usedTeamIds = [...new Set(list.map((m) => m.team_id))];
  if (usedTeamIds.length === 0) {
    return {
      person: p as SfvPlayerListRow,
      memberships: [],
      inSfvScope: false,
      error: null,
    };
  }

  const { data: teams, error: e3 } = await supabase
    .schema("core")
    .from("teams")
    .select("id,name,verein_id")
    .in("id", usedTeamIds);

  if (e3) {
    return {
      person: null,
      memberships: [],
      inSfvScope: false,
      error: new Error(e3.message),
    };
  }

  const vereinIds = [
    ...new Set((teams ?? []).map((t) => t.verein_id).filter(Boolean)),
  ] as string[];

  const vereinMap = new Map<string, string>();
  if (vereinIds.length > 0) {
    const { data: vereine } = await supabase
      .schema("core")
      .from("vereine")
      .select("id,name")
      .in("id", vereinIds);
    for (const v of vereine ?? []) {
      vereinMap.set(v.id, v.name);
    }
  }

  const teamMap = new Map((teams ?? []).map((t) => [t.id, t]));

  const memberships: SfvPlayerMembershipRow[] = list
    .map((m) => {
      const t = teamMap.get(m.team_id);
      if (!t) {
        return null;
      }
      return {
        membership_id: m.id,
        team_id: m.team_id,
        team_name: t.name,
        verein_id: t.verein_id,
        verein_name: vereinMap.get(t.verein_id) ?? "—",
        role_type: m.role_type,
        shirt_number: m.shirt_number,
        position_label: m.position_label,
      };
    })
    .filter(Boolean) as SfvPlayerMembershipRow[];

  memberships.sort((a, b) =>
    a.verein_name.localeCompare(b.verein_name, "de") ||
    a.team_name.localeCompare(b.team_name, "de"),
  );

  return {
    person: p as SfvPlayerListRow,
    memberships,
    inSfvScope,
    error: null,
  };
}

export type SfvBewerbEditionRow = {
  id: string;
  title: string;
  source_url: string;
  is_current: boolean;
};

/**
 * Aktuelle Bewerb-Editionen für den SFV: über `bewerb_serien.verband_id`
 * (zuverlässiger als nur `meta.verband_source_id` auf der Edition).
 * Wenn nichts mit `is_current` existiert, alle Editionen dieser Serien.
 */
export async function fetchSfvBewerbEditionen(
  supabase: SupabaseClient,
): Promise<{
  data: SfvBewerbEditionRow[];
  usedCurrentFlag: boolean;
  error: Error | null;
}> {
  const { data: serien, error: e1 } = await supabase
    .schema("core")
    .from("bewerb_serien")
    .select("id")
    .eq("verband_id", SFV_VERBAND_ROW_ID);

  if (e1) {
    return {
      data: [],
      usedCurrentFlag: true,
      error: new Error(e1.message),
    };
  }

  const serieIds = (serien ?? []).map((s) => s.id);
  if (serieIds.length === 0) {
    return { data: [], usedCurrentFlag: true, error: null };
  }

  const { data: currentRows, error: e2 } = await supabase
    .schema("core")
    .from("bewerb_editionen")
    .select("id,title,source_url,is_current")
    .in("serie_id", serieIds)
    .eq("is_current", true)
    .order("title");

  if (e2) {
    return {
      data: [],
      usedCurrentFlag: true,
      error: new Error(e2.message),
    };
  }

  if (currentRows?.length) {
    return {
      data: currentRows as SfvBewerbEditionRow[],
      usedCurrentFlag: true,
      error: null,
    };
  }

  const { data: allRows, error: e3 } = await supabase
    .schema("core")
    .from("bewerb_editionen")
    .select("id,title,source_url,is_current")
    .in("serie_id", serieIds)
    .order("title");

  if (e3) {
    return {
      data: [],
      usedCurrentFlag: false,
      error: new Error(e3.message),
    };
  }

  return {
    data: (allRows ?? []) as SfvBewerbEditionRow[],
    usedCurrentFlag: false,
    error: null,
  };
}

export type SfvStaffRow = {
  person_id: string;
  name: string;
  role_label: string | null;
  subtitle: string;
  foto_public_uid: string | null;
};

const STAFF_TEAM_CHUNK = 55;
const STAFF_PERSON_CHUNK = 400;

/** Trainer & Staff mit Zuordnung zu importierten Teams (erste Rolle pro Person). */
export async function fetchSfvStaffList(
  supabase: SupabaseClient,
  options: { limit: number },
): Promise<{ data: SfvStaffRow[]; error: Error | null }> {
  const { limit } = options;

  const { data: teamRows, error: eT } = await supabase
    .schema("core")
    .from("teams")
    .select("id,verein_id,name");

  if (eT) {
    return { data: [], error: new Error(eT.message) };
  }

  const teams = teamRows ?? [];
  const teamIds = teams.map((t) => t.id);
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  const picked = new Map<
    string,
    { team_id: string; role_label: string | null; role_type: string }
  >();

  for (let i = 0; i < teamIds.length; i += STAFF_TEAM_CHUNK) {
    const chunk = teamIds.slice(i, i + STAFF_TEAM_CHUNK);
    let mems: Record<string, unknown>[];
    try {
      mems = await fetchAllActiveMembershipsForTeams(
        supabase,
        chunk,
        "person_id,team_id,role_type,role_label",
      );
    } catch (e) {
      return {
        data: [],
        error: e instanceof Error ? e : new Error(String(e)),
      };
    }

    for (const raw of mems) {
      const m = raw as {
        person_id: string | null;
        team_id: string;
        role_type: string | null;
        role_label: string | null;
      };
      if (!m.person_id || !isStaffRole(m.role_type)) {
        continue;
      }
      if (!picked.has(m.person_id)) {
        picked.set(m.person_id, {
          team_id: m.team_id,
          role_label: m.role_label,
          role_type: m.role_type ?? "",
        });
      }
    }
  }

  const personIds = [...picked.keys()];
  if (personIds.length === 0) {
    return { data: [], error: null };
  }

  const personen: Array<{
    id: string;
    display_name: string | null;
    vorname: string | null;
    nachname: string | null;
    foto_public_uid: string | null;
  }> = [];

  for (let i = 0; i < personIds.length; i += STAFF_PERSON_CHUNK) {
    const chunk = personIds.slice(i, i + STAFF_PERSON_CHUNK);
    const { data: prow, error: eP } = await supabase
      .schema("core")
      .from("personen")
      .select("id,display_name,vorname,nachname,foto_public_uid")
      .in("id", chunk);
    if (eP) {
      return { data: [], error: new Error(eP.message) };
    }
    personen.push(...(prow ?? []));
  }

  const vereinIds = [
    ...new Set(teams.map((t) => t.verein_id).filter(Boolean)),
  ] as string[];
  const vereinName = new Map<string, string>();
  if (vereinIds.length > 0) {
    const { data: vr } = await supabase
      .schema("core")
      .from("vereine")
      .select("id,name")
      .in("id", vereinIds);
    for (const v of vr ?? []) {
      vereinName.set(v.id, v.name);
    }
  }

  const rows: SfvStaffRow[] = (personen ?? []).map((p) => {
    const meta = picked.get(p.id)!;
    const tm = teamMap.get(meta.team_id);
    const vn = tm?.verein_id
      ? (vereinName.get(tm.verein_id) ?? "")
      : "";
    const name =
      p.display_name ||
      [p.vorname, p.nachname].filter(Boolean).join(" ") ||
      "—";
    const subtitle = tm
      ? vn
        ? `${vn} · ${tm.name}`
        : tm.name
      : "—";
    return {
      person_id: p.id,
      name,
      role_label: meta.role_label,
      subtitle,
      foto_public_uid: p.foto_public_uid ?? null,
    };
  });

  rows.sort((a, b) => a.name.localeCompare(b.name, "de"));

  return { data: rows.slice(0, limit), error: null };
}
