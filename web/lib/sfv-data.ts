import type { SupabaseClient } from "@supabase/supabase-js";

import { bundeslandFromVerbandName } from "./oefb-bundesland";
import { SFV_VERBAND_ROW_ID } from "./sfv";

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

function parseVereinListMeta(meta: unknown): {
  stadion_label: string | null;
  capacity: number | null;
  founded_year: number | null;
} {
  if (!meta || typeof meta !== "object") {
    return { stadion_label: null, capacity: null, founded_year: null };
  }
  const m = meta as Record<string, unknown>;
  const rawStadion =
    m.stadion_name ?? m.stadion ?? m.stadium_name ?? m.stadium;
  const stadion_label =
    typeof rawStadion === "string" && rawStadion.trim()
      ? rawStadion.trim()
      : null;

  let capacity: number | null = null;
  const capRaw = m.capacity ?? m.kapazitaet ?? m.stadium_capacity;
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
    const extra = parseVereinListMeta(v.meta);
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

export async function fetchVereinDetail(
  supabase: SupabaseClient,
  vereinId: string,
): Promise<{
  club: {
    name: string;
    short_name: string | null;
    verband_name: string | null;
    team_count: number;
    player_count: number;
    staff_count: number;
  } | null;
  teams: VereinTeamRow[];
  error: Error | null;
}> {
  const { data: v, error: e1 } = await supabase
    .schema("core")
    .from("vereine")
    .select("id,name,short_name,verband_id")
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
    .select("id,name,team_type,meta,saison_id")
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

  return {
    club: {
      name: v.name,
      short_name: v.short_name,
      verband_name: vb?.name ?? null,
      team_count: teams.length,
      player_count: playerTotal,
      staff_count: staffTotal,
    },
    teams,
    error: null,
  };
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
