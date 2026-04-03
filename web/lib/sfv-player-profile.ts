import type { SupabaseClient } from "@supabase/supabase-js";

import { mergeScoutbaseProfileMeta } from "@/lib/player-profile-meta-defaults";
import { loadPositionLabelsForPrimaryTeams } from "@/lib/player-position-category";
import { bundeslandFromVerbandName } from "@/lib/oefb-bundesland";
import { scoutbaseRating99 } from "@/lib/player-rating";
import { fetchTeamTableRankContext } from "@/lib/team-table-rank";
import { isPlayerRole, isStaffRole } from "@/lib/sfv-data";

const EDITION_BATCH = 120;

type EditionRow = { id: string; title: string; is_current: boolean };

function num(v: unknown): number {
  if (v == null) {
    return 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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

function collectEditionIdsFromMeta(meta: unknown): string[] {
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

export type MembershipStatsParsed = {
  goals: number;
  appearances: number;
  yellow: number;
  yellow_red: number;
  red: number;
  subs_in: number;
  subs_out: number;
  avg_minutes: number | null;
  /** Aus Import-JSON, sonst aus Einsätzen × Ø-Minuten geschätzt */
  minutes_total: number;
};

function emptyMembershipStats(): MembershipStatsParsed {
  return {
    goals: 0,
    appearances: 0,
    yellow: 0,
    yellow_red: 0,
    red: 0,
    subs_in: 0,
    subs_out: 0,
    avg_minutes: null,
    minutes_total: 0,
  };
}

function minutesTotalForRating(st: MembershipStatsParsed): number {
  let m = st.minutes_total;
  if (st.appearances > 0 && m <= 0 && st.avg_minutes != null) {
    m = Math.round(st.appearances * st.avg_minutes);
  }
  if (m <= 0 && st.appearances > 0) {
    m = st.appearances * 90;
  }
  return m;
}

function parseMembershipStats(stats: unknown): MembershipStatsParsed {
  const s =
    stats && typeof stats === "object" ? (stats as Record<string, unknown>) : {};
  const avgRaw = s.minutes_per_game ?? s.avg_minutes_per_game ?? s.ø_minuten;
  let avg_minutes: number | null = null;
  if (typeof avgRaw === "number" && Number.isFinite(avgRaw)) {
    avg_minutes = avgRaw;
  }
  let minutes_total = num(
    s.minutes ?? s.einsatzminuten ?? s.einsatz_minuten ?? s.minutes_played,
  );
  const appearances = num(s.appearances);
  if (minutes_total <= 0 && appearances > 0 && avg_minutes != null) {
    minutes_total = Math.round(appearances * avg_minutes);
  }
  return {
    goals: num(s.goals),
    appearances,
    yellow: num(s.yellow_cards),
    yellow_red: num(s.yellow_red_cards),
    red: num(s.red_cards),
    subs_in: num(s.subs_in ?? s.einwechslungen),
    subs_out: num(s.subs_out ?? s.auswechslungen),
    avg_minutes,
    minutes_total,
  };
}

/** Liga vs. Cup: Top-Level-Stats = Meisterschaft; optional `cup` / `pokal` = Cup. */
function splitLeagueCup(stats: unknown): {
  league: MembershipStatsParsed;
  cup: MembershipStatsParsed;
} {
  const s =
    stats && typeof stats === "object" ? (stats as Record<string, unknown>) : {};
  const cupRaw = s.cup ?? s.pokal;
  const leagueOnly = { ...s };
  delete leagueOnly.cup;
  delete leagueOnly.pokal;
  const league = parseMembershipStats(leagueOnly);
  const cup =
    cupRaw && typeof cupRaw === "object"
      ? parseMembershipStats(cupRaw)
      : emptyMembershipStats();
  return { league, cup };
}

function isReserveTeam(meta: unknown, teamName: string): boolean {
  if (meta && typeof meta === "object") {
    const m = meta as Record<string, unknown>;
    if (m.reserve_team === true) {
      return true;
    }
  }
  return /\bres(erve)?\b/i.test(teamName) || /\bzweite\b/i.test(teamName);
}

export type ProfileKmResLine = {
  appearances: number;
  minutes: number;
  avg_minutes: number | null;
  subs_in: number;
  subs_out: number;
  goals: number;
};

function emptyKmResLine(): ProfileKmResLine {
  return {
    appearances: 0,
    minutes: 0,
    avg_minutes: null,
    subs_in: 0,
    subs_out: 0,
    goals: 0,
  };
}

function lineFromStats(st: MembershipStatsParsed): ProfileKmResLine {
  let minutes = st.minutes_total;
  let avg = st.avg_minutes;
  if (st.appearances > 0 && minutes > 0 && (avg == null || !Number.isFinite(avg))) {
    avg = minutes / st.appearances;
  }
  if (st.appearances > 0 && minutes <= 0 && avg != null) {
    minutes = Math.round(st.appearances * avg);
  }
  return {
    appearances: st.appearances,
    minutes,
    avg_minutes: avg != null ? Math.round(avg) : null,
    subs_in: st.subs_in,
    subs_out: st.subs_out,
    goals: st.goals,
  };
}

function addKmResLines(a: ProfileKmResLine, b: ProfileKmResLine): ProfileKmResLine {
  const apps = a.appearances + b.appearances;
  const mins = a.minutes + b.minutes;
  const avg = apps > 0 ? Math.round(mins / apps) : null;
  return {
    appearances: apps,
    minutes: mins,
    avg_minutes: avg,
    subs_in: a.subs_in + b.subs_in,
    subs_out: a.subs_out + b.subs_out,
    goals: a.goals + b.goals,
  };
}

export type ProfileStatsTables = {
  /** Import-/Saison-Schlüssel (z. B. 2025/26), entspricht „Aktuelle Saison“ */
  dataSeasonKey: string;
  meisterschaft: {
    current: { km: ProfileKmResLine; res: ProfileKmResLine };
    total: { km: ProfileKmResLine; res: ProfileKmResLine };
  };
  cup: {
    current: { km: ProfileKmResLine; res: ProfileKmResLine };
    total: { km: ProfileKmResLine; res: ProfileKmResLine };
  };
};

function buildEmptyStatsTables(seasonKey: string): ProfileStatsTables {
  const z = () => ({ km: emptyKmResLine(), res: emptyKmResLine() });
  return {
    dataSeasonKey: seasonKey,
    meisterschaft: { current: z(), total: z() },
    cup: { current: z(), total: z() },
  };
}

function aggregateStatsTables(
  playerMems: { team_id: string; stats: unknown }[],
  teamById: Map<
    string,
    {
      name: string;
      meta: unknown;
    }
  >,
  seasonKey: string,
): ProfileStatsTables {
  const mCurr = { km: emptyKmResLine(), res: emptyKmResLine() };
  const cCurr = { km: emptyKmResLine(), res: emptyKmResLine() };
  const mTot = { km: emptyKmResLine(), res: emptyKmResLine() };
  const cTot = { km: emptyKmResLine(), res: emptyKmResLine() };

  for (const m of playerMems) {
    const t = teamById.get(m.team_id);
    const reserve = t ? isReserveTeam(t.meta, t.name) : false;
    const bucket = reserve ? "res" : "km";
    const { league, cup } = splitLeagueCup(m.stats);
    const leagueLine = lineFromStats(league);
    const cupLine = lineFromStats(cup);

    mCurr[bucket] = addKmResLines(mCurr[bucket], leagueLine);
    cCurr[bucket] = addKmResLines(cCurr[bucket], cupLine);
    mTot.km = addKmResLines(mTot.km, reserve ? emptyKmResLine() : leagueLine);
    mTot.res = addKmResLines(mTot.res, reserve ? leagueLine : emptyKmResLine());
    cTot.km = addKmResLines(cTot.km, reserve ? emptyKmResLine() : cupLine);
    cTot.res = addKmResLines(cTot.res, reserve ? cupLine : emptyKmResLine());
  }

  return {
    dataSeasonKey: seasonKey,
    meisterschaft: {
      current: mCurr,
      total: mTot,
    },
    cup: {
      current: cCurr,
      total: cTot,
    },
  };
}

function parseStringListField(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof v === "string" && v.trim()) {
    return v
      .split(/[,;/]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function parsePersonProfileMeta(meta: unknown): {
  height_cm: number | null;
  strong_foot: "left" | "right" | "both" | null;
  birth_year: number | null;
  profile_verified: boolean;
  primary_positions: string[];
  secondary_positions: string[];
} {
  if (!meta || typeof meta !== "object") {
    return {
      height_cm: null,
      strong_foot: null,
      birth_year: null,
      profile_verified: false,
      primary_positions: [],
      secondary_positions: [],
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

  const profile_verified = Boolean(
    m.profile_verified ?? m.scoutbase_verified ?? m.verified_profile,
  );

  const primary_positions = parseStringListField(
    m.primary_positions ?? m.primary_position,
  );
  const secondary_positions = parseStringListField(
    m.secondary_positions ?? m.secondary_position,
  );

  return {
    height_cm,
    strong_foot,
    birth_year,
    profile_verified,
    primary_positions,
    secondary_positions,
  };
}

function resolveBirthYear(
  geburtsdatum: string | null,
  metaYear: number | null,
): number | null {
  if (metaYear != null && metaYear >= 1900 && metaYear <= 2100) {
    return metaYear;
  }
  if (!geburtsdatum?.trim()) {
    return null;
  }
  const y4 = Number(geburtsdatum.trim().slice(0, 4));
  if (Number.isFinite(y4) && y4 >= 1900 && y4 <= 2100) {
    return y4;
  }
  const d = new Date(geburtsdatum);
  if (!Number.isFinite(d.getTime())) {
    return null;
  }
  const y = d.getFullYear();
  return y >= 1900 && y <= 2100 ? y : null;
}

function parseVereinFounded(meta: unknown): number | null {
  if (!meta || typeof meta !== "object") {
    return null;
  }
  const m = meta as Record<string, unknown>;
  const fy = m.gegruendet ?? m.founded_year ?? m.gruendungsjahr;
  if (typeof fy === "number" && Number.isFinite(fy)) {
    return Math.round(fy);
  }
  if (typeof fy === "string" && /^\d{4}$/.test(fy.trim())) {
    return Number.parseInt(fy.trim(), 10);
  }
  return null;
}

function ageFromIso(iso: string | null): number | null {
  if (!iso) {
    return null;
  }
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) {
    return null;
  }
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) {
    age -= 1;
  }
  return age >= 0 && age < 120 ? age : null;
}

function currentSeasonLabel(): string {
  const y = new Date().getFullYear();
  const mo = new Date().getMonth();
  const start = mo >= 6 ? y : y - 1;
  const endShort = (start + 1).toString().slice(2);
  return `${start}/${endShort}`;
}

/** Tab „Historie“: Stationen aus team_memberships (inkl. beendet). */
export type ProfileClubHistoryRow = {
  membership_id: string;
  team_id: string;
  team_name: string;
  verein_id: string;
  verein_name: string;
  joined_on: string | null;
  left_on: string | null;
  appearances: number;
  goals: number;
  avg_goals_per_game: number | null;
  is_current: boolean;
};

/** Zusätzliche Wechsel aus core.transfers (Import), chronologisch absteigend. */
export type ProfileTransferHistoryRow = {
  id: string;
  transfer_date: string | null;
  from_verein_name: string | null;
  to_verein_name: string | null;
  appearances: number | null;
  category_label: string | null;
};

function parseIsoMs(iso: string | null): number {
  if (!iso) {
    return 0;
  }
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function sortClubHistoryRows(
  rows: ProfileClubHistoryRow[],
): ProfileClubHistoryRow[] {
  return [...rows].sort((a, b) => {
    const endA =
      a.left_on == null ? Number.POSITIVE_INFINITY : parseIsoMs(a.left_on);
    const endB =
      b.left_on == null ? Number.POSITIVE_INFINITY : parseIsoMs(b.left_on);
    if (endB !== endA) {
      return endB - endA;
    }
    return parseIsoMs(b.joined_on) - parseIsoMs(a.joined_on);
  });
}

async function loadClubHistoryRows(
  supabase: SupabaseClient,
  memberships: Array<{
    id: string;
    team_id: string;
    stats: unknown;
    joined_on: string | null;
    left_on: string | null;
  }>,
): Promise<ProfileClubHistoryRow[]> {
  if (memberships.length === 0) {
    return [];
  }
  const teamIds = [...new Set(memberships.map((m) => m.team_id))];
  const { data: teams } = await supabase
    .schema("core")
    .from("teams")
    .select("id,name,verein_id")
    .in("id", teamIds);

  const vereinIds = [
    ...new Set(
      (teams ?? [])
        .map((t) => t.verein_id)
        .filter((x): x is string => typeof x === "string" && x.length > 0),
    ),
  ];

  const vereinById = new Map<string, string>();
  if (vereinIds.length > 0) {
    const { data: vereine } = await supabase
      .schema("core")
      .from("vereine")
      .select("id,name")
      .in("id", vereinIds);
    for (const v of vereine ?? []) {
      vereinById.set(v.id, v.name?.trim() || "—");
    }
  }

  const teamById = new Map((teams ?? []).map((t) => [t.id, t]));
  const rows: ProfileClubHistoryRow[] = [];

  for (const m of memberships) {
    const team = teamById.get(m.team_id);
    if (!team) {
      continue;
    }
    const verein_name = team.verein_id
      ? vereinById.get(team.verein_id) ?? "—"
      : "—";
    const st = parseMembershipStats(m.stats);
    const avg =
      st.appearances > 0
        ? Math.round((st.goals / st.appearances) * 100) / 100
        : null;
    rows.push({
      membership_id: m.id,
      team_id: team.id,
      team_name: team.name,
      verein_id: team.verein_id ?? "",
      verein_name,
      joined_on: m.joined_on,
      left_on: m.left_on,
      appearances: st.appearances,
      goals: st.goals,
      avg_goals_per_game: avg,
      is_current: m.left_on == null,
    });
  }

  return sortClubHistoryRows(rows);
}

async function loadTransferHistory(
  supabase: SupabaseClient,
  personId: string,
): Promise<ProfileTransferHistoryRow[]> {
  const { data, error } = await supabase
    .schema("core")
    .from("transfers")
    .select(
      "id,transfer_date,from_verein_name,to_verein_name,appearances,category_label",
    )
    .eq("person_id", personId)
    .order("transfer_date", { ascending: false });

  if (error || !data?.length) {
    return [];
  }

  return data.map((r) => ({
    id: r.id,
    transfer_date: r.transfer_date,
    from_verein_name: r.from_verein_name,
    to_verein_name: r.to_verein_name,
    appearances: r.appearances,
    category_label: r.category_label,
  }));
}

export type SfvPlayerProfileData = {
  person: {
    id: string;
    display_name: string | null;
    vorname: string | null;
    nachname: string | null;
    geburtsdatum: string | null;
    foto_public_uid: string | null;
    nationalitaet: string | null;
    height_cm: number | null;
    strong_foot: "left" | "right" | "both" | null;
    /** ScoutBase / manuell gepflegt via personen.meta */
    profile_verified: boolean;
  };
  /** Auflösung: meta.birth_year oder Jahr aus geburtsdatum */
  birthYear: number | null;
  /** Spielfeld: primäre Positionen (grün), aus meta */
  primaryPositions: string[];
  /** Spielfeld: sekundäre Positionen (orange), aus meta */
  secondaryPositions: string[];
  displayName: string;
  age: number | null;
  rating: number;
  totals: {
    appearances: number;
    goals: number;
    cards: number;
    yellow: number;
    yellow_red: number;
    red: number;
  };
  primary: {
    team_id: string;
    team_name: string;
    verein_id: string;
    verein_name: string;
    liga_label: string | null;
    region_label: string | null;
    position_label: string | null;
    shirt_number: string | null;
    joined_on: string | null;
    stats: MembershipStatsParsed;
  } | null;
  /** Eine Zeile für „Aktuelle Statistiken“ (Primär-Mannschaft) */
  statsRow: {
    verein_name: string;
    liga_label: string | null;
    stats: MembershipStatsParsed;
  } | null;
  trainer: { display_name: string; age: number | null } | null;
  verein_founded_year: number | null;
  tabellenplatz: number | null;
  seasonLabel: string;
  memberships_count: number;
  /** Tab „Statistiken“: Meisterschaft/Cup, KM/Res; Saisonfilter in der UI */
  statsTables: ProfileStatsTables;
  /** Tab „Historie“: Vereins-/Mannschaftsstationen (sortiert: aktuell zuerst, sonst nach Enddatum) */
  clubHistory: ProfileClubHistoryRow[];
  /** Tab „Historie“: Wechsel aus Transfer-Import, falls vorhanden */
  transferHistory: ProfileTransferHistoryRow[];
};

/**
 * Profildaten für einen Spieler: Kader-Stats, Primärteam, Liga, optional Trainer.
 * Größe / starker Fuß aus `personen.meta`, falls gesetzt (später durch Spieler pflegbar).
 */
export async function fetchSfvPlayerProfile(
  supabase: SupabaseClient,
  personId: string,
): Promise<{ data: SfvPlayerProfileData | null; error: Error | null }> {
  try {
    const { data: p, error: e1 } = await supabase
      .schema("core")
      .from("personen")
      .select(
        "id,display_name,vorname,nachname,geburtsdatum,foto_public_uid,nationalitaet,meta",
      )
      .eq("id", personId)
      .maybeSingle();

    if (e1) {
      return { data: null, error: new Error(e1.message) };
    }
    if (!p) {
      return { data: null, error: null };
    }

    const metaParsed = parsePersonProfileMeta(p.meta);

    const displayName =
      p.display_name ||
      [p.vorname, p.nachname].filter(Boolean).join(" ") ||
      "Unbenannt";

    const metaMerged = mergeScoutbaseProfileMeta(
      personId,
      displayName,
      p.vorname,
      p.nachname,
      metaParsed,
    );

    const { data: teamRows } = await supabase
      .schema("core")
      .from("teams")
      .select("id");

    const teamIdSet = new Set((teamRows ?? []).map((t) => t.id));
    if (teamIdSet.size === 0) {
      const age = ageFromIso(p.geburtsdatum);
      const birthYear = resolveBirthYear(p.geburtsdatum, metaMerged.birth_year);
      const transferHistory = await loadTransferHistory(supabase, personId);
      return {
        data: {
          person: {
            id: p.id,
            display_name: p.display_name,
            vorname: p.vorname,
            nachname: p.nachname,
            geburtsdatum: p.geburtsdatum,
            foto_public_uid: p.foto_public_uid,
            nationalitaet: p.nationalitaet,
            height_cm: metaMerged.height_cm,
            strong_foot: metaMerged.strong_foot,
            profile_verified: metaMerged.profile_verified,
          },
          birthYear,
          primaryPositions: metaMerged.primary_positions,
          secondaryPositions: metaMerged.secondary_positions,
          displayName,
          age,
          rating: 1,
          totals: {
            appearances: 0,
            goals: 0,
            cards: 0,
            yellow: 0,
            yellow_red: 0,
            red: 0,
          },
          primary: null,
          statsRow: null,
          trainer: null,
          verein_founded_year: null,
          tabellenplatz: null,
          seasonLabel: currentSeasonLabel(),
          memberships_count: 0,
          statsTables: buildEmptyStatsTables(currentSeasonLabel()),
          clubHistory: [],
          transferHistory,
        },
        error: null,
      };
    }

    const { data: memsRaw, error: e2 } = await supabase
      .schema("core")
      .from("team_memberships")
      .select(
        "id,team_id,role_type,stats,joined_on,left_on,shirt_number,position_label",
      )
      .eq("person_id", personId);

    if (e2) {
      return { data: null, error: new Error(e2.message) };
    }

    const allPlayerMemsFiltered = (memsRaw ?? []).filter(
      (m) => teamIdSet.has(m.team_id) && isPlayerRole(m.role_type),
    );
    const playerMems = allPlayerMemsFiltered.filter((m) => m.left_on == null);

    const seasonKeyNow = currentSeasonLabel();
    let statsTables = buildEmptyStatsTables(seasonKeyNow);
    if (playerMems.length > 0) {
      const usedTeamIds = [...new Set(playerMems.map((m) => m.team_id))];
      const teamById = new Map<
        string,
        { name: string; meta: unknown }
      >();
      const { data: trows } = await supabase
        .schema("core")
        .from("teams")
        .select("id,name,meta")
        .in("id", usedTeamIds);
      for (const t of trows ?? []) {
        teamById.set(t.id, { name: t.name, meta: t.meta });
      }
      statsTables = aggregateStatsTables(playerMems, teamById, seasonKeyNow);
    }

    let totalGoals = 0;
    let totalApps = 0;
    let totalYellow = 0;
    let totalYr = 0;
    let totalRed = 0;
    const goalsByTeam = new Map<string, number>();

    for (const m of playerMems) {
      const st = parseMembershipStats(m.stats);
      totalGoals += st.goals;
      totalApps += st.appearances;
      totalYellow += st.yellow;
      totalYr += st.yellow_red;
      totalRed += st.red;
      if (st.goals > 0) {
        goalsByTeam.set(
          m.team_id,
          (goalsByTeam.get(m.team_id) ?? 0) + st.goals,
        );
      }
    }

    let primaryTeamId: string | null = null;
    if (playerMems.length > 0) {
      primaryTeamId = playerMems[0]!.team_id;
      let bestG = -1;
      for (const [tid, g] of goalsByTeam) {
        if (g > bestG) {
          bestG = g;
          primaryTeamId = tid;
        }
      }
      if (bestG <= 0) {
        primaryTeamId = playerMems[0]!.team_id;
      }
    }

    const positions = await loadPositionLabelsForPrimaryTeams(
      supabase,
      [personId],
      new Map(primaryTeamId ? [[personId, primaryTeamId]] : []),
    );
    const positionFromKader = positions.get(personId) ?? null;

    let primary: SfvPlayerProfileData["primary"] = null;
    let statsRow: SfvPlayerProfileData["statsRow"] = null;
    let trainer: SfvPlayerProfileData["trainer"] = null;
    let verein_founded_year: number | null = null;
    let tabellenplatz: number | null = null;
    let teamsInLeagueForRating: number | null = null;

    if (primaryTeamId) {
      const { data: team } = await supabase
        .schema("core")
        .from("teams")
        .select("id,name,verein_id,meta,category_label")
        .eq("id", primaryTeamId)
        .maybeSingle();

      if (team?.verein_id) {
        const { data: verein } = await supabase
          .schema("core")
          .from("vereine")
          .select("id,name,verband_id,meta")
          .eq("id", team.verein_id)
          .maybeSingle();

        verein_founded_year = parseVereinFounded(verein?.meta);

        const editionIdSet = new Set<string>();
        for (const id of collectEditionIdsFromMeta(team.meta)) {
          editionIdSet.add(id);
        }

        const editionIds = [...editionIdSet];
        const editionById = new Map<string, EditionRow>();
        for (let i = 0; i < editionIds.length; i += EDITION_BATCH) {
          const chunk = editionIds.slice(i, i + EDITION_BATCH);
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

        if (editionIds.length > 0) {
          const ctx = await fetchTeamTableRankContext(
            supabase,
            team.id,
            editionIds,
          );
          tabellenplatz = ctx.rank;
          teamsInLeagueForRating = ctx.teamsInLeague;
        }

        const liga_label = ligaLabelFromTeamMeta(team.meta, editionById);
        let region_label: string | null = null;
        if (verein?.verband_id) {
          const { data: vb } = await supabase
            .schema("core")
            .from("verbaende")
            .select("name")
            .eq("id", verein.verband_id)
            .maybeSingle();
          region_label = bundeslandFromVerbandName(vb?.name ?? null);
        }

        const pm = playerMems.find((m) => m.team_id === primaryTeamId);
        const st = pm ? parseMembershipStats(pm.stats) : parseMembershipStats({});

        const posLabel =
          positionFromKader ??
          pm?.position_label ??
          null;

        primary = {
          team_id: team.id,
          team_name: team.name,
          verein_id: verein?.id ?? team.verein_id,
          verein_name: verein?.name ?? "—",
          liga_label,
          region_label,
          position_label: posLabel,
          shirt_number: pm?.shirt_number ?? null,
          joined_on: pm?.joined_on ?? null,
          stats: st,
        };

        statsRow = {
          verein_name: verein?.name ?? "—",
          liga_label,
          stats: st,
        };

        const { data: staffMems } = await supabase
          .schema("core")
          .from("team_memberships")
          .select("person_id,role_type,role_label")
          .eq("team_id", primaryTeamId)
          .is("left_on", null);

        const trainerPid = (staffMems ?? []).find(
          (x) => x.person_id && isStaffRole(x.role_type),
        )?.person_id;

        if (trainerPid) {
          const { data: coach } = await supabase
            .schema("core")
            .from("personen")
            .select("display_name,vorname,nachname,geburtsdatum")
            .eq("id", trainerPid)
            .maybeSingle();
          if (coach) {
            const dn =
              coach.display_name ||
              [coach.vorname, coach.nachname].filter(Boolean).join(" ") ||
              "Trainer";
            trainer = {
              display_name: dn,
              age: ageFromIso(coach.geburtsdatum),
            };
          }
        }
      }
    }

    const clubHistory = await loadClubHistoryRows(
      supabase,
      allPlayerMemsFiltered,
    );
    const transferHistory = await loadTransferHistory(supabase, personId);

    const age = ageFromIso(p.geburtsdatum);

    let rating = 1;
    if (playerMems.length > 0) {
      if (primary) {
        const mt = minutesTotalForRating(primary.stats);
        rating = scoutbaseRating99({
          ligaLabel: primary.liga_label,
          minutesTotal: mt,
          goals: primary.stats.goals,
          age,
          tablePosition: tabellenplatz,
          teamsInLeague: teamsInLeagueForRating,
        });
      } else {
        let sumMinutes = 0;
        let sumGoals = 0;
        for (const m of playerMems) {
          const st = parseMembershipStats(m.stats);
          sumGoals += st.goals;
          sumMinutes += minutesTotalForRating(st);
        }
        rating = scoutbaseRating99({
          ligaLabel: null,
          minutesTotal: sumMinutes,
          goals: sumGoals,
          age,
          tablePosition: null,
          teamsInLeague: null,
        });
      }
    }
    const birthYear = resolveBirthYear(p.geburtsdatum, metaMerged.birth_year);

    return {
      data: {
        person: {
          id: p.id,
          display_name: p.display_name,
          vorname: p.vorname,
          nachname: p.nachname,
          geburtsdatum: p.geburtsdatum,
          foto_public_uid: p.foto_public_uid,
          nationalitaet: p.nationalitaet,
          height_cm: metaMerged.height_cm,
          strong_foot: metaMerged.strong_foot,
          profile_verified: metaMerged.profile_verified,
        },
        birthYear,
        primaryPositions: metaMerged.primary_positions,
        secondaryPositions: metaMerged.secondary_positions,
        displayName,
        age,
        rating,
        totals: {
          appearances: totalApps,
          goals: totalGoals,
          cards: totalYellow + totalYr + totalRed,
          yellow: totalYellow,
          yellow_red: totalYr,
          red: totalRed,
        },
        primary,
        statsRow,
        trainer,
        verein_founded_year,
        tabellenplatz,
        seasonLabel: seasonKeyNow,
        memberships_count: playerMems.length,
        statsTables,
        clubHistory,
        transferHistory,
      },
      error: null,
    };
  } catch (e) {
    return {
      data: null,
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
}
