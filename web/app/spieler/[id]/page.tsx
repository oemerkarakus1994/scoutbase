import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PlayerProfileView } from "@/components/player-profile-view";
import { getCachedSfvPlayerProfile } from "@/lib/sfv-player-profile-cached";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { data } = await getCachedSfvPlayerProfile(decodeURIComponent(id));
  const name = data?.displayName ?? "Spieler";
  return { title: name };
}

export default async function SpielerDetailPage({ params }: Props) {
  const { id } = await params;
  const personId = decodeURIComponent(id);

  const { data: profile, error } = await getCachedSfvPlayerProfile(personId);

  if (error) {
    return (
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {error.message}
        </p>
      </main>
    );
  }

  if (!profile) {
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-8 sm:px-6 sm:py-10">
      <nav className="mb-4 text-xs text-muted">
        <Link href="/" className="hover:text-foreground">
          Dashboard
        </Link>
        <span className="mx-2 text-muted">/</span>
        <Link href="/spieler" className="hover:text-foreground">
          Spieler
        </Link>
      </nav>
      <PlayerProfileView profile={profile} />
    </main>
  );
}
