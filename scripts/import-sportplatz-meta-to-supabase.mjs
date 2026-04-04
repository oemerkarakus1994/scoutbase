#!/usr/bin/env node
/**
 * Liest data/derived/sportplatz-meta.sfv.json und merged meta_patch in core.vereine
 * (Match über slug = club_slug). Benötigt SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadScoutbaseEnv, requireEnv } from "./lib/env.mjs";
import { PostgrestClient } from "./lib/postgrest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MANIFEST = path.join(ROOT, "data", "derived", "sportplatz-meta.sfv.json");

async function main() {
  await loadScoutbaseEnv(ROOT);
  const url = requireEnv("SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const client = new PostgrestClient({ supabaseUrl: url, serviceRoleKey: key });

  const raw = JSON.parse(await readFile(MANIFEST, "utf8"));
  const entries = raw.entries ?? [];

  let updated = 0;
  let skipped = 0;
  const errors = [];

  for (const e of entries) {
    if (!e.ok || !e.meta_patch || !e.club_slug) {
      skipped += 1;
      continue;
    }

    try {
      const sel = await fetch(
        `${url.replace(/\/+$/, "")}/rest/v1/vereine?slug=eq.${encodeURIComponent(e.club_slug)}&select=id,meta`,
        {
          headers: {
            apikey: key,
            authorization: `Bearer ${key}`,
            "accept-profile": "core",
            "content-profile": "core",
          },
        },
      );
      const rows = await sel.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        skipped += 1;
        errors.push({ club_slug: e.club_slug, error: "Kein Verein mit diesem slug" });
        continue;
      }

      const row = rows[0];
      const merged = {
        ...(row.meta && typeof row.meta === "object" ? row.meta : {}),
        ...e.meta_patch,
      };

      await client.patch({
        schema: "core",
        table: "vereine",
        match: { id: `eq.${row.id}` },
        values: { meta: merged },
        returning: "minimal",
      });
      updated += 1;
    } catch (err) {
      errors.push({
        club_slug: e.club_slug,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        manifest: MANIFEST,
        updated,
        skipped,
        errors: errors.length ? errors : undefined,
      },
      null,
      2,
    ),
  );

  if (errors.length) {
    process.exitCode = 1;
  }
}

await main();
