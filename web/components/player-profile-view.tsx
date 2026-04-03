"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { buildOefbPlayerPhotoUrl } from "@/lib/oefb-assets";
import type {
  ProfileKmResLine,
  SfvPlayerProfileData,
} from "@/lib/sfv-player-profile";
import {
  type PitchSlotId,
  positionLabelMatchesPitchSlot,
} from "@/lib/player-position-category";

const PITCH_SLOTS: {
  id: PitchSlotId;
  label: string;
  top: string;
  left: string;
}[] = [
  { id: "tw", label: "TW", left: "7%", top: "50%" },
  { id: "lv", label: "LV", left: "20%", top: "20%" },
  { id: "iv", label: "IV", left: "20%", top: "50%" },
  { id: "rv", label: "RV", left: "20%", top: "80%" },
  { id: "zdm", label: "ZDM", left: "38%", top: "52%" },
  { id: "zm", label: "ZM", left: "47%", top: "36%" },
  { id: "zom", label: "ZOM", left: "56%", top: "52%" },
  { id: "lf", label: "LF", left: "72%", top: "26%" },
  { id: "rf", label: "RF", left: "72%", top: "74%" },
  { id: "st", label: "ST", left: "84%", top: "50%" },
];

function slotColorsForLabel(
  label: string | null,
): Map<PitchSlotId, "def" | "mid" | "fwd" | "tw"> {
  const map = new Map<PitchSlotId, "def" | "mid" | "fwd" | "tw">();
  if (!label?.trim()) {
    return map;
  }
  const parts = label.split(/[,/]/).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    for (const s of PITCH_SLOTS) {
      if (positionLabelMatchesPitchSlot(part, s.id)) {
        const cat =
          s.id === "tw"
            ? "tw"
            : ["lv", "iv", "rv"].includes(s.id)
              ? "def"
              : ["zdm", "zm", "zom"].includes(s.id)
                ? "mid"
                : "fwd";
        map.set(s.id, cat);
        break;
      }
    }
  }
  return map;
}

/** Meta primary_positions = grün, secondary_positions = orange. */
function slotRolesForPositions(
  primary: string[],
  secondary: string[],
): Map<PitchSlotId, "primary" | "secondary"> {
  const map = new Map<PitchSlotId, "primary" | "secondary">();
  for (const part of primary) {
    for (const s of PITCH_SLOTS) {
      if (positionLabelMatchesPitchSlot(part, s.id)) {
        map.set(s.id, "primary");
        break;
      }
    }
  }
  for (const part of secondary) {
    for (const s of PITCH_SLOTS) {
      if (positionLabelMatchesPitchSlot(part, s.id)) {
        if (!map.has(s.id)) {
          map.set(s.id, "secondary");
        }
        break;
      }
    }
  }
  return map;
}

const SLOT_RING: Record<"tw" | "def" | "mid" | "fwd", string> = {
  tw: "ring-amber-300/90 shadow-[0_0_12px_rgba(251,191,36,0.55)]",
  def: "ring-sky-400/90 shadow-[0_0_12px_rgba(56,189,248,0.45)]",
  mid: "ring-orange-400/90 shadow-[0_0_12px_rgba(251,146,60,0.45)]",
  fwd: "ring-rose-400/90 shadow-[0_0_12px_rgba(251,113,133,0.45)]",
};

const SLOT_BG: Record<"tw" | "def" | "mid" | "fwd", string> = {
  tw: "bg-amber-300",
  def: "bg-sky-400",
  mid: "bg-orange-400",
  fwd: "bg-rose-400",
};

const SLOT_PITCH_PRIMARY =
  "bg-brand text-white ring-2 ring-white/90 shadow-[0_0_14px_rgba(34,197,94,0.55)] dark:ring-white/25";
const SLOT_PITCH_SECONDARY =
  "bg-orange-500 text-white ring-2 ring-orange-200/90 shadow-[0_0_14px_rgba(251,146,60,0.5)] dark:ring-orange-300/40";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (
      parts[0]![0] + parts[parts.length - 1]![0]
    ).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "—";
}

function formatDateDe(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) {
    return iso;
  }
  return d.toLocaleDateString("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function footLabel(
  f: "left" | "right" | "both" | null,
): { text: string; placeholder: boolean } {
  if (!f) {
    return { text: "—", placeholder: true };
  }
  if (f === "left") {
    return { text: "Links", placeholder: false };
  }
  if (f === "right") {
    return { text: "Rechts", placeholder: false };
  }
  return { text: "Beide", placeholder: false };
}

type TabId = "overview" | "stats" | "history";

function buildSeasonOptions(): { value: string; label: string }[] {
  const y = new Date().getFullYear();
  const mo = new Date().getMonth();
  const start = mo >= 6 ? y : y - 1;
  const list: { value: string; label: string }[] = [
    { value: "__current__", label: "Aktuelle Saison" },
  ];
  for (let i = 0; i < 6; i++) {
    const s = start - i;
    const key = `${s}/${(s + 1).toString().slice(2)}`;
    if (i === 0) {
      continue;
    }
    list.push({ value: key, label: key });
  }
  return list;
}

function fmtInt(n: number, show: boolean): string {
  if (!show) {
    return "—";
  }
  return n.toLocaleString("de-AT");
}

function fmtAvg(n: number | null, show: boolean): string {
  if (!show) {
    return "—";
  }
  if (n == null) {
    return "—";
  }
  return String(n);
}

function fmtSubs(a: number, b: number, show: boolean): string {
  if (!show) {
    return "—";
  }
  if (a === 0 && b === 0) {
    return "— / —";
  }
  return `${a} / ${b}`;
}

function StatsKmResTable({
  title,
  titleClassName,
  block,
  hasData,
  cupMode,
}: {
  title: string;
  titleClassName: string;
  block: {
    current: { km: ProfileKmResLine; res: ProfileKmResLine };
    total: { km: ProfileKmResLine; res: ProfileKmResLine };
  };
  hasData: boolean;
  /** Cup: leere Cup-Zeilen als „—“ */
  cupMode?: boolean;
}) {
  const c = block.current;
  const g = block.total;

  function goalsCell(line: ProfileKmResLine, show: boolean) {
    if (!show) {
      return "—";
    }
    if (
      cupMode &&
      line.goals === 0 &&
      line.appearances === 0 &&
      line.minutes === 0
    ) {
      return "—";
    }
    return fmtInt(line.goals, true);
  }

  return (
    <div className="mt-6">
      <h3
        className={cn(
          "mb-2 text-xs font-bold uppercase tracking-wide",
          titleClassName,
        )}
      >
        {title}
      </h3>
      <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700/80 dark:bg-slate-800/40">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-700/80 dark:bg-slate-800/60">
              <th
                className="min-w-[160px] px-2 py-2 text-left font-normal"
                rowSpan={2}
              />
              <th className="px-1 py-2 text-center" colSpan={2}>
                aktuelle Saison
              </th>
              <th className="px-1 py-2 text-center" colSpan={2}>
                Gesamt
              </th>
            </tr>
            <tr className="border-b border-slate-200 bg-white text-[10px] font-semibold text-slate-600 dark:border-slate-700/80 dark:bg-slate-800/60 dark:text-slate-400">
              <th className="px-2 py-1.5">KM</th>
              <th className="px-2 py-1.5">Res</th>
              <th className="px-2 py-1.5">KM</th>
              <th className="px-2 py-1.5">Res</th>
            </tr>
          </thead>
          <tbody className="text-slate-700 dark:text-slate-200">
            <tr className="border-b border-slate-100 dark:border-slate-700/80">
              <td className="px-2 py-2.5 text-slate-500 dark:text-slate-400">
                Einsätze
              </td>
              <td className="px-2 py-2.5 text-center tabular-nums">
                {fmtInt(c.km.appearances, hasData)}
              </td>
              <td className="px-2 py-2.5 text-center tabular-nums">
                {fmtInt(c.res.appearances, hasData)}
              </td>
              <td className="px-2 py-2.5 text-center tabular-nums">
                {fmtInt(g.km.appearances, hasData)}
              </td>
              <td className="px-2 py-2.5 text-center tabular-nums">
                {fmtInt(g.res.appearances, hasData)}
              </td>
            </tr>
            <tr className="border-b border-slate-100 dark:border-slate-700/80">
              <td className="px-2 py-2.5 text-slate-500 dark:text-slate-400">
                Einsatzminuten
              </td>
              <td className="px-2 py-2.5 text-center tabular-nums">
                {fmtInt(c.km.minutes, hasData)}
              </td>
              <td className="px-2 py-2.5 text-center tabular-nums">
                {fmtInt(c.res.minutes, hasData)}
              </td>
              <td className="px-2 py-2.5 text-center tabular-nums">
                {fmtInt(g.km.minutes, hasData)}
              </td>
              <td className="px-2 py-2.5 text-center tabular-nums">
                {fmtInt(g.res.minutes, hasData)}
              </td>
            </tr>
            <tr className="border-b border-slate-100 dark:border-slate-700/80">
              <td className="px-2 py-2.5 text-slate-500 dark:text-slate-400">
                ø Einsatzminuten je Spiel
              </td>
              <td className="px-2 py-2.5 text-center tabular-nums">
                {fmtAvg(c.km.avg_minutes, hasData)}
              </td>
              <td className="px-2 py-2.5 text-center tabular-nums">
                {fmtAvg(c.res.avg_minutes, hasData)}
              </td>
              <td className="px-2 py-2.5 text-center tabular-nums">
                {fmtAvg(g.km.avg_minutes, hasData)}
              </td>
              <td className="px-2 py-2.5 text-center tabular-nums">
                {fmtAvg(g.res.avg_minutes, hasData)}
              </td>
            </tr>
            <tr className="border-b border-slate-100 dark:border-slate-700/80">
              <td className="px-2 py-2.5 text-slate-500 dark:text-slate-400">
                Ein- / Auswechslungen
              </td>
              <td className="px-2 py-2.5 text-center tabular-nums text-slate-600 dark:text-slate-300">
                {fmtSubs(c.km.subs_in, c.km.subs_out, hasData)}
              </td>
              <td className="px-2 py-2.5 text-center tabular-nums text-slate-600 dark:text-slate-300">
                {fmtSubs(c.res.subs_in, c.res.subs_out, hasData)}
              </td>
              <td className="px-2 py-2.5 text-center tabular-nums text-slate-600 dark:text-slate-300">
                {fmtSubs(g.km.subs_in, g.km.subs_out, hasData)}
              </td>
              <td className="px-2 py-2.5 text-center tabular-nums text-slate-600 dark:text-slate-300">
                {fmtSubs(g.res.subs_in, g.res.subs_out, hasData)}
              </td>
            </tr>
            <tr>
              <td className="px-2 py-2.5 text-slate-500 dark:text-slate-400">
                Tore
              </td>
              <td
                className={cn(
                  "px-2 py-2.5 text-center tabular-nums font-semibold",
                  titleClassName.includes("red")
                    ? "text-red-600 dark:text-red-300"
                    : "text-brand",
                )}
              >
                {goalsCell(c.km, hasData)}
              </td>
              <td
                className={cn(
                  "px-2 py-2.5 text-center tabular-nums font-semibold",
                  titleClassName.includes("red")
                    ? "text-red-600 dark:text-red-300"
                    : "text-brand",
                )}
              >
                {goalsCell(c.res, hasData)}
              </td>
              <td
                className={cn(
                  "px-2 py-2.5 text-center tabular-nums font-semibold",
                  titleClassName.includes("red")
                    ? "text-red-600 dark:text-red-300"
                    : "text-brand",
                )}
              >
                {goalsCell(g.km, hasData)}
              </td>
              <td
                className={cn(
                  "px-2 py-2.5 text-center tabular-nums font-semibold",
                  titleClassName.includes("red")
                    ? "text-red-600 dark:text-red-300"
                    : "text-brand",
                )}
              >
                {goalsCell(g.res, hasData)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PlayerHistoryTab({ profile }: { profile: SfvPlayerProfileData }) {
  const hasClubs = profile.clubHistory.length > 0;
  const hasTransfers = profile.transferHistory.length > 0;

  if (!hasClubs && !hasTransfers) {
    return (
      <div className="px-4 py-10 text-center text-sm text-slate-500 sm:px-6 dark:text-slate-400">
        Für diesen Spieler liegen noch keine Vereinsstationen oder Transfers in der
        Datenbank vor.
      </div>
    );
  }

  return (
    <div className="space-y-8 p-4 sm:p-6">
      <section>
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          Bisherige Vereine & Mannschaften
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Sortierung: aktuelle Station zuerst, danach nach Ende der Zuordnung (neu nach
          alt).
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700/80 dark:bg-slate-800/40">
          <table className="w-max max-w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 bg-white text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-700/80 dark:bg-slate-800/60">
                <th className="whitespace-nowrap py-2.5 pl-3 pr-3 text-left sm:pr-4">
                  Von
                </th>
                <th className="whitespace-nowrap py-2.5 pr-3 sm:pr-4">Bis</th>
                <th className="min-w-[10rem] py-2.5 pr-3 sm:pr-4">Verein</th>
                <th className="min-w-[9rem] py-2.5 pr-3 sm:pr-4">Mannschaft</th>
                <th className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums">
                  Einsätze
                </th>
                <th className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums">
                  Tore
                </th>
                <th className="whitespace-nowrap py-2.5 pl-2 pr-3 text-right tabular-nums sm:pr-4">
                  Ø Tore/Spiel
                </th>
              </tr>
            </thead>
            <tbody>
              {hasClubs ? (
                profile.clubHistory.map((row) => (
                  <tr
                    key={row.membership_id}
                    className="text-slate-700 dark:text-slate-200"
                  >
                    <td className="py-2.5 pl-3 pr-3 tabular-nums text-slate-600 dark:text-slate-400 sm:pr-4">
                      {formatDateDe(row.joined_on)}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums sm:pr-4">
                      {row.is_current ? (
                        <span className="font-medium text-brand">heute</span>
                      ) : (
                        <span className="text-slate-600 dark:text-slate-400">
                          {formatDateDe(row.left_on)}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 font-medium sm:pr-4">
                      {row.verein_id ? (
                        <Link
                          href={`/vereine/${encodeURIComponent(row.verein_id)}`}
                          className="text-brand hover:underline"
                        >
                          {row.verein_name}
                        </Link>
                      ) : (
                        row.verein_name
                      )}
                    </td>
                    <td className="max-w-[14rem] py-2.5 pr-3 text-slate-600 dark:text-slate-400 sm:pr-4">
                      {row.team_name}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {row.appearances}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-brand">
                      {row.goals}
                    </td>
                    <td className="py-2.5 pl-2 pr-3 text-right tabular-nums text-slate-600 dark:text-slate-400 sm:pr-4">
                      {row.avg_goals_per_game != null
                        ? row.avg_goals_per_game.toLocaleString("de-AT", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        : "—"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-8 text-center text-slate-500 dark:text-slate-400"
                  >
                    Keine gespeicherten Mannschafts-Stationen.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {hasTransfers ? (
        <section>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Transfers & Wechsel
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Einträge aus dem Transfer-Import (ÖFB/SFV), chronologisch mit neuestem
            zuerst.
          </p>
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700/80 dark:bg-slate-800/40">
            <table className="w-max max-w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-slate-200 bg-white text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-700/80 dark:bg-slate-800/60">
                  <th className="whitespace-nowrap py-2.5 pl-3 pr-4 text-left sm:pr-6">
                    Datum
                  </th>
                  <th className="min-w-[10rem] py-2.5 pr-4 sm:pr-6">Von</th>
                  <th className="min-w-[10rem] py-2.5 pr-4 sm:pr-6">Nach</th>
                  <th className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums">
                    Einsätze
                  </th>
                  <th className="whitespace-nowrap py-2.5 pl-2 pr-3 sm:pr-4">
                    Kategorie
                  </th>
                </tr>
              </thead>
              <tbody>
                {profile.transferHistory.map((t) => (
                  <tr
                    key={t.id}
                    className="text-slate-700 dark:text-slate-200"
                  >
                    <td className="py-2.5 pl-3 pr-4 tabular-nums text-slate-600 dark:text-slate-400 sm:pr-6">
                      {formatDateDe(t.transfer_date)}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-800 dark:text-slate-100 sm:pr-6">
                      {t.from_verein_name?.trim() || "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-800 dark:text-slate-100 sm:pr-6">
                      {t.to_verein_name?.trim() || "—"}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {t.appearances != null ? t.appearances : "—"}
                    </td>
                    <td className="py-2.5 pl-2 pr-3 text-slate-600 dark:text-slate-400 sm:pr-4">
                      {t.category_label?.trim() || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function PlayerStatsTab({ profile }: { profile: SfvPlayerProfileData }) {
  const [season, setSeason] = useState("__current__");
  const sk = profile.statsTables.dataSeasonKey;

  const options = useMemo(() => buildSeasonOptions(), []);

  const hasData =
    season === "__current__" || season === sk;

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-col items-stretch justify-end gap-3 sm:flex-row sm:items-center">
        <p className="flex-1 text-xs text-slate-500 dark:text-slate-400">
          Saison wählen: Importdaten sind derzeit der Saison{" "}
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            {sk}
          </span>{" "}
          zugeordnet. Ältere Saisons folgen mit historisierten Stats.
        </p>
        <label className="flex shrink-0 flex-col gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Saison
          <select
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className="h-10 min-w-[180px] rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <StatsKmResTable
        title="Statistik Meisterschaft"
        titleClassName="text-slate-800 dark:text-slate-200"
        block={profile.statsTables.meisterschaft}
        hasData={hasData}
      />

      <StatsKmResTable
        title="Statistik Cup"
        titleClassName="text-slate-800 dark:text-slate-200"
        block={profile.statsTables.cup}
        hasData={hasData}
        cupMode
      />
    </div>
  );
}

export function PlayerProfileView({ profile }: { profile: SfvPlayerProfileData }) {
  const [tab, setTab] = useState<TabId>("overview");

  const pos = profile.primary?.position_label ?? null;
  const positionLabelForChip =
    profile.primaryPositions.length > 0 || profile.secondaryPositions.length > 0
      ? [...profile.primaryPositions, ...profile.secondaryPositions].join(", ")
      : pos;

  const pitchPaint = useMemo(() => {
    const hasPs =
      profile.primaryPositions.length > 0 || profile.secondaryPositions.length > 0;
    if (hasPs) {
      const roles = slotRolesForPositions(
        profile.primaryPositions,
        profile.secondaryPositions,
      );
      if (roles.size > 0) {
        return { kind: "roles" as const, roles };
      }
    }
    return { kind: "categories" as const, cats: slotColorsForLabel(pos) };
  }, [profile.primaryPositions, profile.secondaryPositions, pos]);

  const photoUrl = buildOefbPlayerPhotoUrl(profile.person.foto_public_uid, "320x320");

  const birthYear = profile.birthYear;

  const sublineParts: string[] = [];
  if (birthYear != null) {
    sublineParts.push(`Jg. ${birthYear}`);
  }
  if (profile.primary) {
    sublineParts.push(
      `${profile.primary.verein_name} (${profile.primary.liga_label ?? "—"})`,
    );
  }

  const foot = footLabel(profile.person.strong_foot);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/spieler"
          className="inline-flex w-fit items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/80"
        >
          ← Spielerübersicht
        </Link>
        <Link
          href="/spieler"
          className="inline-flex w-fit items-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand/90"
        >
          Spieler vergleichen
        </Link>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-slate-700/80 dark:bg-slate-800/40 dark:shadow-none">
        <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-start lg:gap-10">
          <div className="flex shrink-0 gap-5">
            {photoUrl ? (
              <Image
                src={photoUrl}
                width={128}
                height={128}
                alt=""
                className="h-28 w-28 shrink-0 rounded-full object-cover ring-2 ring-slate-200/90 dark:ring-slate-600/80 sm:h-32 sm:w-32"
                sizes="128px"
              />
            ) : (
              <span
                className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full bg-slate-100 text-3xl font-bold text-slate-600 ring-2 ring-slate-200/70 dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-600/60 sm:h-32 sm:w-32"
                aria-hidden
              >
                {initials(profile.displayName)}
              </span>
            )}
            <div className="min-w-0 lg:hidden">
              <PositionChip label={positionLabelForChip} />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
                  <span>{profile.displayName}</span>
                  {profile.person.profile_verified ? (
                    <ProfileVerifiedBadge />
                  ) : null}
                  {profile.primary?.shirt_number ? (
                    <span className="text-brand">
                      #{profile.primary.shirt_number}
                    </span>
                  ) : null}
                </h1>
                {sublineParts.length > 0 ? (
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    {sublineParts.join(" · ")}
                  </p>
                ) : null}
              </div>
              <div className="hidden lg:block">
                <PositionChip label={positionLabelForChip} />
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Spiele" value={String(profile.totals.appearances)} />
              <StatTile label="Tore" value={String(profile.totals.goals)} accent />
              <StatTile label="Karten" value={String(profile.totals.cards)} />
              <StatTile
                label="Rating"
                value={String(profile.rating)}
                highlight
              />
            </div>
          </div>
        </div>

        <div className="border-t border-border/70 bg-card/40 dark:border-border/60 dark:bg-card/30">
          <nav
            className="flex gap-1 border-b border-border/60 px-4 sm:gap-2 sm:px-6 dark:border-border/50"
            role="tablist"
            aria-label="Profilbereiche"
          >
            {(
              [
                ["overview", "Übersicht"],
                ["stats", "Statistiken"],
                ["history", "Historie"],
              ] as const
            ).map(([id, label]) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(id)}
                  className={cn(
                    "relative -mb-px border-b-2 px-4 py-3.5 text-sm font-semibold transition-colors sm:px-5",
                    active
                      ? "border-brand text-brand"
                      : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:text-slate-400 dark:hover:border-slate-500 dark:hover:text-slate-200",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </nav>

          {tab === "overview" && (
            <div className="space-y-6 p-4 sm:p-6">
            <div>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Aktuelle Statistiken ({profile.seasonLabel})
              </h2>
              <div className="mt-3 overflow-x-auto">
                <div className="inline-block w-max max-w-full rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700/80 dark:bg-slate-800/40">
                <table className="w-max max-w-full border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-white text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-700/80 dark:bg-slate-800/60">
                      <th className="whitespace-nowrap py-2.5 pl-3 pr-4 text-left sm:pr-6">
                        Verein
                      </th>
                      <th className="max-w-[14rem] whitespace-normal py-2.5 pr-4 text-left sm:pr-6">
                        Liga
                      </th>
                      <th className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums">
                        Einsätze
                      </th>
                      <th className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums">
                        Tore
                      </th>
                      <th className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums">
                        Einw.
                      </th>
                      <th className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums">
                        Ausw.
                      </th>
                      <th className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums">
                        Gelb
                      </th>
                      <th className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums">
                        Gelb-Rot
                      </th>
                      <th className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums">
                        Rot
                      </th>
                      <th className="whitespace-nowrap py-2.5 pl-2 pr-3 text-right tabular-nums sm:pr-4">
                        Ø Min.
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.statsRow ? (
                      <tr className="text-slate-700 dark:text-slate-200">
                        <td className="py-2.5 pl-3 pr-4 font-medium sm:pr-6">
                          {profile.statsRow.verein_name}
                        </td>
                        <td className="max-w-[14rem] py-2.5 pr-4 text-slate-600 dark:text-slate-400 sm:pr-6">
                          {profile.statsRow.liga_label ?? "—"}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums">
                          {profile.statsRow.stats.appearances}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-brand">
                          {profile.statsRow.stats.goals}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-slate-500 dark:text-slate-400">
                          {profile.statsRow.stats.subs_in || "—"}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-slate-500 dark:text-slate-400">
                          {profile.statsRow.stats.subs_out || "—"}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums">
                          {profile.statsRow.stats.yellow}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums">
                          {profile.statsRow.stats.yellow_red}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums">
                          {profile.statsRow.stats.red}
                        </td>
                        <td className="py-2.5 pl-2 pr-3 text-right tabular-nums text-slate-500 dark:text-slate-400 sm:pr-4">
                          {profile.statsRow.stats.avg_minutes != null
                            ? `${Math.round(profile.statsRow.stats.avg_minutes)}`
                            : "—"}
                        </td>
                      </tr>
                    ) : (
                      <tr>
                        <td
                          colSpan={10}
                          className="px-3 py-8 text-center text-slate-500 dark:text-slate-400"
                        >
                          Keine Mannschafts-Zuordnung mit Statistik.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700/80 dark:bg-slate-800/40">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Persönliche Informationen
                </h3>
                <dl className="mt-4 divide-y divide-slate-100/90 text-sm dark:divide-slate-700/60">
                  <Row k="Name" v={profile.displayName} />
                  <Row
                    k="Geburtsjahr"
                    v={birthYear != null ? String(birthYear) : "—"}
                  />
                  <Row
                    k="Nationalität"
                    v={profile.person.nationalitaet ?? "—"}
                  />
                  <Row
                    k="Größe"
                    v={
                      profile.person.height_cm != null
                        ? `${profile.person.height_cm} cm`
                        : "—"
                    }
                    hint={
                      profile.person.height_cm == null
                        ? "später ergänzbar"
                        : undefined
                    }
                  />
                  <Row
                    k="Starker Fuß"
                    v={foot.text}
                    hint={foot.placeholder ? "später ergänzbar" : undefined}
                  />
                  <Row
                    k="Positionen"
                    v={
                      profile.primaryPositions.length > 0 ||
                      profile.secondaryPositions.length > 0 ? (
                        <span className="inline-flex flex-wrap items-baseline justify-end gap-x-1 gap-y-0.5">
                          {profile.primaryPositions.length > 0 ? (
                            <span className="font-medium text-brand">
                              {profile.primaryPositions.join(", ")}
                            </span>
                          ) : null}
                          {profile.primaryPositions.length > 0 &&
                          profile.secondaryPositions.length > 0 ? (
                            <span className="text-slate-400">·</span>
                          ) : null}
                          {profile.secondaryPositions.length > 0 ? (
                            <span className="font-medium text-orange-600 dark:text-orange-400">
                              {profile.secondaryPositions.join(", ")}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        (pos ?? "—")
                      )
                    }
                  />
                  <Row
                    k="Rating"
                    v={
                      <span className="font-semibold text-brand">
                        {profile.rating} ★
                      </span>
                    }
                  />
                </dl>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700/80 dark:bg-slate-800/40">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Vereinsinformationen
                </h3>
                <dl className="mt-4 space-y-3 text-sm">
                  <Row
                    k="Aktueller Verein"
                    v={
                      profile.primary ? (
                        <Link
                          href={`/vereine/${encodeURIComponent(profile.primary.verein_id)}`}
                          className="font-medium text-brand hover:underline"
                        >
                          {profile.primary.verein_name}
                        </Link>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <Row
                    k="Liga"
                    v={
                      profile.primary?.liga_label ??
                      "—"
                    }
                  />
                  <Row
                    k="Aktueller Tabellenplatz"
                    v={
                      profile.tabellenplatz != null
                        ? `${profile.tabellenplatz}.`
                        : "—"
                    }
                  />
                  <Row
                    k="Aktueller Trainer"
                    v={
                      profile.trainer
                        ? `${profile.trainer.display_name}${
                            profile.trainer.age != null
                              ? ` (${profile.trainer.age})`
                              : ""
                          }`
                        : "—"
                    }
                  />
                  <Row
                    k="Gegründet"
                    v={
                      profile.verein_founded_year != null
                        ? String(profile.verein_founded_year)
                        : "—"
                    }
                  />
                  <Row
                    k="Im Verein seit"
                    v={formatDateDe(profile.primary?.joined_on ?? null)}
                  />
                </dl>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700/80 dark:bg-slate-800/40">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Spielpositionen
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {profile.primaryPositions.length > 0 ||
                profile.secondaryPositions.length > 0
                  ? "Grün und orange kennzeichnen unterschiedliche Rollen. Ohne Meta-Felder gelten die Kader-Farben."
                  : "Positionen aus dem Kader-Import; mehrere Rollen werden auf dem Feld markiert."}
              </p>
              {profile.primaryPositions.length > 0 ||
              profile.secondaryPositions.length > 0 ? (
                <div
                  className="mt-2 flex flex-wrap gap-3"
                  aria-label="Legende: grün und orange Markierungen"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand ring-1 ring-white/50"
                    title="Erste Rolle"
                    aria-hidden
                  />
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full bg-orange-500 ring-1 ring-white/40"
                    title="Zweite Rolle"
                    aria-hidden
                  />
                </div>
              ) : null}
              <div className="mt-4 flex justify-center">
                <div className="relative aspect-[120/100] w-full max-w-[420px] overflow-hidden rounded-lg ring-1 ring-slate-200/90 dark:ring-slate-600/80">
                  <svg
                    className="h-full w-full"
                    viewBox="0 0 120 100"
                    preserveAspectRatio="none"
                    aria-hidden
                  >
                    <defs>
                      <linearGradient
                        id="ppGrass"
                        x1="0"
                        y1="0"
                        x2="120"
                        y2="0"
                        gradientUnits="userSpaceOnUse"
                      >
                        <stop offset="0%" stopColor="#2f9d5c" />
                        <stop offset="100%" stopColor="#268a50" />
                      </linearGradient>
                    </defs>
                    <rect width="120" height="100" fill="url(#ppGrass)" />
                    <rect
                      x="4"
                      y="4"
                      width="112"
                      height="92"
                      fill="none"
                      stroke="rgba(255,255,255,0.35)"
                      strokeWidth="0.6"
                    />
                    <circle
                      cx="60"
                      cy="50"
                      r="12"
                      fill="none"
                      stroke="rgba(255,255,255,0.35)"
                      strokeWidth="0.5"
                    />
                    {/* Mittellinie (FIFA-Maße ~105×68 m auf Innenfeld 112×92 skaliert) */}
                    <line
                      x1="60"
                      y1="4"
                      x2="60"
                      y2="96"
                      stroke="rgba(255,255,255,0.35)"
                      strokeWidth="0.55"
                    />
                    {/* Strafraum (16er): 16,5 m tief, 40,3 m entlang der Torlinie */}
                    <rect
                      x="4"
                      y="22.74"
                      width="17.6"
                      height="54.52"
                      fill="none"
                      stroke="rgba(255,255,255,0.35)"
                      strokeWidth="0.55"
                    />
                    <rect
                      x="98.4"
                      y="22.74"
                      width="17.6"
                      height="54.52"
                      fill="none"
                      stroke="rgba(255,255,255,0.35)"
                      strokeWidth="0.55"
                    />
                  </svg>
                  {PITCH_SLOTS.map((s) => {
                    const role =
                      pitchPaint.kind === "roles"
                        ? pitchPaint.roles.get(s.id)
                        : null;
                    const cat =
                      pitchPaint.kind === "categories"
                        ? pitchPaint.cats.get(s.id)
                        : null;
                    return (
                      <div
                        key={s.id}
                        className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                        style={{ left: s.left, top: s.top }}
                      >
                        <span
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-full text-[9px] font-bold ring-2",
                            role === "primary"
                              ? SLOT_PITCH_PRIMARY
                              : role === "secondary"
                                ? SLOT_PITCH_SECONDARY
                                : cat
                                  ? cn(
                                      "text-slate-900",
                                      SLOT_BG[cat],
                                      SLOT_RING[cat],
                                    )
                                  : "bg-slate-200/90 text-slate-900 ring-slate-300 dark:bg-white/25 dark:ring-white/20",
                          )}
                        >
                          {s.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          )}

          {tab === "stats" && <PlayerStatsTab profile={profile} />}

          {tab === "history" && <PlayerHistoryTab profile={profile} />}
        </div>
      </section>
    </div>
  );
}

function ProfileVerifiedBadge() {
  /** Gewelltes Siegel (Bootstrap „patch“-Pfad) + weißer Haken – vergleichbar mit gängigen „Verified“-Badges. */
  return (
    <span
      className="inline-flex shrink-0 translate-y-[1px] align-middle"
      title="Zertifiziertes Profil"
      aria-label="Zertifiziertes Profil"
    >
      <svg
        viewBox="0 0 16 16"
        className="h-6 w-6 drop-shadow-sm"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path
          fill="#1D9BF0"
          d="M10.067.87a2.89 2.89 0 0 0-4.134 0l-.622.638-.89-.011a2.89 2.89 0 0 0-2.924 2.924l.01.89-.636.622a2.89 2.89 0 0 0 0 4.134l.637.622-.011.89a2.89 2.89 0 0 0 2.924 2.924l.89-.01.622.636a2.89 2.89 0 0 0 4.134 0l.622-.637.89.011a2.89 2.89 0 0 0 2.924-2.924l-.01-.89.636-.622a2.89 2.89 0 0 0 0-4.134l-.637-.622.011-.89a2.89 2.89 0 0 0-2.924-2.924l-.89.01z"
        />
        <path
          d="M4.7 8.35 6.9 10.55 12.25 5.2"
          fill="none"
          stroke="white"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function PositionChip({ label }: { label: string | null }) {
  if (!label?.trim()) {
    return (
      <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500 dark:border-slate-600 dark:bg-slate-700/60 dark:text-slate-400">
        Position —
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full border border-brand/40 bg-brand/10 px-3 py-1 text-xs font-semibold text-brand dark:bg-brand/15">
      {label}
    </span>
  );
}

function StatTile({
  label,
  value,
  accent,
  highlight,
}: {
  label: string;
  value: ReactNode;
  accent?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-3 text-center sm:px-4",
        highlight
          ? "border-brand/50 bg-brand/10"
          : "border-slate-200/90 bg-slate-50/90 dark:border-slate-600 dark:bg-slate-800/60",
      )}
    >
      <div
        className={cn(
          "text-xl font-bold tabular-nums sm:text-2xl",
          highlight ? "text-brand" : accent ? "text-brand" : "text-slate-900 dark:text-slate-100",
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
    </div>
  );
}

function Row({
  k,
  v,
  hint,
}: {
  k: string;
  v: ReactNode;
  hint?: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(5.5rem,32%)_1fr] items-baseline gap-x-3 gap-y-0 py-2 sm:grid-cols-[8.5rem_1fr] sm:gap-x-4">
      <dt className="text-xs font-medium leading-snug text-slate-500 dark:text-slate-400">
        {k}
      </dt>
      <dd className="min-w-0 text-right text-sm leading-snug text-slate-900 dark:text-slate-100">
        <span className="inline-flex flex-wrap items-baseline justify-end gap-x-1.5 gap-y-0.5">
          <span>{v}</span>
          {hint ? (
            <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
              · {hint}
            </span>
          ) : null}
        </span>
      </dd>
    </div>
  );
}
