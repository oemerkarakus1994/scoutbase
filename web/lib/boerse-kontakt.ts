/** Lokale Kontakt-Anfragen (ohne Backend) — nur im selben Browser sichtbar. */

export const BOERSE_MY_AD_IDS_KEY = "scoutbase-boerse-meine-anzeigen-ids";
export const BOERSE_CONTACT_REQUESTS_KEY = "scoutbase-boerse-kontakt-anfragen";

export type BoerseKontaktAnfrage = {
  at: number;
  message: string;
  viewerEmail?: string;
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function appendMyAdId(id: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const ids = safeParse<string[]>(
    localStorage.getItem(BOERSE_MY_AD_IDS_KEY),
    [],
  );
  if (!ids.includes(id)) {
    ids.push(id);
    localStorage.setItem(BOERSE_MY_AD_IDS_KEY, JSON.stringify(ids));
  }
}

export function getMyAdIds(): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  return safeParse<string[]>(localStorage.getItem(BOERSE_MY_AD_IDS_KEY), []);
}

export function getContactRequestsMap(): Record<string, BoerseKontaktAnfrage[]> {
  if (typeof window === "undefined") {
    return {};
  }
  return safeParse<Record<string, BoerseKontaktAnfrage[]>>(
    localStorage.getItem(BOERSE_CONTACT_REQUESTS_KEY),
    {},
  );
}

export function recordContactRequest(
  adId: string,
  payload: Omit<BoerseKontaktAnfrage, "at">,
): void {
  if (typeof window === "undefined") {
    return;
  }
  const map = getContactRequestsMap();
  const list = map[adId] ?? [];
  list.push({ at: Date.now(), ...payload });
  map[adId] = list;
  localStorage.setItem(BOERSE_CONTACT_REQUESTS_KEY, JSON.stringify(map));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("scoutbase-boerse-anfrage"));
  }
}

export function countContactRequestsForMyAds(): number {
  const myIds = getMyAdIds();
  if (myIds.length === 0) {
    return 0;
  }
  const map = getContactRequestsMap();
  let n = 0;
  for (const id of myIds) {
    n += map[id]?.length ?? 0;
  }
  return n;
}

export function getRequestsForAd(adId: string): BoerseKontaktAnfrage[] {
  return getContactRequestsMap()[adId] ?? [];
}
