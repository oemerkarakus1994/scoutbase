import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { fetchSfvPlayerProfile } from "@/lib/sfv-player-profile";

/**
 * Ein Request: generateMetadata + Page teilen sich dieselbe Profil-Abfrage
 * (sonst doppelter Supabase-/Join-Aufwand).
 */
export const getCachedSfvPlayerProfile = cache(async (personId: string) => {
  const supabase = await createClient();
  return fetchSfvPlayerProfile(supabase, personId);
});
