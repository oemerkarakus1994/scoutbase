#!/usr/bin/env node

import { buildDiscoveryManifest, writeDiscoveryManifest } from "./lib/discovery-manifest.mjs";

const manifest = await buildDiscoveryManifest();
const { manifestPath, summaryPath } = await writeDiscoveryManifest(manifest);

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
