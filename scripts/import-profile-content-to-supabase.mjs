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

const options = parseArgs(process.argv.slice(2));

await loadDotEnv(ROOT_DIR);

const supabaseUrl = requireEnv("SUPABASE_URL");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const batchSize = getOptionalIntEnv("IMPORT_BATCH_SIZE", 250);

const suffix = options.scope === "all" ? "all" : "current";
const manifestPath = path.join(
  ROOT_DIR,
  "data",
  "derived",
  `profile-content-manifest.${suffix}.json`,
);

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const client = new PostgrestClient({
  supabaseUrl,
  serviceRoleKey,
});

const IMPORT_ORDER = [
  { schema: "raw", table: "payloads", key: "raw.payloads", onConflict: "id" },
  { schema: "core", table: "vereine", key: "core.vereine", onConflict: "id" },
  { schema: "core", table: "personen", key: "core.personen", onConflict: "id" },
  {
    schema: "core",
    table: "person_stationen",
    key: "core.person_stationen",
    onConflict: "id",
  },
  {
    schema: "core",
    table: "person_team_history",
    key: "core.person_team_history",
    onConflict: "id",
  },
  {
    schema: "core",
    table: "person_achievements",
    key: "core.person_achievements",
    onConflict: "id",
  },
  {
    schema: "core",
    table: "person_statistiken",
    key: "core.person_statistiken",
    onConflict: "id",
  },
];

async function materializeRawPayloadRows(rows) {
  return Promise.all(
    rows.map(async (row) => {
      if (row.payload_json != null) {
        return row;
      }

      const relativePath = row.meta?.relative_path;
      if (!relativePath) {
        return row;
      }

      const payloadPath = path.join(ROOT_DIR, relativePath);
      const payloadJson = JSON.parse(await readFile(payloadPath, "utf8"));

      return {
        ...row,
        payload_json: payloadJson,
      };
    }),
  );
}

async function createRun() {
  const rows = await client.insert({
    schema: "sync",
    table: "runs",
    rows: [
      {
        pipeline_name: "oefb_profile_content_import",
        stage: `profile_content_${options.scope}`,
        status: "running",
        trigger_source: "manual",
        stats: manifest.summary,
        meta: {
          scope: options.scope,
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

const tableStats = {};
let runId = null;

try {
  runId = await createRun();

  for (const plan of IMPORT_ORDER) {
    const baseRows = manifest.tables[plan.key] ?? [];
    const chunks = chunkArray(baseRows, batchSize);

    for (const chunk of chunks) {
      let rows =
        plan.key === "raw.payloads" ? await materializeRawPayloadRows(chunk) : chunk;
      if (plan.key === "core.vereine") {
        rows = rows.map((row) => ({
          ...row,
          name: row.name?.trim() || "Unbekannt",
        }));
      }
      await client.upsert({
        schema: plan.schema,
        table: plan.table,
        rows,
        onConflict: plan.onConflict,
      });
    }

    tableStats[plan.key] = {
      rows: baseRows.length,
      batches: chunks.length,
    };
  }

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
  await finalizeRun(
    runId,
    "failed",
    {
      ...manifest.summary,
      tables: tableStats,
    },
    {
      message: error.message,
    },
  );
  throw error;
}
