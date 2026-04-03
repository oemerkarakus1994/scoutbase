import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";
import { bewerbEditionElementId } from "@/lib/ligen-anchor";
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

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Ligen & Bewerbe
        </h1>
        <p className="mt-2 text-sm text-muted">
          Bewerb-Editionen des SFV (Zuordnung über Serien → Verband).
          {!usedCurrentFlag && sfvRows.length > 0
            ? " Keine Edition ist als „aktuell“ markiert — es werden alle Editionen der SFV-Serien angezeigt."
            : null}
        </p>

        {error ? (
          <p className="mt-8 rounded-lg border border-border bg-card p-4 text-sm text-red-600 dark:text-red-400">
            {error.message}
          </p>
        ) : !sfvRows.length ? (
          <p className="mt-8 text-sm text-muted">
            Keine Bewerb-Editionen für SFV-Serien gefunden (Import prüfen).
          </p>
        ) : (
          <ul className="mt-8 divide-y divide-border rounded-xl border border-border bg-card">
            {sfvRows.map((ed) => (
              <li
                key={ed.id}
                id={bewerbEditionElementId(ed.id)}
                className="scroll-mt-24 px-4 py-4"
              >
                <a
                  href={ed.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-brand hover:underline"
                >
                  {ed.title}
                </a>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  <span className="break-all">{ed.id}</span>
                  {ed.is_current ? (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                      Aktuell
                    </span>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
