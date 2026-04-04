import Image from "next/image";
import Link from "next/link";

import { ProfilePreviewLink } from "@/components/profile-preview-link";
import { VereinTabellePanel } from "@/components/verein-tabelle-panel";
import { buildOefbPlayerPhotoUrl } from "@/lib/oefb-assets";
import type {
  VereinDetailClub,
  VereinErgebnisRow,
  VereinKaderPlayerRow,
  VereinLigaTabelleData,
  VereinTeamRow,
} from "@/lib/sfv-data";

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (
      parts[0]![0] + parts[parts.length - 1]![0]
    ).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "—";
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-3 last:border-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

export type VereinProfileTab = "uebersicht" | "mannschaften" | "tabelle";

type Props = {
  club: VereinDetailClub;
  teams: VereinTeamRow[];
  kader: VereinKaderPlayerRow[];
  ligaTabelle: VereinLigaTabelleData | null;
  ergebnisse: VereinErgebnisRow[];
  hasKmTeam: boolean;
  hasResTeam: boolean;
  vereinPath: string;
  activeTab: VereinProfileTab;
  activeSegment: "km" | "res";
  /** Tab-/Segmentwechsel ohne Routing (z. B. großes Profil-Modal). */
  onTabChange?: (tab: VereinProfileTab, segment: "km" | "res") => void;
};

function tabHref(
  base: string,
  tab: VereinProfileTab,
  segment?: "km" | "res",
): string {
  const q = new URLSearchParams();
  if (tab !== "uebersicht") {
    q.set("tab", tab);
  }
  if (
    (tab === "mannschaften" || tab === "tabelle") &&
    segment &&
    segment !== "km"
  ) {
    q.set("segment", segment);
  }
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/**
 * Vereinsprofil — Hero, Tabs (Übersicht / Mannschaften / Tabelle & Ergebnisse).
 */
export function VereinProfileView({
  club,
  teams,
  kader,
  ligaTabelle,
  ergebnisse,
  hasKmTeam,
  hasResTeam,
  vereinPath,
  activeTab,
  activeSegment,
  onTabChange,
}: Props) {
  const ini = initialsFromName(club.name);
  const logoUrl = buildOefbPlayerPhotoUrl(club.logo_public_uid, "320x320");

  const kmCount = kader.filter((r) => r.segment === "km").length;
  const resCount = kader.filter((r) => r.segment === "res").length;
  const roster = kader.filter((r) => r.segment === activeSegment);

  const tabClass = (tab: VereinProfileTab) =>
    [
      "rounded-full px-4 py-2 text-sm font-medium transition-colors",
      activeTab === tab
        ? "bg-brand/15 text-foreground"
        : "text-muted hover:text-foreground",
    ].join(" ");

  const segClass = (seg: "km" | "res") =>
    [
      "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
      activeSegment === seg
        ? "bg-brand/15 text-foreground"
        : "text-muted hover:text-foreground",
    ].join(" ");

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 gap-4 px-4 pb-14 pt-6 sm:px-6 sm:py-8 lg:gap-6 lg:px-8">
        <aside
          className="hidden shrink-0 xl:block xl:w-[140px] 2xl:w-[160px]"
          aria-hidden
        />
        <main className="min-w-0 flex-1">
        <nav className="text-sm text-muted" aria-label="Brotkrumen">
          <Link href="/vereine" className="hover:text-brand">
            Vereine
          </Link>
          <span className="mx-2 text-border">/</span>
          <span className="text-foreground">{club.name}</span>
        </nav>

        <section className="mt-6 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-brand via-rose-700 to-rose-950 px-6 py-8 text-white shadow-lg sm:px-10 sm:py-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-10">
            <div
              className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl ring-2 ring-white/40 sm:h-36 sm:w-36"
              aria-label={logoUrl ? `Logo ${club.name}` : undefined}
            >
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt=""
                  title={club.name}
                  fill
                  sizes="(max-width: 640px) 112px, 144px"
                  className="bg-white object-contain p-2"
                  priority
                />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center bg-white/15 text-3xl font-bold tracking-tight sm:text-4xl"
                  aria-hidden
                >
                  {ini}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              {club.short_name ? (
                <p className="text-sm font-medium text-white/85">
                  {club.short_name}
                </p>
              ) : null}
              <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
                {club.name}
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/90">
                Übersicht zu Mannschaften und Kader im ScoutBase-Datenbestand
                (SFV/ÖFB-Import).
              </p>
            </div>
          </div>
        </section>

        <section
          className="mt-8 rounded-3xl border border-border bg-card p-1 shadow-sm"
          aria-label="Vereinsbereiche"
        >
          <div
            className="flex flex-wrap gap-1 border-b border-border px-2 py-2"
            role="tablist"
          >
            {onTabChange ? (
              <button
                type="button"
                onClick={() => onTabChange("uebersicht", activeSegment)}
                className={tabClass("uebersicht")}
                role="tab"
                aria-selected={activeTab === "uebersicht"}
              >
                Übersicht
              </button>
            ) : (
              <Link
                href={tabHref(vereinPath, "uebersicht")}
                className={tabClass("uebersicht")}
                role="tab"
                aria-selected={activeTab === "uebersicht"}
              >
                Übersicht
              </Link>
            )}
            <div className="group relative inline-block pb-2">
              {onTabChange ? (
                <button
                  type="button"
                  onClick={() =>
                    onTabChange("mannschaften", activeSegment)
                  }
                  className={`${tabClass("mannschaften")} inline-flex items-center gap-1.5`}
                  role="tab"
                  aria-selected={activeTab === "mannschaften"}
                  aria-haspopup="menu"
                >
                  Mannschaften
                  <span
                    className="text-[10px] leading-none text-muted opacity-80"
                    aria-hidden
                  >
                    ▾
                  </span>
                </button>
              ) : (
                <Link
                  href={tabHref(vereinPath, "mannschaften")}
                  className={`${tabClass("mannschaften")} inline-flex items-center gap-1.5`}
                  role="tab"
                  aria-selected={activeTab === "mannschaften"}
                  aria-haspopup="menu"
                >
                  Mannschaften
                  <span
                    className="text-[10px] leading-none text-muted opacity-80"
                    aria-hidden
                  >
                    ▾
                  </span>
                </Link>
              )}
              <div
                className="absolute left-0 top-full z-40 hidden min-w-[11rem] pt-1 group-hover:block"
                role="menu"
                aria-label="Kader filtern"
              >
                <div className="rounded-xl border border-border bg-card py-1 shadow-lg ring-1 ring-black/5 dark:ring-white/10">
                  {onTabChange ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onTabChange("mannschaften", "km")}
                        className="flex w-full items-center justify-between gap-4 px-3 py-2 text-left text-sm text-foreground hover:bg-muted/60"
                        role="menuitem"
                      >
                        <span>Kampfmannschaft</span>
                        <span className="tabular-nums text-muted">
                          ({kmCount})
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onTabChange("mannschaften", "res")}
                        className="flex w-full items-center justify-between gap-4 px-3 py-2 text-left text-sm text-foreground hover:bg-muted/60"
                        role="menuitem"
                      >
                        <span>Reserve</span>
                        <span className="tabular-nums text-muted">
                          ({resCount})
                        </span>
                      </button>
                    </>
                  ) : (
                    <>
                      <Link
                        href={tabHref(vereinPath, "mannschaften", "km")}
                        className="flex items-center justify-between gap-4 px-3 py-2 text-sm text-foreground hover:bg-muted/60"
                        role="menuitem"
                      >
                        <span>Kampfmannschaft</span>
                        <span className="tabular-nums text-muted">
                          ({kmCount})
                        </span>
                      </Link>
                      <Link
                        href={tabHref(vereinPath, "mannschaften", "res")}
                        className="flex items-center justify-between gap-4 px-3 py-2 text-sm text-foreground hover:bg-muted/60"
                        role="menuitem"
                      >
                        <span>Reserve</span>
                        <span className="tabular-nums text-muted">
                          ({resCount})
                        </span>
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>
            {onTabChange ? (
              <button
                type="button"
                onClick={() => onTabChange("tabelle", activeSegment)}
                className={tabClass("tabelle")}
                role="tab"
                aria-selected={activeTab === "tabelle"}
              >
                Tabelle / Ergebnisse
              </button>
            ) : (
              <Link
                href={tabHref(vereinPath, "tabelle")}
                className={tabClass("tabelle")}
                role="tab"
                aria-selected={activeTab === "tabelle"}
              >
                Tabelle / Ergebnisse
              </Link>
            )}
          </div>

          <div className="px-4 pb-6 pt-4 sm:px-6">
            {activeTab === "uebersicht" ? (
              <>
                <section
                  className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
                  aria-label="Kennzahlen"
                >
                  <StatCard label="Mannschaften" value={club.team_count} />
                  <StatCard label="Spieler im Kader" value={club.player_count} />
                  <StatCard label="Trainer / Staff" value={club.staff_count} />
                  <StatCard
                    label="Gründung"
                    value={club.founded_year ?? "—"}
                  />
                </section>

                <div className="mt-10 grid gap-8 lg:grid-cols-5 lg:gap-10">
                  <section className="lg:col-span-2">
                    <h2 className="text-lg font-semibold tracking-tight text-foreground">
                      Vereinsdaten
                    </h2>
                    <div className="mt-4 rounded-2xl border border-border bg-background px-4 shadow-sm">
                      <dl>
                        <InfoRow
                          label="Verband"
                          value={club.verband_name ?? "—"}
                        />
                        <InfoRow
                          label="Region"
                          value={club.region_label ?? "—"}
                        />
                        <InfoRow
                          label="Stadion"
                          value={club.stadion_label ?? "—"}
                        />
                        <InfoRow
                          label="Kapazität"
                          value={
                            club.capacity != null
                              ? `${club.capacity.toLocaleString("de-AT")} Plätze`
                              : "—"
                          }
                        />
                      </dl>
                    </div>
                  </section>

                  <section className="lg:col-span-3">
                    <h2 className="text-lg font-semibold tracking-tight text-foreground">
                      Mannschaften
                    </h2>
                    {!teams.length ? (
                      <p className="mt-4 rounded-2xl border border-dashed border-border bg-background/50 px-4 py-8 text-center text-sm text-muted">
                        Keine Mannschaften in den Importdaten.
                      </p>
                    ) : (
                      <ul className="mt-4 space-y-3">
                        {teams.map((t) => (
                          <li
                            key={t.team_id}
                            className="rounded-2xl border border-border bg-background px-4 py-4 shadow-sm transition hover:border-brand/40"
                          >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="font-medium text-foreground">
                                  {t.team_name}
                                  {t.reserve_team ? (
                                    <span className="ml-2 rounded-md bg-muted/30 px-1.5 py-0.5 text-xs font-normal text-muted">
                                      Reserve
                                    </span>
                                  ) : null}
                                </p>
                                <p className="mt-1 text-xs text-muted">
                                  {t.team_type ?? "Mannschaft"}
                                  {t.saison_name ? ` · ${t.saison_name}` : ""}
                                </p>
                              </div>
                              <div className="flex shrink-0 gap-4 text-sm tabular-nums">
                                <span>
                                  <span className="text-muted">Kader </span>
                                  <span className="font-medium text-foreground">
                                    {t.kader_count}
                                  </span>
                                </span>
                                <span>
                                  <span className="text-muted">Staff </span>
                                  <span className="font-medium text-foreground">
                                    {t.staff_count}
                                  </span>
                                </span>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              </>
            ) : null}

            {activeTab === "mannschaften" ? (
              <div>
                <div className="flex flex-wrap gap-2" role="tablist">
                  {onTabChange ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onTabChange("mannschaften", "km")}
                        className={segClass("km")}
                        aria-selected={activeSegment === "km"}
                      >
                        KM ({kmCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => onTabChange("mannschaften", "res")}
                        className={segClass("res")}
                        aria-selected={activeSegment === "res"}
                      >
                        RES ({resCount})
                      </button>
                    </>
                  ) : (
                    <>
                      <Link
                        href={tabHref(vereinPath, "mannschaften", "km")}
                        className={segClass("km")}
                        aria-selected={activeSegment === "km"}
                      >
                        KM ({kmCount})
                      </Link>
                      <Link
                        href={tabHref(vereinPath, "mannschaften", "res")}
                        className={segClass("res")}
                        aria-selected={activeSegment === "res"}
                      >
                        RES ({resCount})
                      </Link>
                    </>
                  )}
                </div>

                <div className="mt-6 overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-muted">
                        <th className="px-3 py-3">#</th>
                        <th className="px-3 py-3">Name</th>
                        <th className="px-3 py-3">Position</th>
                        <th className="px-3 py-3">Alter</th>
                        <th className="px-3 py-3">Größe</th>
                        <th className="px-3 py-3">Fuß</th>
                        <th className="px-3 py-3">Rating</th>
                        <th className="px-3 py-3">Spiele</th>
                        <th className="px-3 py-3">Tore</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roster.length === 0 ? (
                        <tr>
                          <td
                            colSpan={9}
                            className="px-3 py-10 text-center text-muted"
                          >
                            {activeSegment === "res"
                              ? "Keine Spieler in der Reserve gemäß Import."
                              : "Keine Spieler in der Kampfmannschaft gemäß Import."}
                          </td>
                        </tr>
                      ) : (
                        roster.map((pl) => {
                          const photo = buildOefbPlayerPhotoUrl(
                            pl.foto_public_uid,
                            "100x100",
                          );
                          const iniPl = initialsFromName(pl.display_name);
                          return (
                            <tr
                              key={`${pl.team_id}-${pl.person_id}`}
                              className="border-b border-border/80 last:border-0"
                            >
                              <td className="px-3 py-3 tabular-nums text-muted">
                                {pl.shirt_number ?? "—"}
                              </td>
                              <td className="px-3 py-3">
                                <ProfilePreviewLink
                                  href={`/spieler/${encodeURIComponent(pl.person_id)}`}
                                  className="flex items-center gap-3 font-medium text-foreground hover:text-brand"
                                >
                                  <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-muted">
                                    {photo ? (
                                      <Image
                                        src={photo}
                                        alt=""
                                        width={36}
                                        height={36}
                                        className="object-cover"
                                      />
                                    ) : (
                                      iniPl
                                    )}
                                  </span>
                                  {pl.display_name}
                                </ProfilePreviewLink>
                              </td>
                              <td className="px-3 py-3 text-muted">
                                {pl.position_label ?? "—"}
                              </td>
                              <td className="px-3 py-3 tabular-nums">
                                {pl.age ?? "—"}
                              </td>
                              <td className="px-3 py-3 tabular-nums text-muted">
                                {pl.height_cm != null
                                  ? `${pl.height_cm} cm`
                                  : "—"}
                              </td>
                              <td className="px-3 py-3 text-muted">
                                {pl.foot_label ?? "—"}
                              </td>
                              <td className="px-3 py-3">
                                <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-full bg-brand/15 px-2 text-sm font-semibold tabular-nums text-brand dark:bg-brand/25 dark:text-rose-100">
                                  {pl.rating}
                                </span>
                              </td>
                              <td className="px-3 py-3 tabular-nums">
                                {pl.spiele}
                              </td>
                              <td className="px-3 py-3 tabular-nums">
                                {pl.tore}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {activeTab === "tabelle" ? (
              <section aria-label="Tabelle und Ergebnisse">
                <h2 className="sr-only">Tabelle und Ergebnisse</h2>
                <VereinTabellePanel
                  liga={ligaTabelle}
                  ergebnisse={ergebnisse}
                  bundeslandLabel={club.region_label}
                  vereinPath={vereinPath}
                  segment={activeSegment}
                  hasKmTeam={hasKmTeam}
                  hasResTeam={hasResTeam}
                  onSegmentChangeOverride={
                    onTabChange
                      ? (seg) => onTabChange("tabelle", seg)
                      : undefined
                  }
                />
              </section>
            ) : null}
          </div>
        </section>
        </main>
        <aside
          className="hidden shrink-0 xl:block xl:w-[140px] 2xl:w-[160px]"
          aria-hidden
        />
      </div>
    </div>
  );
}
