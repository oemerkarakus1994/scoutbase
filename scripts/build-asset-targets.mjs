#!/usr/bin/env node

import { buildAssetTargets, parseArgs, writeAssetTargets } from "./lib/asset-targets.mjs";

const options = parseArgs(process.argv.slice(2));
const manifest = await buildAssetTargets(options);
const { manifestPath, summaryPath } = await writeAssetTargets(manifest);

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
