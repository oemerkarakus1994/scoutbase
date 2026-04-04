/**
 * Öffentliche Spielerfotos wie auf oefb.at / in den Vereinsseiten (gleicher CDN-Bestand wie SFV/ÖFB).
 * @see scripts/lib/asset-targets.mjs — `buildOefbImageUrl`
 */
const OEFB_IMAGE_PREFIX =
  "https://www.oefb.at/oefb2/images/1278650591628556536_";

const VEREINE_PERSON_PREFIX =
  "https://vereine.oefb.at/vereine3/person/images/834733022602002384_";

/**
 * Rohwert aus DB oder vollständige CDN-URL → Asset-ID für die festen Präfixe.
 */
export function normalizeFotoPublicUid(
  raw: string | null | undefined,
): string | null {
  if (raw == null) {
    return null;
  }
  const s = String(raw).trim();
  if (!s) {
    return null;
  }
  if (/^https?:\/\//i.test(s)) {
    const oefb = s.match(/1278650591628556536_([^-]+)-/);
    if (oefb?.[1]) {
      return oefb[1];
    }
    const ver = s.match(/834733022602002384_([^-]+)-/);
    if (ver?.[1]) {
      return ver[1];
    }
    return null;
  }
  return s;
}

function readMetaString(
  m: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const k of keys) {
    const v = m[k];
    if (typeof v === "string" && v.trim()) {
      return v.trim();
    }
    if (typeof v === "number" && Number.isFinite(v)) {
      return String(Math.round(v));
    }
  }
  return null;
}

/** Foto-ID aus `personen.meta`, wenn die Spalte `foto_public_uid` leer ist (Importe). */
export function fotoUidFromPersonMeta(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") {
    return null;
  }
  const m = meta as Record<string, unknown>;
  const raw = readMetaString(m, [
    "foto_public_uid",
    "foto_uid",
    "photo_public_uid",
    "public_foto_uid",
    "oefb_foto_uid",
    "foto_id",
    "photo_id",
    "foto",
  ]);
  return raw ? normalizeFotoPublicUid(raw) : null;
}

export function resolvePersonFotoPublicUid(
  column: string | null | undefined,
  meta: unknown,
): string | null {
  const fromCol = normalizeFotoPublicUid(column);
  if (fromCol) {
    return fromCol;
  }
  return fotoUidFromPersonMeta(meta);
}

/**
 * Reihenfolge wie Spielerliste: Vereine 100 → Vereine 320 → ÖFB 100 → ÖFB 320.
 * (Manche Assets existieren nur in einer Größe oder auf einem CDN.)
 */
export function buildPlayerPhotoUrlCandidates(
  fotoPublicUid: string | null | undefined,
): string[] {
  const id = normalizeFotoPublicUid(fotoPublicUid);
  if (!id) {
    return [];
  }
  const urls: string[] = [];
  const add = (u: string | null) => {
    if (u && !urls.includes(u)) {
      urls.push(u);
    }
  };
  add(buildVereinePersonPhotoUrl(id, "100x100"));
  add(buildVereinePersonPhotoUrl(id, "320x320"));
  add(buildOefbPlayerPhotoUrl(id, "100x100"));
  add(buildOefbPlayerPhotoUrl(id, "320x320"));
  return urls;
}

export function buildOefbPlayerPhotoUrl(
  fotoPublicUid: string | null | undefined,
  size: "320x320" | "100x100" = "320x320",
): string | null {
  const id = normalizeFotoPublicUid(fotoPublicUid);
  if (!id) {
    return null;
  }
  return `${OEFB_IMAGE_PREFIX}${id}-1,0-${size}.png`;
}

/** Kleinere Variante (u. a. für Listen). */
export function buildVereinePersonPhotoUrl(
  fotoPublicUid: string | null | undefined,
  size: "100x100" | "320x320" = "100x100",
): string | null {
  const id = normalizeFotoPublicUid(fotoPublicUid);
  if (!id) {
    return null;
  }
  return `${VEREINE_PERSON_PREFIX}${id}-1,0-${size}.png`;
}
