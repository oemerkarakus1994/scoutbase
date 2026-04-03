#!/usr/bin/env node
/**
 * Lädt SFV/KM/RES-Daten (Manifeste unter data/derived/*.sfv.json) nach Supabase.
 * Benötigt: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (Root-.env oder web/.env.local + Root)
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

await runNode("scripts/import-discovery-to-supabase.mjs", ["--sfv-only"]);
await runNode("scripts/import-competition-content-to-supabase.mjs", ["--suffix=sfv"]);
await runNode("scripts/import-team-content-to-supabase.mjs", ["--suffix=sfv"]);

console.log(
  JSON.stringify(
    {
      ok: true,
      message: "SFV-Import abgeschlossen (Discovery SFV, Competition sfv, Team-Content sfv).",
    },
    null,
    2,
  ),
);
