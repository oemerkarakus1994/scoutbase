import type { SupabaseClient } from "@supabase/supabase-js";

import { bundeslandFromVerbandName } from "./oefb-bundesland";
import { fetchAllActiveMembershipsForTeams, isStaffRole } from "./sfv-data";

const TEAM_BATCH = 80;
const EDITION_BATCH = 120;
const PERSON_CHUNK = 400;

type EditionRow = { id: string; title: string; is_current: boolean };

function collectCompetitionEditionIds(
  teamById: Map<
    string,
    { category_label: string | null; verein_id: string | null; meta: unknown }
  >,
): string[] {
  const ids = new Set<string>();
  for (const t of teamById.values()) {
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

/** Demo: stabile fiktive UEFA-Lizenz pro Person (Hash über `person_id`). */
const FAKE_UEFA_LICENSES = [
  "UEFA Pro",
  "UEFA A",
  "UEFA B",
  "UEFA C",
  "UEFA D",
] as const;

export function fakeUefaLicenseForPersonId(personId: string): string {
  let h = 0;
  for (let i = 0; i < personId.length; i++) {
    h = (Math.imul(31, h) + personId.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(h) % FAKE_UEFA_LICENSES.length;
  return FAKE_UEFA_LICENSES[idx]!;
}

export type SfvTrainerDirectoryRow = {
  id: string;
  display_name: string | null;
  vorname: string | null;
  nachname: string | null;
  name: string;
  /** Vereinsname */
  verein_name: string;
  /** Mannschaftsname */
  team_name: string;
  /** „Verein · Team“ für Suche */
  verein_team: string;
  role_label: string | null;
  foto_public_uid: string | null;
  region_label: string | null;
  liga_label: string | null;
  /** Fiktive Demo-Lizenz (siehe `fakeUefaLicenseForPersonId`). */
  license_label: string;
  /** Nicht im SFV/ÖFB-Teamimport — nur Platzhalter für spätere Datenquelle */
  wins: number | null;
  draws: number | null;
  losses: number | null;
  win_rate_percent: number | null;
};

function personLabel(p: {
  display_name: string | null;
  vorname: string | null;
  nachname: string | null;
}): string {
  return (
    p.display_name ||
    [p.vorname, p.nachname].filter(Boolean).join(" ") ||
    "—"
  );
}

/**
 * Trainer/Staff aus Import-Mitgliedschaften, angereichert mit Region/Liga wie Spieler,
 * Lizenz: fiktive UEFA-Stufe pro Person (Demo).
 * Siege/Unentschieden/Niederlagen/Siegquote: aktuell keine echte Quelle in der DB.
 */
export async function fetchSfvTrainerDirectory(
  supabase: SupabaseClient,
): Promise<{ data: SfvTrainerDirectoryRow[]; error: Error | null }> {
  try {
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
      {
        team_id: string;
        role_label: string | null;
        role_type: string;
        joined_on: string | null;
        meta: unknown;
      }
    >();

    for (let i = 0; i < teamIds.length; i += TEAM_BATCH) {
      const chunk = teamIds.slice(i, i + TEAM_BATCH);
      let mems: Record<string, unknown>[];
      try {
        mems = await fetchAllActiveMembershipsForTeams(
          supabase,
          chunk,
          "person_id,team_id,role_type,role_label,joined_on,meta",
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
          joined_on: string | null;
          meta: unknown;
        };
        if (!m.person_id || !isStaffRole(m.role_type)) {
          continue;
        }
        if (!picked.has(m.person_id)) {
          picked.set(m.person_id, {
            team_id: m.team_id,
            role_label: m.role_label,
            role_type: m.role_type ?? "",
            joined_on: m.joined_on,
            meta: m.meta,
          });
        }
      }
    }

    const personIds = [...picked.keys()];
    if (personIds.length === 0) {
      return { data: [], error: null };
    }

    const persons: Array<{
      id: string;
      display_name: string | null;
      vorname: string | null;
      nachname: string | null;
      foto_public_uid: string | null;
    }> = [];

    for (let i = 0; i < personIds.length; i += PERSON_CHUNK) {
      const chunk = personIds.slice(i, i + PERSON_CHUNK);
      const { data, error: eP } = await supabase
        .schema("core")
        .from("personen")
        .select("id,display_name,vorname,nachname,foto_public_uid")
        .in("id", chunk);
      if (eP) {
        return { data: [], error: new Error(eP.message) };
      }
      persons.push(...(data ?? []));
    }

    const teamById = new Map<
      string,
      { category_label: string | null; verein_id: string | null; meta: unknown }
    >();
    for (let i = 0; i < teamIds.length; i += TEAM_BATCH) {
      const chunk = teamIds.slice(i, i + TEAM_BATCH);
      const { data: trows } = await supabase
        .schema("core")
        .from("teams")
        .select("id,category_label,verein_id,meta")
        .in("id", chunk);
      for (const t of trows ?? []) {
        teamById.set(t.id, {
          category_label: t.category_label,
          verein_id: t.verein_id,
          meta: t.meta,
        });
      }
    }

    const vereinIds = [
      ...new Set(
        [...teamById.values()]
          .map((t) => t.verein_id)
          .filter((x): x is string => Boolean(x)),
      ),
    ];

    const vereinToVerband = new Map<string, string | null>();
    for (let i = 0; i < vereinIds.length; i += TEAM_BATCH) {
      const chunk = vereinIds.slice(i, i + TEAM_BATCH);
      const { data: vrows } = await supabase
        .schema("core")
        .from("vereine")
        .select("id,verband_id")
        .in("id", chunk);
      for (const v of vrows ?? []) {
        vereinToVerband.set(v.id, v.verband_id);
      }
    }

    const verbandIds = [
      ...new Set(
        [...vereinToVerband.values()].filter((x): x is string => Boolean(x)),
      ),
    ];
    const verbandName = new Map<string, string>();
    for (let i = 0; i < verbandIds.length; i += TEAM_BATCH) {
      const chunk = verbandIds.slice(i, i + TEAM_BATCH);
      const { data: brows } = await supabase
        .schema("core")
        .from("verbaende")
        .select("id,name")
        .in("id", chunk);
      for (const b of brows ?? []) {
        verbandName.set(b.id, b.name);
      }
    }

    const editionIds = collectCompetitionEditionIds(teamById);
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

    const vereinName = new Map<string, string>();
    if (vereinIds.length > 0) {
      for (let i = 0; i < vereinIds.length; i += TEAM_BATCH) {
        const chunk = vereinIds.slice(i, i + TEAM_BATCH);
        const { data: vr } = await supabase
          .schema("core")
          .from("vereine")
          .select("id,name")
          .in("id", chunk);
        for (const v of vr ?? []) {
          vereinName.set(v.id, v.name);
        }
      }
    }

    const rows: SfvTrainerDirectoryRow[] = [];

    for (const p of persons) {
      const meta = picked.get(p.id);
      if (!meta) {
        continue;
      }
      const tm = teamMap.get(meta.team_id);
      const teamFull = teamById.get(meta.team_id);
      const vn = tm?.verein_id
        ? (vereinName.get(tm.verein_id) ?? "")
        : "";
      const teamName = tm?.name ?? "—";
      const vereinTeam =
        vn && teamName ? `${vn} · ${teamName}` : teamName || "—";

      let region: string | null = null;
      let liga: string | null = null;
      if (teamFull) {
        liga = ligaLabelFromTeamMeta(teamFull.meta, editionById);
        if (teamFull.verein_id) {
          const vb = vereinToVerband.get(teamFull.verein_id);
          if (vb) {
            region = bundeslandFromVerbandName(verbandName.get(vb) ?? null);
          }
        }
      }

      rows.push({
        id: p.id,
        display_name: p.display_name,
        vorname: p.vorname,
        nachname: p.nachname,
        name: personLabel(p),
        verein_name: vn || "—",
        team_name: teamName,
        verein_team: vereinTeam,
        role_label: meta.role_label,
        foto_public_uid: p.foto_public_uid ?? null,
        region_label: region,
        liga_label: liga,
        license_label: fakeUefaLicenseForPersonId(p.id),
        wins: null,
        draws: null,
        losses: null,
        win_rate_percent: null,
      });
    }

    rows.sort((a, b) => a.name.localeCompare(b.name, "de"));

    return { data: rows, error: null };
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
}

/**
 * Alle Ligabezeichnungen aus `bewerb_editionen`, die an importierten Teams
 * (`teams.meta.competition_edition_ids`) hängen — unabhängig davon, ob aktuell
 * ein Trainer einer dieser Ligen zugeordnet ist (sonst fehlen z. B. „2. Klasse Nord A“ im Filter).
 */
export async function fetchSfvLigaTitlesFromImportedTeams(
  supabase: SupabaseClient,
): Promise<string[]> {
  const { data: teamRows, error } = await supabase
    .schema("core")
    .from("teams")
    .select("meta");

  if (error || !teamRows?.length) {
    return [];
  }

  const editionIds = new Set<string>();
  for (const t of teamRows) {
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
        editionIds.add(x.trim());
      }
    }
  }

  if (editionIds.size === 0) {
    return [];
  }

  const ids = [...editionIds];
  const titles = new Set<string>();

  for (let i = 0; i < ids.length; i += EDITION_BATCH) {
    const chunk = ids.slice(i, i + EDITION_BATCH);
    const { data: erows } = await supabase
      .schema("core")
      .from("bewerb_editionen")
      .select("title")
      .in("id", chunk);
    for (const e of erows ?? []) {
      if (typeof e.title === "string" && e.title.trim()) {
        titles.add(e.title.trim());
      }
    }
  }

  return [...titles].sort((a, b) => a.localeCompare(b, "de"));
}
