import { Suspense } from "react";

import { DashboardSection } from "@/components/dashboard-section";
import { QuickAccess } from "@/components/quick-access";
import { RegionSelect } from "@/components/region-select";
import { SiteHeader } from "@/components/site-header";
import { fetchHomeDashboard } from "@/lib/home-dashboard";
import { createClient } from "@/lib/supabase/server";

type Props = {
  searchParams: Promise<{ region?: string }>;
};

export default async function Home({ searchParams }: Props) {
  const { region } = await searchParams;
  const supabase = await createClient();
  const dash = await fetchHomeDashboard(supabase, region);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <SiteHeader />

      <main className="flex-1">
        <div className="mx-auto max-w-[1400px] px-4 pb-12 pt-6 sm:px-6 lg:px-8">
          <section className="overflow-hidden rounded-2xl bg-brand px-6 py-10 text-white shadow-md sm:px-10 sm:py-12">
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
                <div className="h-14 max-w-2xl animate-pulse rounded-2xl bg-card shadow-sm dark:bg-slate-800" />
              }
            >
              <RegionSelect />
            </Suspense>
            {dash.regionNote ? (
              <p
                className="mt-4 max-w-2xl text-sm text-slate-600 dark:text-slate-400"
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
              viewAllHref="/spieler"
              icon="trophy"
              rows={dash.topScorers}
            />
          <DashboardSection
            title="Höchstes Rating"
            description="Rating-Skala 1–99 aus Toren pro Einsatz (mindestens drei Spiele)."
            viewAllHref="/spieler"
            icon="star"
            rows={dash.topRating}
          />
            <DashboardSection
              title="Formstärkste Teams"
              description="Letzte Spiele aus dem Import."
              viewAllHref="/vereine"
              icon="flame"
              rows={dash.formTeams}
            />
            <DashboardSection
              title="Meiste Karten"
              description="Gelb-, Gelb-Rot und Rot aus dem Kader-Import."
              viewAllHref="/spieler"
              icon="card"
              rows={dash.mostCards}
            />
            <DashboardSection
              title="Meiste Tore"
              description="Summe Spieler-Tore pro Mannschaft (Kader)."
              viewAllHref="/vereine"
              icon="goal"
              rows={dash.mostTeamGoals}
            />
            <DashboardSection
              title="Meiste Gegentore"
              description="Aus Tabellen-Snapshots, falls vorhanden."
              viewAllHref="/vereine"
              icon="conceded"
              rows={dash.mostConceded}
            />
          </div>

          <div className="mt-8">
            <QuickAccess />
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-card py-8 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
        ScoutBase — Datenhaltung mit ÖFB/SFV abstimmen.{" "}
        <a href="/ligen" className="font-medium text-brand hover:underline">
          Ligen
        </a>
      </footer>
    </div>
  );
}
