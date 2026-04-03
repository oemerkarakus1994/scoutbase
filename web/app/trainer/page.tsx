import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";
import { TrainerDirectory } from "@/components/trainer-directory";
import { createClient } from "@/lib/supabase/server";
import {
  fetchSfvLigaTitlesFromImportedTeams,
  fetchSfvTrainerDirectory,
} from "@/lib/sfv-trainer-directory";

export const metadata: Metadata = {
  title: "Trainer",
  description:
    "Trainer und Staff aus dem Import — Region, Liga, Erfahrung aus Teamdaten",
};

export default async function TrainerPage() {
  const supabase = await createClient();
  const [{ data: rows, error }, ligaOptions] = await Promise.all([
    fetchSfvTrainerDirectory(supabase),
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
        ) : (
          <TrainerDirectory rows={rows} ligaOptions={ligaOptions} />
        )}
      </main>
    </div>
  );
}
