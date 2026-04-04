/**
 * Öffentliche Spielberichte auf vereine.oefb.at / www.oefb.at / www.sfv.at
 * (relative Pfade aus Importen oder API).
 */
export function resolveSpielberichtUrl(
  raw: string | null | undefined,
): string | null {
  if (!raw?.trim()) {
    return null;
  }
  const t = raw.trim();
  if (/^https?:\/\//i.test(t)) {
    return t.replace(/^http:\/\//i, "https://");
  }
  if (t.startsWith("//")) {
    return `https:${t}`;
  }
  if (!t.startsWith("/")) {
    return null;
  }

  const lower = t.toLowerCase();
  if (lower.includes("sfv.at") || lower.includes("salzburg")) {
    try {
      return new URL(t, "https://www.sfv.at").href;
    } catch {
      return null;
    }
  }

  if (
    lower.includes("spielbericht") ||
    lower.includes("/spiel/") ||
    /^\/[a-z0-9]+[^/]*\/spielbericht\//i.test(t)
  ) {
    try {
      return new URL(t, "https://vereine.oefb.at").href;
    } catch {
      return null;
    }
  }

  try {
    return new URL(t, "https://www.oefb.at").href;
  } catch {
    return null;
  }
}

export function spielberichtUrlFromMeta(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") {
    return null;
  }
  const m = meta as Record<string, unknown>;
  const direct =
    typeof m.spielbericht_url === "string"
      ? m.spielbericht_url
      : typeof m.match_report_url === "string"
        ? m.match_report_url
        : null;
  const fromDirect = resolveSpielberichtUrl(direct);
  if (fromDirect) {
    return fromDirect;
  }
  const links = m.links;
  if (!Array.isArray(links)) {
    return null;
  }
  for (const l of links) {
    if (typeof l !== "string") {
      continue;
    }
    const u = resolveSpielberichtUrl(l);
    if (u && /spiel|bericht|match/i.test(u)) {
      return u;
    }
  }
  return null;
}
