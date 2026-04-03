#!/usr/bin/env node

import {
  buildTeamTargetsManifest,
  parseArgs,
  writeTeamTargetsManifest,
} from "./lib/team-targets.mjs";

const options = parseArgs(process.argv.slice(2));
const manifest = await buildTeamTargetsManifest(options);
const { manifestPath, summaryPath } = await writeTeamTargetsManifest(manifest);

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
