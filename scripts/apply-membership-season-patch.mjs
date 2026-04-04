#!/usr/bin/env node

/**
 * Wendet data/derived/membership-season-stats-patch.json an: merged stats.seasons
 * in core.team_memberships (liest bestehende stats und merged JSON).
 *
 * Benötigt: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (siehe scripts/lib/env.mjs)
 *
 *   node scripts/apply-membership-season-patch.mjs
 *   node scripts/apply-membership-season-patch.mjs --dry-run
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { ROOT_DIR } from "./lib/discovery-manifest.mjs";
import { loadScoutbaseEnv, requireEnv, getOptionalIntEnv } from "./lib/env.mjs";
import { chunkArray } from "./lib/postgrest.mjs";

const PATCH_PATH = path.join(
  ROOT_DIR,
  "data/derived/membership-season-stats-patch.json",
);

function parseArgs(argv) {
  return { dryRun: argv.includes("--dry-run") };
}

/** Nur stats.seasons aus dem Patch übernehmen (Top-Level-Stats bleiben aus der DB). */
function mergeSeasonsFromPatch(currentStats, patchStats) {
  const cur = currentStats && typeof currentStats === "object" ? currentStats : {};
  const incoming =
    patchStats && typeof patchStats === "object" && patchStats.seasons
      ? patchStats.seasons
      : {};
  return {
    ...cur,
    seasons: {
      ...(typeof cur.seasons === "object" && cur.seasons ? cur.seasons : {}),
      ...(typeof incoming === "object" ? incoming : {}),
    },
  };
}

async function fetchStats(supabaseUrl, key, id) {
  const url = new URL(`${supabaseUrl}/rest/v1/team_memberships`);
  url.searchParams.set("id", `eq.${id}`);
  url.searchParams.set("select", "stats");
  const response = await fetch(url, {
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "accept-profile": "core",
    },
  });
  if (!response.ok) {
    throw new Error(`GET team_memberships ${response.status}: ${await response.text()}`);
  }
  const rows = await response.json();
  return rows?.[0]?.stats ?? {};
}

async function patchStats(supabaseUrl, key, id, stats) {
  const url = new URL(`${supabaseUrl}/rest/v1/team_memberships`);
  url.searchParams.set("id", `eq.${id}`);
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "accept-profile": "core",
      "content-profile": "core",
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify({ stats }),
  });
  if (!response.ok) {
    throw new Error(`PATCH team_memberships ${response.status}: ${await response.text()}`);
  }
}

const { dryRun } = parseArgs(process.argv.slice(2));

await loadScoutbaseEnv(ROOT_DIR);
const supabaseUrl = requireEnv("SUPABASE_URL");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const batchSize = getOptionalIntEnv("APPLY_PATCH_BATCH_SIZE", 40);

const raw = await readFile(PATCH_PATH, "utf8");
const payload = JSON.parse(raw);
const updates = payload.updates ?? [];

let ok = 0;
let err = 0;

const chunks = chunkArray(updates, batchSize);
for (const chunk of chunks) {
  await Promise.all(
    chunk.map(async (u) => {
      try {
        const current = dryRun ? {} : await fetchStats(supabaseUrl, serviceRoleKey, u.id);
        const merged = mergeSeasonsFromPatch(current, u.stats);
        if (dryRun) {
          ok += 1;
          return;
        }
        await patchStats(supabaseUrl, serviceRoleKey, u.id, merged);
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
      patch: path.relative(ROOT_DIR, PATCH_PATH),
      dry_run: dryRun,
      updates: updates.length,
      ok,
      err,
    },
    null,
    2,
  ),
);
