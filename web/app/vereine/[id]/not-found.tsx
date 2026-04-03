import Link from "next/link";

import { SiteHeader } from "@/components/site-header";

export default function VereinNotFound() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-foreground">Verein nicht gefunden</h1>
        <p className="mt-2 text-sm text-muted">
          Kein Eintrag für diesen Verband oder ungültige ID.
        </p>
        <Link
          href="/vereine"
          className="mt-6 inline-block text-sm text-brand hover:underline"
        >
          Zur Vereinsliste
        </Link>
      </main>
    </div>
  );
}
