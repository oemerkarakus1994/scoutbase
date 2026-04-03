import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";
import { SpielerDirectory } from "@/components/spieler-directory";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_SFV_DIRECTORY_PAGE_SIZE,
  fetchSfvPlayerDirectory,
} from "@/lib/sfv-player-directory";

export const metadata: Metadata = {
  title: "Spieler",
  description: "Spieler suchen — Kader, Tore und Rating aus dem Import",
};

export default async function SpielerPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  const sp = await searchParams;
  const loadAll =
    sp.all === "1" || sp.all === "true" || sp.all === "yes";

  const supabase = await createClient();
  const { data: rows, total, error } = await fetchSfvPlayerDirectory(supabase, {
    maxRows: loadAll ? null : DEFAULT_SFV_DIRECTORY_PAGE_SIZE,
  });

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error.message}
          </p>
        ) : (
          <SpielerDirectory
            rows={rows}
            totalInScope={total}
            loadAll={loadAll}
          />
        )}
      </main>
    </div>
  );
}
