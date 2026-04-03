"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { IconSearch } from "@/components/ui/dashboard-icons";
import { cn } from "@/lib/cn";
import {
  type PitchSlotId,
  type PositionCategory,
  positionLabelMatchesPitchSlot,
  positionLabelToCategories,
} from "@/lib/player-position-category";
import { buildVereinePersonPhotoUrl } from "@/lib/oefb-assets";
import { parseVereinTeamSubtitle } from "@/lib/sfv-team-tier";
import {
  DEFAULT_SFV_DIRECTORY_PAGE_SIZE,
  type SfvPlayerDirectoryRow,
} from "@/lib/sfv-player-directory";

type Props = {
  rows: SfvPlayerDirectoryRow[];
  totalInScope: number;
  /** `true` = alle Spieler geladen (`?all=1`), sonst Kurzliste */
  loadAll: boolean;
};

type ViewMode = "table" | "grid";

const FILTER_PANEL =
  "rounded-2xl bg-[#252b3a] px-4 py-4 text-[#e8eaef] shadow-[0_12px_32px_-8px_rgba(15,23,42,0.28)] sm:px-5 sm:py-5";
const FILTER_MUTED = "text-[#8b95a8]";
const FILTER_INPUT =
  "mt-1 h-9 w-full rounded-lg border border-white/[0.12] bg-[#323a4d] px-2.5 text-sm text-white shadow-inner outline-none transition placeholder:text-[#6b7289] focus:border-white/25 focus:ring-1 focus:ring-white/15";
const FILTER_NUM =
  "w-full min-w-0 rounded-md border border-white/10 bg-[#323a4d] px-1.5 py-1 text-center text-xs font-medium tabular-nums text-white outline-none focus:border-white/25";

/** Querformat: Tore links/rechts, Positionen in % von links/oben */
const PITCH_SLOTS: {
  id: PitchSlotId;
  label: string;
  top: string;
  left: string;
  cat: PositionCategory;
}[] = [
  { id: "tw", label: "TW", left: "7%", top: "50%", cat: "tw" },
  { id: "lv", label: "LV", left: "20%", top: "20%", cat: "def" },
  { id: "iv", label: "IV", left: "20%", top: "50%", cat: "def" },
  { id: "rv", label: "RV", left: "20%", top: "80%", cat: "def" },
  /** Angriff rechts: ZDM → ZM → ZOM (von hinten nach vorne). */
  { id: "zdm", label: "ZDM", left: "38%", top: "52%", cat: "mid" },
  { id: "zm", label: "ZM", left: "47%", top: "36%", cat: "mid" },
  { id: "zom", label: "ZOM", left: "56%", top: "52%", cat: "mid" },
  { id: "lf", label: "LF", left: "72%", top: "26%", cat: "fwd" },
  { id: "rf", label: "RF", left: "72%", top: "74%", cat: "fwd" },
  { id: "st", label: "ST", left: "84%", top: "50%", cat: "fwd" },
];

/** Welche Kreise leuchten, wenn die Kategorie aktiv ist (Kategorie-Button oder Filter). */
const CATEGORY_PITCH_SLOT_IDS: Record<
  PositionCategory,
  readonly string[]
> = {
  tw: ["tw"],
  def: ["lv", "iv", "rv"],
  mid: ["zdm", "zm", "zom"],
  fwd: ["lf", "rf", "st"],
};

const CAT_ROWS: { key: PositionCategory; label: string }[] = [
  { key: "tw", label: "Torwart" },
  { key: "def", label: "Abwehr" },
  { key: "mid", label: "Mittelfeld" },
  { key: "fwd", label: "Stürmer" },
];

/** Marker-Farbe: bei Spielfeld-Slots nur gewählte Kreise; bei Kategorien alle Slots der Kategorie. */
function pitchSlotHighlightCategory(
  slotId: PitchSlotId,
  catFilter: Set<PositionCategory> | null,
  slotFilter: Set<PitchSlotId> | null,
): PositionCategory | null {
  if (slotFilter && slotFilter.size > 0) {
    if (!slotFilter.has(slotId)) {
      return null;
    }
    const slot = PITCH_SLOTS.find((s) => s.id === slotId);
    return slot?.cat ?? null;
  }
  if (!catFilter || catFilter.size === 0) {
    return null;
  }
  for (const { key } of CAT_ROWS) {
    if (
      catFilter.has(key) &&
      CATEGORY_PITCH_SLOT_IDS[key].includes(slotId as string)
    ) {
      return key;
    }
  }
  return null;
}

const PITCH_SLOT_ACTIVE: Record<PositionCategory, string> = {
  tw: "border-amber-100 bg-amber-300 text-slate-900 ring-2 ring-amber-200/90 shadow-[0_0_10px_rgba(251,191,36,0.65)]",
  def: "border-sky-100 bg-sky-400 text-slate-900 ring-2 ring-sky-200/90 shadow-[0_0_10px_rgba(56,189,248,0.6)]",
  mid: "border-orange-100 bg-orange-400 text-slate-900 ring-2 ring-orange-200/90 shadow-[0_0_10px_rgba(251,146,60,0.55)]",
  fwd: "border-rose-100 bg-rose-400 text-slate-900 ring-2 ring-rose-200/90 shadow-[0_0_10px_rgba(251,113,133,0.55)]",
};

function birthYearFromIso(iso: string | null): number | null {
  if (!iso) {
    return null;
  }
  const y = new Date(iso).getFullYear();
  return Number.isFinite(y) ? y : null;
}

function computeYearExtent(
  rows: SfvPlayerDirectoryRow[],
): { min: number; max: number } {
  const ys = rows
    .map((r) => birthYearFromIso(r.geburtsdatum))
    .filter((y): y is number => y != null);
  if (ys.length === 0) {
    return { min: 1990, max: 2010 };
  }
  return { min: Math.min(...ys), max: Math.max(...ys) };
}

function personName(p: SfvPlayerDirectoryRow): string {
  return (
    p.display_name ||
    [p.vorname, p.nachname].filter(Boolean).join(" ") ||
    "Unbenannt"
  );
}

type TableSortKey =
  | "name"
  | "verein"
  | "liga"
  | "region"
  | "position"
  | "goals"
  | "appearances"
  | "rating"
  | "jg";

function compareRowsForSort(
  a: SfvPlayerDirectoryRow,
  b: SfvPlayerDirectoryRow,
  key: TableSortKey,
): number {
  switch (key) {
    case "name":
      return personName(a).localeCompare(personName(b), "de");
    case "verein": {
      const va = parseVereinTeamSubtitle(a.verein_team).verein;
      const vb = parseVereinTeamSubtitle(b.verein_team).verein;
      return va.localeCompare(vb, "de");
    }
    case "liga":
      return (a.liga_label ?? "").localeCompare(b.liga_label ?? "", "de");
    case "region":
      return (a.region_label ?? "").localeCompare(b.region_label ?? "", "de");
    case "position":
      return (a.position_label ?? "").localeCompare(b.position_label ?? "", "de");
    case "goals":
      return a.goals - b.goals;
    case "appearances":
      return a.appearances - b.appearances;
    case "rating":
      return a.rating - b.rating;
    case "jg": {
      const ya = birthYearFromIso(a.geburtsdatum);
      const yb = birthYearFromIso(b.geburtsdatum);
      if (ya == null && yb == null) {
        return 0;
      }
      if (ya == null) {
        return 1;
      }
      if (yb == null) {
        return -1;
      }
      return ya - yb;
    }
    default:
      return 0;
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (
      parts[0]![0] + parts[parts.length - 1]![0]
    ).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "—";
}

function positionShortLabel(label: string | null): string {
  if (!label?.trim()) {
    return "—";
  }
  const t = label.trim();
  return t.length > 20 ? `${t.slice(0, 18)}…` : t;
}

function FootballPitch({
  children,
  compact,
}: {
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative mx-auto shrink-0 overflow-hidden rounded-lg ring-1 ring-black/20",
        /* Querformat: h = Breite, w = Länge; jeweils +2/3 (Faktor 5/3) ggü. 104×213 / 123×253. */
        compact
          ? "h-[173px] w-[355px] sm:h-[187px] sm:w-[395px]"
          : "h-[205px] w-[422px] sm:h-[222px] sm:w-[467px]",
      )}
    >
      <svg
        className="h-full w-full block"
        viewBox="0 0 120 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient
            id="pitchGrass"
            x1="0"
            y1="0"
            x2="120"
            y2="0"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#2f9d5c" />
            <stop offset="50%" stopColor="#2d8f52" />
            <stop offset="100%" stopColor="#267a47" />
          </linearGradient>
        </defs>
        <rect width="120" height="100" fill="url(#pitchGrass)" rx="3" />
        <rect
          x="3"
          y="3"
          width="114"
          height="94"
          fill="none"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth="0.5"
          rx="2"
        />
        <line
          x1="60"
          y1="3"
          x2="60"
          y2="97"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth="0.45"
        />
        <circle
          cx="60"
          cy="50"
          r="11"
          fill="none"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth="0.45"
        />
        <circle cx="60" cy="50" r="0.9" fill="rgba(255,255,255,0.5)" />
        <rect
          x="3"
          y="22"
          width="18"
          height="56"
          fill="none"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth="0.45"
          rx="0.5"
        />
        <rect
          x="99"
          y="22"
          width="18"
          height="56"
          fill="none"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth="0.45"
          rx="0.5"
        />
      </svg>
      <div className="pointer-events-none absolute inset-0">{children}</div>
    </div>
  );
}

export function SpielerDirectory({
  rows,
  totalInScope,
  loadAll,
}: Props) {
  const [view, setView] = useState<ViewMode>("table");
  const [region, setRegion] = useState("");
  const [liga, setLiga] = useState("");
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState<Set<PositionCategory> | null>(
    null,
  );
  /** Genaue Positionen vom Spielfeld (ZOM, ZDM, …); schließt Kategorie-Pills aus. */
  const [slotFilter, setSlotFilter] = useState<Set<PitchSlotId> | null>(null);
  const yearExtent = useMemo(() => computeYearExtent(rows), [rows]);
  const [birthYearMin, setBirthYearMin] = useState(yearExtent.min);
  const [birthYearMax, setBirthYearMax] = useState(yearExtent.max);

  useEffect(() => {
    setBirthYearMin(yearExtent.min);
    setBirthYearMax(yearExtent.max);
  }, [yearExtent.min, yearExtent.max]);
  const [ratingMin, setRatingMin] = useState(0);
  const [ratingMax, setRatingMax] = useState(99);
  const [appsMin, setAppsMin] = useState(0);
  const [appsMax, setAppsMax] = useState<number | null>(null);
  const [goalsMin, setGoalsMin] = useState(0);
  const [goalsMax, setGoalsMax] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<TableSortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const maxApps = useMemo(
    () => Math.max(100, ...rows.map((r) => r.appearances), 1),
    [rows],
  );
  const maxGoals = useMemo(
    () => Math.max(100, ...rows.map((r) => r.goals), 1),
    [rows],
  );

  const capApps = appsMax ?? maxApps;
  const capGoals = goalsMax ?? maxGoals;

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
    for (const r of rows) {
      if (r.liga_label?.trim()) {
        s.add(r.liga_label.trim());
      }
    }
    return [...s].sort((a, b) => a.localeCompare(b, "de"));
  }, [rows]);

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
    if (catFilter && catFilter.size > 0) {
      n++;
    }
    if (slotFilter && slotFilter.size > 0) {
      n++;
    }
    if (
      birthYearMin > yearExtent.min ||
      birthYearMax < yearExtent.max
    ) {
      n++;
    }
    if (ratingMin !== 0 || ratingMax !== 99) {
      n++;
    }
    if (appsMin > 0 || (appsMax !== null && appsMax < maxApps)) {
      n++;
    }
    if (goalsMin > 0 || (goalsMax !== null && goalsMax < maxGoals)) {
      n++;
    }
    return n;
  }, [
    query,
    region,
    liga,
    catFilter,
    slotFilter,
    birthYearMin,
    birthYearMax,
    yearExtent.min,
    yearExtent.max,
    ratingMin,
    ratingMax,
    appsMin,
    appsMax,
    goalsMin,
    goalsMax,
    maxApps,
    maxGoals,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((p) => {
      const name = personName(p).toLowerCase();
      const club = p.verein_team.toLowerCase();
      if (q && !name.includes(q) && !club.includes(q)) {
        return false;
      }
      if (region && (p.region_label?.trim() ?? "") !== region) {
        return false;
      }
      if (liga && (p.liga_label?.trim() ?? "") !== liga) {
        return false;
      }
      if (slotFilter && slotFilter.size > 0) {
        const hit = [...slotFilter].some((sid) =>
          positionLabelMatchesPitchSlot(p.position_label, sid),
        );
        if (!hit) {
          return false;
        }
      } else if (catFilter && catFilter.size > 0) {
        const pc = positionLabelToCategories(p.position_label);
        if (pc.size === 0) {
          return false;
        }
        const hit = [...catFilter].some((c) => pc.has(c));
        if (!hit) {
          return false;
        }
      }
      const yearFilterFull =
        birthYearMin <= yearExtent.min && birthYearMax >= yearExtent.max;
      if (!yearFilterFull) {
        const jg = birthYearFromIso(p.geburtsdatum);
        if (jg == null) {
          return false;
        }
        if (jg < birthYearMin || jg > birthYearMax) {
          return false;
        }
      }
      if (p.rating < ratingMin || p.rating > ratingMax) {
        return false;
      }
      if (p.appearances < appsMin || p.appearances > capApps) {
        return false;
      }
      if (p.goals < goalsMin || p.goals > capGoals) {
        return false;
      }
      return true;
    });
  }, [
    rows,
    query,
    region,
    liga,
    catFilter,
    slotFilter,
    birthYearMin,
    birthYearMax,
    yearExtent.min,
    yearExtent.max,
    ratingMin,
    ratingMax,
    appsMin,
    appsMax,
    goalsMin,
    goalsMax,
    capApps,
    capGoals,
  ]);

  function handleColumnSort(key: TableSortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sortedRows = useMemo(() => {
    const arr = [...filtered];
    const mult = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => compareRowsForSort(a, b, sortKey) * mult);
    return arr;
  }, [filtered, sortKey, sortDir]);

  function toggleCat(cat: PositionCategory) {
    setSlotFilter(null);
    setCatFilter((prev) => {
      const base = new Set(prev ?? []);
      if (base.has(cat)) {
        base.delete(cat);
      } else {
        base.add(cat);
      }
      return base.size === 0 ? null : base;
    });
  }

  function toggleSlot(id: PitchSlotId) {
    setCatFilter(null);
    setSlotFilter((prev) => {
      const base = new Set(prev ?? []);
      if (base.has(id)) {
        base.delete(id);
      } else {
        base.add(id);
      }
      return base.size === 0 ? null : base;
    });
  }

  function resetFilters() {
    setRegion("");
    setLiga("");
    setQuery("");
    setCatFilter(null);
    setSlotFilter(null);
    setBirthYearMin(yearExtent.min);
    setBirthYearMax(yearExtent.max);
    setRatingMin(0);
    setRatingMax(99);
    setAppsMin(0);
    setAppsMax(null);
    setGoalsMin(0);
    setGoalsMax(null);
  }

  return (
    <div className="space-y-6">
      {/* Kopfzeile wie Referenz: Titel links, Umschalter rechts; Zähler unter Titel */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-[2rem] sm:leading-tight">
            Spieler
          </h1>
          <p className="mt-2 text-sm font-medium text-slate-500 dark:text-slate-400">
            {filtered.length} von {totalInScope} Spielern
          </p>
          {!loadAll && totalInScope > rows.length ? (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Standard sind die ersten {rows.length} Einträge (alphabetisch). Für
              Suche und Filter über den gesamten Kader:{" "}
              <Link
                href="/spieler?all=1"
                className="font-semibold text-slate-900 underline underline-offset-2 hover:no-underline dark:text-slate-100"
              >
                alle {totalInScope} Spieler laden
              </Link>
              .
            </p>
          ) : loadAll ? (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              <Link
                href="/spieler"
                className="font-semibold text-slate-900 underline underline-offset-2 hover:no-underline dark:text-slate-100"
              >
                Nur Kurzliste
              </Link>{" "}
              (Standard: {DEFAULT_SFV_DIRECTORY_PAGE_SIZE} Spieler)
            </p>
          ) : null}
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
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:gap-3">
          <label className="min-w-0 flex-1">
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
          <label className="w-full shrink-0 md:w-40">
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
              <option value="">Alle</option>
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
              <option value="">Alle</option>
              {ligas.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-white/[0.07] pt-4 lg:flex-row lg:items-start lg:gap-5">
          <div>
            <p
              className={cn(
                "mb-2 text-[10px] font-bold uppercase tracking-[0.1em]",
                FILTER_MUTED,
              )}
            >
              Spielfeld
            </p>
            <FootballPitch compact>
              {PITCH_SLOTS.map((slot) => {
                const highlightCat = pitchSlotHighlightCategory(
                  slot.id,
                  catFilter,
                  slotFilter,
                );
                const active = highlightCat != null;
                return (
                  <button
                    key={slot.id}
                    type="button"
                    title={`${slot.label}: Position filtern`}
                    onClick={() => toggleSlot(slot.id)}
                    className={cn(
                      "pointer-events-auto absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-[6px] font-bold leading-none shadow-sm transition-all sm:h-5 sm:w-5 sm:text-[7px]",
                      active && highlightCat
                        ? PITCH_SLOT_ACTIVE[highlightCat]
                        : "border-white/90 bg-white/95 text-[#1a3d28] hover:bg-white",
                    )}
                    style={{ top: slot.top, left: slot.left }}
                  >
                    {slot.label}
                  </button>
                );
              })}
            </FootballPitch>
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p
                className={cn(
                  "text-[10px] font-bold uppercase tracking-[0.1em]",
                  FILTER_MUTED,
                )}
              >
                Position (Kategorie)
              </p>
              {((catFilter && catFilter.size > 0) ||
                (slotFilter && slotFilter.size > 0)) ? (
                <button
                  type="button"
                  onClick={() => {
                    setCatFilter(null);
                    setSlotFilter(null);
                  }}
                  className="text-[11px] font-medium text-emerald-400/95 hover:underline"
                >
                  Position löschen
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CAT_ROWS.map(({ key, label }) => {
                const on = catFilter?.has(key) ?? false;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleCat(key)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                      on
                        ? "border-white bg-white text-slate-900"
                        : "border-white/20 bg-white/5 text-[#c5cad6] hover:border-white/30 hover:text-white",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[10px] leading-snug text-[#6b7289]">
              Spielfeld: genaue Position (z. B. nur ZOM oder ZDM). Kategorien:
              grobe Rolle (Torwart–Stürmer). Mehrfachauswahl jeweils mit Oder —
              Kategorie und Spielfeld schließen sich aus.
            </p>
          </div>
        </div>

        <div className="mt-4 border-t border-white/[0.07] pt-4">
          <p
            className={cn(
              "mb-2 text-[10px] font-bold uppercase tracking-[0.1em]",
              FILTER_MUTED,
            )}
          >
            Bereiche (von – bis)
          </p>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <CompactMinMax
              label="Jahrgang"
              min={birthYearMin}
              max={birthYearMax}
              floor={1940}
              ceil={2035}
              onMin={setBirthYearMin}
              onMax={setBirthYearMax}
            />
            <CompactMinMax
              label="Rating"
              min={ratingMin}
              max={ratingMax}
              floor={0}
              ceil={99}
              onMin={setRatingMin}
              onMax={setRatingMax}
            />
            <CompactMinMax
              label="Spiele"
              min={appsMin}
              max={capApps}
              floor={0}
              ceil={maxApps}
              onMin={setAppsMin}
              onMax={(n) => setAppsMax(n >= maxApps ? null : n)}
            />
            <CompactMinMax
              label="Tore"
              min={goalsMin}
              max={capGoals}
              floor={0}
              ceil={maxGoals}
              onMin={setGoalsMin}
              onMax={(n) => setGoalsMax(n >= maxGoals ? null : n)}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] pt-3">
          <span className="text-xs text-[#8b95a8]">
            {activeFilterCount > 0
              ? `${activeFilterCount} Filter aktiv`
              : "Keine Filter aktiv"}
          </span>
          <button
            type="button"
            onClick={resetFilters}
            disabled={activeFilterCount === 0}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              activeFilterCount === 0
                ? "cursor-not-allowed text-[#5c6577]"
                : "bg-white/10 text-white hover:bg-white/15",
            )}
          >
            Alles zurücksetzen
          </button>
        </div>
      </div>

      {view === "table" ? (
        <PlayerTable
          rows={sortedRows}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleColumnSort}
        />
      ) : (
        <PlayerGrid rows={sortedRows} />
      )}
    </div>
  );
}

function CompactMinMax({
  label,
  min,
  max,
  floor,
  ceil,
  onMin,
  onMax,
}: {
  label: string;
  min: number;
  max: number;
  floor: number;
  ceil: number;
  onMin: (n: number) => void;
  onMax: (n: number) => void;
}) {
  return (
    <div className="rounded-lg bg-[#1e2431] px-2 py-2 ring-1 ring-white/[0.06]">
      <div className="mb-1.5 truncate text-[10px] font-bold uppercase tracking-wide text-[#8b95a8]">
        {label}
      </div>
      <div className="flex items-center gap-1">
        <input
          type="number"
          inputMode="numeric"
          className={FILTER_NUM}
          value={min}
          min={floor}
          max={ceil}
          aria-label={`${label} Minimum`}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") {
              return;
            }
            const v = Number(raw);
            if (!Number.isFinite(v)) {
              return;
            }
            const clamped = Math.min(Math.max(v, floor), ceil);
            onMin(Math.min(clamped, max));
          }}
        />
        <span className="shrink-0 select-none text-[11px] text-[#6b7289]">
          –
        </span>
        <input
          type="number"
          inputMode="numeric"
          className={FILTER_NUM}
          value={max}
          min={floor}
          max={ceil}
          aria-label={`${label} Maximum`}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") {
              return;
            }
            const v = Number(raw);
            if (!Number.isFinite(v)) {
              return;
            }
            const clamped = Math.min(Math.max(v, floor), ceil);
            onMax(Math.max(clamped, min));
          }}
        />
      </div>
    </div>
  );
}

function SortCol({
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
        aria-sort={
          active ? (sortDir === "asc" ? "ascending" : "descending") : "none"
        }
      >
        <span className="truncate">{label}</span>
        {active ? (
          <span aria-hidden className="shrink-0 tabular-nums opacity-90">
            {sortDir === "asc" ? "↑" : "↓"}
          </span>
        ) : (
          <span
            className="shrink-0 text-[10px] font-normal opacity-35"
            aria-hidden
          >
            ↕
          </span>
        )}
      </button>
    </th>
  );
}

function PlayerTable({
  rows,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: SfvPlayerDirectoryRow[];
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
              <SortCol
                label="Name"
                colKey="name"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                thClassName="px-5 py-3.5"
              />
              <SortCol
                label="Verein"
                colKey="verein"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <SortCol
                label="Liga"
                colKey="liga"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <SortCol
                label="Region"
                colKey="region"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <SortCol
                label="Position"
                colKey="position"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <SortCol
                label="Tore"
                colKey="goals"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                align="right"
                thClassName="w-[72px] px-3 py-3.5"
              />
              <SortCol
                label="Spiele"
                colKey="appearances"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                align="right"
                thClassName="w-[72px] px-3 py-3.5"
              />
              <SortCol
                label="Rating"
                colKey="rating"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                align="right"
                thClassName="w-[72px] px-3 py-3.5"
              />
              <SortCol
                label="Jg."
                colKey="jg"
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                align="right"
                thClassName="w-[64px] px-4 py-3.5"
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
                const name = personName(p);
                const { verein } = parseVereinTeamSubtitle(p.verein_team);
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
                            {initials(name)}
                          </span>
                        )}
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          {name}
                        </span>
                      </Link>
                    </td>
                    <td className="max-w-[200px] px-4 py-3 text-slate-600 dark:text-slate-300">
                      <span className="line-clamp-2 leading-snug">{verein}</span>
                    </td>
                    <td className="max-w-[160px] px-4 py-3 text-slate-600 dark:text-slate-300">
                      {p.liga_label ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {p.region_label ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex max-w-[160px] rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-700/80 dark:text-slate-200">
                        <span className="truncate">
                          {positionShortLabel(p.position_label)}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-[15px] font-semibold tabular-nums text-[#16a34a]">
                      {p.goals}
                    </td>
                    <td className="px-3 py-3 text-right text-[15px] font-semibold tabular-nums text-[#2563eb]">
                      {p.appearances}
                    </td>
                    <td className="px-3 py-3 text-right text-[15px] font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {p.rating}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-800 dark:text-slate-200">
                      {birthYearFromIso(p.geburtsdatum) ?? "—"}
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

function PlayerGrid({ rows }: { rows: SfvPlayerDirectoryRow[] }) {
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
        const name = personName(p);
        const { verein } = parseVereinTeamSubtitle(p.verein_team);
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
                    {initials(name)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {name}
                  </span>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    {verein}
                  </p>
                  <span className="mt-2 inline-flex rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700 dark:bg-slate-700/80 dark:text-slate-200">
                    {positionShortLabel(p.position_label)}
                  </span>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-center text-xs dark:border-slate-700/80">
                <div>
                  <div className="text-[15px] font-semibold text-[#16a34a]">
                    {p.goals}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">Tore</div>
                </div>
                <div>
                  <div className="text-[15px] font-semibold text-[#2563eb]">
                    {p.appearances}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">Spiele</div>
                </div>
                <div>
                  <div className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">
                    {p.rating}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                    Rating
                  </div>
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
