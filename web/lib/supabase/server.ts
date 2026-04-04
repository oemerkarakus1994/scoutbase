import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { isSupabaseConfigured } from "./env";

function createServerClientWithCookieHandlers(handlers: {
  getAll: () => { name: string; value: string }[];
  setAll: (
    cookiesToSet: {
      name: string;
      value: string;
      options: Record<string, unknown>;
    }[],
  ) => void;
}): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!isSupabaseConfigured() || !url || !anonKey) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example)",
    );
  }

  return createServerClient(url, anonKey, {
    cookies: handlers,
  });
}

/**
 * Anon-Lesen ohne Session-Cookies — z. B. für `unstable_cache`, wo `cookies()` nicht erlaubt ist.
 * Gleiche Rechte wie unangemeldeter Zugriff (öffentliche Dashboard-Daten).
 */
export function createPublicServerClient(): SupabaseClient {
  return createServerClientWithCookieHandlers({
    getAll() {
      return [];
    },
    setAll() {},
  });
}

export async function createClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClientWithCookieHandlers({
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet) {
      try {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options),
        );
      } catch {
        // Called from a Server Component where mutating cookies is not allowed.
      }
    },
  });
}
