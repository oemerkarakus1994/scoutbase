/**
 * ÖFB-Landesverbände → Bundesland-Kurzname (Anzeige „Region“).
 * Quelle: data/discovery/verbands.json (Namen exakt wie dort).
 */
const VERBAND_NAME_TO_BUNDESLAND: Record<string, string> = {
  "Burgenländischer Fußballverband": "Burgenland",
  "Kärntner Fußballverband": "Kärnten",
  "Niederösterreichischer Fußballverband": "Niederösterreich",
  "Oberösterreichischer Fußballverband": "Oberösterreich",
  "Salzburger Fußballverband": "Salzburg",
  "Steirischer Fußballverband": "Steiermark",
  "Tiroler Fußballverband": "Tirol",
  "Vorarlberger Fußballverband": "Vorarlberg",
  "Wiener Fußballverband": "Wien",
};

export function bundeslandFromVerbandName(
  verbandName: string | null | undefined,
): string | null {
  const n = verbandName?.trim();
  if (!n) {
    return null;
  }
  return VERBAND_NAME_TO_BUNDESLAND[n] ?? null;
}
