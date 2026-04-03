import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { DERIVED_DIR } from "./discovery-manifest.mjs";

function oefbId(kind, ...parts) {
  return `oefb:${kind}:${parts.filter(Boolean).join(":")}`;
}

function sortById(rows) {
  return [...rows].sort((left, right) => left.id.localeCompare(right.id, "de"));
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv) {
  const options = {
    scope: "current",
  };

  for (const arg of argv) {
    if (arg.startsWith("--scope=")) {
      options.scope = arg.split("=")[1];
    }
  }

  if (!["current", "all"].includes(options.scope)) {
    throw new Error(`Unsupported scope: ${options.scope}`);
  }

  return options;
}

function parsePublicPersonId(url) {
  const value = String(url ?? "");
  const match = value.match(/\/(?:Profile|bewerbe)\/(?:Spieler|Trainer)\/(\d+)/);
  return match?.[1] ?? null;
}

function parseLegacyProfileKey(url) {
  const value = String(url ?? "");
  const match = value.match(/\/spielerdetails\/\d+\/[^_]+_(\d+)~\d+\.htm/i);
  return match?.[1] ?? null;
}

export async function buildPlayerProfileTargets(options = {}) {
  const config = {
    scope: options.scope ?? "current",
  };

  const suffix = config.scope === "all" ? "all" : "current";
  const manifestPath = path.join(DERIVED_DIR, `team-content-manifest.${suffix}.json`);
  const manifest = await readJson(manifestPath);
  const personen = manifest.tables["core.personen"] ?? [];
  const rollen = manifest.tables["core.person_rollen"] ?? [];

  const roleTypesByPersonId = new Map();
  for (const rolle of rollen) {
    const values = roleTypesByPersonId.get(rolle.person_id) ?? new Set();
    values.add(rolle.role_type);
    roleTypesByPersonId.set(rolle.person_id, values);
  }

  const targets = [];
  for (const person of personen) {
    const publicUrl = person.meta?.public_profile_url ?? null;
    const legacyUrl = person.meta?.legacy_profile_url ?? null;
    if (!publicUrl && !legacyUrl) {
      continue;
    }

    const publicPersonId = parsePublicPersonId(publicUrl);
    const legacyProfileKey = parseLegacyProfileKey(legacyUrl);

    targets.push({
      id:
        publicPersonId != null
          ? oefbId("profile-target", "public", publicPersonId)
          : legacyProfileKey != null
            ? oefbId("profile-target", "legacy", legacyProfileKey)
            : oefbId("profile-target", person.id),
      person_id: person.id,
      source_system: "oefb",
      source_person_id: person.source_person_id ?? null,
      display_name: person.display_name,
      role_types: [...(roleTypesByPersonId.get(person.id) ?? [])].sort((left, right) =>
        left.localeCompare(right, "de"),
      ),
      public_profile_url: publicUrl,
      legacy_profile_url: legacyUrl,
      preferred_profile_url: publicUrl ?? legacyUrl,
      public_person_id: publicPersonId,
      legacy_profile_key: legacyProfileKey,
      foto_public_uid: person.foto_public_uid ?? null,
      meta: {},
    });
  }

  const summary = {
    targets: targets.length,
    with_public_url: targets.filter((target) => target.public_profile_url != null).length,
    with_legacy_url: targets.filter((target) => target.legacy_profile_url != null).length,
    only_legacy_url: targets.filter(
      (target) => target.public_profile_url == null && target.legacy_profile_url != null,
    ).length,
  };

  return {
    generated_at: new Date().toISOString(),
    scope: config.scope,
    summary,
    targets: sortById(targets),
  };
}

export async function writePlayerProfileTargets(manifest) {
  await ensureDir(DERIVED_DIR);
  const suffix = manifest.scope === "all" ? "all" : "current";
  const manifestPath = path.join(DERIVED_DIR, `player-profile-targets.${suffix}.json`);
  const summaryPath = path.join(DERIVED_DIR, `player-profile-targets.${suffix}.summary.json`);

  await writeJson(manifestPath, manifest);
  await writeJson(summaryPath, {
    generated_at: manifest.generated_at,
    scope: manifest.scope,
    summary: manifest.summary,
  });

  return {
    manifestPath,
    summaryPath,
  };
}

export { parseArgs };
