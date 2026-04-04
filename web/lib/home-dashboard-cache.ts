import { unstable_cache } from "next/cache";

import { fetchHomeDashboard } from "@/lib/home-dashboard";
import { createPublicServerClient } from "@/lib/supabase/server";

/**
 * Dashboard ist rechenintensiv; 60s Cache entlastet DB und TTFB bei Folgeaufrufen.
 * `createPublicServerClient`: kein `cookies()` — `unstable_cache` erlaubt das nicht.
 */
export const getCachedHomeDashboard = unstable_cache(
  async (region: string | null | undefined) => {
    const supabase = createPublicServerClient();
    return fetchHomeDashboard(supabase, region);
  },
  ["home-dashboard"],
  { revalidate: 60 },
);
