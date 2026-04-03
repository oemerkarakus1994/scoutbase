"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import { IconSearch } from "@/components/ui/dashboard-icons";
import { cn } from "@/lib/cn";
import { buildOefbPlayerPhotoUrl } from "@/lib/oefb-assets";
import type { SfvClubRow } from "@/lib/sfv-data";

type ViewMode = "table" | "grid";

const FILTER_PANEL =
  "rounded-2xl bg-[#252b3a] px-4 py-4 text-[#e8eaef] shadow-[0_12px_32px_-8px_rgba(15,23,42,0.28)] sm:px-5 sm:py-5";
const FILTER_MUTED = "text-[#8b95a8]";
const FILTER_INPUT =
  "mt-1 h-9 w-full rounded-lg border border-white/[0.12] bg-[#323a4d] px-2.5 text-sm text-white shadow-inner outline-none transition placeholder:text-[#6b7289] focus:border-white/25 focus:ring-1 focus:ring-white/15";

type TableSortKey =
  | "name"
  | "region"
  | "liga"
  | "stadion"
  | "players"
  | "capacity"
  | "founded";

type Props = {
  rows: SfvClubRow[];
  /** Ligen aus Team-Import (Filter), analog Trainer/Spieler */
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
  a: SfvClubRow,
  b: SfvClubRow,
  key: TableSortKey,
): number {
  switch (key) {
    case "name":
      return a.name.localeCompare(b.name, "de");
    case "region":
      return (a.region_label ?? "").localeCompare(b.region_label ?? "", "de");
    case "liga":
      return (a.liga_label ?? "").localeCompare(b.liga_label ?? "", "de");
    case "stadion":
      return (a.stadion_label ?? "").localeCompare(b.stadion_label ?? "", "de");
    case "players":
      return a.player_count - b.player_count;
    case "capacity":
      return numOrNull(a.capacity, b.capacity);
    case "founded":
      return numOrNull(a.founded_year, b.founded_year);
    default:
      return 0;
  }
}

function VereineSortCol({
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

function formatCapacity(n: number | null): string {
  if (n == null || !Number.isFinite(n)) {
    return "—";
  }
  return n.toLocaleString("de-AT");
}

export function VereineDirectory({ rows, ligaOptions }: Props) {
  const [view, setView] = useState<ViewMode>("table");
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");
  const [liga, setLiga] = useState("");
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
    return n;
  }, [query, region, liga]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const name = r.name.toLowerCase();
      const stadion = (r.stadion_label ?? "").toLowerCase();
      if (q && !name.includes(q) && !stadion.includes(q)) {
        return false;
      }
      if (region && (r.region_label?.trim() ?? "") !== region) {
        return false;
      }
      if (liga && (r.liga_label?.trim() ?? "") !== liga) {
        return false;
      }
      return true;
    });
  }, [rows, query, region, liga]);

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
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-[2rem] sm:leading-tight">
            Vereine
          </h1>
          <p className="mt-2 text-sm font-medium text-slate-500 dark:text-slate-400">
            {filtered.length} von {rows.length} Vereinen
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
                placeholder="Vereinsname oder Stadion …"
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
              Liga
            </span>
            <select
              className={FILTER_INPUT}
              value={liga}
              onChange={(e) => setLiga(e.target.value)}
            >
              <option value="">Alle Ligen</option>
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
            Region und Liga aus Verband bzw. Team-Wettbewerb. Stadion, Kapazität
            und Gründungsjahr aus Vereins-Meta, falls im Import gesetzt.
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
        <VereineTable
          rows={sorted}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
        />
      ) : (
        <VereineGrid rows={sorted} />
      )}
    </div>
  );
}

function VereineTable({
  rows,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: SfvClubRow[];
  sortKey: TableSortKey;
  sortDir: "asc" | "desc";
  onSort: (k: TableSortKey) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-slate-700/80 dark:bg-slate-800/40 dark:shadow-none">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-slate-200 bg-white dark:border-slate-700/80 dark:bg-slate-800/60">
              <VereineSortCol
                label="Vereinsname"
                colKey="name"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                thClassName="px-5 py-3.5"
              />
              <VereineSortCol
                label="Region"
                colKey="region"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <VereineSortCol
                label="Liga"
                colKey="liga"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <VereineSortCol
                label="Stadion"
                colKey="stadion"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <VereineSortCol
                label="Spieler"
                colKey="players"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                align="right"
                thClassName="w-[88px] px-3 py-3.5"
              />
              <VereineSortCol
                label="Kapazität"
                colKey="capacity"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                align="right"
                thClassName="w-[100px] px-3 py-3.5"
              />
              <VereineSortCol
                label="Gegründet"
                colKey="founded"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                align="right"
                thClassName="w-[96px] px-4 py-3.5"
              />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/80">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-5 py-14 text-center text-sm text-slate-500 dark:text-slate-400"
                >
                  Keine Treffer mit diesen Filtern.
                </td>
              </tr>
            ) : (
              rows.map((c) => {
                const logoUrl = buildOefbPlayerPhotoUrl(
                  c.logo_public_uid,
                  "100x100",
                );
                return (
                  <tr
                    key={c.verein_id}
                    className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-700/30"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/vereine/${encodeURIComponent(c.verein_id)}`}
                        className="flex items-center gap-3"
                      >
                        {logoUrl ? (
                          <Image
                            src={logoUrl}
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
                            {initials(c.name)}
                          </span>
                        )}
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          {c.name}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {c.region_label ?? "—"}
                    </td>
                    <td className="max-w-[180px] px-4 py-3 text-slate-600 dark:text-slate-300">
                      <span className="line-clamp-2 leading-snug">
                        {c.liga_label ?? "—"}
                      </span>
                    </td>
                    <td className="max-w-[220px] px-4 py-3 text-slate-600 dark:text-slate-300">
                      <span className="line-clamp-2 leading-snug">
                        {c.stadion_label ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-[15px] font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                      {c.player_count}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                      {formatCapacity(c.capacity)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-800 dark:text-slate-200">
                      {c.founded_year ?? "—"}
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

function VereineGrid({ rows }: { rows: SfvClubRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-white px-6 py-14 text-center text-sm text-slate-500 shadow-sm dark:border-slate-700/80 dark:bg-slate-800/40 dark:text-slate-400">
        Keine Treffer mit diesen Filtern.
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {rows.map((c) => {
        const logoUrl = buildOefbPlayerPhotoUrl(c.logo_public_uid, "100x100");
        return (
          <li key={c.verein_id}>
            <Link
              href={`/vereine/${encodeURIComponent(c.verein_id)}`}
              className="flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-md dark:border-slate-700/80 dark:bg-slate-800/40 dark:hover:bg-slate-800/60"
            >
              <div className="flex items-start gap-3">
                {logoUrl ? (
                  <Image
                    src={logoUrl}
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
                    {initials(c.name)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {c.name}
                  </span>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {c.liga_label ?? "—"} · {c.region_label ?? "—"}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                    {c.stadion_label ?? "—"}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-center text-xs dark:border-slate-700/80">
                <div>
                  <div className="text-[15px] font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                    {c.player_count}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">Spieler</div>
                </div>
                <div>
                  <div className="text-[15px] font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                    {formatCapacity(c.capacity)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">Kapazität</div>
                </div>
                <div>
                  <div className="text-[15px] font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                    {c.founded_year ?? "—"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">Gegr.</div>
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
