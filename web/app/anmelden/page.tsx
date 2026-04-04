import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Anmelden",
};

export default function AnmeldenPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16 sm:px-6">
      <div className="rounded-2xl border border-border bg-card p-8 shadow-lg">
        <h1 className="text-xl font-bold text-foreground">
          Anmelden
        </h1>
        <p className="mt-2 text-sm text-muted">
          Authentifizierung wird für eine spätere Ausbaustufe angebunden.
        </p>
      </div>
    </main>
  );
}
