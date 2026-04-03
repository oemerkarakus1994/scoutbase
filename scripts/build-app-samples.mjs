#!/usr/bin/env node

import { buildAppSamples, parseArgs, writeAppSamples } from "./lib/app-samples.mjs";

const options = parseArgs(process.argv.slice(2));
const manifest = await buildAppSamples(options);
const { outputDir, summaryPath } = await writeAppSamples(manifest);

console.log(
  JSON.stringify(
    {
      output_dir: outputDir,
      summary_path: summaryPath,
      summary: manifest.summary,
    },
    null,
    2,
  ),
);
