#!/usr/bin/env node

/**
 * Trägt in `core.team_memberships.stats.seasons` die fünf Saisons **vor**
 * `SCOUTBASE_TOP_LEVEL_IMPORT_SEASON` (Default `2025/26`) mit plausiblen Demo-Zahlen ein
 * (Tore, Einsätze, Minuten, Karten — wie beim Kader-Merge).
 * Top-Level-`stats` bleiben unverändert.
 *
 *   node scripts/seed-fictive-membership-season-stats.mjs --dry-run
 *   node scripts/seed-fictive-membership-season-stats.mjs
 *   node scripts/seed-fictive-membership-season-stats.mjs --write-patch
 *   node scripts/seed-fictive-membership-season-stats.mjs --include-left
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (scripts/lib/env.mjs)
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { ROOT_DIR } from "./lib/discovery-manifest.mjs";
import {
  loadScoutbaseEnv,
  requireEnv,
  getOptionalIntEnv,
} from "./lib/env.mjs";
import { chunkArray } from "./lib/postgrest.mjs";

const TOP_LEVEL_IMPORT_SEASON =
  process.env.SCOUTBASE_TOP_LEVEL_IMPORT_SEASON?.trim() ?? "2025/26";

const PATCH_OUT = path.join(
  ROOT_DIR,
  "data/derived/membership-season-stats-fictive-seed.json",
);

function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry-run"),
    writePatch: argv.includes("--write-patch"),
    includeLeft: argv.includes("--include-left"),
  };
}

/** z. B. Top `2025/26` → fünf vorherige: `2020/21` … `2024/25` (älteste zuerst). */
function fiveSeasonsBeforeTop(topSeason) {
  const m = /^(\d{4})\/(\d{2})$/.exec(topSeason.trim());
  if (!m) {
    throw new Error(
      `SCOUTBASE_TOP_LEVEL_IMPORT_SEASON ungültig: ${JSON.stringify(topSeason)} (erwartet z. B. 2025/26)`,
    );
  }
  const yStart = Number.parseInt(m[1], 10);
  const out = [];
  for (let k = 5; k >= 1; k--) {
    const a = yStart - k;
    const b = (a + 1) % 100;
    out.push(`${a}/${String(b).padStart(2, "0")}`);
  }
  return out;
}

function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 0 Stürmer, 1 MF, 2 Abwehr, 3 TW, 4 Fokus wenig Einsätze */
function profileFromMembershipId(id) {
  return hash32(id) % 5;
}

/** Minuten + Wechsel konsistent: Vollzeit 90, Auswechsel 46–85, Einwechsel 12–43. */
function computeFictiveMinutesSubsAndAvg(rng, apps) {
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
  return { minutes: total, subs_in: subsIn, subs_out: subsOut };
}

/**
 * @param {() => number} rng
 * @param {number} profile
 * @param {number} seasonIndex 0 = älteste der fünf Saisons
 */
function fakeSeasonStats(rng, profile, seasonIndex) {
  const aging = 0.88 + (seasonIndex / 4) * 0.24;
  let appsCap = 30;
  if (profile === 3) {
    appsCap = 30;
  }
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

function buildSeasonsPayload(membershipId, seasonLabels) {
  const profile = profileFromMembershipId(membershipId);
  const seasons = {};
  for (let i = 0; i < seasonLabels.length; i++) {
    const label = seasonLabels[i];
    const rng = mulberry32(hash32(`${membershipId}|${label}`));
    seasons[label] = fakeSeasonStats(rng, profile, i);
  }
  return seasons;
}

function mergeSeasonsIntoStats(currentStats, newSeasons) {
  const cur =
    currentStats && typeof currentStats === "object" ? currentStats : {};
  return {
    ...cur,
    seasons: {
      ...(typeof cur.seasons === "object" && cur.seasons ? cur.seasons : {}),
      ...newSeasons,
    },
  };
}

async function fetchMembershipPage(
  supabaseUrl,
  key,
  { offset, limit, includeLeft },
) {
  const params = new URLSearchParams();
  params.set("select", "id,stats");
  params.set("or", "(role_type.eq.player,role_type.eq.spieler)");
  params.set("order", "id.asc");
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  if (!includeLeft) {
    params.set("left_on", "is.null");
  }
  const url = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/team_memberships?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      accept: "application/json",
      "accept-profile": "core",
    },
  });
  if (!response.ok) {
    throw new Error(
      `GET team_memberships ${response.status}: ${await response.text()}`,
    );
  }
  return response.json();
}

async function patchStats(supabaseUrl, key, id, stats) {
  const url = new URL(`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/team_memberships`);
  url.searchParams.set("id", `eq.${id}`);
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-profile": "core",
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify({ stats }),
  });
  if (!response.ok) {
    throw new Error(
      `PATCH team_memberships ${response.status}: ${await response.text()}`,
    );
  }
}

const { dryRun, writePatch, includeLeft } = parseArgs(process.argv.slice(2));

await loadScoutbaseEnv(ROOT_DIR);
const supabaseUrl = requireEnv("SUPABASE_URL");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const batchSize = getOptionalIntEnv("SEED_FICTIVE_BATCH_SIZE", 40);

const seasonLabels = fiveSeasonsBeforeTop(TOP_LEVEL_IMPORT_SEASON);

const pageSize = 1000;
let offset = 0;
/** @type {{ id: string, stats: object }[]} */
const updates = [];

for (;;) {
  const rows = await fetchMembershipPage(supabaseUrl, serviceRoleKey, {
    offset,
    limit: pageSize,
    includeLeft,
  });
  if (!rows?.length) {
    break;
  }
  for (const row of rows) {
    const newSeasons = buildSeasonsPayload(row.id, seasonLabels);
    updates.push({
      id: row.id,
      stats: mergeSeasonsIntoStats(row.stats, newSeasons),
    });
  }
  if (rows.length < pageSize) {
    break;
  }
  offset += pageSize;
}

const payload = {
  generated_at: new Date().toISOString(),
  top_level_import_season: TOP_LEVEL_IMPORT_SEASON,
  season_labels_written: seasonLabels,
  include_left_memberships: includeLeft,
  membership_rows: updates.length,
  updates,
};

if (writePatch) {
  await mkdir(path.dirname(PATCH_OUT), { recursive: true });
  await writeFile(PATCH_OUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        wrote: path.relative(ROOT_DIR, PATCH_OUT),
        rows: updates.length,
        season_labels: seasonLabels,
        hint: "Zum Anwenden: node scripts/seed-fictive-membership-season-stats.mjs (ohne --write-patch)",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (dryRun) {
  console.log(
    JSON.stringify(
      {
        dry_run: true,
        season_labels: seasonLabels,
        rows: updates.length,
        sample:
          updates[0] != null
            ? {
                id: updates[0].id,
                seasons: updates[0].stats.seasons,
              }
            : null,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

let ok = 0;
let err = 0;
const chunks = chunkArray(updates, batchSize);
for (const chunk of chunks) {
  await Promise.all(
    chunk.map(async (u) => {
      try {
        await patchStats(supabaseUrl, serviceRoleKey, u.id, u.stats);
        ok += 1;
      } catch (e) {
        err += 1;
        console.error(u.id, e.message);
      }
    }),
  );
}

console.log(
  JSON.stringify(
    {
      top_level_import_season: TOP_LEVEL_IMPORT_SEASON,
      season_labels: seasonLabels,
      include_left: includeLeft,
      patched: ok,
      errors: err,
    },
    null,
    2,
  ),
);
