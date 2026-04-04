/**
 * Demo-Stats für `stats.seasons` (gleiche Logik wie `scripts/seed-fictive-membership-season-stats.mjs`).
 * Nur wenn explizit aktiviert oder in Development — siehe `shouldApplyFictiveSeasonStats`.
 */

/** Gleiche Regel wie `pastSeasonLabelsBefore` in sfv-player-profile (kein Zirkelimport). */
function pastSeasonLabelsBeforeLocal(dataSeasonKey: string, count: number): string[] {
  const m = /^(\d{4})\/(\d{2})$/.exec(dataSeasonKey.trim());
  if (!m) {
    return [];
  }
  const yStart = Number.parseInt(m[1], 10);
  const out: string[] = [];
  for (let k = 1; k <= count; k++) {
    const a = yStart - k;
    const b = (a + 1) % 100;
    out.push(`${a}/${String(b).padStart(2, "0")}`);
  }
  return out;
}

function hash32(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function profileFromMembershipId(id: string): number {
  return hash32(id) % 5;
}

/**
 * Einsätze = Vollzeitspiele + Spiele mit frühem Auswechsel + Spiele mit Einwechsel von der Bank.
 * Minuten ergeben sich aus den Typen; Ø Min./Spiel = Summe / Einsätze (gerundet).
 */
function computeFictiveMinutesSubsAndAvg(
  rng: () => number,
  apps: number,
): {
  minutes: number;
  subs_in: number;
  subs_out: number;
} {
  if (apps <= 0) {
    return { minutes: 0, subs_in: 0, subs_out: 0 };
  }

  let subsOut = Math.floor(rng() * (Math.floor(apps * 0.4) + 1));
  let subsIn = Math.floor(
    rng() * (Math.floor(Math.max(0, apps - subsOut) * 0.4) + 1),
  );
  if (subsIn + subsOut > apps) {
    let over = subsIn + subsOut - apps;
    while (over > 0 && (subsIn > 0 || subsOut > 0)) {
      if (subsOut >= subsIn && subsOut > 0) {
        subsOut--;
      } else if (subsIn > 0) {
        subsIn--;
      } else {
        subsOut--;
      }
      over--;
    }
  }

  const nFull = apps - subsIn - subsOut;
  let total = 0;
  for (let i = 0; i < nFull; i++) {
    total += 90;
  }
  for (let i = 0; i < subsOut; i++) {
    total += Math.round(46 + rng() * 39);
  }
  for (let i = 0; i < subsIn; i++) {
    total += Math.round(12 + rng() * 31);
  }

  return {
    minutes: total,
    subs_in: subsIn,
    subs_out: subsOut,
  };
}

function fakeSeasonStats(
  rng: () => number,
  profile: number,
  seasonIndex: number,
): Record<string, unknown> {
  const aging = 0.88 + (seasonIndex / 4) * 0.24;
  let appsCap = 30;
  if (profile === 4) {
    appsCap = 20;
  }
  const rawApps = Math.floor((4 + rng() * 24) * aging);
  const apps = Math.min(appsCap, Math.max(0, rawApps));
  if (apps === 0) {
    return {
      appearances: 0,
      goals: 0,
      yellow_cards: 0,
      yellow_red_cards: 0,
      red_cards: 0,
      blue_cards: false,
      minutes: 0,
      minutes_per_game: null,
      subs_in: 0,
      subs_out: 0,
    };
  }

  const { minutes, subs_in, subs_out } = computeFictiveMinutesSubsAndAvg(
    rng,
    apps,
  );

  let goals = 0;
  if (profile === 0) {
    goals = Math.min(apps, Math.floor(rng() * rng() * (apps * 0.5 + 4)));
  } else if (profile === 1) {
    goals = Math.min(apps, Math.floor(rng() * rng() * (apps * 0.25 + 2)));
  } else if (profile === 2) {
    goals = Math.min(apps, Math.floor(rng() * rng() * (apps * 0.1 + 0.8)));
  } else if (profile === 3) {
    goals = rng() < 0.04 ? 1 : 0;
  } else {
    goals = Math.min(apps, Math.floor(rng() * rng() * (apps * 0.35 + 2)));
  }

  const yellow = Math.min(
    14,
    Math.floor(rng() * rng() * (profile === 2 ? 7 : profile === 0 ? 5 : 4.5)),
  );
  const yr = rng() < 0.11 ? 1 : 0;
  const red = rng() < 0.028 ? 1 : 0;

  return {
    appearances: apps,
    goals,
    yellow_cards: yellow,
    yellow_red_cards: yr,
    red_cards: red,
    blue_cards: false,
    minutes,
    subs_in,
    subs_out,
  };
}

/** Älteste Saison zuerst (für gleichen „aging“-Index wie beim Seed-Skript). */
function pastSeasonLabelsOldestFirst(dataSeasonKey: string, count: number): string[] {
  return [...pastSeasonLabelsBeforeLocal(dataSeasonKey, count)].reverse();
}

function buildSeasonsPayloadForMissing(
  membershipId: string,
  seasonLabelsOldestFirst: string[],
  existingSeasons: Record<string, unknown>,
): Record<string, unknown> {
  const profile = profileFromMembershipId(membershipId);
  const out: Record<string, unknown> = {};
  for (let i = 0; i < seasonLabelsOldestFirst.length; i++) {
    const label = seasonLabelsOldestFirst[i]!;
    if (
      existingSeasons[label] != null &&
      typeof existingSeasons[label] === "object"
    ) {
      continue;
    }
    const rng = mulberry32(hash32(`${membershipId}|${label}`));
    out[label] = fakeSeasonStats(rng, profile, i);
  }
  return out;
}

/** `SCOUTBASE_FICTIVE_SEASON_STATS=0` schaltet aus; `=1` an; sonst nur in development. */
export function shouldApplyFictiveSeasonStats(): boolean {
  const v = process.env.SCOUTBASE_FICTIVE_SEASON_STATS?.trim();
  if (v === "0" || v === "false") {
    return false;
  }
  if (v === "1" || v === "true") {
    return true;
  }
  return process.env.NODE_ENV === "development";
}

/**
 * Ergänzt fehlende `stats.seasons`-Einträge (nur fehlende Schlüssel) — nur im Speicher für die Profil-Antwort.
 */
export function mergeFictiveSeasonsIntoMembershipStats(
  memberships: { id: string; stats: unknown }[],
  dataSeasonKey: string,
): void {
  const labelsOldestFirst = pastSeasonLabelsOldestFirst(dataSeasonKey, 5);
  for (const m of memberships) {
    const cur =
      m.stats && typeof m.stats === "object"
        ? (m.stats as Record<string, unknown>)
        : {};
    const seasons =
      cur.seasons && typeof cur.seasons === "object"
        ? ({ ...(cur.seasons as Record<string, unknown>) } as Record<
            string,
            unknown
          >)
        : {};
    const payload = buildSeasonsPayloadForMissing(m.id, labelsOldestFirst, seasons);
    if (Object.keys(payload).length === 0) {
      continue;
    }
    m.stats = {
      ...cur,
      seasons: { ...seasons, ...payload },
    };
  }
}
