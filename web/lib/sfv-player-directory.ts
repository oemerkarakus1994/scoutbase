import type { SupabaseClient } from "@supabase/supabase-js";

import { resolvePersonFotoPublicUid } from "./oefb-assets";
import { bundeslandFromVerbandName } from "./oefb-bundesland";
import { loadPositionLabelsForPrimaryTeams } from "./player-position-category";
import { scoutbaseRating99 } from "./player-rating";
import { buildSfvKaderContext } from "./sfv-kader-context";
import {
  kmResDisplayPreference,
  parseVereinTeamSubtitle,
  playerDirectoryDedupKey,
} from "./sfv-team-tier";

export type SfvPlayerDirectoryRow = {
  id: string;
  display_name: string | null;
  vorname: string | null;
  nachname: string | null;
  geburtsdatum: string | null;
  foto_public_uid: string | null;
  verein_team: string;
  goals: number;
  appearances: number;
  /** 1–99, ScoutBase-Komposit (Liga, Minuten, Team, Alter, Tore/90) */
  rating: number;
  /** Aus Kader der Primär-Mannschaft */
  position_label: string | null;
  liga_label: string | null;
  region_label: string | null;
  /** Volljahre aus Geburtsdatum */
  age: number | null;
};

/** Standard-Ansicht Spielerseite: nur so viele Zeilen anreichern (nach Sortierung). */
export const DEFAULT_SFV_DIRECTORY_PAGE_SIZE = 20;

const ID_CHUNK = 400;
const TEAM_BATCH = 80;
const EDITION_BATCH = 120;
/** Wie bei Positions-Query: `.in(person_id, …)` nicht zu groß für die GET-URL. */
const TRANSFER_BATCH = 80;

/** z. B. „U17“, „u12-a“ → Altersklasse für Jahrgangsschätzung */
const U_CATEGORY_RE = /^U(\d{1,2})(?:\b|[-/])/i;

/**
 * Wenn kein echtes Geburtsdatum da ist: aus Altersklasse (U12 … U19) den typischen
 * Jahrgang schätzen — Saisonstart-Jahr minus U-Zahl (ÖFB-Jugend, grobe Näherung).
 */
function inferBirthYearIsoFromUCategory(categoryLabel: string | null | undefined): string | null {
  if (!categoryLabel?.trim()) {
    return null;
  }
  const m = categoryLabel.trim().match(U_CATEGORY_RE);
  if (!m) {
    return null;
  }
  const u = Number(m[1]);
  if (!Number.isFinite(u) || u < 6 || u > 23) {
    return null;
  }
  const now = new Date();
  const y = now.getFullYear();
  // Saison üblicherweise Juli–Juni: vor Juli noch Vorjahres-Saison für Zuordnung.
  const seasonStartYear = now.getMonth() >= 6 ? y : y - 1;
  const birthYear = seasonStartYear - u;
  if (birthYear < 1990 || birthYear > y) {
    return null;
  }
  return `${birthYear}-01-01`;
}

/**
 * Ohne Profil-Import ist personen.geburtsdatum oft leer. Letzter Transfer mit Alter+Datum
 * → Jahrgang (1.1. des geschätzten Geburtsjahres).
 */
async function loadGeburtsdatumEstimateFromTransfers(
  supabase: SupabaseClient,
  personIdsMissingBirth: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (personIdsMissingBirth.length === 0) {
    return out;
  }

  const yearMax = new Date().getFullYear();

  for (let i = 0; i < personIdsMissingBirth.length; i += TRANSFER_BATCH) {
    const chunk = personIdsMissingBirth.slice(i, i + TRANSFER_BATCH);
    const { data, error } = await supabase
      .schema("core")
      .from("transfers")
      .select("person_id,transfer_date,age")
      .in("person_id", chunk);

    if (error) {
      console.warn(
        "loadGeburtsdatumEstimateFromTransfers: transfers query failed",
        error.message,
      );
      continue;
    }

    type TRow = {
      person_id: string | null;
      transfer_date: string | null;
      age: number | null;
    };

    const bestByPerson = new Map<
      string,
      { t: number; birthYear: number }
    >();

    for (const raw of (data ?? []) as TRow[]) {
      const pid = raw.person_id;
      if (!pid || raw.transfer_date == null || raw.age == null) {
        continue;
      }
      const age = Number(raw.age);
      if (!Number.isFinite(age) || age < 3 || age > 55) {
        continue;
      }
      const td = new Date(raw.transfer_date).getTime();
      if (!Number.isFinite(td)) {
        continue;
      }
      const birthYear = new Date(raw.transfer_date).getFullYear() - age;
      if (birthYear < 1940 || birthYear > yearMax) {
        continue;
      }
      const prev = bestByPerson.get(pid);
      if (!prev || td > prev.t) {
        bestByPerson.set(pid, { t: td, birthYear });
      }
    }

    for (const [pid, v] of bestByPerson) {
      out.set(pid, `${v.birthYear}-01-01`);
    }
  }

  return out;
}

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

function ageFromGeburtsdatum(iso: string | null): number | null {
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

function personLabel(p: {
  display_name: string | null;
  vorname: string | null;
  nachname: string | null;
}): string {
  return (
    p.display_name ||
    [p.vorname, p.nachname].filter(Boolean).join(" ") ||
    ""
  );
}

function dedupePreferKm(rows: SfvPlayerDirectoryRow[]): SfvPlayerDirectoryRow[] {
  const byKey = new Map<string, SfvPlayerDirectoryRow[]>();
  for (const row of rows) {
    const displayName = personLabel(row);
    const key = playerDirectoryDedupKey({
      geburtsdatum: row.geburtsdatum,
      displayName,
      vereinTeam: row.verein_team,
    });
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }

  const out: SfvPlayerDirectoryRow[] = [];
  for (const [, list] of byKey) {
    if (list.length === 1) {
      out.push(list[0]!);
      continue;
    }
    const sorted = [...list].sort((a, b) => {
      const ta = parseVereinTeamSubtitle(a.verein_team).team;
      const tb = parseVereinTeamSubtitle(b.verein_team).team;
      const diff =
        kmResDisplayPreference(tb) - kmResDisplayPreference(ta);
      if (diff !== 0) {
        return diff;
      }
      if (b.appearances !== a.appearances) {
        return b.appearances - a.appearances;
      }
      return a.id.localeCompare(b.id);
    });
    out.push(sorted[0]!);
  }
  return out;
}

async function enrichDirectoryRows(
  supabase: SupabaseClient,
  rows: SfvPlayerDirectoryRow[],
  personPrimaryTeamId: Map<string, string>,
): Promise<SfvPlayerDirectoryRow[]> {
  if (rows.length === 0) {
    return rows;
  }

  const ids = rows.map((r) => r.id);
  let positions: Map<string, string | null>;
  try {
    positions = await loadPositionLabelsForPrimaryTeams(
      supabase,
      ids,
      personPrimaryTeamId,
    );
  } catch (e) {
    console.warn("loadPositionLabelsForPrimaryTeams failed", e);
    positions = new Map();
  }

  let birthFromTransfers = new Map<string, string>();
  try {
    birthFromTransfers = await loadGeburtsdatumEstimateFromTransfers(
      supabase,
      rows.filter((r) => !r.geburtsdatum).map((r) => r.id),
    );
  } catch {
    birthFromTransfers = new Map();
  }

  const teamIds = [
    ...new Set(
      ids
        .map((id) => personPrimaryTeamId.get(id))
        .filter((x): x is string => Boolean(x)),
    ),
  ];

  const teamById = new Map<
    string,
    { category_label: string | null; verein_id: string | null; meta: unknown }
  >();
  for (let i = 0; i < teamIds.length; i += TEAM_BATCH) {
    const chunk = teamIds.slice(i, i + TEAM_BATCH);
    const { data: trows, error: et } = await supabase
      .schema("core")
      .from("teams")
      .select("id,category_label,verein_id,meta")
      .in("id", chunk);
    if (et) {
      break;
    }
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

  return rows.map((r) => {
    const tid = personPrimaryTeamId.get(r.id);
    const team = tid ? teamById.get(tid) : undefined;
    const pos = positions.get(r.id) ?? null;

    const liga: string | null = team
      ? ligaLabelFromTeamMeta(team.meta, editionById)
      : null;

    let region: string | null = null;
    if (team?.verein_id) {
      const vb = vereinToVerband.get(team.verein_id);
      if (vb) {
        const vn = verbandName.get(vb) ?? null;
        region = bundeslandFromVerbandName(vn);
      }
    }

    let geburtsdatum =
      r.geburtsdatum ?? birthFromTransfers.get(r.id) ?? null;
    if (!geburtsdatum && team?.category_label) {
      geburtsdatum = inferBirthYearIsoFromUCategory(team.category_label);
    }

    const age = ageFromGeburtsdatum(geburtsdatum);
    const minutesEst =
      r.appearances > 0 ? r.appearances * 90 : 0;

    return {
      ...r,
      geburtsdatum,
      position_label: pos,
      liga_label: liga,
      region_label: region,
      age,
      rating: scoutbaseRating99({
        ligaLabel: liga,
        minutesTotal: minutesEst,
        goals: r.goals,
        age,
        tablePosition: null,
        teamsInLeague: null,
      }),
    };
  });
}

export type FetchSfvPlayerDirectoryOptions = {
  /**
   * Nach Dedupe & alphabetischer Sortierung nur die ersten N Spieler anreichern.
   * `null` / fehlend: alle Spieler (teuer bei großen Kadern).
   */
  maxRows?: number | null;
};

/**
 * Spieler im SFV-Kader mit aggregierten Kader-Stats und alphabetischer Sortierung.
 */
export async function fetchSfvPlayerDirectory(
  supabase: SupabaseClient,
  options?: FetchSfvPlayerDirectoryOptions,
): Promise<{
  data: SfvPlayerDirectoryRow[];
  total: number;
  error: Error | null;
}> {
  try {
    const maxRows = options?.maxRows;

    const ctx = await buildSfvKaderContext(supabase);
    const personIds = [...ctx.personGoals.keys()];
    if (personIds.length === 0) {
      return { data: [], total: 0, error: null };
    }

    const persons: Array<{
      id: string;
      display_name: string | null;
      vorname: string | null;
      nachname: string | null;
      geburtsdatum: string | null;
      foto_public_uid: string | null;
      meta: unknown;
    }> = [];

    for (let i = 0; i < personIds.length; i += ID_CHUNK) {
      const chunk = personIds.slice(i, i + ID_CHUNK);
      const { data, error } = await supabase
        .schema("core")
        .from("personen")
        .select("id,display_name,vorname,nachname,geburtsdatum,foto_public_uid,meta")
        .in("id", chunk);

      if (error) {
        return { data: [], total: 0, error: new Error(error.message) };
      }
      persons.push(...(data ?? []));
    }

    const rowsRaw: SfvPlayerDirectoryRow[] = persons.map((p) => {
      const { meta, ...rest } = p;
      const g = ctx.personGoals.get(p.id) ?? 0;
      const a = ctx.personApps.get(p.id) ?? 0;
      return {
        ...rest,
        foto_public_uid: resolvePersonFotoPublicUid(rest.foto_public_uid, meta),
        verein_team: ctx.subtitleForPerson(p.id),
        goals: g,
        appearances: a,
        rating: 0,
        position_label: null,
        liga_label: null,
        region_label: null,
        age: null,
      };
    });

    const deduped = dedupePreferKm(rowsRaw);
    deduped.sort((x, y) =>
      personLabel(x).localeCompare(personLabel(y), "de"),
    );

    const total = deduped.length;
    const toEnrich =
      maxRows != null && maxRows > 0
        ? deduped.slice(0, maxRows)
        : deduped;

    const rows = await enrichDirectoryRows(
      supabase,
      toEnrich,
      ctx.personPrimaryTeamId,
    );

    return {
      data: rows,
      total,
      error: null,
    };
  } catch (e) {
    return {
      data: [],
      total: 0,
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
}
