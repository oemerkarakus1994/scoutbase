#!/usr/bin/env node

import {
  materializeTeamPageCollection,
  parseArgs,
  writeTeamPageCollectionManifest,
} from "./lib/team-page-collection.mjs";

const options = parseArgs(process.argv.slice(2));
const manifest = await materializeTeamPageCollection(options);
const { manifestPath, summaryPath } = await writeTeamPageCollectionManifest(manifest);

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
