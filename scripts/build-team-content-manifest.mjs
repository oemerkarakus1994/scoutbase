#!/usr/bin/env node

import {
  buildTeamContentManifest,
  parseArgs,
  writeTeamContentManifest,
} from "./lib/team-content-manifest.mjs";

const options = parseArgs(process.argv.slice(2));
const manifest = await buildTeamContentManifest(options);
const { manifestPath, summaryPath } = await writeTeamContentManifest(manifest);

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
