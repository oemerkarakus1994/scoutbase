import {
  normVereinTeamName,
  spielNameMatchesOurTeam,
  type VereinErgebnisRow,
} from "@/lib/sfv-data";
import { resolveSpielberichtUrl } from "@/lib/spiel-report-url";

import { extractAllAppPreloads } from "@/lib/oefb-preloads";

const OEFB_CLUBS_BASE = "https://vereine.oefb.at";

/**
 * z. B. `2025/26` oder `2025 / 26` → `Saison-2025-26` (ÖFB-Pfadsegment).
 */
export function saisonLabelToOefbPathSegment(
  saison: string | null | undefined,
): string | null {
  if (!saison?.trim()) {
    return null;
  }
  const t = saison.trim();
  const m = t.match(/^(\d{4})\s*\/\s*(\d{2})$/);
  if (m) {
    return `Saison-${m[1]}-${m[2]}`;
  }
  const m2 = t.match(/^(\d{4})\s*\/\s*(\d{4})$/);
  if (m2) {
    const y2 = m2[2]!.slice(-2);
    return `Saison-${m2[1]}-${y2}`;
  }
  return null;
}

/** Saison-Juli–Juni, z. B. April 2026 → `Saison-2025-26`. */
export function defaultOefbSeasonPathSegment(now = new Date()): string {
  const y = now.getFullYear();
  const mo = now.getMonth() + 1;
  const startYear = mo >= 7 ? y : y - 1;
  const y2 = String(startYear + 1).slice(-2);
  return `Saison-${startYear}-${y2}`;
}

function formatDeDate(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) {
    return "—";
  }
  return d.toLocaleDateString("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function competitionKindFromOefbSpiel(s: Record<string, unknown>): {
  kind_label: string | null;
  detail: string | null;
} {
  const art = String(s.art ?? "").trim();
  const bew = String(s.bewerbBezeichnung ?? "").trim();
  const detail = bew || null;
  if (art === "Liga") {
    return { kind_label: "Liga", detail };
  }
  if (art === "Cup") {
    return { kind_label: "Pokal", detail };
  }
  if (art === "Testspiel") {
    return { kind_label: "Freundschaftsspiel", detail };
  }
  if (detail && /freundschaft/i.test(detail)) {
    return { kind_label: "Freundschaftsspiel", detail };
  }
  if (art) {
    return { kind_label: art, detail };
  }
  return { kind_label: null, detail };
}

function kickoffMs(iso: string | null): number {
  if (!iso) {
    return 0;
  }
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function findSpielplanMannschaftPayload(preloads: Record<string, unknown>): {
  spiele: unknown[];
} | null {
  for (const value of Object.values(preloads)) {
    if (!Array.isArray(value) || !value[0] || typeof value[0] !== "object") {
      continue;
    }
    const row = value[0] as Record<string, unknown>;
    if (!Array.isArray(row.spiele)) {
      continue;
    }
    const isSpielplan =
      row.type === "SPIELPLAN_MANNSCHAFT" ||
      (typeof row.detailUrl === "string" && row.detailUrl.includes("/Spiele"));
    if (isSpielplan) {
      return { spiele: row.spiele };
    }
  }
  return null;
}

function mapOefbSpielToRow(
  raw: unknown,
  nameNormSet: Set<string>,
): VereinErgebnisRow | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const s = raw as Record<string, unknown>;
  if (s.abgeschlossen !== true || s.abgesagt === true) {
    return null;
  }

  const hg = Number.parseInt(String(s.heimTore ?? ""), 10);
  const gg = Number.parseInt(String(s.gastTore ?? ""), 10);
  if (!Number.isFinite(hg) || !Number.isFinite(gg)) {
    return null;
  }

  const heimName = String(s.heimName ?? "").trim();
  const gastName = String(s.gastName ?? "").trim();
  if (!heimName || !gastName) {
    return null;
  }

  const nh = normVereinTeamName(heimName);
  const na = normVereinTeamName(gastName);
  const homeMatch = spielNameMatchesOurTeam(nh, nameNormSet);
  const awayMatch = spielNameMatchesOurTeam(na, nameNormSet);
  if (!homeMatch && !awayMatch) {
    return null;
  }

  let is_home: boolean;
  if (homeMatch && !awayMatch) {
    is_home = true;
  } else if (!homeMatch && awayMatch) {
    is_home = false;
  } else {
    is_home = true;
  }

  const datumMs = typeof s.datum === "number" ? s.datum : Number(s.datum);
  const kickoff_at =
    Number.isFinite(datumMs) && datumMs > 0
      ? new Date(datumMs).toISOString()
      : null;

  const our = is_home ? hg : gg;
  const their = is_home ? gg : hg;
  let result: "S" | "U" | "N" = "U";
  if (our > their) {
    result = "S";
  } else if (our < their) {
    result = "N";
  }

  const spielUrl = String(s.spielUrl ?? "").trim();
  const id = `oefb:${spielUrl || `${heimName}|${gastName}|${kickoff_at ?? ""}`}`;

  const reportPath =
    spielUrl && !/^https?:\/\//i.test(spielUrl) && !spielUrl.startsWith("//")
      ? spielUrl.startsWith("/")
        ? spielUrl
        : `/${spielUrl}`
      : spielUrl;
  const report_url = reportPath ? resolveSpielberichtUrl(reportPath) : null;

  const ck = competitionKindFromOefbSpiel(s);

  return {
    id,
    kickoff_at,
    dateLabel: formatDeDate(kickoff_at),
    home_team_name: heimName,
    away_team_name: gastName,
    focus_team_name: is_home ? heimName : gastName,
    opponent_name: is_home ? gastName : heimName,
    is_home,
    our_goals: our,
    their_goals: their,
    result,
    competition_kind_label: ck.kind_label,
    competition_detail: ck.detail,
    report_url,
  };
}

export type FetchOefbScheduleErgebnisseOptions = {
  clubSlug: string;
  /** z. B. `Saison-2025-26` */
  saisonPathSegment: string;
  segment: "km" | "res";
  /** Namen der eigenen Mannschaft (Verein, Tabellenzeile, Teamzeilen) — Abgleich wie in der DB-Logik. */
  focusTeamNames: string[];
  limit?: number;
};

/**
 * Lädt die Mannschafts-Spiele von der öffentlichen ÖFB-Vereins-URL
 * `https://vereine.oefb.at/{slug}/Mannschaften/{Saison}/KM|Res/Spiele/` und parst `SPIELPLAN_MANNSCHAFT`.
 */
export async function fetchVereinErgebnisseFromOefbSchedulePage(
  options: FetchOefbScheduleErgebnisseOptions,
): Promise<{ rows: VereinErgebnisRow[]; error: Error | null }> {
  const maxRows = options.limit ?? 200;
  const pathSeg = options.segment === "res" ? "Res" : "KM";
  const slug = options.clubSlug.trim().replace(/^\/+|\/+$/g, "");
  if (!slug) {
    return { rows: [], error: null };
  }

  const saisonSeg = options.saisonPathSegment.trim();
  if (!saisonSeg) {
    return { rows: [], error: null };
  }

  const url = `${OEFB_CLUBS_BASE}/${slug}/Mannschaften/${saisonSeg}/${pathSeg}/Spiele/`;

  let html: string;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (compatible; Scoutbase/1.0; +https://scoutbase) AppleWebKit/537.36 (KHTML, like Gecko)",
      },
    });
    if (!res.ok) {
      return {
        rows: [],
        error: new Error(`ÖFB Spiele: HTTP ${res.status}`),
      };
    }
    html = await res.text();
  } catch (e) {
    return {
      rows: [],
      error: e instanceof Error ? e : new Error("ÖFB Spiele: Netzwerkfehler"),
    };
  }

  const preloads = extractAllAppPreloads(html);
  const plan = findSpielplanMannschaftPayload(preloads);
  if (!plan?.spiele?.length) {
    return { rows: [], error: null };
  }

  const nameNormSet = new Set<string>();
  for (const n of options.focusTeamNames) {
    const t = n?.trim();
    if (t) {
      nameNormSet.add(normVereinTeamName(t));
    }
  }
  if (nameNormSet.size === 0) {
    return { rows: [], error: null };
  }

  const rows: VereinErgebnisRow[] = [];
  for (const spiel of plan.spiele) {
    const row = mapOefbSpielToRow(spiel, nameNormSet);
    if (row) {
      rows.push(row);
    }
  }

  rows.sort((a, b) => kickoffMs(b.kickoff_at) - kickoffMs(a.kickoff_at));

  return { rows: rows.slice(0, maxRows), error: null };
}
