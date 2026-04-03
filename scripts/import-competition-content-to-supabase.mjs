#!/usr/bin/env node

import path from "node:path";
import { readFile } from "node:fs/promises";

import { ROOT_DIR } from "./lib/discovery-manifest.mjs";
import { loadScoutbaseEnv, requireEnv, getOptionalIntEnv } from "./lib/env.mjs";
import { PostgrestClient, chunkArray } from "./lib/postgrest.mjs";

function parseArgs(argv) {
  const options = {
    scope: "current",
    suffix: null,
  };

  for (const arg of argv) {
    if (arg.startsWith("--scope=")) {
      options.scope = arg.split("=")[1];
    } else if (arg.startsWith("--suffix=")) {
      options.suffix = arg.split("=")[1];
    }
  }

  if (!["current", "all"].includes(options.scope)) {
    throw new Error(`Unsupported scope: ${options.scope}`);
  }

  const manifestSuffix = options.suffix ?? (options.scope === "all" ? "all" : "current");
  return { ...options, manifestSuffix };
}

const options = parseArgs(process.argv.slice(2));

await loadScoutbaseEnv(ROOT_DIR);

const supabaseUrl = requireEnv("SUPABASE_URL");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const batchSize = getOptionalIntEnv("IMPORT_BATCH_SIZE", 250);

const manifestPath = path.join(
  ROOT_DIR,
  "data",
  "derived",
  `competition-content-manifest.${options.manifestSuffix}.json`,
);

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const client = new PostgrestClient({
  supabaseUrl,
  serviceRoleKey,
});

const IMPORT_ORDER = [
  { schema: "raw", table: "payloads", key: "raw.payloads", onConflict: "id" },
  {
    schema: "core",
    table: "tabellen_snapshots",
    key: "core.tabellen_snapshots",
    onConflict: "id",
  },
  {
    schema: "core",
    table: "tabellen_snapshot_rows",
    key: "core.tabellen_snapshot_rows",
    onConflict: "id",
  },
  { schema: "core", table: "spiele", key: "core.spiele", onConflict: "id" },
];

async function createRun() {
  const rows = await client.insert({
    schema: "sync",
    table: "runs",
    rows: [
      {
        pipeline_name: "oefb_competition_content_import",
        stage: `competition_content_${options.manifestSuffix}`,
        status: "running",
        trigger_source: "manual",
        stats: manifest.summary,
        meta: {
          scope: options.scope,
          manifest_suffix: options.manifestSuffix,
          generated_at: manifest.generated_at,
        },
      },
    ],
    returning: "representation",
  });

  return rows?.[0]?.id ?? null;
}

async function finalizeRun(runId, status, stats, error) {
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

async function upsertCheckpoint(tableStats) {
  await client.upsert({
    schema: "sync",
    table: "checkpoints",
    onConflict: "id",
    rows: [
      {
        id: `oefb:checkpoint:competition-content:${options.manifestSuffix}`,
        pipeline_name: "oefb_competition_content_import",
        checkpoint_key: `competition-content:${options.manifestSuffix}`,
        status: "completed",
        cursor_text: manifest.generated_at,
        cursor_json: {
          scope: options.scope,
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

const tableStats = {};
let runId = null;

try {
  runId = await createRun();

  for (const plan of IMPORT_ORDER) {
    const rows = manifest.tables[plan.key] ?? [];
    const chunks = chunkArray(rows, batchSize);

    for (const chunk of chunks) {
      await client.upsert({
        schema: plan.schema,
        table: plan.table,
        rows: chunk,
        onConflict: plan.onConflict,
      });
    }

    tableStats[plan.key] = {
      rows: rows.length,
      batches: chunks.length,
    };
  }

  await upsertCheckpoint(tableStats);
  await finalizeRun(runId, "completed", {
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
  await finalizeRun(runId, "failed", {
    ...manifest.summary,
    tables: tableStats,
  }, {
    message: error.message,
  });
  throw error;
}
