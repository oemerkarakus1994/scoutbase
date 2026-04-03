#!/usr/bin/env node

import {
  buildProfileContentManifest,
  parseArgs,
  writeProfileContentManifest,
} from "./lib/profile-content-manifest.mjs";

const options = parseArgs(process.argv.slice(2));
const manifest = await buildProfileContentManifest(options);
const { manifestPath, summaryPath } = await writeProfileContentManifest(manifest);

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
