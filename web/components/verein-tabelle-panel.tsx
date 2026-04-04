"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { ProfilePreviewLink } from "@/components/profile-preview-link";
import { bundeslandWappenSrc } from "@/lib/bundesland-wappen";
import { bewerbEditionElementId } from "@/lib/ligen-anchor";
import {
  type VereinErgebnisRow,
  type VereinLigaTabelleData,
} from "@/lib/sfv-data";

type Props = {
  liga: VereinLigaTabelleData | null;
  ergebnisse: VereinErgebnisRow[];
  /** Bundesland-Kurzname (z. B. „Salzburg“) — aus Verband / `region_label`. */
  bundeslandLabel?: string | null;
  vereinPath: string;
  segment: "km" | "res";
  hasKmTeam: boolean;
  hasResTeam: boolean;
  /** Wenn gesetzt: kein `router.push` (z. B. Profil-Modal). */
  onSegmentChangeOverride?: (segment: "km" | "res") => void;
};

function normTabellenName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Eigene Mannschaft in der Ligatabelle (team_id oder Fallback über Namen im Snapshot). */
function isOwnTeamRow(
  row: { team_id: string | null; team_name: string },
  liga: VereinLigaTabelleData,
): boolean {
  if (row.team_id != null && row.team_id === liga.focusTeamId) {
    return true;
  }
  return (
    normTabellenName(String(row.team_name ?? "")) ===
    normTabellenName(String(liga.focusTeamName ?? ""))
  );
}

const FORM_SLOT_COUNT = 5;

function normalizeFormLetters(
  letters: ("S" | "U" | "N" | null)[] | undefined,
): ("S" | "U" | "N" | null)[] {
  const out = [...(letters ?? [])];
  while (out.length < FORM_SLOT_COUNT) {
    out.push(null);
  }
  return out.slice(0, FORM_SLOT_COUNT);
}

function FormBubbles({
  letters,
  emphasized,
}: {
  letters: ("S" | "U" | "N" | null)[];
  emphasized?: boolean;
}) {
  const slots = normalizeFormLetters(letters);
  const size = emphasized
    ? "h-8 min-w-8 px-1 text-[11px] ring-2 ring-white/70 shadow-md dark:ring-brand/40"
    : "h-6 w-6 text-[10px]";
  return (
    <span className="inline-flex flex-nowrap items-center gap-1.5">
      {slots.map((L, i) =>
        L == null ? (
          <span
            key={`form-${i}-empty`}
            className={[
              "inline-flex items-center justify-center rounded-full border border-border text-muted",
              size,
            ].join(" ")}
            title="Kein Spiel in den Importdaten"
          >
            —
          </span>
        ) : (
          <span
            key={`form-${i}-${L}`}
            className={[
              "inline-flex items-center justify-center rounded-full font-bold text-white",
              size,
              L === "S" &&
                "bg-gradient-to-br from-rose-500 to-rose-800 shadow-md shadow-rose-950/40",
              L === "U" &&
                "bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/35",
              L === "N" &&
                "bg-gradient-to-br from-red-600 to-red-900 shadow-red-950/40",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {L}
          </span>
        ),
      )}
    </span>
  );
}

function ResultBadge({ r }: { r: "S" | "U" | "N" }) {
  return (
    <span
      className={[
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
        r === "S" && "bg-rose-600",
        r === "U" && "bg-amber-500",
        r === "N" && "bg-red-600",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {r}
    </span>
  );
}

function scoreClass(r: "S" | "U" | "N"): string {
  if (r === "S") {
    return "font-semibold text-rose-500 dark:text-rose-300";
  }
  if (r === "N") {
    return "font-semibold text-red-600 dark:text-red-400";
  }
  return "font-semibold text-amber-600 dark:text-amber-400";
}

function ErgebnisCompetitionBadge({ m }: { m: VereinErgebnisRow }) {
  const kind = m.competition_kind_label?.trim();
  const detail = m.competition_detail?.trim();
  const showDetail =
    detail &&
    (!kind || detail.toLowerCase() !== kind.toLowerCase());

  const badgeClass =
    kind === "Liga"
      ? "bg-sky-100 text-sky-900 dark:bg-sky-950/70 dark:text-sky-100"
      : kind === "Pokal"
        ? "bg-amber-100 text-amber-950 dark:bg-amber-950/50 dark:text-amber-100"
        : kind === "Freundschaftsspiel"
          ? "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
          : kind
            ? "bg-muted text-foreground"
            : "";

  return (
    <div className="flex max-w-[min(100%,14rem)] flex-col gap-0.5">
      {kind ? (
        <span
          className={`inline-flex w-fit rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeClass}`}
        >
          {kind}
        </span>
      ) : detail ? (
        <span
          className="line-clamp-2 text-[10px] leading-tight text-muted"
          title={detail}
        >
          {detail}
        </span>
      ) : (
        <span className="text-[10px] text-muted">—</span>
      )}
      {showDetail ? (
        <span
          className="line-clamp-2 text-[10px] leading-snug text-muted"
          title={detail}
        >
          {detail}
        </span>
      ) : null}
    </div>
  );
}

export function VereinTabellePanel({
  liga,
  ergebnisse,
  bundeslandLabel,
  vereinPath,
  segment,
  hasKmTeam,
  hasResTeam,
  onSegmentChangeOverride,
}: Props) {
  const router = useRouter();
  const wappenSrc = bundeslandWappenSrc(bundeslandLabel);

  const onSegmentChange = (next: string) => {
    if (onSegmentChangeOverride) {
      onSegmentChangeOverride(next === "res" ? "res" : "km");
      return;
    }
    const q = new URLSearchParams();
    q.set("tab", "tabelle");
    if (next === "res") {
      q.set("segment", "res");
    }
    router.push(`${vereinPath}?${q.toString()}`);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex flex-wrap items-center gap-2 text-sm text-foreground">
          <span className="font-medium text-muted">Mannschaft:</span>
          <select
            value={segment}
            onChange={(e) => onSegmentChange(e.target.value)}
            className="h-10 min-w-[220px] rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25"
          >
            <option value="km" disabled={!hasKmTeam}>
              KM – Kampfmannschaft
            </option>
            <option value="res" disabled={!hasResTeam}>
              RES – Reserve
            </option>
          </select>
        </label>
        {liga?.editionId ? (
          <Link
            href={`/ligen#${bewerbEditionElementId(liga.editionId)}`}
            className="text-sm font-medium text-brand hover:underline"
          >
            Liga auf ScoutBase
          </Link>
        ) : liga?.editionSourceUrl ? (
          <a
            href={liga.editionSourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-brand hover:underline"
          >
            Quelle (ÖFB / SFV)
          </a>
        ) : null}
      </div>

      {liga ? (
        <>
          <div className="rounded-2xl border border-border bg-card px-5 py-4 shadow-lg shadow-black/20">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              {wappenSrc ? (
                <div className="mx-auto flex h-[4.5rem] w-14 shrink-0 items-center justify-start sm:mx-0">
                  <Image
                    src={wappenSrc}
                    alt={
                      bundeslandLabel
                        ? `Landeswappen ${bundeslandLabel}`
                        : "Landeswappen"
                    }
                    width={56}
                    height={72}
                    className="h-[4.5rem] w-14 object-contain object-left"
                    sizes="56px"
                    priority={false}
                  />
                </div>
              ) : null}
              <div className="min-w-0 flex-1 text-center sm:text-left">
                <p className="text-lg font-bold text-foreground">
                  {liga.ligaTitle}
                </p>
                {liga.saisonName ? (
                  <p className="mt-1 text-sm font-medium text-muted">
                    Saison {liga.saisonName}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-muted">
                    Tabellenstand aus dem Datenimport (SFV/ÖFB)
                  </p>
                )}
                {bundeslandLabel?.trim() ? (
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-brand">
                    Bundesland {bundeslandLabel.trim()}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {!Array.isArray(liga.rows) || liga.rows.length === 0 ? (
            <p className="text-sm text-muted">
              Für diese Mannschaft ist noch kein Tabellen-Snapshot in der Datenbank
              — Import oder Zuordnung der Bewerb-Edition prüfen.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-lg shadow-black/25 ring-1 ring-white/5">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-gradient-to-r from-brand/90 via-rose-800 to-rose-950 text-xs font-bold uppercase tracking-wide text-white shadow-sm">
                    <th className="px-2 py-3.5 pl-3">Pos.</th>
                    <th className="px-2 py-3.5">Mannschaft</th>
                    <th className="px-2 py-3.5 text-right tabular-nums text-white/90">
                      Spiele
                    </th>
                    <th className="px-2 py-3.5 text-right tabular-nums text-rose-100">
                      S
                    </th>
                    <th className="px-2 py-3.5 text-right tabular-nums text-amber-200">
                      U
                    </th>
                    <th className="px-2 py-3.5 text-right tabular-nums text-rose-200">
                      N
                    </th>
                    <th className="px-2 py-3.5 text-right tabular-nums">Tore</th>
                    <th className="px-2 py-3.5 text-right tabular-nums">Ggt.</th>
                    <th className="px-2 py-3.5 text-right tabular-nums">
                      Diff.
                    </th>
                    <th className="px-2 py-3.5 text-right tabular-nums text-amber-100">
                      Pkt.
                    </th>
                    <th className="px-2 py-3.5 pr-3">Form</th>
                  </tr>
                </thead>
                <tbody>
                  {(liga.rows ?? []).map((row, rowIdx) => {
                    const ownRow = isOwnTeamRow(row, liga);
                    const formLetters = row.form ?? [];
                    const gd = row.goal_difference;
                    const stripe =
                      !ownRow && rowIdx % 2 === 1
                        ? "bg-muted/30 dark:bg-muted/15"
                        : !ownRow
                          ? "bg-card/50 dark:bg-transparent"
                          : "";
                    return (
                      <tr
                        key={
                          row.team_id ??
                          `r${row.rank}-${String(row.team_name ?? "").replace(/\s+/g, "-")}`
                        }
                        className={[
                          "border-b border-border transition-colors last:border-0",
                          stripe,
                          ownRow
                            ? "bg-gradient-to-r from-brand/20 via-rose-950/40 to-card dark:from-brand/25 dark:via-rose-950/50 dark:to-card"
                            : "",
                        ].join(" ")}
                        aria-current={ownRow ? "true" : undefined}
                      >
                        <td
                          className={`px-2 py-2.5 tabular-nums font-semibold ${
                            ownRow
                              ? "border-l-4 border-l-brand pl-2 text-foreground"
                              : "pl-3 text-foreground"
                          }`}
                        >
                          {row.rank}
                        </td>
                        <td
                          className={`max-w-[220px] px-2 py-2.5 ${
                            ownRow
                              ? "font-bold text-foreground"
                              : "text-foreground"
                          }`}
                        >
                          {row.verein_id ? (
                            <ProfilePreviewLink
                              href={`/vereine/${encodeURIComponent(row.verein_id)}`}
                              className="cursor-pointer font-medium text-foreground underline-offset-2 transition hover:text-brand hover:underline"
                            >
                              {row.team_name}
                            </ProfilePreviewLink>
                          ) : (
                            <span title="Kein Verein in ScoutBase zu dieser Mannschaft zugeordnet">
                              {row.team_name}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-muted">
                          {row.played ?? "—"}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums font-medium text-brand">
                          {row.wins ?? "—"}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums font-medium text-amber-600 dark:text-amber-400">
                          {row.draws ?? "—"}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums font-medium text-red-600 dark:text-red-400">
                          {row.losses ?? "—"}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-sky-700 dark:text-sky-300">
                          {row.goals_for ?? "—"}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-orange-700/90 dark:text-orange-300/90">
                          {row.goals_against ?? "—"}
                        </td>
                        <td
                          className={[
                            "px-2 py-2.5 text-right tabular-nums font-medium",
                            gd == null
                              ? ""
                              :                             gd > 0
                                ? "text-brand"
                                : gd < 0
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-muted",
                          ].join(" ")}
                        >
                          {gd != null
                            ? gd > 0
                              ? `+${gd}`
                              : String(gd)
                            : "—"}
                        </td>
                        <td className="px-2 py-2.5 text-right text-base font-bold tabular-nums text-brand">
                          {row.points ?? "—"}
                        </td>
                        <td className="px-2 py-2.5 pr-3">
                          <FormBubbles
                            letters={formLetters}
                            emphasized={ownRow}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted">Keine Mannschaft für diesen Filter.</p>
      )}

      <section>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Letzte Ergebnisse
        </h2>
        {ergebnisse.length > 0 ? (
          <p className="mt-1 text-xs text-muted">
            Abgeschlossene Spiele (Liga, Pokal, Freundschaftsspiel) — neueste zuerst.
            Daten von der ÖFB-Mannschaftsseite bzw. aus dem ScoutBase-Import.
          </p>
        ) : null}
        {!ergebnisse.length ? (
          <p className="mt-4 text-sm text-muted">
            Keine abgeschlossenen Spiele mit Ergebnis für diese Mannschaft
            gefunden.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
            {ergebnisse.map((m) => {
              const inner = (
                <>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:min-w-[11rem]">
                    <span className="text-xs text-muted">{m.dateLabel}</span>
                    <ErgebnisCompetitionBadge m={m} />
                  </div>
                  <span className="min-w-0 flex-1 text-sm">
                    <span
                      className={
                        m.is_home
                          ? "font-semibold text-foreground"
                          : "text-foreground"
                      }
                    >
                      {m.home_team_name}
                    </span>
                    <span className="mx-2 text-muted">vs</span>
                    <span
                      className={
                        !m.is_home
                          ? "font-semibold text-foreground"
                          : "text-foreground"
                      }
                    >
                      {m.away_team_name}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-3 sm:justify-end">
                    <span
                      className={`tabular-nums ${scoreClass(m.result)}`}
                    >{`${m.our_goals} : ${m.their_goals}`}</span>
                    <ResultBadge r={m.result} />
                    <span className="text-xs font-medium text-muted">
                      {m.is_home ? "Heim" : "Ausw."}
                    </span>
                  </span>
                </>
              );
              return (
                <li
                  key={m.id}
                  className={
                    m.report_url
                      ? "p-0 transition-colors hover:bg-muted/40"
                      : "flex flex-col gap-2 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3"
                  }
                >
                  {m.report_url ? (
                    <a
                      href={m.report_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3"
                    >
                      {inner}
                    </a>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
