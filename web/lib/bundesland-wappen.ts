/**
 * Bundesland-Anzeigename (wie `bundeslandFromVerbandName` / Region) → URL-Slug für
 * statische Wappen unter `public/bundesland/{slug}.svg`.
 * Weitere Bundesländer: SVG hinzufügen und Eintrag in `WAPPEN_AVAILABLE`.
 */
const BUNDESLAND_LABEL_TO_SLUG: Record<string, string> = {
  Burgenland: "burgenland",
  Kärnten: "kaernten",
  Niederösterreich: "niederoesterreich",
  Oberösterreich: "oberoesterreich",
  Salzburg: "salzburg",
  Steiermark: "steiermark",
  Tirol: "tirol",
  Vorarlberg: "vorarlberg",
  Wien: "wien",
};

/** Slugs, für die bereits eine Datei in `public/bundesland/` existiert. */
const WAPPEN_AVAILABLE = new Set<string>(["salzburg"]);

/**
 * Relativer Pfad zum Wappen (`/bundesland/…`) oder `null`, wenn kein Bild vorliegt.
 */
export function bundeslandWappenSrc(
  bundeslandLabel: string | null | undefined,
): string | null {
  const label = bundeslandLabel?.trim();
  if (!label) {
    return null;
  }
  const slug = BUNDESLAND_LABEL_TO_SLUG[label];
  if (!slug || !WAPPEN_AVAILABLE.has(slug)) {
    return null;
  }
  return `/bundesland/${slug}.svg`;
}
