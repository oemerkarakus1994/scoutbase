#!/usr/bin/env node

import {
  collectPlayerProfiles,
  parseArgs,
  writePlayerProfileCollection,
} from "./lib/player-profile-collection.mjs";

const options = parseArgs(process.argv.slice(2));
const manifest = await collectPlayerProfiles(options);
const { manifestPath, summaryPath } = await writePlayerProfileCollection(manifest);

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
