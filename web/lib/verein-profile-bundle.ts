import type { SupabaseClient } from "@supabase/supabase-js";

import type { VereinProfileTab } from "@/components/verein-profile-view";
import {
  defaultOefbSeasonPathSegment,
  fetchVereinErgebnisseFromOefbSchedulePage,
  saisonLabelToOefbPathSegment,
} from "@/lib/oefb-verein-spiele";
import {
  fetchVereinDetail,
  fetchVereinErgebnisseForVereinSegment,
  fetchVereinKaderRows,
  fetchVereinLigaTabelle,
} from "@/lib/sfv-data";

const VALID_TABS: VereinProfileTab[] = [
  "uebersicht",
  "mannschaften",
  "tabelle",
];

export function parseVereinProfileTab(
  raw: string | undefined,
): VereinProfileTab {
  if (raw && VALID_TABS.includes(raw as VereinProfileTab)) {
    return raw as VereinProfileTab;
  }
  return "uebersicht";
}

export function parseVereinProfileSegment(
  raw: string | undefined,
): "km" | "res" {
  return raw === "res" ? "res" : "km";
}

export type VereinProfileBundleData = {
  club: NonNullable<Awaited<ReturnType<typeof fetchVereinDetail>>["club"]>;
  teams: Awaited<ReturnType<typeof fetchVereinDetail>>["teams"];
  kader: Awaited<ReturnType<typeof fetchVereinKaderRows>>["rows"];
  ligaTabelle: NonNullable<
    Awaited<ReturnType<typeof fetchVereinLigaTabelle>>["data"]
  > | null;
  ergebnisse: Awaited<
    ReturnType<typeof fetchVereinErgebnisseForVereinSegment>
  >["rows"];
  hasKmTeam: boolean;
  hasResTeam: boolean;
};

export type VereinProfileBundleResult =
  | { ok: true; data: VereinProfileBundleData }
  | { ok: false; error: Error }
  | { ok: false; notFound: true };

export async function fetchVereinProfileBundle(
  supabase: SupabaseClient,
  vereinId: string,
  activeTab: VereinProfileTab,
  activeSegment: "km" | "res",
): Promise<VereinProfileBundleResult> {
  const { club, teams, error } = await fetchVereinDetail(supabase, vereinId);

  if (error) {
    return { ok: false, error };
  }

  if (!club) {
    return { ok: false, notFound: true };
  }

  const [kaderRes, ligaRes] = await Promise.all([
    fetchVereinKaderRows(supabase, vereinId),
    fetchVereinLigaTabelle(supabase, vereinId, activeSegment),
  ]);

  const kader = kaderRes.error ? [] : kaderRes.rows;
  const ligaTabelle = ligaRes.error ? null : ligaRes.data;

  let ergebnisse: Awaited<
    ReturnType<typeof fetchVereinErgebnisseForVereinSegment>
  >["rows"] = [];

  const saisonPathSegment =
    saisonLabelToOefbPathSegment(ligaTabelle?.saisonName ?? null) ??
    saisonLabelToOefbPathSegment(
      activeSegment === "res"
        ? teams.find((t) => t.reserve_team)?.saison_name ?? null
        : teams.find((t) => !t.reserve_team)?.saison_name ?? null,
    ) ??
    defaultOefbSeasonPathSegment();

  const focusTeamNames = [
    ligaTabelle?.focusTeamName,
    club.name,
    ...teams
      .filter((t) =>
        activeSegment === "res" ? t.reserve_team : !t.reserve_team,
      )
      .map((t) => t.team_name),
  ].filter((x): x is string => Boolean(x?.trim()));

  if (club.oefb_slug) {
    const oefb = await fetchVereinErgebnisseFromOefbSchedulePage({
      clubSlug: club.oefb_slug,
      saisonPathSegment,
      segment: activeSegment,
      focusTeamNames: [...new Set(focusTeamNames)],
      limit: 200,
    });
    if (!oefb.error && oefb.rows.length > 0) {
      ergebnisse = oefb.rows;
    }
  }

  if (ergebnisse.length === 0) {
    const er = await fetchVereinErgebnisseForVereinSegment(
      supabase,
      vereinId,
      activeSegment,
      {
        bewerbEditionId: ligaTabelle?.editionId ?? null,
        limit: 200,
        focusTeamNameSnapshot: ligaTabelle?.focusTeamName ?? null,
      },
    );
    if (!er.error) {
      ergebnisse = er.rows;
    }
  }

  const hasKmTeam = teams.some((t) => !t.reserve_team);
  const hasResTeam = teams.some((t) => t.reserve_team);

  return {
    ok: true,
    data: {
      club,
      teams,
      kader,
      ligaTabelle,
      ergebnisse,
      hasKmTeam,
      hasResTeam,
    },
  };
}
