import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildOefbPlayerPhotoUrl,
  buildVereinePersonPhotoUrl,
} from "@/lib/oefb-assets";

import { scoutbaseRating99 } from "./player-rating";
import {
  fetchVereinLigaTabelle,
  normVereinTeamName,
  teamDisplayLabelForDashboard,
  teamIsReserve,
  type VereinLigaTabelleData,
  type VereinLigaTabelleRow,
} from "./sfv-data";
import {
  buildSfvKaderContext,
  type SfvKaderContext,
} from "./sfv-kader-context";
import { SFV_VERBAND_ROW_ID } from "./sfv";

export type DashboardRankRow = {
  rank: number;
  name: string;
  subtitle: string;
  valueLabel: string;
  href: string | null;
  /** ÖFB-CDN, gleicher Bestand wie auf SFV/Vereinsseiten */
  photoUrl?: string | null;
};

export type HomeDashboard = {
  regionSupported: boolean;
  regionNote: string | null;
  topScorers: DashboardRankRow[];
  topScorersAll: DashboardRankRow[];
  topRating: DashboardRankRow[];
  topRatingAll: DashboardRankRow[];
  formTeams: DashboardRankRow[];
  formTeamsAll: DashboardRankRow[];
  mostCards: DashboardRankRow[];
  mostCardsAll: DashboardRankRow[];
  mostTeamGoals: DashboardRankRow[];
  mostTeamGoalsAll: DashboardRankRow[];
  mostConceded: DashboardRankRow[];
  mostConcededAll: DashboardRankRow[];
};

const SALZBURG_SLUG = "salzburg";
const ALLE_SLUG = "alle";

/** PostgREST-URL wird bei zu vielen `.in()`-Werten zu lang; gleiches Muster wie sfv-player-directory */
const PERSONEN_IN_CHUNK = 400;
const SNAPSHOT_PAGE = 1000;
const SNAPSHOT_ROWS_IN_CHUNK = 400;

function num(v: unknown): number {
  if (v == null) {
    return 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Gegentore aus Tabellenzeile: Spalte oder GF − Tordifferenz (Tordiff. = GF − GA). */
function goalsAgainstFromSnapshotRow(r: {
  goals_against: unknown;
  goals_for: unknown;
  goal_difference: unknown;
}): number | null {
  if (r.goals_against != null) {
    const g = num(r.goals_against);
    return g >= 0 ? g : null;
  }
  if (r.goals_for != null && r.goal_difference != null) {
    const derived = num(r.goals_for) - num(r.goal_difference);
    return derived >= 0 ? derived : null;
  }
  return null;
}

export function isDashboardDataRegion(region: string | null | undefined): boolean {
  const r = (region ?? SALZBURG_SLUG).toLowerCase();
  return r === ALLE_SLUG || r === SALZBURG_SLUG;
}

/** Mannschaften von Vereinen im Salzburger Fußballverband (Bundesland Salzburg). */
async function fetchSfvTeamIdSet(
  supabase: SupabaseClient,
): Promise<Set<string>> {
  const { data: vereine } = await supabase
    .schema("core")
    .from("vereine")
    .select("id")
    .eq("verband_id", SFV_VERBAND_ROW_ID);

  const vids = [...new Set((vereine ?? []).map((v) => v.id))];
  const out = new Set<string>();
  if (vids.length === 0) {
    return out;
  }
  for (let i = 0; i < vids.length; i += PERSONEN_IN_CHUNK) {
    const chunk = vids.slice(i, i + PERSONEN_IN_CHUNK);
    const { data: teams } = await supabase
      .schema("core")
      .from("teams")
      .select("id")
      .in("verein_id", chunk);
    for (const t of teams ?? []) {
      out.add(t.id);
    }
  }
  return out;
}

function toRows(
  entries: {
    id: string;
    name: string;
    subtitle: string;
    valueLabel: string;
    href: string | null;
    photoUrl?: string | null;
  }[],
): DashboardRankRow[] {
  return entries.map((e, i) => ({
    rank: i + 1,
    name: e.name,
    subtitle: e.subtitle,
    valueLabel: e.valueLabel,
    href: e.href,
    photoUrl: e.photoUrl ?? null,
  }));
}

async function loadMembershipAgg(
  supabase: SupabaseClient,
  teamIdsAllowed: Set<string> | null,
): Promise<{
  topScorers: DashboardRankRow[];
  topScorersAll: DashboardRankRow[];
  topRating: DashboardRankRow[];
  topRatingAll: DashboardRankRow[];
  mostCards: DashboardRankRow[];
  mostCardsAll: DashboardRankRow[];
  mostTeamGoals: DashboardRankRow[];
  mostTeamGoalsAll: DashboardRankRow[];
  kaderContext: SfvKaderContext;
}> {
  const ctx = await buildSfvKaderContext(supabase, {
    teamIdsAllowed,
  });
  const {
    personGoals,
    personApps,
    personCards,
    teamGoals,
    teamMeta,
    vereinName,
    vereinLogoUrl,
    subtitleForPerson,
  } = ctx;

  const topByGoals = [...personGoals.entries()]
    .filter(([, g]) => g > 0)
    .sort((a, b) => b[1] - a[1]);

  const ratingCandidates = [...personGoals.entries()]
    .map(([pid, g]) => {
      const apps = personApps.get(pid) ?? 0;
      const rating = scoutbaseRating99({
        ligaLabel: null,
        minutesTotal: apps * 90,
        goals: g,
        age: null,
        tablePosition: null,
        teamsInLeague: null,
      });
      return { pid, g, apps, rating };
    })
    .filter((x) => x.apps >= 3 && x.g > 0)
    .sort((a, b) => b.rating - a.rating);

  const topCards = [...personCards.entries()]
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([pid, c]) => ({ pid, c }));

  const personIdsNeeded = new Set<string>();
  for (const [pid] of topByGoals) {
    personIdsNeeded.add(pid);
  }
  for (const x of ratingCandidates) {
    personIdsNeeded.add(x.pid);
  }
  for (const { pid } of topCards) {
    personIdsNeeded.add(pid);
  }

  const personName = new Map<string, string>();
  const needed = [...personIdsNeeded];
  const personPhotoUrl = new Map<string, string | null>();

  if (needed.length > 0) {
    for (let i = 0; i < needed.length; i += PERSONEN_IN_CHUNK) {
      const chunk = needed.slice(i, i + PERSONEN_IN_CHUNK);
      const { data: personRows } = await supabase
        .schema("core")
        .from("personen")
        .select("id,display_name,vorname,nachname,foto_public_uid")
        .in("id", chunk);

      for (const p of personRows ?? []) {
        const label =
          p.display_name ||
          [p.vorname, p.nachname].filter(Boolean).join(" ") ||
          "Unbekannt";
        personName.set(p.id, label);
        personPhotoUrl.set(
          p.id,
          buildVereinePersonPhotoUrl(p.foto_public_uid, "100x100"),
        );
      }
    }
  }

  const topScorersList = topByGoals.map(([pid, g]) => ({
    id: pid,
    name: personName.get(pid) ?? "—",
    subtitle: subtitleForPerson(pid),
    valueLabel: `${g} Tore`,
    href: `/spieler/${encodeURIComponent(pid)}`,
    photoUrl: personPhotoUrl.get(pid) ?? null,
  }));

  const topRatingList = ratingCandidates.map((x) => ({
    id: x.pid,
    name: personName.get(x.pid) ?? "—",
    subtitle: subtitleForPerson(x.pid),
    valueLabel: String(x.rating),
    href: `/spieler/${encodeURIComponent(x.pid)}`,
    photoUrl: personPhotoUrl.get(x.pid) ?? null,
  }));

  const topCardsList = topCards.map(({ pid, c }) => ({
    id: pid,
    name: personName.get(pid) ?? "—",
    subtitle: subtitleForPerson(pid),
    valueLabel: `${c} Karten`,
    href: `/spieler/${encodeURIComponent(pid)}`,
    photoUrl: personPhotoUrl.get(pid) ?? null,
  }));

  const topTeamGoals = [...teamGoals.entries()]
    .filter(([, g]) => g > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([tid, g]) => {
      const tm = teamMeta.get(tid);
      const vName = tm?.vereinId
        ? (vereinName.get(tm.vereinId) ?? "Verein")
        : "Verein";
      const league = "Kader-Tore (Summe)";
      return {
        id: tid,
        name: teamDisplayLabelForDashboard(
          tm?.name ?? "Team",
          tm?.meta ?? null,
        ),
        subtitle: `${vName} · ${league}`,
        valueLabel: `${g} Tore`,
        href: tm?.vereinId
          ? `/vereine/${encodeURIComponent(tm.vereinId)}`
          : null,
        photoUrl:
          tm?.vereinId != null
            ? (vereinLogoUrl.get(tm.vereinId) ?? null)
            : null,
      };
    });

  const topScorersRows = toRows(topScorersList);
  const topRatingRows = toRows(topRatingList);
  const mostCardsRows = toRows(topCardsList);
  const mostTeamGoalsRows = toRows(topTeamGoals);

  return {
    topScorers: topScorersRows.slice(0, 5),
    topScorersAll: topScorersRows,
    topRating: topRatingRows.slice(0, 5),
    topRatingAll: topRatingRows,
    mostCards: mostCardsRows.slice(0, 5),
    mostCardsAll: mostCardsRows,
    mostTeamGoals: mostTeamGoalsRows.slice(0, 5),
    mostTeamGoalsAll: mostTeamGoalsRows,
    kaderContext: ctx,
  };
}

/**
 * Gleiche Darstellung wie „Meiste Tore“, wenn `team_id` bekannt ist.
 * Ohne Team-Zeile in `teamMeta` (nur Tabellenname): erster Teil der Unterzeile = Mannschaftsname.
 */
function concededRowFromKader(
  ctx: SfvKaderContext,
  tid: string | null,
  against: number,
  snapshotTeamName: string | null,
  subtitleLine: string,
  rank: number,
): DashboardRankRow {
  const tm = tid ? ctx.teamMeta.get(tid) : undefined;
  const vName = tm?.vereinId
    ? (ctx.vereinName.get(tm.vereinId) ?? "Verein")
    : (snapshotTeamName?.trim() || "Team");
  const name = tm?.name ?? snapshotTeamName ?? "Team";
  const vid = tm?.vereinId ?? null;
  return {
    rank,
    name,
    subtitle: `${vName} · ${subtitleLine}`,
    valueLabel: `${against} Gegentore`,
    href: vid ? `/vereine/${encodeURIComponent(vid)}` : null,
    photoUrl: vid ? (ctx.vereinLogoUrl.get(vid) ?? null) : null,
  };
}

async function fetchTeamsByIds(
  supabase: SupabaseClient,
  ids: string[],
): Promise<
  { id: string; verein_id: string | null; name: string; meta: unknown }[]
> {
  const out: {
    id: string;
    verein_id: string | null;
    name: string;
    meta: unknown;
  }[] = [];
  for (let i = 0; i < ids.length; i += PERSONEN_IN_CHUNK) {
    const chunk = ids.slice(i, i + PERSONEN_IN_CHUNK);
    const { data } = await supabase
      .schema("core")
      .from("teams")
      .select("id,verein_id,name,meta")
      .in("id", chunk);
    out.push(...(data ?? []));
  }
  return out;
}

function findLigaRowForTeam(
  table: VereinLigaTabelleData | null,
  teamId: string,
  teamName: string,
): VereinLigaTabelleRow | undefined {
  if (!table?.rows?.length) {
    return undefined;
  }
  const byId = table.rows.find((r) => r.team_id === teamId);
  if (byId) {
    return byId;
  }
  const n = normVereinTeamName(teamName);
  return table.rows.find((r) => normVereinTeamName(r.team_name) === n);
}

/** Gleiche Zahl wie Spalte GGT. in „Verein → Tabelle / Ergebnisse“. */
function goalsAgainstFromLigaRow(r: VereinLigaTabelleRow): number | null {
  if (r.goals_against != null) {
    const g = num(r.goals_against);
    return g >= 0 ? g : null;
  }
  if (r.goals_for != null && r.goal_difference != null) {
    const derived = num(r.goals_for) - num(r.goal_difference);
    return derived >= 0 ? derived : null;
  }
  return null;
}

const LIGA_TABELLE_FETCH_CONCURRENCY = 6;

/**
 * Gegentore exakt wie auf der Vereinsseite: `fetchVereinLigaTabelle` → Zeile der Mannschaft → GGT.
 */
async function loadMostConcededFromVereinLigaTabelle(
  supabase: SupabaseClient,
  ctx: SfvKaderContext,
  teamIdsAllowed: Set<string> | null,
): Promise<DashboardRankRow[]> {
  if (teamIdsAllowed == null || teamIdsAllowed.size === 0) {
    return [];
  }

  const teamIds = [...teamIdsAllowed];
  const teamRows = await fetchTeamsByIds(supabase, teamIds);
  const byTeamId = new Map(teamRows.map((t) => [t.id, t]));

  type Segment = "km" | "res";
  const seenPair = new Set<string>();
  const pairs: { vereinId: string; segment: Segment }[] = [];
  for (const t of teamRows) {
    if (!t.verein_id) {
      continue;
    }
    const segment: Segment = teamIsReserve(t.meta, t.name) ? "res" : "km";
    const pk = `${t.verein_id}:${segment}`;
    if (seenPair.has(pk)) {
      continue;
    }
    seenPair.add(pk);
    pairs.push({ vereinId: t.verein_id, segment });
  }

  const cache = new Map<string, VereinLigaTabelleData | null>();
  for (let i = 0; i < pairs.length; i += LIGA_TABELLE_FETCH_CONCURRENCY) {
    const chunk = pairs.slice(i, i + LIGA_TABELLE_FETCH_CONCURRENCY);
    const part = await Promise.all(
      chunk.map(async ({ vereinId, segment }) => {
        const { data, error } = await fetchVereinLigaTabelle(
          supabase,
          vereinId,
          segment,
        );
        if (error) {
          return { key: `${vereinId}:${segment}`, data: null as VereinLigaTabelleData | null };
        }
        return { key: `${vereinId}:${segment}`, data };
      }),
    );
    for (const { key, data } of part) {
      cache.set(key, data);
    }
  }

  const scored: { tid: string; ga: number; name: string }[] = [];
  for (const tid of teamIds) {
    const t = byTeamId.get(tid);
    if (!t?.verein_id) {
      continue;
    }
    const segment: Segment = teamIsReserve(t.meta, t.name) ? "res" : "km";
    const table = cache.get(`${t.verein_id}:${segment}`) ?? null;
    const row = findLigaRowForTeam(table, tid, t.name);
    if (!row) {
      continue;
    }
    const ga = goalsAgainstFromLigaRow(row);
    if (ga == null) {
      continue;
    }
    scored.push({ tid, ga, name: t.name });
  }

  scored.sort((a, b) => b.ga - a.ga);
  const subtitleLine = "Gegentore (Ligatabelle)";
  return scored.map((r, i) =>
    concededRowFromKader(ctx, r.tid, r.ga, r.name, subtitleLine, i + 1),
  );
}

/**
 * Fallback: `tabellen_snapshot_rows` über alle Editionen (nicht 1:1 Vereins-Liga).
 */
async function loadConcededFromTables(
  supabase: SupabaseClient,
  ctx: SfvKaderContext,
  teamIdsAllowed: Set<string> | null,
): Promise<DashboardRankRow[]> {
  const firstSnapByEdition = new Map<string, string>();
  let offset = 0;
  for (;;) {
    const { data: snaps, error } = await supabase
      .schema("core")
      .from("tabellen_snapshots")
      .select("id,bewerb_edition_id,captured_at")
      .order("captured_at", { ascending: false })
      .range(offset, offset + SNAPSHOT_PAGE - 1);

    if (error) {
      return [];
    }
    const page = snaps ?? [];
    if (page.length === 0) {
      break;
    }
    for (const s of page) {
      if (!s.bewerb_edition_id) {
        continue;
      }
      if (!firstSnapByEdition.has(s.bewerb_edition_id)) {
        firstSnapByEdition.set(s.bewerb_edition_id, s.id);
      }
    }
    if (page.length < SNAPSHOT_PAGE) {
      break;
    }
    offset += SNAPSHOT_PAGE;
  }

  const snapshotIds = [...firstSnapByEdition.values()];
  if (snapshotIds.length === 0) {
    return [];
  }

  const allRows: {
    team_id: string | null;
    team_name: string;
    goals_against: unknown;
    goals_for: unknown;
    goal_difference: unknown;
  }[] = [];

  for (let i = 0; i < snapshotIds.length; i += SNAPSHOT_ROWS_IN_CHUNK) {
    const chunk = snapshotIds.slice(i, i + SNAPSHOT_ROWS_IN_CHUNK);
    const { data: rows } = await supabase
      .schema("core")
      .from("tabellen_snapshot_rows")
      .select("team_id,team_name,goals_against,goals_for,goal_difference")
      .in("snapshot_id", chunk);
    allRows.push(...(rows ?? []));
  }

  /** Wie auf der Vereinsseite: `team_id` fehlt im Import oft — Abgleich über `team_name` */
  const nameNormToTeamId = new Map<string, string>();
  for (const [id, tm] of ctx.teamMeta) {
    const k = normVereinTeamName(tm.name);
    if (k && !nameNormToTeamId.has(k)) {
      nameNormToTeamId.set(k, id);
    }
  }

  function resolveTeamKey(r: {
    team_id: string | null;
    team_name: string;
  }): { tid: string | null; dedupeKey: string } {
    if (r.team_id) {
      return { tid: r.team_id, dedupeKey: r.team_id };
    }
    const n = normVereinTeamName(r.team_name);
    const matched = nameNormToTeamId.get(n);
    if (matched) {
      return { tid: matched, dedupeKey: matched };
    }
    return { tid: null, dedupeKey: `name:${n}` };
  }

  const byTeam = new Map<
    string,
    { tid: string | null; name: string; against: number }
  >();
  for (const r of allRows) {
    const g = goalsAgainstFromSnapshotRow(r);
    if (g == null) {
      continue;
    }
    const { tid, dedupeKey } = resolveTeamKey(r);
    const prev = byTeam.get(dedupeKey);
    if (!prev || g > prev.against) {
      byTeam.set(dedupeKey, {
        tid,
        name: r.team_name,
        against: g,
      });
    }
  }

  const sorted = [...byTeam.entries()].sort(
    (a, b) => b[1].against - a[1].against,
  );

  let ranked = sorted.map(([, o]) => o);
  if (teamIdsAllowed != null) {
    if (teamIdsAllowed.size === 0) {
      ranked = [];
    } else {
      ranked = ranked.filter(
        (o) => o.tid != null && teamIdsAllowed.has(o.tid),
      );
    }
  }

  if (ranked.length === 0) {
    return [];
  }

  const subtitleLine = "Gegentore (Ligatabelle)";
  return ranked.map((o, i) =>
    concededRowFromKader(ctx, o.tid, o.against, o.name, subtitleLine, i + 1),
  );
}

/**
 * Summe kassierter Tore pro Team aus Spielen mit Ergebnis (Heim: `away_goals`,
 * Auswärts: `home_goals`). Fallback, wenn Tabellen-Snapshots keine brauchbaren
 * Gegentore liefern. `finished` wird nicht zwingend vorausgesetzt (Import kann es
 * auslassen, solange Tore gesetzt sind).
 */
const SPIELE_PAGE = 1000;
/** `.or(home…in,away…in)` pro Chunk — URL-Länge; gleiches Spiel kann in zwei Chunks vorkommen → Dedupe per `id`. */
const SPIELE_TEAM_FILTER_CHUNK = 40;

type SpielRowConceded = {
  id: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_goals: unknown;
  away_goals: unknown;
  cancelled: boolean | null;
};

function addConcededFromSpieleRows(
  conceded: Map<string, number>,
  seenMatchIds: Set<string> | null,
  page: SpielRowConceded[],
): void {
  for (const m of page) {
    if (seenMatchIds) {
      if (seenMatchIds.has(m.id)) {
        continue;
      }
      seenMatchIds.add(m.id);
    }
    if (m.cancelled === true) {
      continue;
    }
    const hg = num(m.home_goals);
    const ag = num(m.away_goals);
    if (m.home_team_id) {
      const tid = m.home_team_id;
      conceded.set(tid, (conceded.get(tid) ?? 0) + ag);
    }
    if (m.away_team_id) {
      const tid = m.away_team_id;
      conceded.set(tid, (conceded.get(tid) ?? 0) + hg);
    }
  }
}

async function loadConcededFromSpiele(
  supabase: SupabaseClient,
  ctx: SfvKaderContext,
  teamIdsAllowed: Set<string> | null,
): Promise<DashboardRankRow[]> {
  const conceded = new Map<string, number>();
  const allow = teamIdsAllowed;

  if (allow != null && allow.size > 0) {
    const ids = [...allow];
    const seenMatchIds = new Set<string>();
    for (let c = 0; c < ids.length; c += SPIELE_TEAM_FILTER_CHUNK) {
      const chunk = ids.slice(c, c + SPIELE_TEAM_FILTER_CHUNK);
      const inList = chunk.join(",");
      const orFilter = `home_team_id.in.(${inList}),away_team_id.in.(${inList})`;
      let offset = 0;
      for (;;) {
        const { data: spiele, error } = await supabase
          .schema("core")
          .from("spiele")
          .select("id,home_team_id,away_team_id,home_goals,away_goals,cancelled")
          .eq("cancelled", false)
          .not("home_goals", "is", null)
          .not("away_goals", "is", null)
          .or(orFilter)
          .order("id", { ascending: true })
          .range(offset, offset + SPIELE_PAGE - 1);

        if (error) {
          return [];
        }
        const page = (spiele ?? []) as SpielRowConceded[];
        if (page.length === 0) {
          break;
        }
        addConcededFromSpieleRows(conceded, seenMatchIds, page);
        if (page.length < SPIELE_PAGE) {
          break;
        }
        offset += SPIELE_PAGE;
      }
    }
  } else {
    let offset = 0;
    for (;;) {
      const { data: spiele, error } = await supabase
        .schema("core")
        .from("spiele")
        .select(
          "id,home_team_id,away_team_id,home_goals,away_goals,cancelled",
        )
        .eq("cancelled", false)
        .not("home_goals", "is", null)
        .not("away_goals", "is", null)
        .order("id", { ascending: true })
        .range(offset, offset + SPIELE_PAGE - 1);

      if (error) {
        return [];
      }
      const page = (spiele ?? []) as SpielRowConceded[];
      if (page.length === 0) {
        break;
      }
      addConcededFromSpieleRows(conceded, null, page);
      if (page.length < SPIELE_PAGE) {
        break;
      }
      offset += SPIELE_PAGE;
    }
  }

  let sorted = [...conceded.entries()]
    .filter(([, ga]) => ga > 0)
    .sort((a, b) => b[1] - a[1]);

  if (teamIdsAllowed != null) {
    if (teamIdsAllowed.size === 0) {
      sorted = [];
    } else {
      sorted = sorted.filter(([tid]) => teamIdsAllowed.has(tid));
    }
  }

  if (sorted.length === 0) {
    return [];
  }

  const subtitleLine = "Gegentore (Summe aus Spielen)";
  return sorted.map(([tid, ga], i) =>
    concededRowFromKader(ctx, tid, ga, null, subtitleLine, i + 1),
  );
}

async function loadFormTeams(
  supabase: SupabaseClient,
  teamIdsAllowed: Set<string> | null,
): Promise<DashboardRankRow[]> {
  const { data: spiele, error } = await supabase
    .schema("core")
    .from("spiele")
    .select("home_team_id,away_team_id,home_goals,away_goals,finished,kickoff_at")
    .eq("finished", true)
    .not("home_goals", "is", null)
    .not("away_goals", "is", null)
    .order("kickoff_at", { ascending: false })
    .limit(400);

  if (error || !spiele?.length) {
    return [];
  }

  const teamIds = new Set<string>();
  for (const m of spiele) {
    if (m.home_team_id) {
      teamIds.add(m.home_team_id);
    }
    if (m.away_team_id) {
      teamIds.add(m.away_team_id);
    }
  }

  const formStr = new Map<string, string>();
  for (const tid of teamIds) {
    const letters: string[] = [];
    for (const m of spiele) {
      if (letters.length >= 5) {
        break;
      }
      let side: "home" | "away" | null = null;
      if (m.home_team_id === tid) {
        side = "home";
      } else if (m.away_team_id === tid) {
        side = "away";
      } else {
        continue;
      }
      const hg = num(m.home_goals);
      const ag = num(m.away_goals);
      if (side === "home") {
        if (hg > ag) {
          letters.push("W");
        } else if (hg < ag) {
          letters.push("L");
        } else {
          letters.push("D");
        }
      } else {
        if (ag > hg) {
          letters.push("W");
        } else if (ag < hg) {
          letters.push("L");
        } else {
          letters.push("D");
        }
      }
    }
    if (letters.length) {
      formStr.set(tid, letters.join(""));
    }
  }

  let scored = [...formStr.entries()]
    .filter(([, s]) => s.length >= 3)
    .map(([tid, s]) => {
      const w = (s.match(/W/g) ?? []).length;
      return { tid, s, w };
    })
    .sort((a, b) => b.w - a.w || b.s.length - a.s.length);

  if (teamIdsAllowed != null) {
    if (teamIdsAllowed.size === 0) {
      scored = [];
    } else {
      scored = scored.filter((x) => teamIdsAllowed.has(x.tid));
    }
  }

  if (scored.length === 0) {
    return [];
  }

  const { data: teamRows } = await supabase
    .schema("core")
    .from("teams")
    .select("id,name,verein_id")
    .in(
      "id",
      scored.map((x) => x.tid),
    );

  const tmap = new Map((teamRows ?? []).map((t) => [t.id, t]));
  const vids = [
    ...new Set(
      (teamRows ?? []).map((t) => t.verein_id).filter(Boolean),
    ),
  ] as string[];
  const vname = new Map<string, string>();
  const vlogo = new Map<string, string | null>();
  if (vids.length) {
    const { data: vr } = await supabase
      .schema("core")
      .from("vereine")
      .select("id,name,logo_public_uid")
      .in("id", vids);
    for (const v of vr ?? []) {
      vname.set(v.id, v.name);
      vlogo.set(v.id, buildOefbPlayerPhotoUrl(v.logo_public_uid, "100x100"));
    }
  }

  return scored.map((x, i) => {
    const t = tmap.get(x.tid);
    const vid = t?.verein_id;
    const vn = vid ? (vname.get(vid) ?? "") : "";
    return {
      rank: i + 1,
      name: t?.name ?? "Team",
      subtitle: vn ? `${vn} · Form (letzte Spiele)` : "Form",
      valueLabel: x.s,
      href: vid ? `/vereine/${encodeURIComponent(vid)}` : null,
      photoUrl: vid ? (vlogo.get(vid) ?? null) : null,
    };
  });
}

export async function fetchHomeDashboard(
  supabase: SupabaseClient,
  region: string | null | undefined,
): Promise<HomeDashboard> {
  const slug = (region ?? SALZBURG_SLUG).toLowerCase();
  const regionSupported = isDashboardDataRegion(slug);

  const empty: HomeDashboard = {
    regionSupported,
    regionNote: regionSupported
      ? null
      : "Für diese Region liegen in ScoutBase noch keine Daten vor. Wähle „Salzburg“ oder „Alle“ (Datenbasis SFV).",
    topScorers: [],
    topScorersAll: [],
    topRating: [],
    topRatingAll: [],
    formTeams: [],
    formTeamsAll: [],
    mostCards: [],
    mostCardsAll: [],
    mostTeamGoals: [],
    mostTeamGoalsAll: [],
    mostConceded: [],
    mostConcededAll: [],
  };

  if (!regionSupported) {
    return empty;
  }

  try {
    const teamIdsAllowed =
      slug === ALLE_SLUG ? null : await fetchSfvTeamIdSet(supabase);

    const [agg, formTeams] = await Promise.all([
      loadMembershipAgg(supabase, teamIdsAllowed),
      loadFormTeams(supabase, teamIdsAllowed),
    ]);
    const ctx = agg.kaderContext;

    let mostConceded: DashboardRankRow[] = [];
    if (teamIdsAllowed != null && teamIdsAllowed.size > 0) {
      mostConceded = await loadMostConcededFromVereinLigaTabelle(
        supabase,
        ctx,
        teamIdsAllowed,
      );
    }
    if (mostConceded.length === 0) {
      mostConceded = await loadConcededFromTables(
        supabase,
        ctx,
        teamIdsAllowed,
      );
    }
    if (mostConceded.length === 0) {
      mostConceded = await loadConcededFromSpiele(
        supabase,
        ctx,
        teamIdsAllowed,
      );
    }

    return {
      regionSupported: true,
      regionNote:
        slug === ALLE_SLUG
          ? "Datenbasis: importierte Vereine und Bewerbe (Schwerpunkt Salzburg / SFV)."
          : "Ranglisten: nur Mannschaften des Salzburger Fußballverbands (SFV, Bundesland Salzburg).",
      topScorers: agg.topScorers,
      topScorersAll: agg.topScorersAll,
      topRating: agg.topRating,
      topRatingAll: agg.topRatingAll,
      formTeams: formTeams.slice(0, 5),
      formTeamsAll: formTeams,
      mostCards: agg.mostCards,
      mostCardsAll: agg.mostCardsAll,
      mostTeamGoals: agg.mostTeamGoals,
      mostTeamGoalsAll: agg.mostTeamGoalsAll,
      mostConceded: mostConceded.slice(0, 5),
      mostConcededAll: mostConceded,
    };
  } catch {
    return {
      ...empty,
      regionSupported: true,
      regionNote:
        "Ranglisten konnten nicht geladen werden. Bitte später erneut versuchen.",
    };
  }
}
