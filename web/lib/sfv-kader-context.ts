import type { SupabaseClient } from "@supabase/supabase-js";

import { buildOefbPlayerPhotoUrl } from "@/lib/oefb-assets";
import { isPlayerRole, teamDisplayLabelForDashboard } from "@/lib/sfv-data";

const TEAM_CHUNK = 55;
/** `.in("id", …)` pro Query — nicht alle Teams laden, wenn nur SFV-IDs erlaubt sind. */
const TEAM_QUERY_CHUNK = 200;

type MembershipRow = {
  person_id: string | null;
  team_id: string;
  role_type: string;
  stats: {
    goals?: number | null;
    appearances?: number | null;
    yellow_cards?: number | null;
    yellow_red_cards?: number | null;
    red_cards?: number | null;
  } | null;
};

function num(v: unknown): number {
  if (v == null) {
    return 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function cardTotalFromStats(s: MembershipRow["stats"]): number {
  if (!s) {
    return 0;
  }
  return (
    num(s.yellow_cards) +
    num(s.yellow_red_cards) +
    num(s.red_cards)
  );
}

export type SfvKaderContext = {
  personGoals: Map<string, number>;
  personApps: Map<string, number>;
  personCards: Map<string, number>;
  teamGoals: Map<string, number>;
  teamMeta: Map<
    string,
    { vereinId: string | null; name: string; meta: unknown }
  >;
  vereinName: Map<string, string>;
  /** Vereinswappen (ÖFB-CDN), Schlüssel Vereins-ID */
  vereinLogoUrl: Map<string, string | null>;
  /** Gewählte Mannschaft für Subtitle / Primärzuordnung (z. B. meiste Tore). */
  personPrimaryTeamId: Map<string, string>;
  subtitleForPerson: (personId: string) => string;
};

export type BuildSfvKaderContextOptions = {
  /**
   * Nur diese Mannschafts-IDs (z. B. SFV / Region Salzburg).
   * `null`: alle Mannschaften. Leeres Set: keine (leere Aggregation).
   */
  teamIdsAllowed?: Set<string> | null;
};

/**
 * Liest alle aktiven Spieler-Kader in importierten Teams und aggregiert Statistiken.
 */
export async function buildSfvKaderContext(
  supabase: SupabaseClient,
  options?: BuildSfvKaderContextOptions,
): Promise<SfvKaderContext> {
  const allow = options?.teamIdsAllowed;
  let teams: Array<{
    id: string;
    verein_id: string | null;
    name: string;
    meta: unknown;
  }> = [];

  if (allow != null) {
    if (allow.size === 0) {
      teams = [];
    } else {
      const ids = [...allow];
      for (let i = 0; i < ids.length; i += TEAM_QUERY_CHUNK) {
        const chunk = ids.slice(i, i + TEAM_QUERY_CHUNK);
        const { data: teamRows, error: eTeams } = await supabase
          .schema("core")
          .from("teams")
          .select("id,verein_id,name,meta")
          .in("id", chunk);
        if (eTeams) {
          throw new Error(eTeams.message);
        }
        teams.push(...(teamRows ?? []));
      }
    }
  } else {
    const { data: teamRows, error: eTeams } = await supabase
      .schema("core")
      .from("teams")
      .select("id,verein_id,name,meta");

    if (eTeams) {
      throw new Error(eTeams.message);
    }
    teams = teamRows ?? [];
  }
  const teamIds = teams.map((t) => t.id);
  const teamMeta = new Map(
    teams.map((t) => [
      t.id,
      { vereinId: t.verein_id, name: t.name, meta: t.meta },
    ]),
  );

  const personGoals = new Map<string, number>();
  const personApps = new Map<string, number>();
  const personCards = new Map<string, number>();
  const personPrimaryTeamId = new Map<string, string>();
  const teamGoals = new Map<string, number>();
  const goalsByPersonTeam = new Map<string, Map<string, number>>();

  for (let i = 0; i < teamIds.length; i += TEAM_CHUNK) {
    const chunk = teamIds.slice(i, i + TEAM_CHUNK);
    const { data: mems, error: eM } = await supabase
      .schema("core")
      .from("team_memberships")
      .select("person_id,team_id,role_type,stats")
      .in("team_id", chunk)
      .is("left_on", null);

    if (eM) {
      throw new Error(eM.message);
    }

    for (const raw of mems ?? []) {
      const m = raw as MembershipRow;
      if (!isPlayerRole(m.role_type) || !m.person_id) {
        continue;
      }
      const g = num(m.stats?.goals);
      const a = num(m.stats?.appearances);
      const c = cardTotalFromStats(m.stats);

      const pid = m.person_id;
      personGoals.set(pid, (personGoals.get(pid) ?? 0) + g);
      personApps.set(pid, (personApps.get(pid) ?? 0) + a);
      personCards.set(pid, (personCards.get(pid) ?? 0) + c);
      teamGoals.set(m.team_id, (teamGoals.get(m.team_id) ?? 0) + g);

      if (g > 0) {
        let inner = goalsByPersonTeam.get(pid);
        if (!inner) {
          inner = new Map();
          goalsByPersonTeam.set(pid, inner);
        }
        inner.set(m.team_id, (inner.get(m.team_id) ?? 0) + g);
      }
      if (!personPrimaryTeamId.has(pid)) {
        personPrimaryTeamId.set(pid, m.team_id);
      }
    }
  }

  for (const [pid, inner] of goalsByPersonTeam) {
    let bestT = "";
    let bestG = -1;
    for (const [tid, g] of inner) {
      if (g > bestG) {
        bestG = g;
        bestT = tid;
      }
    }
    if (bestT) {
      personPrimaryTeamId.set(pid, bestT);
    }
  }

  const vereinIds = [
    ...new Set(teams.map((t) => t.verein_id).filter(Boolean)),
  ] as string[];

  const vereinName = new Map<string, string>();
  const vereinLogoUrl = new Map<string, string | null>();
  if (vereinIds.length > 0) {
    const { data: vrows } = await supabase
      .schema("core")
      .from("vereine")
      .select("id,name,logo_public_uid")
      .in("id", vereinIds);
    for (const v of vrows ?? []) {
      vereinName.set(v.id, v.name);
      vereinLogoUrl.set(
        v.id,
        buildOefbPlayerPhotoUrl(v.logo_public_uid, "100x100"),
      );
    }
  }

  function subtitleForPerson(personId: string): string {
    const tid = personPrimaryTeamId.get(personId);
    if (!tid) {
      return "—";
    }
    const tm = teamMeta.get(tid);
    if (!tm) {
      return "—";
    }
    const vName = tm.vereinId
      ? (vereinName.get(tm.vereinId) ?? "Verein")
      : "Verein";
    return `${vName} · ${teamDisplayLabelForDashboard(tm.name, tm.meta)}`;
  }

  return {
    personGoals,
    personApps,
    personCards,
    teamGoals,
    teamMeta,
    vereinName,
    vereinLogoUrl,
    personPrimaryTeamId,
    subtitleForPerson,
  };
}
