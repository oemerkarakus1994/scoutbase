import { notFound } from "next/navigation";

import { VereinProfileView } from "@/components/verein-profile-view";
import {
  fetchVereinProfileBundle,
  parseVereinProfileSegment,
  parseVereinProfileTab,
} from "@/lib/verein-profile-bundle";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; segment?: string }>;
};

export const dynamic = "force-dynamic";

export default async function VereinDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const vereinId = decodeURIComponent(id);

  const supabase = await createClient();
  const activeTab = parseVereinProfileTab(sp.tab);
  const activeSegment = parseVereinProfileSegment(sp.segment);

  const bundle = await fetchVereinProfileBundle(
    supabase,
    vereinId,
    activeTab,
    activeSegment,
  );

  if (!bundle.ok) {
    if ("notFound" in bundle) {
      notFound();
    }
    return (
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-10 sm:px-6">
        <p className="text-sm text-red-600 dark:text-red-400">
          {bundle.error.message}
        </p>
      </main>
    );
  }

  const d = bundle.data;
  const vereinPath = `/vereine/${encodeURIComponent(vereinId)}`;

  return (
    <VereinProfileView
      club={d.club}
      teams={d.teams}
      kader={d.kader}
      ligaTabelle={d.ligaTabelle}
      ergebnisse={d.ergebnisse}
      hasKmTeam={d.hasKmTeam}
      hasResTeam={d.hasResTeam}
      vereinPath={vereinPath}
      activeTab={activeTab}
      activeSegment={activeSegment}
    />
  );
}
