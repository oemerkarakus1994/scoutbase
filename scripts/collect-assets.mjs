#!/usr/bin/env node

import {
  collectAssets,
  parseArgs,
  writeAssetCollection,
} from "./lib/asset-collection.mjs";

const options = parseArgs(process.argv.slice(2));
const manifest = await collectAssets(options);
const { manifestPath, summaryPath } = await writeAssetCollection(manifest);

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
