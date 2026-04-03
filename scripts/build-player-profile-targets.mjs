#!/usr/bin/env node

import {
  buildPlayerProfileTargets,
  parseArgs,
  writePlayerProfileTargets,
} from "./lib/player-profile-targets.mjs";

const options = parseArgs(process.argv.slice(2));
const manifest = await buildPlayerProfileTargets(options);
const { manifestPath, summaryPath } = await writePlayerProfileTargets(manifest);

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
