import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/server";
import { fetchVereinDetail } from "@/lib/sfv-data";

type Props = { params: Promise<{ id: string }> };

export default async function VereinDetailPage({ params }: Props) {
  const { id } = await params;
  const vereinId = decodeURIComponent(id);

  const supabase = await createClient();
  const { club, teams, error } = await fetchVereinDetail(supabase, vereinId);

  if (error) {
    return (
      <div className="flex min-h-full flex-1 flex-col">
        <SiteHeader />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-10">
          <p className="text-sm text-red-600 dark:text-red-400">
            {error.message}
          </p>
        </main>
      </div>
    );
  }

  if (!club) {
    notFound();
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-10 sm:px-6">
        <p className="text-sm text-muted">
          <Link href="/vereine" className="hover:text-brand">
            ← Vereine
          </Link>
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
          {club.name}
        </h1>
        {club.short_name ? (
          <p className="mt-1 text-sm text-muted">{club.short_name}</p>
        ) : null}
        <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Verband</dt>
            <dd>{club.verband_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">Teams / Kader / Staff</dt>
            <dd>
              {club.team_count ?? 0} / {club.player_count ?? 0} /{" "}
              {club.staff_count ?? 0}
            </dd>
          </div>
        </dl>

        <h2 className="mt-10 text-lg font-medium text-foreground">Mannschaften</h2>
        {!teams?.length ? (
          <p className="mt-2 text-sm text-muted">Keine Teamzeilen.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
            {teams.map((t) => (
              <li
                key={t.team_id}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span>
                  {t.team_name}
                  {t.reserve_team ? (
                    <span className="ml-2 text-xs text-muted">Reserve</span>
                  ) : null}
                </span>
                <span className="text-xs text-muted">
                  {t.team_type ?? "—"}
                  {t.saison_name ? ` · ${t.saison_name}` : ""} · Kader{" "}
                  {t.kader_count ?? 0} · Trainer/Staff {t.staff_count ?? 0}
                </span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
