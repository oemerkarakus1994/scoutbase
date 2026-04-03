import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Börse",
  description: "Transfer- und Marktplatz (geplant)",
};

export default function BoersePage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Börse
        </h1>
        <p className="mt-3 max-w-xl text-slate-600 dark:text-slate-400">
          Dieser Bereich ist für einen späteren Ausbau vorgesehen (Transfers,
          Marktplatz). Die Navigation entspricht bereits dem geplanten Aufbau.
        </p>
      </main>
    </div>
  );
}
