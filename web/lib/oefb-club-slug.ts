/**
 * ÖFB-Vereins-URLs sind case-sensitiv: `UskElsbethen` liefert Daten, `uskelsbethen` nach Redirect oft ohne Spielplan-Preload.
 */

function extractSlugFromOefbUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) {
    return null;
  }
  const m = raw.match(/vereine\.oefb\.at\/([^\/\?#]+)/i);
  return m?.[1]?.trim() ? m[1]!.trim() : null;
}

/**
 * Erster Pfadabschnitt auf vereine.oefb.at — bevorzugt aus URLs, dann Meta, zuletzt DB-`slug`.
 */
export function resolveOefbClubSlug(input: {
  slug: string | null;
  meta: unknown;
  source_url: string | null;
  homepage_url: string | null;
  /** z. B. `core.teams.source_url` der Mannschaften */
  team_source_urls?: (string | null | undefined)[];
}): string | null {
  for (const u of [input.source_url, input.homepage_url]) {
    const s = extractSlugFromOefbUrl(u);
    if (s) {
      return s;
    }
  }
  for (const u of input.team_source_urls ?? []) {
    const s = extractSlugFromOefbUrl(u ?? null);
    if (s) {
      return s;
    }
  }

  if (input.meta && typeof input.meta === "object") {
    const m = input.meta as Record<string, unknown>;
    for (const key of [
      "club_slug",
      "oefb_slug",
      "verein_slug",
      "clubSlug",
      "startseiteUrl",
      "startseite_url",
    ] as const) {
      const val = m[key];
      if (typeof val !== "string" || !val.trim()) {
        continue;
      }
      const t = val.trim();
      const fromUrl = extractSlugFromOefbUrl(t);
      if (fromUrl) {
        return fromUrl;
      }
      if (!t.includes("://") && !t.includes("..")) {
        const noSlash = t.replace(/^\/+|\/+$/g, "");
        const first = noSlash.split("/").filter(Boolean)[0];
        if (first) {
          return first;
        }
      }
    }
  }

  if (input.slug?.trim()) {
    return input.slug.trim();
  }
  return null;
}
