import type { SupabaseClient } from "@supabase/supabase-js";

import { buildVereinePersonPhotoUrl } from "@/lib/oefb-assets";

import { scoutbaseRating99 } from "./player-rating";
import { buildSfvKaderContext } from "./sfv-kader-context";
import { fetchSfvBewerbEditionen } from "./sfv-data";

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
  topRating: DashboardRankRow[];
  formTeams: DashboardRankRow[];
  mostCards: DashboardRankRow[];
  mostTeamGoals: DashboardRankRow[];
  mostConceded: DashboardRankRow[];
};

const SALZBURG_SLUG = "salzburg";
const ALLE_SLUG = "alle";

function num(v: unknown): number {
  if (v == null) {
    return 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function isDashboardDataRegion(region: string | null | undefined): boolean {
  const r = (region ?? SALZBURG_SLUG).toLowerCase();
  return r === ALLE_SLUG || r === SALZBURG_SLUG;
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

async function loadMembershipAgg(supabase: SupabaseClient) {
  const {
    personGoals,
    personApps,
    personCards,
    teamGoals,
    teamMeta,
    vereinName,
    subtitleForPerson,
  } = await buildSfvKaderContext(supabase);

  const topByGoals = [...personGoals.entries()]
    .filter(([, g]) => g > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const ratingCandidates = [...personGoals.entries()]
    .map(([pid, g]) => {
      const apps = personApps.get(pid) ?? 0;
      const q = apps >= 3 ? g / apps : 0;
      return { pid, g, apps, q };
    })
    .filter((x) => x.apps >= 3 && x.g > 0)
    .sort((a, b) => b.q - a.q)
    .slice(0, 5);

  const topCards = [...personCards.entries()]
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
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
    const { data: personRows } = await supabase
      .schema("core")
      .from("personen")
      .select("id,display_name,vorname,nachname,foto_public_uid")
      .in("id", needed);

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
    valueLabel: String(
      scoutbaseRating99({
        ligaLabel: null,
        minutesTotal: x.apps * 90,
        goals: x.g,
        age: null,
        tablePosition: null,
        teamsInLeague: null,
      }),
    ),
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
    .slice(0, 5)
    .map(([tid, g]) => {
      const tm = teamMeta.get(tid);
      const vName = tm?.vereinId
        ? (vereinName.get(tm.vereinId) ?? "Verein")
        : "Verein";
      const league = "Kader-Tore (Summe)";
      return {
        id: tid,
        name: tm?.name ?? "Team",
        subtitle: `${vName} · ${league}`,
        valueLabel: `${g} Tore`,
        href: tm?.vereinId
          ? `/vereine/${encodeURIComponent(tm.vereinId)}`
          : null,
      };
    });

  return {
    topScorers: toRows(topScorersList),
    topRating: toRows(topRatingList),
    mostCards: toRows(topCardsList),
    mostTeamGoals: toRows(topTeamGoals),
  };
}

async function loadConcededFromTables(supabase: SupabaseClient): Promise<DashboardRankRow[]> {
  const editionResult = await fetchSfvBewerbEditionen(supabase);
  if (editionResult.error || !editionResult.data?.length) {
    return [];
  }

  const editionIds = editionResult.data.map((e) => e.id);
  const { data: snaps } = await supabase
    .schema("core")
    .from("tabellen_snapshots")
    .select("id,bewerb_edition_id,captured_at")
    .in("bewerb_edition_id", editionIds)
    .order("captured_at", { ascending: false });

  const firstSnapByEdition = new Map<string, string>();
  for (const s of snaps ?? []) {
    if (!firstSnapByEdition.has(s.bewerb_edition_id)) {
      firstSnapByEdition.set(s.bewerb_edition_id, s.id);
    }
  }

  const snapshotIds = [...firstSnapByEdition.values()];
  if (snapshotIds.length === 0) {
    return [];
  }

  const { data: rows } = await supabase
    .schema("core")
    .from("tabellen_snapshot_rows")
    .select("team_id,team_name,goals_against")
    .in("snapshot_id", snapshotIds)
    .not("goals_against", "is", null);

  const byTeam = new Map<string, { name: string; against: number }>();
  for (const r of rows ?? []) {
    if (!r.team_id) {
      continue;
    }
    const g = num(r.goals_against);
    const prev = byTeam.get(r.team_id);
    if (!prev || g > prev.against) {
      byTeam.set(r.team_id, { name: r.team_name, against: g });
    }
  }

  const sorted = [...byTeam.entries()]
    .sort((a, b) => b[1].against - a[1].against)
    .slice(0, 5);

  const { data: teams } = await supabase
    .schema("core")
    .from("teams")
    .select("id,verein_id")
    .in(
      "id",
      sorted.map(([tid]) => tid),
    );

  const teamToVerein = new Map((teams ?? []).map((t) => [t.id, t.verein_id]));

  return sorted.map(([tid, o], i) => ({
    rank: i + 1,
    name: o.name,
    subtitle: "Ligatabelle (Snapshot)",
    valueLabel: `${o.against} Gegentore`,
    href: teamToVerein.get(tid)
      ? `/vereine/${encodeURIComponent(teamToVerein.get(tid)!)}`
      : null,
  }));
}

async function loadFormTeams(supabase: SupabaseClient): Promise<DashboardRankRow[]> {
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

  const scored = [...formStr.entries()]
    .filter(([, s]) => s.length >= 3)
    .map(([tid, s]) => {
      const w = (s.match(/W/g) ?? []).length;
      return { tid, s, w };
    })
    .sort((a, b) => b.w - a.w || b.s.length - a.s.length)
    .slice(0, 5);

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
  if (vids.length) {
    const { data: vr } = await supabase
      .schema("core")
      .from("vereine")
      .select("id,name")
      .in("id", vids);
    for (const v of vr ?? []) {
      vname.set(v.id, v.name);
    }
  }

  return scored.map((x, i) => {
    const t = tmap.get(x.tid);
    const vn = t?.verein_id ? (vname.get(t.verein_id) ?? "") : "";
    return {
      rank: i + 1,
      name: t?.name ?? "Team",
      subtitle: vn ? `${vn} · Form (letzte Spiele)` : "Form",
      valueLabel: x.s,
      href: t?.verein_id
        ? `/vereine/${encodeURIComponent(t.verein_id)}`
        : null,
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
    topRating: [],
    formTeams: [],
    mostCards: [],
    mostTeamGoals: [],
    mostConceded: [],
  };

  if (!regionSupported) {
    return empty;
  }

  try {
    const agg = await loadMembershipAgg(supabase);
    const [formTeams, mostConceded] = await Promise.all([
      loadFormTeams(supabase),
      loadConcededFromTables(supabase),
    ]);

    return {
      regionSupported: true,
      regionNote:
        slug === ALLE_SLUG
          ? "Datenbasis: importierte Vereine und Bewerbe (Schwerpunkt Salzburg / SFV)."
          : null,
      topScorers: agg.topScorers,
      topRating: agg.topRating,
      formTeams,
      mostCards: agg.mostCards,
      mostTeamGoals: agg.mostTeamGoals,
      mostConceded,
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
