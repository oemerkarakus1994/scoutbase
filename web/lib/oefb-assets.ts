/**
 * Öffentliche Spielerfotos wie auf oefb.at / in den Vereinsseiten (gleicher CDN-Bestand wie SFV/ÖFB).
 * @see scripts/lib/asset-targets.mjs — `buildOefbImageUrl`
 */
const OEFB_IMAGE_PREFIX =
  "https://www.oefb.at/oefb2/images/1278650591628556536_";

const VEREINE_PERSON_PREFIX =
  "https://vereine.oefb.at/vereine3/person/images/834733022602002384_";

export function buildOefbPlayerPhotoUrl(
  fotoPublicUid: string | null | undefined,
  size: "320x320" | "100x100" = "320x320",
): string | null {
  if (fotoPublicUid == null || fotoPublicUid === "") {
    return null;
  }
  const id = String(fotoPublicUid).trim();
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
  if (fotoPublicUid == null || fotoPublicUid === "") {
    return null;
  }
  const id = String(fotoPublicUid).trim();
  if (!id) {
    return null;
  }
  return `${VEREINE_PERSON_PREFIX}${id}-1,0-${size}.png`;
}
