#!/usr/bin/env node

/**
 * Baut team-targets.sfv-5y.json: alle SFV-Vereine × letzte N Saisons × KM + Res.
 * Voraussetzung: npm run build:team-targets:sfv
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";

import { DERIVED_DIR } from "./lib/discovery-manifest.mjs";
import { buildHistoricMultiSeasonTargets } from "./lib/team-targets-multi-season.mjs";

function parseArgs(argv) {
  let seasonCount = 5;
  for (const arg of argv) {
    if (arg.startsWith("--seasons=")) {
      const n = Number.parseInt(arg.split("=")[1], 10);
      if (Number.isFinite(n) && n > 0) {
        seasonCount = n;
      }
    }
  }
  return { seasonCount };
}

const opts = parseArgs(process.argv.slice(2));
const manifest = await buildHistoricMultiSeasonTargets({
  seasonCount: opts.seasonCount,
});

const outPath = path.join(DERIVED_DIR, "team-targets.sfv-5y.json");
const summaryPath = path.join(DERIVED_DIR, "team-targets.sfv-5y.summary.json");

await writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await writeFile(
  summaryPath,
  `${JSON.stringify(
    {
      generated_at: manifest.generated_at,
      summary: manifest.summary,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(
  JSON.stringify(
    {
      manifest_path: outPath,
      summary_path: summaryPath,
      summary: manifest.summary,
    },
    null,
    2,
  ),
);
