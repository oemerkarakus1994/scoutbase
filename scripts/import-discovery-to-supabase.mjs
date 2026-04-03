#!/usr/bin/env node

import { ROOT_DIR, buildDiscoveryManifest } from "./lib/discovery-manifest.mjs";
import { filterDiscoveryManifestForSfv } from "./lib/discovery-sfv-filter.mjs";
import { loadScoutbaseEnv, requireEnv, getOptionalIntEnv } from "./lib/env.mjs";
import { PostgrestClient, chunkArray } from "./lib/postgrest.mjs";

function parseArgs(argv) {
  const options = { sfvOnly: false };
  for (const arg of argv) {
    if (arg === "--sfv-only") {
      options.sfvOnly = true;
    }
  }
  return options;
}

const cli = parseArgs(process.argv.slice(2));

const IMPORT_ORDER = [
  { schema: "raw", table: "payloads", key: "raw.payloads", onConflict: "id" },
  { schema: "core", table: "verbaende", key: "core.verbaende", onConflict: "id" },
  { schema: "core", table: "saisonen", key: "core.saisonen", onConflict: "id" },
  { schema: "core", table: "gruppen", key: "core.gruppen", onConflict: "id" },
  { schema: "core", table: "bewerb_serien", key: "core.bewerb_serien", onConflict: "id" },
  { schema: "core", table: "bewerb_editionen", key: "core.bewerb_editionen", onConflict: "id" },
  { schema: "core", table: "bewerb_runden", key: "core.bewerb_runden", onConflict: "id" },
];

async function createRun(client, manifest, sfvOnly) {
  const rows = await client.insert({
    schema: "sync",
    table: "runs",
    rows: [
      {
        pipeline_name: sfvOnly ? "oefb_discovery_import_sfv" : "oefb_discovery_import",
        stage: sfvOnly ? "discovery_sfv" : "discovery",
        status: "running",
        trigger_source: "manual",
        stats: manifest.summary,
        meta: {
          source_system: manifest.source_system,
          generated_at: manifest.generated_at,
          sfv_only: sfvOnly,
        },
      },
    ],
    returning: "representation",
  });

  return rows?.[0]?.id ?? null;
}

async function finalizeRun(client, runId, status, stats, error) {
  if (!runId) {
    return;
  }

  await client.patch({
    schema: "sync",
    table: "runs",
    match: { id: `eq.${runId}` },
    values: {
      status,
      finished_at: new Date().toISOString(),
      stats,
      error: error ?? null,
    },
  });
}

async function upsertCheckpoint(client, manifest, tableStats, sfvOnly) {
  await client.upsert({
    schema: "sync",
    table: "checkpoints",
    onConflict: "id",
    rows: [
      {
        id: sfvOnly ? "oefb:checkpoint:discovery-manifest:sfv" : "oefb:checkpoint:discovery-manifest",
        pipeline_name: sfvOnly ? "oefb_discovery_import_sfv" : "oefb_discovery_import",
        checkpoint_key: sfvOnly ? "discovery-manifest:sfv" : "discovery-manifest",
        status: "completed",
        cursor_text: manifest.generated_at,
        cursor_json: {
          source_system: manifest.source_system,
          summary: manifest.summary,
          tables: tableStats,
        },
        last_seen_at: new Date().toISOString(),
        last_success_at: new Date().toISOString(),
        meta: {},
      },
    ],
  });
}

await loadScoutbaseEnv(ROOT_DIR);

const supabaseUrl = requireEnv("SUPABASE_URL");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const batchSize = getOptionalIntEnv("IMPORT_BATCH_SIZE", 250);

let manifest = await buildDiscoveryManifest();
if (cli.sfvOnly) {
  manifest = await filterDiscoveryManifestForSfv(manifest);
}
const client = new PostgrestClient({
  supabaseUrl,
  serviceRoleKey,
});

const tableStats = {};
let runId = null;

try {
  runId = await createRun(client, manifest, cli.sfvOnly);

  for (const plan of IMPORT_ORDER) {
    const rows = manifest.tables[plan.key] ?? [];
    const chunks = chunkArray(rows, batchSize);
    let insertedRows = 0;

    for (const chunk of chunks) {
      await client.upsert({
        schema: plan.schema,
        table: plan.table,
        rows: chunk,
        onConflict: plan.onConflict,
      });
      insertedRows += chunk.length;
    }

    tableStats[plan.key] = {
      rows: rows.length,
      batches: chunks.length,
      inserted_rows: insertedRows,
    };
  }

  await upsertCheckpoint(client, manifest, tableStats, cli.sfvOnly);
  await finalizeRun(client, runId, "completed", {
    ...manifest.summary,
    tables: tableStats,
  });

  console.log(
    JSON.stringify(
      {
        run_id: runId,
        summary: manifest.summary,
        tables: tableStats,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await finalizeRun(client, runId, "failed", {
    ...manifest.summary,
    tables: tableStats,
  }, {
    message: error.message,
  });
  throw error;
}
