import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Anmelden",
};

export default function AnmeldenPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-800/50">
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Anmelden
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Authentifizierung wird für eine spätere Ausbaustufe angebunden.
          </p>
        </div>
      </main>
    </div>
  );
}
