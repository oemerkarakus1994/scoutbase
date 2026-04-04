import type { Metadata } from "next";

import { LigenBewerbEditionCard } from "@/components/ligen-bewerb-edition-card";
import { IconTrophy } from "@/components/ui/dashboard-icons";
import { createClient } from "@/lib/supabase/server";
import { fetchSfvBewerbEditionen } from "@/lib/sfv-data";

export const metadata: Metadata = {
  title: "Ligen",
  description: "Aktuelle SFV-Bewerbe",
};

export default async function LigenPage() {
  const supabase = await createClient();
  const { data: sfvRows, usedCurrentFlag, error } =
    await fetchSfvBewerbEditionen(supabase);

  const sorted = [...sfvRows].sort((a, b) => {
    if (a.is_current !== b.is_current) {
      return a.is_current ? -1 : 1;
    }
    return a.title.localeCompare(b.title, "de");
  });

  const currentCount = sfvRows.filter((e) => e.is_current).length;

  return (
    <main className="flex-1">
      <div className="border-b border-brand/15 bg-gradient-to-b from-rose-950/40 via-background to-background">
        <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
                <IconTrophy className="h-4 w-4" />
                Salzburger Fußballverband
              </div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Ligen & Bewerbe
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
                Bewerb-Editionen des SFV — Zuordnung über Serien zum Verband. Pro
                Karte verlinkt die offizielle ÖFB-Seite mit Spielplan und Tabelle.
                {!usedCurrentFlag && sfvRows.length > 0 ? (
                  <>
                    {" "}
                    <span className="text-amber-200/90">
                      Keine Edition ist als „aktuell“ markiert; es werden alle
                      Editionen der SFV-Serien angezeigt.
                    </span>
                  </>
                ) : null}
              </p>
            </div>
            {!error && sfvRows.length > 0 ? (
              <dl className="flex shrink-0 flex-wrap gap-4 sm:gap-6">
                <div className="rounded-xl border border-border bg-card/80 px-4 py-3 text-center shadow-sm backdrop-blur-sm">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Editionen
                  </dt>
                  <dd className="mt-1 text-2xl font-bold tabular-nums text-brand">
                    {sfvRows.length}
                  </dd>
                </div>
                <div className="rounded-xl border border-border bg-card/80 px-4 py-3 text-center shadow-sm backdrop-blur-sm">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Als aktuell
                  </dt>
                  <dd className="mt-1 text-2xl font-bold tabular-nums text-foreground">
                    {currentCount}
                  </dd>
                </div>
              </dl>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-4 pb-14 pt-8 sm:px-6 lg:px-8">
        {error ? (
          <p className="rounded-xl border border-red-500/30 bg-red-950/40 p-4 text-sm text-red-200">
            {error.message}
          </p>
        ) : !sfvRows.length ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-14 text-center">
            <p className="text-sm text-muted">
              Keine Bewerb-Editionen für SFV-Serien gefunden.
            </p>
            <p className="mt-2 text-xs text-muted">
              Import und Zuordnung der Bewerb-Serien in Supabase prüfen.
            </p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sorted.map((ed) => (
              <li key={ed.id}>
                <LigenBewerbEditionCard edition={ed} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
