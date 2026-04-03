import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";
import { VereineDirectory } from "@/components/vereine-directory";
import { createClient } from "@/lib/supabase/server";
import { fetchSfvClubs } from "@/lib/sfv-data";
import { fetchSfvLigaTitlesFromImportedTeams } from "@/lib/sfv-trainer-directory";

export const metadata: Metadata = {
  title: "Vereine",
  description: "Vereine im Salzburger Fußballverband (KM/RES)",
};

export default async function VereinePage() {
  const supabase = await createClient();
  const [{ data: clubs, error }, ligaOptions] = await Promise.all([
    fetchSfvClubs(supabase),
    fetchSfvLigaTitlesFromImportedTeams(supabase),
  ]);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            {error.message}
          </p>
        ) : !clubs?.length ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Keine Einträge. Ist der Import nach Supabase gelaufen?
          </p>
        ) : (
          <VereineDirectory rows={clubs} ligaOptions={ligaOptions} />
        )}
      </main>
    </div>
  );
}
