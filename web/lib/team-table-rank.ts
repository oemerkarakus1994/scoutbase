import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Tabellenplatz und Teilnehmerzahl aus dem neuesten Tabellen-Snapshot
 * zu einer der angegebenen Bewerb-Editionen.
 */
export async function fetchTeamTableRankContext(
  supabase: SupabaseClient,
  teamId: string,
  editionIds: string[],
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

  const { data: row, error: e2 } = await supabase
    .schema("core")
    .from("tabellen_snapshot_rows")
    .select("rank")
    .eq("snapshot_id", snap.id)
    .eq("team_id", teamId)
    .maybeSingle();

  if (e2) {
    return { rank: null, teamsInLeague: null };
  }

  const { count, error: e3 } = await supabase
    .schema("core")
    .from("tabellen_snapshot_rows")
    .select("id", { count: "exact", head: true })
    .eq("snapshot_id", snap.id);

  if (e3) {
    return { rank: row?.rank ?? null, teamsInLeague: null };
  }

  return {
    rank: row?.rank ?? null,
    teamsInLeague: count ?? null,
  };
}
