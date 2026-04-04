import { extractAllAppPreloads } from "@/lib/oefb-preloads";

export type OefbProfileVereinRow = {
  name: string;
  url: string | null;
  /** ISO-Datum (yyyy-mm-dd), aus ÖFB-Feld `ab` (ms) */
  ab: string | null;
};

function canonicalProfileSpielerUrl(url: string): string | null {
  try {
    const u = new URL(url.trim(), "https://www.oefb.at");
    const m = u.pathname.match(/\/Profile\/Spieler\/(\d+)/i);
    if (m?.[1]) {
      return `https://www.oefb.at/Profile/Spieler/${m[1]}`;
    }
    const m2 = u.pathname.match(/\/(?:bewerbe|netzwerk)\/Spieler\/(\d+)/i);
    if (m2?.[1]) {
      return `https://www.oefb.at/Profile/Spieler/${m2[1]}`;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Altes ÖFB-Layout `…/spielerdetails/…/Name_358876~….htm` → öffentliche Spieler-ID.
 * (Gleiches Muster wie `scripts/lib/team-content-manifest.mjs` → `parseLegacyProfileKey`.)
 */
function parseLegacySpielerIdFromUrl(url: string): string | null {
  const m = String(url).match(/\/spielerdetails\/\d+\/[^_]+_(\d+)~\d+\.htm/i);
  return m?.[1] ?? null;
}

/**
 * Versucht zuerst kanonische Profil-URL, dann Legacy-HTM → `Profile/Spieler/{id}`.
 * Prüft **beide** übergebenen Strings (öffentlich + Legacy), nicht nur eines.
 */
export function resolveOefbSpielerProfileUrlFromStrings(
  publicUrl: string | null | undefined,
  legacyUrl: string | null | undefined,
): string | null {
  const candidates: string[] = [];
  for (const x of [publicUrl, legacyUrl]) {
    if (typeof x === "string" && x.trim()) {
      candidates.push(x.trim());
    }
  }
  const seen = new Set<string>();
  const uniq = candidates.filter((c) =>
    seen.has(c) ? false : (seen.add(c), true),
  );

  for (const raw of uniq) {
    const c = canonicalProfileSpielerUrl(raw);
    if (c) {
      return c;
    }
  }
  for (const raw of uniq) {
    const id = parseLegacySpielerIdFromUrl(raw);
    if (id) {
      return `https://www.oefb.at/Profile/Spieler/${id}`;
    }
  }
  return null;
}

/**
 * Öffentliche ÖFB-Spieler-URL aus `personen.meta` (Import / Manifest).
 */
export function resolveOefbSpielerProfileUrlFromMeta(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") {
    return null;
  }
  const m = meta as Record<string, unknown>;
  return resolveOefbSpielerProfileUrlFromStrings(
    typeof m.public_profile_url === "string" ? m.public_profile_url : null,
    typeof m.legacy_profile_url === "string" ? m.legacy_profile_url : null,
  );
}

function findDetailsPayloadFromPreloads(
  preloads: Record<string, unknown>,
): Record<string, unknown> | null {
  for (const value of Object.values(preloads)) {
    if (!Array.isArray(value) || !value[0] || typeof value[0] !== "object") {
      continue;
    }
    const v0 = value[0] as Record<string, unknown>;
    if (
      v0.vorname != null &&
      v0.nachname != null &&
      "geburtsdatum" in v0
    ) {
      return v0;
    }
  }
  return null;
}

function mapVereine(raw: unknown[]): OefbProfileVereinRow[] {
  const out: OefbProfileVereinRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as Record<string, unknown>;
    const name =
      typeof row.verein === "string" && row.verein.trim()
        ? row.verein.trim()
        : typeof row.name === "string" && row.name.trim()
          ? row.name.trim()
          : "—";
    let url: string | null = null;
    if (typeof row.url === "string" && row.url.trim()) {
      try {
        url = new URL(row.url.trim(), "https://www.oefb.at").href;
      } catch {
        url = null;
      }
    }
    let ab: string | null = null;
    if (typeof row.ab === "number" && Number.isFinite(row.ab)) {
      const d = new Date(row.ab);
      if (Number.isFinite(d.getTime())) {
        ab = d.toISOString().slice(0, 10);
      }
    }
    out.push({ name, url, ab });
  }
  return out;
}

const FETCH_TIMEOUT_MS = 10_000;

/**
 * Liest die Vereinsliste aus der öffentlichen ÖFB-Spielerseite (App-Preloads, vgl. Profil-Sammlung).
 * Keine Tore/Einsätze — nur Stationen wie auf oefb.at.
 */
export async function fetchOefbProfileVereine(
  profileUrl: string,
): Promise<OefbProfileVereinRow[] | null> {
  if (!profileUrl.trim()) {
    return null;
  }
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(profileUrl, {
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
      next: { revalidate: 86_400 },
    });
    if (!res.ok) {
      return null;
    }
    const html = await res.text();
    const preloads = extractAllAppPreloads(html);
    const details = findDetailsPayloadFromPreloads(preloads);
    if (!details) {
      return null;
    }
    const vereine = details.vereine;
    if (!Array.isArray(vereine)) {
      return [];
    }
    return mapVereine(vereine);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
