import type { SupabaseClient } from "@supabase/supabase-js";

import { resolvePersonFotoPublicUid } from "@/lib/oefb-assets";
import { mergeScoutbaseProfileMeta } from "@/lib/player-profile-meta-defaults";
import { loadPositionLabelsForPrimaryTeams } from "@/lib/player-position-category";
import { bundeslandFromVerbandName } from "@/lib/oefb-bundesland";
import { scoutbaseRating99 } from "@/lib/player-rating";
import {
  fetchVereinLigaTabelle,
  isPlayerRole,
  isStaffRole,
  normVereinTeamName,
  teamIsReserve,
} from "@/lib/sfv-data";
import {
  mergeFictiveSeasonsIntoMembershipStats,
  shouldApplyFictiveSeasonStats,
} from "@/lib/fictive-membership-season-stats";
import {
  fetchOefbProfileVereine,
  resolveOefbSpielerProfileUrlFromMeta,
  resolveOefbSpielerProfileUrlFromStrings,
  type OefbProfileVereinRow,
} from "@/lib/oefb-player-profile-vereine";
import { fetchTeamTableRankContext } from "@/lib/team-table-rank";

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

/** Wie „Verein → Tabelle / Ergebnisse“: Rang aus derselben Ligatabelle. */
async function tabellenplatzFromVereinLigaTabelle(
  supabase: SupabaseClient,
  teamId: string,
  vereinId: string,
  teamName: string,
  teamMeta: unknown,
): Promise<{ rank: number | null; teamsInLeague: number | null }> {
  const segment = teamIsReserve(teamMeta, teamName) ? "res" : "km";
  const { data: liga, error } = await fetchVereinLigaTabelle(
    supabase,
    vereinId,
    segment,
  );
  if (error || !liga?.rows?.length) {
    return { rank: null, teamsInLeague: null };
  }
  const row =
    liga.rows.find((r) => r.team_id === teamId) ??
    liga.rows.find(
      (r) =>
        normVereinTeamName(r.team_name) === normVereinTeamName(teamName),
    );
  return {
    rank: row?.rank ?? null,
    teamsInLeague: liga.rows.length,
  };
}

/**
 * `joined_on` aus Spalte oder aus `meta` (Importe, z. B. SFV/ÖFB).
 */
function joinedOnFromMembership(m: {
  joined_on: string | null;
  meta: unknown;
}): string | null {
  if (m.joined_on != null && String(m.joined_on).trim() !== "") {
    return String(m.joined_on);
  }
  if (!m.meta || typeof m.meta !== "object") {
    return null;
  }
  const meta = m.meta as Record<string, unknown>;
  const keys = [
    "im_verein_seit",
    "verein_seit",
    "in_club_since",
    "joined_on",
    "joined_at",
    "kader_seit",
    "im_kader_seit",
  ];
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === "string" && v.trim()) {
      return v.trim();
    }
  }
  return null;
}

/**
 * Tore/Einsätze einer Mitgliedschaft über alle relevanten Stat-Slices (Import-Saison +
 * `stats.seasons`), konsistent mit Dashboard-/Profil-Summen.
 */
function aggregateMembershipGoalsAndAppearances(
  raw: unknown,
  dataSeasonKey: string,
): { goals: number; appearances: number } {
  const shards = collectSeasonStatShardsForTotals(raw, dataSeasonKey);
  const toSum =
    shards.length > 0 ? shards : [stripSeasonsFromStatsPayload(raw)];
  let goals = 0;
  let appearances = 0;
  for (const shard of toSum) {
    const st = parseMembershipStats(shard);
    goals += st.goals;
    appearances += st.appearances;
  }
  return { goals, appearances };
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
  const avgRaw =
    s.minutes_per_game ??
    s.avg_minutes_per_game ??
    s.ø_minuten ??
    s.minuten_pro_spiel ??
    s.minutenProSpiel ??
    s.durchschnitt_minuten_pro_spiel ??
    s.durchschnittliche_spielzeit;
  let avg_minutes: number | null = null;
  if (typeof avgRaw === "number" && Number.isFinite(avgRaw)) {
    avg_minutes = avgRaw;
  }
  let minutes_total = num(
    s.minutes ??
      s.einsatzminuten ??
      s.einsatz_minuten ??
      s.minutes_played ??
      s.einsatzMinuten,
  );
  const appearances = num(s.appearances);
  if (minutes_total <= 0 && appearances > 0 && avg_minutes != null) {
    minutes_total = Math.round(appearances * avg_minutes);
  }
  if (
    (avg_minutes == null || !Number.isFinite(avg_minutes)) &&
    minutes_total > 0 &&
    appearances > 0
  ) {
    avg_minutes = minutes_total / appearances;
  }
  return {
    goals: num(s.goals),
    appearances,
    yellow: num(s.yellow_cards ?? s.gelbe),
    yellow_red: num(s.yellow_red_cards ?? s.gelbrote),
    red: num(s.red_cards ?? s.rote),
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

/**
 * „Heimat“-Team für Hero/Position/Liga: Override aus Meta, sonst höchste Einsatzminuten,
 * dann Einsätze, dann Tore; bei Gleichstand KM vor Reserve, sonst stabile team_id.
 */
function pickPrimaryTeamId(
  playerMems: { team_id: string; stats: unknown }[],
  teamById: Map<string, { name: string; meta: unknown }>,
  overrideTeamId: string | null,
): string | null {
  if (playerMems.length === 0) {
    return null;
  }
  const validIds = new Set(playerMems.map((m) => m.team_id));
  if (overrideTeamId && validIds.has(overrideTeamId)) {
    return overrideTeamId;
  }

  type Scored = {
    team_id: string;
    minutes: number;
    apps: number;
    goals: number;
    isReserve: boolean;
  };
  const scored: Scored[] = [];
  for (const m of playerMems) {
    const t = teamById.get(m.team_id);
    const st = parseMembershipStats(m.stats);
    const minutes = minutesTotalForRating(st);
    const reserve = t ? isReserveTeam(t.meta, t.name) : false;
    scored.push({
      team_id: m.team_id,
      minutes,
      apps: st.appearances,
      goals: st.goals,
      isReserve: reserve,
    });
  }

  scored.sort((a, b) => {
    if (b.minutes !== a.minutes) {
      return b.minutes - a.minutes;
    }
    if (b.apps !== a.apps) {
      return b.apps - a.apps;
    }
    if (b.goals !== a.goals) {
      return b.goals - a.goals;
    }
    if (a.isReserve !== b.isReserve) {
      return a.isReserve ? 1 : -1;
    }
    return a.team_id.localeCompare(b.team_id);
  });

  return scored[0]?.team_id ?? null;
}

export type ProfileKmResLine = {
  appearances: number;
  minutes: number;
  avg_minutes: number | null;
  subs_in: number;
  subs_out: number;
  goals: number;
  yellow: number;
  yellow_red: number;
  red: number;
};

function emptyKmResLine(): ProfileKmResLine {
  return {
    appearances: 0,
    minutes: 0,
    avg_minutes: null,
    subs_in: 0,
    subs_out: 0,
    goals: 0,
    yellow: 0,
    yellow_red: 0,
    red: 0,
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
    yellow: st.yellow,
    yellow_red: st.yellow_red,
    red: st.red,
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
    yellow: a.yellow + b.yellow,
    yellow_red: a.yellow_red + b.yellow_red,
    red: a.red + b.red,
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

/** Leere Tabellen (z. B. wenn eine Saison im UI gewählt ist, aber noch keine Profilzeilen). */
export function emptyProfileStatsTables(dataSeasonKey: string): ProfileStatsTables {
  return buildEmptyStatsTables(dataSeasonKey);
}

/** Top-Level-Stats ohne `seasons` (historische Saisons im JSON). */
function stripSeasonsFromStatsPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") {
    return raw;
  }
  const s = raw as Record<string, unknown>;
  const { seasons: _omit, ...rest } = s;
  return rest;
}

/**
 * Roh-Stats für eine gewählte Saison: Top-Level = Import-Saison (`dataSeasonKey`),
 * sonst `stats.seasons[viewSeasonKey]`.
 */
function statsPayloadForSeasonView(
  raw: unknown,
  viewSeasonKey: string,
  dataSeasonKey: string,
): unknown {
  if (viewSeasonKey === "__current__" || viewSeasonKey === dataSeasonKey) {
    return stripSeasonsFromStatsPayload(raw);
  }
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const s = raw as Record<string, unknown>;
  const seasons = s.seasons;
  if (seasons && typeof seasons === "object" && viewSeasonKey in seasons) {
    return (seasons as Record<string, unknown>)[viewSeasonKey];
  }
  return {};
}

/** Alle Saison-Slices für „Gesamt“ (Meisterschaft/Cup summiert); vermeidet Doppelzählung mit Top-Level. */
function collectSeasonStatShardsForTotals(
  raw: unknown,
  dataSeasonKey: string,
): unknown[] {
  if (!raw || typeof raw !== "object") {
    return [];
  }
  const s = raw as Record<string, unknown>;
  const seasons = s.seasons;
  const out: unknown[] = [];
  if (seasons && typeof seasons === "object") {
    for (const k of Object.keys(seasons as Record<string, unknown>)) {
      out.push((seasons as Record<string, unknown>)[k]);
    }
  }
  const hasCurrentInSeasons =
    seasons &&
    typeof seasons === "object" &&
    Object.prototype.hasOwnProperty.call(seasons, dataSeasonKey);
  if (!hasCurrentInSeasons) {
    out.push(stripSeasonsFromStatsPayload(raw));
  }
  return out;
}

export function compareSeasonKeysDesc(a: string, b: string): number {
  const y = (s: string) => {
    const m = /^(\d{4})\/(\d{2})$/.exec(s.trim());
    return m ? Number.parseInt(m[1]!, 10) : 0;
  };
  return y(b) - y(a);
}

function collectSeasonKeysFromMemberships(
  playerMems: { stats: unknown }[],
  dataSeasonKey: string,
): string[] {
  const keys = new Set<string>();
  keys.add(dataSeasonKey);
  for (const m of playerMems) {
    const raw = m.stats;
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const seasons = (raw as Record<string, unknown>).seasons;
    if (seasons && typeof seasons === "object") {
      for (const k of Object.keys(seasons as Record<string, unknown>)) {
        keys.add(k);
      }
    }
  }
  return [...keys].sort(compareSeasonKeysDesc);
}

function aggregateStatsTablesForSeasonView(
  playerMems: { team_id: string; stats: unknown }[],
  teamById: Map<
    string,
    {
      name: string;
      meta: unknown;
    }
  >,
  viewSeasonKey: string,
  dataSeasonKey: string,
): ProfileStatsTables {
  const mCurr = { km: emptyKmResLine(), res: emptyKmResLine() };
  const cCurr = { km: emptyKmResLine(), res: emptyKmResLine() };
  const mTot = { km: emptyKmResLine(), res: emptyKmResLine() };
  const cTot = { km: emptyKmResLine(), res: emptyKmResLine() };

  for (const m of playerMems) {
    const t = teamById.get(m.team_id);
    const reserve = t ? isReserveTeam(t.meta, t.name) : false;
    const bucket = reserve ? "res" : "km";

    const viewRaw = statsPayloadForSeasonView(
      m.stats,
      viewSeasonKey,
      dataSeasonKey,
    );
    const { league, cup } = splitLeagueCup(viewRaw);
    const leagueLine = lineFromStats(league);
    const cupLine = lineFromStats(cup);
    mCurr[bucket] = addKmResLines(mCurr[bucket], leagueLine);
    cCurr[bucket] = addKmResLines(cCurr[bucket], cupLine);

    const shards = collectSeasonStatShardsForTotals(m.stats, dataSeasonKey);
    for (const shard of shards) {
      const { league: lg, cup: cp } = splitLeagueCup(shard);
      const ll = lineFromStats(lg);
      const cl = lineFromStats(cp);
      mTot.km = addKmResLines(mTot.km, reserve ? emptyKmResLine() : ll);
      mTot.res = addKmResLines(mTot.res, reserve ? ll : emptyKmResLine());
      cTot.km = addKmResLines(cTot.km, reserve ? emptyKmResLine() : cl);
      cTot.res = addKmResLines(cTot.res, reserve ? cl : emptyKmResLine());
    }
  }

  return {
    dataSeasonKey: dataSeasonKey,
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

function buildStatsTablesBySeason(
  playerMems: { team_id: string; stats: unknown }[],
  teamById: Map<string, { name: string; meta: unknown }>,
  dataSeasonKey: string,
): Record<string, ProfileStatsTables> {
  const keys = collectSeasonKeysFromMemberships(playerMems, dataSeasonKey);
  const out: Record<string, ProfileStatsTables> = {};
  for (const vk of keys) {
    out[vk] = aggregateStatsTablesForSeasonView(
      playerMems,
      teamById,
      vk,
      dataSeasonKey,
    );
  }
  return out;
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
  return aggregateStatsTablesForSeasonView(
    playerMems,
    teamById,
    "__current__",
    seasonKey,
  );
}

export type AktuelleStatsOverview = {
  seasonLabel: string;
  km: {
    verein_name: string;
    liga_label: string | null;
    line: ProfileKmResLine;
  };
  res: {
    verein_name: string;
    liga_label: string | null;
    line: ProfileKmResLine;
  } | null;
};

function buildAktuelleStatsOverview(
  playerMems: { team_id: string }[],
  teamById: Map<
    string,
    { name: string; meta: unknown; verein_id: string | null }
  >,
  vereinById: Map<string, string>,
  editionById: Map<string, EditionRow>,
  seasonLabel: string,
  meisterschaftCurrent: { km: ProfileKmResLine; res: ProfileKmResLine },
): AktuelleStatsOverview | null {
  if (playerMems.length === 0) {
    return null;
  }
  function header(
    wantReserve: boolean,
  ): { verein_name: string; liga_label: string | null } | null {
    for (const m of playerMems) {
      const t = teamById.get(m.team_id);
      if (!t) {
        continue;
      }
      if (isReserveTeam(t.meta, t.name) !== wantReserve) {
        continue;
      }
      const verein_name = t.verein_id
        ? vereinById.get(t.verein_id) ?? "—"
        : "—";
      const liga_label = ligaLabelFromTeamMeta(t.meta, editionById);
      return { verein_name, liga_label };
    }
    return null;
  }
  const kmH = header(false);
  const resH = header(true);
  const kmLine = meisterschaftCurrent.km;
  const resLine = meisterschaftCurrent.res;
  const hasResMembership = playerMems.some((m) => {
    const t = teamById.get(m.team_id);
    return t ? isReserveTeam(t.meta, t.name) : false;
  });

  return {
    seasonLabel,
    km: {
      verein_name: kmH?.verein_name ?? "—",
      liga_label: kmH?.liga_label ?? null,
      line: kmLine,
    },
    res:
      hasResMembership && resH != null
        ? {
            verein_name: resH.verein_name,
            liga_label: resH.liga_label,
            line: resLine,
          }
        : null,
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
  primary_team_id: string | null;
} {
  if (!meta || typeof meta !== "object") {
    return {
      height_cm: null,
      strong_foot: null,
      birth_year: null,
      profile_verified: false,
      primary_positions: [],
      secondary_positions: [],
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

  const profile_verified = Boolean(
    m.profile_verified ?? m.scoutbase_verified ?? m.verified_profile,
  );

  const primary_positions = parseStringListField(
    m.primary_positions ?? m.primary_position,
  );
  const secondary_positions = parseStringListField(
    m.secondary_positions ?? m.secondary_position,
  );

  const ptRaw = m.scoutbase_primary_team_id ?? m.primary_team_id;
  const primary_team_id =
    typeof ptRaw === "string" && ptRaw.trim() ? ptRaw.trim() : null;

  return {
    height_cm,
    strong_foot,
    birth_year,
    profile_verified,
    primary_positions,
    secondary_positions,
    primary_team_id,
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

/**
 * Die `count` Saisons direkt vor `dataSeasonKey` (neuere zuerst: z. B. bei 2025/26 und count=5
 * → 2024/25, 2023/24, …, 2020/21).
 */
export function pastSeasonLabelsBefore(
  dataSeasonKey: string,
  count: number,
): string[] {
  const m = /^(\d{4})\/(\d{2})$/.exec(dataSeasonKey.trim());
  if (!m) {
    return [];
  }
  const yStart = Number.parseInt(m[1], 10);
  const out: string[] = [];
  for (let k = 1; k <= count; k++) {
    const a = yStart - k;
    const b = (a + 1) % 100;
    out.push(`${a}/${String(b).padStart(2, "0")}`);
  }
  return out;
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
    meta: unknown;
  }>,
  dataSeasonKey: string,
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
    const { goals, appearances } = aggregateMembershipGoalsAndAppearances(
      m.stats,
      dataSeasonKey,
    );
    const avg =
      appearances > 0
        ? Math.round((goals / appearances) * 100) / 100
        : null;
    const joinedResolved = joinedOnFromMembership(m);
    rows.push({
      membership_id: m.id,
      team_id: team.id,
      team_name: team.name,
      verein_id: team.verein_id ?? "",
      verein_name,
      joined_on: joinedResolved,
      left_on: m.left_on != null && String(m.left_on).trim() !== ""
        ? String(m.left_on)
        : null,
      appearances,
      goals,
      avg_goals_per_game: avg,
      is_current: m.left_on == null,
    });
  }

  return sortClubHistoryRows(rows);
}

/**
 * Öffentliche ÖFB-Profil-URL: Meta → `personen.source_*` → `person_rollen`.
 */
async function resolveOefbSpielerProfileUrlForPlayer(
  supabase: SupabaseClient,
  personId: string,
  meta: unknown,
  sourceSystem: string | null,
  sourcePersonId: string | null,
): Promise<string | null> {
  const fromMeta = resolveOefbSpielerProfileUrlFromMeta(meta);
  if (fromMeta) {
    return fromMeta;
  }

  if (
    sourceSystem === "oefb" &&
    sourcePersonId != null &&
    /^\d+$/.test(String(sourcePersonId).trim())
  ) {
    return `https://www.oefb.at/Profile/Spieler/${String(sourcePersonId).trim()}`;
  }

  const { data: rollenRows } = await supabase
    .schema("core")
    .from("person_rollen")
    .select("source_role_id, primary_source_url")
    .eq("person_id", personId)
    .eq("source_system", "oefb")
    .eq("role_type", "spieler")
    .limit(10);

  for (const r of rollenRows ?? []) {
    const sid = r.source_role_id;
    if (typeof sid === "string" && /^\d+$/.test(sid.trim())) {
      return `https://www.oefb.at/Profile/Spieler/${sid.trim()}`;
    }
  }
  for (const r of rollenRows ?? []) {
    const u = r.primary_source_url;
    if (typeof u === "string" && u.trim()) {
      const x = resolveOefbSpielerProfileUrlFromStrings(u, null);
      if (x) {
        return x;
      }
    }
  }
  return null;
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
  /** Tab „Statistiken“: Meisterschaft/Cup, KM/Res; entspricht Import-Saison (`dataSeasonKey`) */
  statsTables: ProfileStatsTables;
  /** Schlüssel z. B. `"2024/25"` — aggregiert für Saison-Dropdown */
  statsTablesBySeason: Record<string, ProfileStatsTables>;
  /** Tab „Historie“: Vereins-/Mannschaftsstationen (sortiert: aktuell zuerst, sonst nach Enddatum) */
  clubHistory: ProfileClubHistoryRow[];
  /** Tab „Historie“: Vereinsliste wie auf der öffentlichen ÖFB-Spielerseite (ohne Tore/Einsätze). */
  oefbProfileVereine: OefbProfileVereinRow[] | null;
  /** Öffentliche Profil-URL, falls aus Meta ableitbar; für Quellen-Link. */
  oefbProfileUrl: string | null;
  /** Tab „Historie“: Wechsel aus Transfer-Import, falls vorhanden */
  transferHistory: ProfileTransferHistoryRow[];
  /** Übersicht: Meisterschaft KM vs. RES (zweite Tabelle nur bei Reserve-Mannschaft) */
  aktuelleStats: AktuelleStatsOverview | null;
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
        "id,display_name,vorname,nachname,geburtsdatum,foto_public_uid,nationalitaet,meta,source_system,source_person_id",
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

    const oefbProfileUrl = await resolveOefbSpielerProfileUrlForPlayer(
      supabase,
      personId,
      p.meta,
      p.source_system ?? null,
      p.source_person_id ?? null,
    );
    let oefbProfileVereine: OefbProfileVereinRow[] | null = null;
    if (oefbProfileUrl && process.env.SCOUTBASE_FETCH_OEFB_VEREINE !== "0") {
      oefbProfileVereine = await fetchOefbProfileVereine(oefbProfileUrl);
    }

    const { data: memsRaw, error: e2 } = await supabase
      .schema("core")
      .from("team_memberships")
      .select(
        "id,team_id,role_type,stats,joined_on,left_on,shirt_number,position_label,meta",
      )
      .eq("person_id", personId);

    if (e2) {
      return { data: null, error: new Error(e2.message) };
    }

    /** Nur Team-IDs aus den Memberships prüfen — nicht alle Zeilen aus `teams` laden (Performance). */
    const rawPlayerMems = (memsRaw ?? []).filter((m) => isPlayerRole(m.role_type));
    const uniqueTeamIds = [
      ...new Set(rawPlayerMems.map((m) => m.team_id).filter(Boolean)),
    ];
    let teamIdSet = new Set<string>();
    if (uniqueTeamIds.length > 0) {
      const { data: existingTeams } = await supabase
        .schema("core")
        .from("teams")
        .select("id")
        .in("id", uniqueTeamIds);
      teamIdSet = new Set((existingTeams ?? []).map((t) => t.id));
    }

    const allPlayerMemsFiltered = rawPlayerMems.filter((m) =>
      teamIdSet.has(m.team_id),
    );
    const playerMems = allPlayerMemsFiltered.filter((m) => m.left_on == null);

    const seasonKeyNow = currentSeasonLabel();
    if (playerMems.length > 0 && shouldApplyFictiveSeasonStats()) {
      mergeFictiveSeasonsIntoMembershipStats(playerMems, seasonKeyNow);
    }
    let statsTables = buildEmptyStatsTables(seasonKeyNow);
    let statsTablesBySeason: Record<string, ProfileStatsTables> = {};
    let aktuelleStats: AktuelleStatsOverview | null = null;
    let teamFullForPrimary: Map<
      string,
      { name: string; meta: unknown; verein_id: string | null }
    > | null = null;
    if (playerMems.length > 0) {
      const usedTeamIds = [...new Set(playerMems.map((m) => m.team_id))];
      const { data: trows } = await supabase
        .schema("core")
        .from("teams")
        .select("id,name,meta,verein_id")
        .in("id", usedTeamIds);

      const teamFull = new Map<
        string,
        { name: string; meta: unknown; verein_id: string | null }
      >();
      const editionIdSet = new Set<string>();
      const vereinIdSet = new Set<string>();

      for (const t of trows ?? []) {
        teamFull.set(t.id, {
          name: t.name,
          meta: t.meta,
          verein_id: t.verein_id ?? null,
        });
        if (t.verein_id) {
          vereinIdSet.add(t.verein_id);
        }
        for (const id of collectEditionIdsFromMeta(t.meta)) {
          editionIdSet.add(id);
        }
      }

      teamFullForPrimary = teamFull;

      const editionById = new Map<string, EditionRow>();
      const editionIds = [...editionIdSet];
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

      const vereinById = new Map<string, string>();
      if (vereinIdSet.size > 0) {
        const { data: vereine } = await supabase
          .schema("core")
          .from("vereine")
          .select("id,name")
          .in("id", [...vereinIdSet]);
        for (const v of vereine ?? []) {
          vereinById.set(v.id, v.name?.trim() || "—");
        }
      }

      const teamById = new Map<string, { name: string; meta: unknown }>();
      for (const [id, t] of teamFull) {
        teamById.set(id, { name: t.name, meta: t.meta });
      }
      statsTablesBySeason = buildStatsTablesBySeason(
        playerMems,
        teamById,
        seasonKeyNow,
      );
      for (const pk of pastSeasonLabelsBefore(seasonKeyNow, 5)) {
        if (!statsTablesBySeason[pk]) {
          statsTablesBySeason[pk] = aggregateStatsTablesForSeasonView(
            playerMems,
            teamById,
            pk,
            seasonKeyNow,
          );
        }
      }
      statsTables =
        statsTablesBySeason[seasonKeyNow] ?? buildEmptyStatsTables(seasonKeyNow);
      aktuelleStats = buildAktuelleStatsOverview(
        playerMems,
        teamFull,
        vereinById,
        editionById,
        seasonKeyNow,
        statsTables.meisterschaft.current,
      );
    }

    let totalGoals = 0;
    let totalApps = 0;
    let totalYellow = 0;
    let totalYr = 0;
    let totalRed = 0;

    for (const m of playerMems) {
      const shards = collectSeasonStatShardsForTotals(m.stats, seasonKeyNow);
      const toSum =
        shards.length > 0 ? shards : [stripSeasonsFromStatsPayload(m.stats)];
      for (const shard of toSum) {
        const st = parseMembershipStats(shard);
        totalGoals += st.goals;
        totalApps += st.appearances;
        totalYellow += st.yellow;
        totalYr += st.yellow_red;
        totalRed += st.red;
      }
    }

    const teamByIdForPrimary = new Map<string, { name: string; meta: unknown }>();
    if (teamFullForPrimary) {
      for (const [id, t] of teamFullForPrimary) {
        teamByIdForPrimary.set(id, { name: t.name, meta: t.meta });
      }
    }

    let primaryTeamId: string | null = null;
    if (playerMems.length > 0) {
      primaryTeamId = pickPrimaryTeamId(
        playerMems,
        teamByIdForPrimary,
        metaMerged.primary_team_id,
      );
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

        const tpLiga = await tabellenplatzFromVereinLigaTabelle(
          supabase,
          team.id,
          verein?.id ?? team.verein_id,
          team.name,
          team.meta,
        );
        tabellenplatz = tpLiga.rank;
        teamsInLeagueForRating = tpLiga.teamsInLeague;

        if (tabellenplatz == null && editionIds.length > 0) {
          const ctx = await fetchTeamTableRankContext(
            supabase,
            team.id,
            editionIds,
            team.name,
          );
          tabellenplatz = ctx.rank;
          if (teamsInLeagueForRating == null) {
            teamsInLeagueForRating = ctx.teamsInLeague;
          }
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
        const st = pm
          ? parseMembershipStats(
              statsPayloadForSeasonView(
                pm.stats,
                "__current__",
                seasonKeyNow,
              ),
            )
          : parseMembershipStats({});

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
          joined_on:
            pm != null
              ? joinedOnFromMembership({
                  joined_on: pm.joined_on,
                  meta: pm.meta,
                })
              : null,
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
      seasonKeyNow,
    );
    const transferHistory = await loadTransferHistory(supabase, personId);

    if (Object.keys(statsTablesBySeason).length === 0) {
      statsTablesBySeason = { [seasonKeyNow]: statsTables };
    }

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
          const shards = collectSeasonStatShardsForTotals(m.stats, seasonKeyNow);
          const toSum =
            shards.length > 0 ? shards : [stripSeasonsFromStatsPayload(m.stats)];
          for (const shard of toSum) {
            const st = parseMembershipStats(shard);
            sumGoals += st.goals;
            sumMinutes += minutesTotalForRating(st);
          }
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
          foto_public_uid: resolvePersonFotoPublicUid(
            p.foto_public_uid,
            p.meta,
          ),
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
        statsTablesBySeason,
        clubHistory,
        oefbProfileVereine,
        oefbProfileUrl,
        transferHistory,
        aktuelleStats,
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
