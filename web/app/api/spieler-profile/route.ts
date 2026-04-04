import { NextRequest } from "next/server";

import { fetchSfvPlayerProfile } from "@/lib/sfv-player-profile";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Profil-JSON für Client (z. B. Spielervergleich). Gleiche Daten wie die Profilseite.
 */
export async function GET(req: NextRequest) {
  const personId = req.nextUrl.searchParams.get("personId")?.trim() ?? "";
  if (!personId) {
    return Response.json({ error: "personId fehlt" }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Datenbank nicht konfiguriert" }, { status: 503 });
  }

  try {
    const supabase = await createClient();
    const decoded = decodeURIComponent(personId);
    const { data, error } = await fetchSfvPlayerProfile(supabase, decoded);
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return Response.json({ error: "Spieler nicht gefunden" }, { status: 404 });
    }
    return Response.json(data);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Fehler" },
      { status: 500 },
    );
  }
}
