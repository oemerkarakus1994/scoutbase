#!/usr/bin/env node

import {
  buildCompetitionContentManifest,
  parseArgs,
  writeCompetitionContentManifest,
} from "./lib/competition-content-manifest.mjs";

const options = parseArgs(process.argv.slice(2));
const manifest = await buildCompetitionContentManifest(options);
const { manifestPath, summaryPath } = await writeCompetitionContentManifest(manifest);

console.log(
  JSON.stringify(
    {
      manifest_path: manifestPath,
      summary_path: summaryPath,
      summary: manifest.summary,
    },
    null,
    2,
  ),
);
