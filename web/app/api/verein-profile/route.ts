import { NextRequest } from "next/server";

import {
  fetchVereinProfileBundle,
  parseVereinProfileSegment,
  parseVereinProfileTab,
} from "@/lib/verein-profile-bundle";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Vereinsprofil-JSON für Client (großes Modal). Gleiche Daten wie die Profilseite.
 */
export async function GET(req: NextRequest) {
  const vereinId = req.nextUrl.searchParams.get("vereinId")?.trim() ?? "";
  if (!vereinId) {
    return Response.json({ error: "vereinId fehlt" }, { status: 400 });
  }

  const tab = parseVereinProfileTab(
    req.nextUrl.searchParams.get("tab") ?? undefined,
  );
  const segment = parseVereinProfileSegment(
    req.nextUrl.searchParams.get("segment") ?? undefined,
  );

  if (!isSupabaseConfigured()) {
    return Response.json(
      { error: "Datenbank nicht konfiguriert" },
      { status: 503 },
    );
  }

  try {
    const supabase = await createClient();
    const decoded = decodeURIComponent(vereinId);
    const bundle = await fetchVereinProfileBundle(
      supabase,
      decoded,
      tab,
      segment,
    );

    if (!bundle.ok) {
      if ("notFound" in bundle) {
        return Response.json({ error: "Verein nicht gefunden" }, { status: 404 });
      }
      return Response.json({ error: bundle.error.message }, { status: 500 });
    }

    const vereinPath = `/vereine/${encodeURIComponent(decoded)}`;

    return Response.json({
      ...bundle.data,
      activeTab: tab,
      activeSegment: segment,
      vereinPath,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Fehler" },
      { status: 500 },
    );
  }
}
