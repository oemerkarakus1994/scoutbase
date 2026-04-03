#!/usr/bin/env node

import path from "node:path";
import { readFile } from "node:fs/promises";

import { ROOT_DIR } from "./lib/discovery-manifest.mjs";
import { loadDotEnv, requireEnv, getOptionalIntEnv } from "./lib/env.mjs";
import { PostgrestClient, chunkArray } from "./lib/postgrest.mjs";

function parseArgs(argv) {
  const options = {
    scope: "current",
  };

  for (const arg of argv) {
    if (arg.startsWith("--scope=")) {
      options.scope = arg.split("=")[1];
    }
  }

  if (!["current", "all"].includes(options.scope)) {
    throw new Error(`Unsupported scope: ${options.scope}`);
  }

  return options;
}

function makeEntityAssetId(assetId, relatedEntity) {
  return `oefb:entity-asset:${assetId}:${relatedEntity.entity_type}:${relatedEntity.entity_id}:${relatedEntity.relation_type}`;
}

const options = parseArgs(process.argv.slice(2));

await loadDotEnv(ROOT_DIR);

const supabaseUrl = requireEnv("SUPABASE_URL");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const batchSize = getOptionalIntEnv("IMPORT_BATCH_SIZE", 250);

const suffix = options.scope === "all" ? "all" : "current";
const targetsPath = path.join(ROOT_DIR, "data", "derived", `asset-targets.${suffix}.json`);
const collectionPath = path.join(ROOT_DIR, "data", "derived", `asset-collection.${suffix}.json`);

const targetsManifest = JSON.parse(await readFile(targetsPath, "utf8"));
const collectionManifest = JSON.parse(await readFile(collectionPath, "utf8"));
const client = new PostgrestClient({
  supabaseUrl,
  serviceRoleKey,
});

const targetsById = new Map((targetsManifest.targets ?? []).map((target) => [target.id, target]));
const mediaAssets = [];
const entityAssets = [];

for (const collectedAsset of collectionManifest.assets ?? []) {
  const target = targetsById.get(collectedAsset.asset_id);
  if (!target) {
    continue;
  }

  mediaAssets.push({
    id: target.id,
    source_system: "oefb",
    asset_kind: target.asset_kind,
    source_asset_id: target.source_asset_id,
    source_url: collectedAsset.downloaded_from ?? target.download_candidates?.[0]?.url ?? null,
    storage_path: path.relative(ROOT_DIR, collectedAsset.file_path).split(path.sep).join("/"),
    content_type: collectedAsset.content_type,
    file_size: collectedAsset.file_size,
    meta: {
      candidate_label: collectedAsset.candidate_label,
      display_names: target.meta?.display_names ?? [],
      relation_types: target.meta?.relation_types ?? [],
      observed_sources: target.meta?.observed_sources ?? [],
      download_candidates: target.download_candidates ?? [],
    },
  });

  for (const relatedEntity of target.related_entities ?? []) {
    entityAssets.push({
      id: makeEntityAssetId(target.id, relatedEntity),
      asset_id: target.id,
      entity_type: relatedEntity.entity_type,
      entity_id: relatedEntity.entity_id,
      relation_type: relatedEntity.relation_type,
      meta: {},
    });
  }
}

const IMPORT_ORDER = [
  {
    schema: "core",
    table: "media_assets",
    rows: mediaAssets,
    onConflict: "id",
  },
  {
    schema: "core",
    table: "entity_assets",
    rows: entityAssets,
    onConflict: "id",
  },
];

async function createRun() {
  const rows = await client.insert({
    schema: "sync",
    table: "runs",
    rows: [
      {
        pipeline_name: "oefb_asset_import",
        stage: `asset_content_${options.scope}`,
        status: "running",
        trigger_source: "manual",
        stats: collectionManifest.summary,
        meta: {
          scope: options.scope,
          targets_generated_at: targetsManifest.generated_at,
          assets_generated_at: collectionManifest.generated_at,
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

const tableStats = {};
let runId = null;

try {
  runId = await createRun();

  for (const plan of IMPORT_ORDER) {
    const chunks = chunkArray(plan.rows, batchSize);

    for (const chunk of chunks) {
      await client.upsert({
        schema: plan.schema,
        table: plan.table,
        rows: chunk,
        onConflict: plan.onConflict,
      });
    }

    tableStats[`${plan.schema}.${plan.table}`] = {
      rows: plan.rows.length,
      batches: chunks.length,
    };
  }

  await finalizeRun(runId, "completed", {
    ...collectionManifest.summary,
    tables: tableStats,
  });

  console.log(
    JSON.stringify(
      {
        run_id: runId,
        summary: collectionManifest.summary,
        tables: tableStats,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await finalizeRun(
    runId,
    "failed",
    {
      ...collectionManifest.summary,
      tables: tableStats,
    },
    {
      message: error.message,
    },
  );
  throw error;
}
