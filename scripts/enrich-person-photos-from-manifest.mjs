#!/usr/bin/env node
/**
 * Setzt `core.personen.foto_public_uid` aus dem Team-Content-Manifest
 * (Spielerfotos aus ÖFB-/Vereins-Kaderdaten — gleicher CDN-Bestand wie sfv.at).
 *
 * Voraussetzung: `npm run build:team-content:sfv` (Manifest) und
 * `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `.env`.
 *
 * Usage: node scripts/enrich-person-photos-from-manifest.mjs --suffix=sfv
 */

import path from "node:path";
import { readFile } from "node:fs/promises";

import { ROOT_DIR } from "./lib/discovery-manifest.mjs";
import { loadScoutbaseEnv, requireEnv, getOptionalIntEnv } from "./lib/env.mjs";
import { PostgrestClient, chunkArray } from "./lib/postgrest.mjs";

function parseArgs(argv) {
  let suffix = "sfv";
  for (const arg of argv) {
    if (arg.startsWith("--suffix=")) {
      suffix = arg.slice("--suffix=".length);
    }
  }
  return { suffix };
}

const options = parseArgs(process.argv.slice(2));

await loadScoutbaseEnv(ROOT_DIR);

const supabaseUrl = requireEnv("SUPABASE_URL");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const batchSize = getOptionalIntEnv("IMPORT_BATCH_SIZE", 200);

const manifestPath = path.join(
  ROOT_DIR,
  "data",
  "derived",
  `team-content-manifest.${options.suffix}.json`,
);

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const personen = manifest.tables?.["core.personen"] ?? [];

const client = new PostgrestClient({ supabaseUrl, serviceRoleKey });

const withFoto = personen.filter(
  (p) => p?.id && p.foto_public_uid != null && String(p.foto_public_uid).trim() !== "",
);
const skipped = personen.length - withFoto.length;

const chunks = chunkArray(withFoto, batchSize);
let batchIndex = 0;

for (const chunk of chunks) {
  batchIndex += 1;
  process.stderr.write(
    `personen upsert batch ${batchIndex}/${chunks.length} (${chunk.length} rows)…\n`,
  );
  await client.upsert({
    schema: "core",
    table: "personen",
    rows: chunk,
    onConflict: "id",
  });
}

console.log(
  JSON.stringify(
    {
      manifest: manifestPath,
      upserted_rows_with_foto: withFoto.length,
      skipped_no_foto: skipped,
      total_person_rows: personen.length,
      batches: chunks.length,
      batch_size: batchSize,
    },
    null,
    2,
  ),
);
