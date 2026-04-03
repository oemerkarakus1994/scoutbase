#!/usr/bin/env node
/**
 * Einmalige SFV-Salzburg-Pipeline: Discovery-Zeilen → Manifeste → Bewerbsseiten → Teamziele.
 * Teamseiten (HTML): npm run collect:team-pages:sfv (separat, länger).
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function runNode(script, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, script), ...args], {
      stdio: "inherit",
      cwd: ROOT,
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${script} exited with ${code}`));
      }
    });
  });
}

const SFV = "5ac4e17caa6271317678";

await runNode("scripts/collect-sfv-scope.mjs");
await runNode("scripts/build-discovery-manifest.mjs");
await runNode("scripts/build-competition-content-manifest.mjs", [
  `--verband-source-id=${SFV}`,
  "--refresh",
]);
await runNode("scripts/build-team-targets.mjs", [
  "--scope=sfv",
  "--competition-manifest-suffix=sfv",
  "--output-suffix=sfv",
]);

console.log(
  JSON.stringify(
    {
      next:
        "Teamseiten crawlen: npm run collect:team-pages:sfv\n" +
        "Dann Inhalt: npm run build:team-content:sfv",
    },
    null,
    2,
  ),
);
