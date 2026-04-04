import type { SupabaseClient } from "@supabase/supabase-js";

function normTeamName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Tabellenplatz und Teilnehmerzahl aus dem neuesten Tabellen-Snapshot
 * zu einer der angegebenen Bewerb-Editionen.
 * `teamName`: Fallback, wenn `team_id` in der Snapshot-Zeile fehlt (Import).
 */
export async function fetchTeamTableRankContext(
  supabase: SupabaseClient,
  teamId: string,
  editionIds: string[],
  teamName?: string | null,
): Promise<{ rank: number | null; teamsInLeague: number | null }> {
  if (!editionIds.length) {
    return { rank: null, teamsInLeague: null };
  }

  const { data: snap, error: e1 } = await supabase
    .schema("core")
    .from("tabellen_snapshots")
    .select("id")
    .in("bewerb_edition_id", editionIds)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (e1 || !snap?.id) {
    return { rank: null, teamsInLeague: null };
  }

  const { data: rowById, error: e2 } = await supabase
    .schema("core")
    .from("tabellen_snapshot_rows")
    .select("rank")
    .eq("snapshot_id", snap.id)
    .eq("team_id", teamId)
    .maybeSingle();

  if (e2) {
    return { rank: null, teamsInLeague: null };
  }

  let rank = rowById?.rank ?? null;
  if (rank == null && teamName?.trim()) {
    const { data: allRows } = await supabase
      .schema("core")
      .from("tabellen_snapshot_rows")
      .select("rank,team_name")
      .eq("snapshot_id", snap.id);
    const n = normTeamName(teamName);
    const found = (allRows ?? []).find(
      (r) => normTeamName(String(r.team_name ?? "")) === n,
    );
    rank = found?.rank ?? null;
  }

  const { count, error: e3 } = await supabase
    .schema("core")
    .from("tabellen_snapshot_rows")
    .select("id", { count: "exact", head: true })
    .eq("snapshot_id", snap.id);

  if (e3) {
    return { rank, teamsInLeague: null };
  }

  return {
    rank,
    teamsInLeague: count ?? null,
  };
}
