import { Suspense } from "react";

import { DashboardSection } from "@/components/dashboard-section";
import { QuickAccess } from "@/components/quick-access";
import { RegionSelect } from "@/components/region-select";
import { getCachedHomeDashboard } from "@/lib/home-dashboard-cache";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type Props = {
  searchParams: Promise<{ region?: string }>;
};

export default async function Home({ searchParams }: Props) {
  const { region } = await searchParams;

  if (!isSupabaseConfigured()) {
    return (
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-16 sm:px-6">
          <h1 className="text-2xl font-bold text-foreground">
            ScoutBase
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Die Website läuft, aber die Verbindung zur Datenbank ist auf dem Server
            nicht eingetragen. Das ist die häufigste Ursache für „Server error“ auf
            Vercel.
          </p>
          <p className="mt-4 text-sm font-medium text-foreground">
            In Vercel: Project → Settings → Environment Variables → für{" "}
            <strong>Production</strong> (und Preview) hinzufügen:
          </p>
          <ul className="mt-2 list-inside list-disc text-sm text-muted">
            <li>
              <code className="rounded bg-panel px-1 py-0.5 text-foreground dark:bg-card">
                NEXT_PUBLIC_SUPABASE_URL
              </code>
            </li>
            <li>
              <code className="rounded bg-panel px-1 py-0.5 text-foreground dark:bg-card">
                NEXT_PUBLIC_SUPABASE_ANON_KEY
              </code>
            </li>
          </ul>
          <p className="mt-4 text-sm text-muted">
            Gleiche Werte wie in <code className="rounded bg-panel px-1 py-0.5 dark:bg-card">web/.env.local</code> auf
            deinem Mac. Danach <strong>Redeploy</strong> auslösen.
          </p>
        </main>
    );
  }

  const dash = await getCachedHomeDashboard(region ?? null);

  return (
    <>
      <main className="flex-1">
        <div className="mx-auto max-w-[1400px] px-4 pb-12 pt-6 sm:px-6 lg:px-8">
          <section className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-brand via-rose-700 to-rose-950 px-6 py-10 text-white shadow-lg sm:px-10 sm:py-12">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Willkommen bei Scoutbase
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-white/90 sm:text-lg">
              Ihre umfassende Plattform für Amateur-Fußball Scouting in
              Österreich — mit offiziellen IDs und Schwerpunkt Salzburg (SFV).
            </p>
          </section>

          <div className="mt-6">
            <Suspense
              fallback={
                <div className="h-14 max-w-2xl animate-pulse rounded-2xl bg-card shadow-sm" />
              }
            >
              <RegionSelect />
            </Suspense>
            {dash.regionNote ? (
              <p
                className="mt-4 max-w-2xl text-sm text-muted"
                role="status"
              >
                {dash.regionNote}
              </p>
            ) : null}
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <DashboardSection
              title="Top Torschützen"
              description="Aus Kader-Statistiken (Tore) im Import."
              icon="trophy"
              rows={dash.topScorers}
              modalRows={dash.topScorersAll}
            />
          <DashboardSection
            title="Höchstes Rating"
            description="Rating-Skala 1–99 aus Toren pro Einsatz (mindestens drei Spiele)."
            icon="star"
            rows={dash.topRating}
            modalRows={dash.topRatingAll}
          />
            <DashboardSection
              title="Formstärkste Teams"
              description="Letzte Spiele aus dem Import."
              icon="flame"
              rows={dash.formTeams}
              modalRows={dash.formTeamsAll}
            />
            <DashboardSection
              title="Meiste Karten"
              description="Gelb-, Gelb-Rot und Rot aus dem Kader-Import."
              icon="card"
              rows={dash.mostCards}
              modalRows={dash.mostCardsAll}
            />
            <DashboardSection
              title="Meiste Tore"
              description="Summe Spieler-Tore pro Mannschaft (Kader)."
              icon="goal"
              rows={dash.mostTeamGoals}
              modalRows={dash.mostTeamGoalsAll}
            />
            <DashboardSection
              title="Meiste Gegentore"
              description="GGT. aus der Ligatabelle wie unter Verein → Tabelle / Ergebnisse (pro Mannschaft dieselbe Zahl); sonst Fallback aus Snapshots oder Spielsummen."
              icon="conceded"
              rows={dash.mostConceded}
              modalRows={dash.mostConcededAll}
            />
          </div>

          <div className="mt-8">
            <QuickAccess />
          </div>
        </div>
      </main>

      <footer className="border-t border-border bg-card py-8 text-center text-xs text-muted">
        ScoutBase — Datenhaltung mit ÖFB/SFV abstimmen.{" "}
        <a href="/ligen" className="font-medium text-brand hover:underline">
          Ligen
        </a>
      </footer>
    </>
  );
}
