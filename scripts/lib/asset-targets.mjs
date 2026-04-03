import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { DERIVED_DIR } from "./discovery-manifest.mjs";

const OEFB_IMAGE_PREFIX = "https://www.oefb.at/oefb2/images/1278650591628556536_";
const CLUB_PERSON_IMAGE_PREFIX =
  "https://vereine.oefb.at/vereine3/person/images/834733022602002384_";

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

export function parseArgs(argv) {
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

export function buildOefbImageUrl(sourceAssetId, size = "320x320", ratio = "1,0") {
  return `${OEFB_IMAGE_PREFIX}${sourceAssetId}-${ratio}-${size}.png`;
}

export function buildClubPersonImageUrl(sourceAssetId, size = "100x100", ratio = "1,0") {
  return `${CLUB_PERSON_IMAGE_PREFIX}${sourceAssetId}-${ratio}-${size}.png`;
}

function addUnique(list, value, keySelector = (entry) => entry) {
  if (value == null) {
    return;
  }

  const key = keySelector(value);
  if (!list.some((entry) => keySelector(entry) === key)) {
    list.push(value);
  }
}

function normalizeName(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function createAssetMap() {
  const assetMap = new Map();

  function ensure({
    assetKind,
    sourceAssetId,
    entityType,
    entityId,
    relationType,
    displayName,
    observedSource,
  }) {
    if (!sourceAssetId) {
      return null;
    }

    const id = oefbId("asset", assetKind, String(sourceAssetId));
    const existing = assetMap.get(id);
    const downloadCandidates = [];

    addUnique(downloadCandidates, {
      label: "oefb2_320",
      priority: 10,
      url: buildOefbImageUrl(sourceAssetId, "320x320"),
    }, (entry) => entry.url);

    if (assetKind === "person_photo") {
      addUnique(downloadCandidates, {
        label: "vereine3_person_100",
        priority: 20,
        url: buildClubPersonImageUrl(sourceAssetId, "100x100"),
      }, (entry) => entry.url);
    }

    const next = existing ?? {
      id,
      asset_kind: assetKind,
      source_system: "oefb",
      source_asset_id: String(sourceAssetId),
      preferred_extension: "png",
      download_candidates: [],
      related_entities: [],
      meta: {
        display_names: [],
        relation_types: [],
        observed_sources: [],
      },
    };

    for (const candidate of downloadCandidates) {
      addUnique(next.download_candidates, candidate, (entry) => entry.url);
    }

    addUnique(
      next.related_entities,
      {
        entity_type: entityType,
        entity_id: entityId,
        relation_type: relationType,
      },
      (entry) => `${entry.entity_type}:${entry.entity_id}:${entry.relation_type}`,
    );
    addUnique(next.meta.display_names, normalizeName(displayName));
    addUnique(next.meta.relation_types, relationType);
    addUnique(next.meta.observed_sources, observedSource);

    next.download_candidates.sort((left, right) => left.priority - right.priority);
    next.related_entities.sort((left, right) => {
      const leftKey = `${left.entity_type}:${left.entity_id}:${left.relation_type}`;
      const rightKey = `${right.entity_type}:${right.entity_id}:${right.relation_type}`;
      return leftKey.localeCompare(rightKey, "de");
    });
    next.meta.display_names.sort((left, right) => left.localeCompare(right, "de"));
    next.meta.relation_types.sort((left, right) => left.localeCompare(right, "de"));
    next.meta.observed_sources.sort((left, right) => left.localeCompare(right, "de"));

    assetMap.set(id, next);
    return next;
  }

  function values() {
    return [...assetMap.values()];
  }

  return {
    ensure,
    values,
  };
}

async function loadJsonIfExists(filePath) {
  try {
    return await readJson(filePath);
  } catch {
    return null;
  }
}

export async function buildAssetTargets(options = {}) {
  const config = {
    scope: options.scope ?? "current",
  };
  const suffix = config.scope === "all" ? "all" : "current";

  const teamContentManifest = await readJson(
    path.join(DERIVED_DIR, `team-content-manifest.${suffix}.json`),
  );
  const profileContentManifest = await loadJsonIfExists(
    path.join(DERIVED_DIR, `profile-content-manifest.${suffix}.json`),
  );

  const assets = createAssetMap();

  for (const person of teamContentManifest.tables["core.personen"] ?? []) {
    assets.ensure({
      assetKind: "person_photo",
      sourceAssetId: person.foto_public_uid,
      entityType: "person",
      entityId: person.id,
      relationType: "profile_photo",
      displayName: person.display_name,
      observedSource: "team-content:core.personen",
    });
  }

  for (const club of teamContentManifest.tables["core.vereine"] ?? []) {
    assets.ensure({
      assetKind: "club_logo",
      sourceAssetId: club.logo_public_uid,
      entityType: "verein",
      entityId: club.id,
      relationType: "club_logo",
      displayName: club.name,
      observedSource: "team-content:core.vereine",
    });
  }

  for (const team of teamContentManifest.tables["core.teams"] ?? []) {
    assets.ensure({
      assetKind: "team_logo",
      sourceAssetId: team.logo_public_uid,
      entityType: "team",
      entityId: team.id,
      relationType: "team_logo",
      displayName: team.name,
      observedSource: "team-content:core.teams",
    });
  }

  if (profileContentManifest) {
    for (const person of profileContentManifest.tables["core.personen"] ?? []) {
      assets.ensure({
        assetKind: "person_photo",
        sourceAssetId: person.foto_public_uid,
        entityType: "person",
        entityId: person.id,
        relationType: "profile_photo",
        displayName: person.display_name,
        observedSource: "profile-content:core.personen",
      });
    }

    for (const club of profileContentManifest.tables["core.vereine"] ?? []) {
      assets.ensure({
        assetKind: "club_logo",
        sourceAssetId: club.logo_public_uid,
        entityType: "verein",
        entityId: club.id,
        relationType: "club_logo",
        displayName: club.name,
        observedSource: "profile-content:core.vereine",
      });
    }

    for (const station of profileContentManifest.tables["core.person_stationen"] ?? []) {
      assets.ensure({
        assetKind: "club_logo",
        sourceAssetId: station.logo_public_uid,
        entityType: "verein",
        entityId: station.verein_id,
        relationType: "station_logo",
        displayName: station.verein_name,
        observedSource: "profile-content:core.person_stationen",
      });
    }

    for (const achievement of profileContentManifest.tables["core.person_achievements"] ?? []) {
      assets.ensure({
        assetKind: "club_logo",
        sourceAssetId: achievement.logo_public_uid,
        entityType: "verein",
        entityId: achievement.verein_id,
        relationType: "achievement_logo",
        displayName: achievement.verein_name,
        observedSource: "profile-content:core.person_achievements",
      });
    }
  }

  const targets = sortById(assets.values());
  const summary = {
    targets: targets.length,
    person_photos: targets.filter((entry) => entry.asset_kind === "person_photo").length,
    club_logos: targets.filter((entry) => entry.asset_kind === "club_logo").length,
    team_logos: targets.filter((entry) => entry.asset_kind === "team_logo").length,
    related_entities: targets.reduce((sum, entry) => sum + entry.related_entities.length, 0),
    profile_content_loaded: Boolean(profileContentManifest),
  };

  return {
    generated_at: new Date().toISOString(),
    scope: config.scope,
    summary,
    targets,
  };
}

export async function writeAssetTargets(manifest) {
  const suffix = manifest.scope === "all" ? "all" : "current";
  const manifestPath = path.join(DERIVED_DIR, `asset-targets.${suffix}.json`);
  const summaryPath = path.join(DERIVED_DIR, `asset-targets.${suffix}.summary.json`);

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
