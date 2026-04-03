"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import { IconSearch } from "@/components/ui/dashboard-icons";
import { cn } from "@/lib/cn";
import { buildVereinePersonPhotoUrl } from "@/lib/oefb-assets";
import type { SfvTrainerDirectoryRow } from "@/lib/sfv-trainer-directory";

type ViewMode = "table" | "grid";

const FILTER_PANEL =
  "rounded-2xl bg-[#252b3a] px-4 py-4 text-[#e8eaef] shadow-[0_12px_32px_-8px_rgba(15,23,42,0.28)] sm:px-5 sm:py-5";
const FILTER_MUTED = "text-[#8b95a8]";
const FILTER_INPUT =
  "mt-1 h-9 w-full rounded-lg border border-white/[0.12] bg-[#323a4d] px-2.5 text-sm text-white shadow-inner outline-none transition placeholder:text-[#6b7289] focus:border-white/25 focus:ring-1 focus:ring-white/15";

const LICENSE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Alle Lizenzen" },
  { value: "UEFA Pro", label: "UEFA Pro" },
  { value: "UEFA A", label: "UEFA A" },
  { value: "UEFA B", label: "UEFA B" },
  { value: "UEFA C", label: "UEFA C" },
  { value: "UEFA D", label: "UEFA D" },
];

type TableSortKey =
  | "name"
  | "verein"
  | "region"
  | "liga"
  | "license"
  | "wins"
  | "draws"
  | "losses"
  | "winrate";

type Props = {
  rows: SfvTrainerDirectoryRow[];
  /** Alle Ligen aus Team-Import; ergänzt Filter, auch ohne Trainer in dieser Liga */
  ligaOptions?: string[];
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (
      parts[0]![0] + parts[parts.length - 1]![0]
    ).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "—";
}

function numOrNull(a: number | null, b: number | null): number {
  const na = a ?? -1;
  const nb = b ?? -1;
  return na - nb;
}

function compareRows(
  a: SfvTrainerDirectoryRow,
  b: SfvTrainerDirectoryRow,
  key: TableSortKey,
): number {
  switch (key) {
    case "name":
      return a.name.localeCompare(b.name, "de");
    case "verein":
      return a.verein_name.localeCompare(b.verein_name, "de");
    case "region":
      return (a.region_label ?? "").localeCompare(b.region_label ?? "", "de");
    case "liga":
      return (a.liga_label ?? "").localeCompare(b.liga_label ?? "", "de");
    case "license":
      return a.license_label.localeCompare(b.license_label, "de");
    case "wins":
      return numOrNull(a.wins, b.wins);
    case "draws":
      return numOrNull(a.draws, b.draws);
    case "losses":
      return numOrNull(a.losses, b.losses);
    case "winrate":
      return numOrNull(a.win_rate_percent, b.win_rate_percent);
    default:
      return 0;
  }
}

function TrainerSortCol({
  label,
  colKey,
  activeKey,
  sortDir,
  onSort,
  align = "left",
  thClassName = "px-4 py-3.5",
}: {
  label: string;
  colKey: TableSortKey;
  activeKey: TableSortKey;
  sortDir: "asc" | "desc";
  onSort: (k: TableSortKey) => void;
  align?: "left" | "right";
  thClassName?: string;
}) {
  const active = activeKey === colKey;
  return (
    <th
      scope="col"
      className={cn(
        thClassName,
        align === "right" && "text-right",
        align === "left" && "text-left",
      )}
    >
      <button
        type="button"
        title="Spalte sortieren"
        onClick={() => onSort(colKey)}
        className={cn(
          "inline-flex max-w-full items-center gap-1 rounded-md px-0.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide transition",
          align === "right" && "ml-auto",
          active
            ? "text-slate-800 dark:text-slate-200"
            : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-700/40 dark:hover:text-slate-200",
        )}
      >
        <span className="truncate">{label}</span>
        {active ? (
          <span aria-hidden className="shrink-0 tabular-nums opacity-90">
            {sortDir === "asc" ? "↑" : "↓"}
          </span>
        ) : (
          <span className="shrink-0 text-[10px] font-normal opacity-35" aria-hidden>
            ↕
          </span>
        )}
      </button>
    </th>
  );
}

export function TrainerDirectory({ rows, ligaOptions }: Props) {
  const [view, setView] = useState<ViewMode>("table");
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");
  const [liga, setLiga] = useState("");
  const [license, setLicense] = useState("");
  const [sortKey, setSortKey] = useState<TableSortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const regions = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      if (r.region_label?.trim()) {
        s.add(r.region_label.trim());
      }
    }
    return [...s].sort((a, b) => a.localeCompare(b, "de"));
  }, [rows]);

  const ligas = useMemo(() => {
    const s = new Set<string>();
    for (const x of ligaOptions ?? []) {
      if (x.trim()) {
        s.add(x.trim());
      }
    }
    for (const r of rows) {
      if (r.liga_label?.trim()) {
        s.add(r.liga_label.trim());
      }
    }
    return [...s].sort((a, b) => a.localeCompare(b, "de"));
  }, [rows, ligaOptions]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (query.trim()) {
      n++;
    }
    if (region) {
      n++;
    }
    if (liga) {
      n++;
    }
    if (license) {
      n++;
    }
    return n;
  }, [query, region, liga, license]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const name = r.name.toLowerCase();
      const club = r.verein_team.toLowerCase();
      if (q && !name.includes(q) && !club.includes(q)) {
        return false;
      }
      if (region && (r.region_label?.trim() ?? "") !== region) {
        return false;
      }
      if (liga && (r.liga_label?.trim() ?? "") !== liga) {
        return false;
      }
      if (license && r.license_label !== license) {
        return false;
      }
      return true;
    });
  }, [rows, query, region, liga, license]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const mult = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => compareRows(a, b, sortKey) * mult);
    return arr;
  }, [filtered, sortKey, sortDir]);

  function handleSort(k: TableSortKey) {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir("asc");
    }
  }

  function resetFilters() {
    setQuery("");
    setRegion("");
    setLiga("");
    setLicense("");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-[2rem] sm:leading-tight">
            Trainer
          </h1>
          <p className="mt-2 text-sm font-medium text-slate-500 dark:text-slate-400">
            {filtered.length} von {rows.length} Trainern
          </p>
        </div>
        <div
          className="inline-flex shrink-0 rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-600 dark:bg-slate-800/80"
          role="group"
          aria-label="Ansicht"
        >
          <button
            type="button"
            onClick={() => setView("table")}
            className={cn(
              "rounded-lg px-6 py-2.5 text-sm font-semibold transition-colors",
              view === "table"
                ? "bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-900"
                : "bg-transparent text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700/60",
            )}
          >
            Tabelle
          </button>
          <button
            type="button"
            onClick={() => setView("grid")}
            className={cn(
              "rounded-lg px-6 py-2.5 text-sm font-semibold transition-colors",
              view === "grid"
                ? "bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-900"
                : "bg-transparent text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700/60",
            )}
          >
            Grid
          </button>
        </div>
      </div>

      <div className={FILTER_PANEL}>
        <p
          className={cn(
            "mb-3 text-[10px] font-bold uppercase tracking-[0.1em]",
            FILTER_MUTED,
          )}
        >
          Filter &amp; Suche
        </p>
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:gap-3">
          <label className="min-w-0 flex-1 md:min-w-[200px]">
            <span
              className={cn(
                "text-[10px] font-bold uppercase tracking-[0.1em]",
                FILTER_MUTED,
              )}
            >
              Suche
            </span>
            <span className="relative mt-1 block">
              <span
                className={cn(
                  "pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2",
                  FILTER_MUTED,
                )}
              >
                <IconSearch />
              </span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name oder Verein …"
                className={cn(FILTER_INPUT, "pl-9")}
                autoComplete="off"
                aria-label="Suche"
              />
            </span>
          </label>
          <label className="w-full shrink-0 md:w-44">
            <span
              className={cn(
                "text-[10px] font-bold uppercase tracking-[0.1em]",
                FILTER_MUTED,
              )}
            >
              Region
            </span>
            <select
              className={FILTER_INPUT}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              <option value="">Alle Regionen</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="w-full shrink-0 md:w-44">
            <span
              className={cn(
                "text-[10px] font-bold uppercase tracking-[0.1em]",
                FILTER_MUTED,
              )}
            >
              Lizenz
            </span>
            <select
              className={FILTER_INPUT}
              value={license}
              onChange={(e) => setLicense(e.target.value)}
            >
              {LICENSE_OPTIONS.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="w-full shrink-0 md:w-44">
            <span
              className={cn(
                "text-[10px] font-bold uppercase tracking-[0.1em]",
                FILTER_MUTED,
              )}
            >
              Liga
            </span>
            <select
              className={FILTER_INPUT}
              value={liga}
              onChange={(e) => setLiga(e.target.value)}
            >
              <option value="">Alle Ligas</option>
              {ligas.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] pt-4">
          <p className="text-[11px] text-[#6b7289]">
            Lizenz: Demo-Zuweisung (fiktiv). Bilanz: keine echte Datenquelle im
            Import.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            disabled={activeFilterCount === 0}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              activeFilterCount === 0
                ? "cursor-not-allowed text-[#5c6577]"
                : "bg-white/10 text-white hover:bg-white/15",
            )}
          >
            Filter zurücksetzen
          </button>
        </div>
      </div>

      {view === "table" ? (
        <TrainerTable
          rows={sorted}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
        />
      ) : (
        <TrainerGrid rows={sorted} />
      )}
    </div>
  );
}

function TrainerTable({
  rows,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: SfvTrainerDirectoryRow[];
  sortKey: TableSortKey;
  sortDir: "asc" | "desc";
  onSort: (k: TableSortKey) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-slate-700/80 dark:bg-slate-800/40 dark:shadow-none">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-slate-200 bg-white dark:border-slate-700/80 dark:bg-slate-800/60">
              <TrainerSortCol
                label="Name"
                colKey="name"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                thClassName="px-5 py-3.5"
              />
              <TrainerSortCol
                label="Verein"
                colKey="verein"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <TrainerSortCol
                label="Liga"
                colKey="liga"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <TrainerSortCol
                label="Region"
                colKey="region"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <TrainerSortCol
                label="Lizenz"
                colKey="license"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <TrainerSortCol
                label="Siege"
                colKey="wins"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                align="right"
                thClassName="w-[72px] px-3 py-3.5"
              />
              <TrainerSortCol
                label="Unent."
                colKey="draws"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                align="right"
                thClassName="w-[72px] px-3 py-3.5"
              />
              <TrainerSortCol
                label="Niederl."
                colKey="losses"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                align="right"
                thClassName="w-[72px] px-3 py-3.5"
              />
              <TrainerSortCol
                label="Siegquote"
                colKey="winrate"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                align="right"
                thClassName="w-[88px] px-4 py-3.5"
              />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/80">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-5 py-14 text-center text-sm text-slate-500 dark:text-slate-400"
                >
                  Keine Treffer mit diesen Filtern.
                </td>
              </tr>
            ) : (
              rows.map((p) => {
                const photoUrl = buildVereinePersonPhotoUrl(
                  p.foto_public_uid,
                  "100x100",
                );
                return (
                  <tr
                    key={p.id}
                    className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-700/30"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/spieler/${encodeURIComponent(p.id)}`}
                        className="flex items-center gap-3"
                      >
                        {photoUrl ? (
                          <Image
                            src={photoUrl}
                            width={40}
                            height={40}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-slate-200/90 dark:ring-slate-600/80"
                            sizes="40px"
                          />
                        ) : (
                          <span
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200/70 dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-600/60"
                            aria-hidden
                          >
                            {initials(p.name)}
                          </span>
                        )}
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          {p.name}
                        </span>
                      </Link>
                    </td>
                    <td className="max-w-[200px] px-4 py-3 text-slate-600 dark:text-slate-300">
                      <span className="line-clamp-2 leading-snug">
                        {p.verein_name}
                      </span>
                    </td>
                    <td className="max-w-[160px] px-4 py-3 text-slate-600 dark:text-slate-300">
                      {p.liga_label ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {p.region_label ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {p.license_label}
                    </td>
                    <td className="px-3 py-3 text-right text-[15px] font-semibold tabular-nums text-[#16a34a]">
                      {p.wins ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-right text-[15px] font-semibold tabular-nums text-[#2563eb]">
                      {p.draws ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-right text-[15px] font-semibold tabular-nums text-[#dc2626]">
                      {p.losses ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-[15px] font-semibold tabular-nums text-[#16a34a]">
                      {p.win_rate_percent != null
                        ? `${p.win_rate_percent}%`
                        : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TrainerGrid({ rows }: { rows: SfvTrainerDirectoryRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-white px-6 py-14 text-center text-sm text-slate-500 shadow-sm dark:border-slate-700/80 dark:bg-slate-800/40 dark:text-slate-400">
        Keine Treffer mit diesen Filtern.
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {rows.map((p) => {
        const photoUrl = buildVereinePersonPhotoUrl(p.foto_public_uid, "100x100");
        return (
          <li key={p.id}>
            <Link
              href={`/spieler/${encodeURIComponent(p.id)}`}
              className="flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-md dark:border-slate-700/80 dark:bg-slate-800/40 dark:hover:bg-slate-800/60"
            >
              <div className="flex items-start gap-3">
                {photoUrl ? (
                  <Image
                    src={photoUrl}
                    width={48}
                    height={48}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-full object-cover ring-1 ring-slate-200/90 dark:ring-slate-600/80"
                    sizes="48px"
                  />
                ) : (
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 ring-1 ring-slate-200/70 dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-600/60"
                    aria-hidden
                  >
                    {initials(p.name)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {p.name}
                  </span>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    {p.verein_name}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {p.liga_label ?? "—"} · {p.region_label ?? "—"}
                  </p>
                  <span className="mt-2 inline-flex rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700 dark:bg-slate-700/80 dark:text-slate-200">
                    {p.license_label}
                  </span>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-center text-xs dark:border-slate-700/80">
                <div>
                  <div className="text-[15px] font-semibold text-[#16a34a]">
                    {p.wins ?? "—"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">Siege</div>
                </div>
                <div>
                  <div className="text-[15px] font-semibold text-[#2563eb]">
                    {p.draws ?? "—"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">Unent.</div>
                </div>
                <div>
                  <div className="text-[15px] font-semibold text-[#dc2626]">
                    {p.losses ?? "—"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">Niederl.</div>
                </div>
              </div>
              <div className="mt-3 text-right text-[11px] text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-[#16a34a]">
                  {p.win_rate_percent != null ? `${p.win_rate_percent}%` : "—"}
                </span>
                <span className="ml-1 text-slate-400">Siegquote</span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
