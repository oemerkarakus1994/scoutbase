import { NextRequest } from "next/server";

import { fetchSearchSuggestions } from "@/lib/search-suggest";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";

  if (!isSupabaseConfigured()) {
    return Response.json({ suggestions: [] });
  }

  try {
    const supabase = await createClient();
    const { suggestions, error } = await fetchSearchSuggestions(supabase, q);
    if (error) {
      console.warn("search-suggest:", error);
    }
    return Response.json({ suggestions });
  } catch {
    return Response.json({ suggestions: [] });
  }
}
