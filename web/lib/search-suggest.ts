import type { SupabaseClient } from "@supabase/supabase-js";

import { bewerbEditionElementId } from "@/lib/ligen-anchor";
import { isPlayerRole, isStaffRole } from "@/lib/sfv-data";
import { SFV_VERBAND_ROW_ID } from "@/lib/sfv";

export type SearchSuggestion = {
  id: string;
  name: string;
  kindLabel: string;
  /** Steuert Ziel-URL (Spieler, Verein, Liga/Bewerb). */
  entity: "person" | "verein" | "liga";
};

/** Zielpfad für globale Schnellsuche (inkl. Hash zur Ligen-Seite). */
export function searchSuggestionHref(s: SearchSuggestion): string {
  if (s.entity === "verein") {
    return `/vereine/${encodeURIComponent(s.id)}`;
  }
  if (s.entity === "liga") {
    return `/ligen#${bewerbEditionElementId(s.id)}`;
  }
  return `/spieler/${encodeURIComponent(s.id)}`;
}

/** Sonderzeichen für SQL ILIKE maskieren. */
export function escapeIlikePattern(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

type BewerbEditionLigaRow = {
  id: string;
  title: string;
  is_current: boolean;
  created_at: string;
};

/**
 * Gleicher Ligatitel kommt in `bewerb_editionen` pro Saison vor — in der Suche nur eine Zeile.
 * Bevorzugt aktuelle Edition, sonst die zuletzt angelegte.
 */
export function dedupeBewerbEditionsByTitle(
  rows: BewerbEditionLigaRow[],
  max: number,
): BewerbEditionLigaRow[] {
  const norm = (t: string) => t.trim().toLowerCase();
  const byTitle = new Map<string, BewerbEditionLigaRow>();

  for (const row of rows) {
    if (!row.title?.trim()) {
      continue;
    }
    const key = norm(row.title);
    const prev = byTitle.get(key);
    if (!prev) {
      byTitle.set(key, row);
      continue;
    }
    if (row.is_current && !prev.is_current) {
      byTitle.set(key, row);
      continue;
    }
    if (!row.is_current && prev.is_current) {
      continue;
    }
    const tNew = new Date(row.created_at).getTime();
    const tOld = new Date(prev.created_at).getTime();
    if (Number.isFinite(tNew) && Number.isFinite(tOld) && tNew > tOld) {
      byTitle.set(key, row);
    }
  }

  return [...byTitle.values()].slice(0, max);
}

function personDisplayName(p: {
  display_name: string | null;
  vorname: string | null;
  nachname: string | null;
}): string {
  return (
    p.display_name?.trim() ||
    [p.vorname, p.nachname].filter(Boolean).join(" ") ||
    "Unbenannt"
  );
}

/** Nur Buchstaben, Ziffern, Leerzeichen, Bindestrich — verhindert kaputte `.or()`-Filter. */
function sanitizeQuery(raw: string): string {
  return raw
    .trim()
    .slice(0, 48)
    .replace(/[^\p{L}\p{N}\s\-'.]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Globale Schnellsuche: Personen (Spieler/Trainer), Vereine, Ligen/Bewerbe (Editionstitel).
 * Mannschaftsnamen (`core.teams`) werden auf den zugehörigen Verein gemappt — pro Verein
 * höchstens ein Treffer (KM/RES umschalten auf dem Vereinsprofil).
 */
export async function fetchSearchSuggestions(
  supabase: SupabaseClient,
  rawQ: string,
): Promise<{ suggestions: SearchSuggestion[]; error: string | null }> {
  const q = sanitizeQuery(rawQ);
  if (q.length < 2) {
    return { suggestions: [], error: null };
  }

  const pattern = `%${escapeIlikePattern(q)}%`;

  const { data: sfvSerien } = await supabase
    .schema("core")
    .from("bewerb_serien")
    .select("id")
    .eq("verband_id", SFV_VERBAND_ROW_ID);
  const sfvSerieIds = (sfvSerien ?? []).map((s) => s.id);

  const sel = "id, display_name, vorname, nachname" as const;
  const base = () =>
    supabase.schema("core").from("personen").select(sel);

  const ligaQuery =
    sfvSerieIds.length === 0
      ? Promise.resolve({
          data: [] as BewerbEditionLigaRow[],
          error: null,
        })
      : supabase
          .schema("core")
          .from("bewerb_editionen")
          .select("id, title, is_current, created_at")
          .in("serie_id", sfvSerieIds)
          .ilike("title", pattern)
          /** Viele Treffer: gleicher Ligatitel existiert pro Saison als eigene Edition. */
          .limit(80);

  const [r1, r2, r3, rv, rLiga, rTeams] = await Promise.all([
    base().ilike("display_name", pattern).limit(8),
    base().ilike("vorname", pattern).limit(8),
    base().ilike("nachname", pattern).limit(8),
    supabase
      .schema("core")
      .from("vereine")
      .select("id, name")
      .ilike("name", pattern)
      .limit(10),
    ligaQuery,
    supabase
      .schema("core")
      .from("teams")
      .select("verein_id")
      .ilike("name", pattern)
      .limit(48),
  ]);

  const err =
    r1.error ?? r2.error ?? r3.error ?? rv.error ?? rLiga.error ?? rTeams.error;
  if (err) {
    return { suggestions: [], error: err.message };
  }

  const byId = new Map<
    string,
    {
      id: string;
      display_name: string | null;
      vorname: string | null;
      nachname: string | null;
    }
  >();
  for (const row of [...(r1.data ?? []), ...(r2.data ?? []), ...(r3.data ?? [])]) {
    byId.set(row.id, row);
  }
  const persons = [...byId.values()].slice(0, 12);

  const ids = persons.map((p) => p.id);
  let mems: { person_id: string | null; role_type: string | null }[] = [];
  if (ids.length > 0) {
    const { data } = await supabase
      .schema("core")
      .from("team_memberships")
      .select("person_id, role_type")
      .in("person_id", ids)
      .is("left_on", null);
    mems = data ?? [];
  }

  const rolesByPerson = new Map<string, Set<string>>();
  for (const m of mems ?? []) {
    if (!m.person_id) {
      continue;
    }
    const set = rolesByPerson.get(m.person_id) ?? new Set();
    set.add((m.role_type ?? "").toLowerCase());
    rolesByPerson.set(m.person_id, set);
  }

  function kindLabelPerson(personId: string): string {
    const sets = rolesByPerson.get(personId);
    if (!sets?.size) {
      return "Person";
    }
    let hasP = false;
    let hasS = false;
    for (const r of sets) {
      if (isPlayerRole(r)) {
        hasP = true;
      }
      if (isStaffRole(r)) {
        hasS = true;
      }
    }
    if (hasP && hasS) {
      return "Spieler · Trainer";
    }
    if (hasS) {
      return "Trainer / Staff";
    }
    if (hasP) {
      return "Spieler";
    }
    return "Person";
  }

  const personSugs: SearchSuggestion[] = persons.map((p) => ({
    id: p.id,
    name: personDisplayName(p),
    kindLabel: kindLabelPerson(p.id),
    entity: "person" as const,
  }));

  const vereinById = new Map<string, string>();
  for (const v of rv.data ?? []) {
    if (v.id && v.name?.trim()) {
      vereinById.set(v.id, v.name.trim());
    }
  }

  const teamVereinIds = new Set<string>();
  for (const t of rTeams.data ?? []) {
    if (t.verein_id) {
      teamVereinIds.add(t.verein_id);
    }
  }

  const missingVereinIds = [...teamVereinIds].filter((id) => !vereinById.has(id));
  if (missingVereinIds.length > 0) {
    const { data: vExtra } = await supabase
      .schema("core")
      .from("vereine")
      .select("id, name")
      .in("id", missingVereinIds);
    for (const v of vExtra ?? []) {
      if (v.id && v.name?.trim()) {
        vereinById.set(v.id, v.name.trim());
      }
    }
  }

  /** Gleicher Vereinsname kann mehrfach in `core.vereine` vorkommen — in der Suche nur ein Treffer. */
  const normVereinName = (n: string) => n.trim().toLowerCase();
  const vereinNameSeen = new Set<string>();
  const vereinSugs: SearchSuggestion[] = [];

  for (const v of rv.data ?? []) {
    const name = v.name?.trim();
    if (!v.id || !name) {
      continue;
    }
    const key = normVereinName(name);
    if (vereinNameSeen.has(key)) {
      continue;
    }
    vereinNameSeen.add(key);
    vereinSugs.push({
      id: v.id,
      name,
      kindLabel: "Verein",
      entity: "verein",
    });
  }

  for (const vid of teamVereinIds) {
    const name = vereinById.get(vid);
    if (!name) {
      continue;
    }
    const key = normVereinName(name);
    if (vereinNameSeen.has(key)) {
      continue;
    }
    vereinNameSeen.add(key);
    vereinSugs.push({
      id: vid,
      name,
      kindLabel: "Verein",
      entity: "verein",
    });
  }

  const ligaRows = dedupeBewerbEditionsByTitle(
    (rLiga.data ?? []) as BewerbEditionLigaRow[],
    10,
  );

  const ligaSugs: SearchSuggestion[] = ligaRows
    .filter((row) => row.id && row.title?.trim())
    .map((row) => ({
      id: row.id,
      name: row.title!.trim(),
      kindLabel: "Liga / Bewerb",
      entity: "liga" as const,
    }));

  const suggestions = [...personSugs, ...vereinSugs, ...ligaSugs]
    .sort((a, b) =>
      a.name.localeCompare(b.name, "de", { sensitivity: "base" }),
    )
    .slice(0, 18);

  return { suggestions, error: null };
}
