import { createHash } from "node:crypto";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ROOT_DIR, DERIVED_DIR } from "./discovery-manifest.mjs";
import { fetchText } from "./oefb-http.mjs";
import { extractAllAppPreloads, findFirstPreload } from "./oefb-preloads.mjs";
import {
  buildPlayerProfileTargets,
  writePlayerProfileTargets,
} from "./player-profile-targets.mjs";

const PROFILE_DIR = path.join(ROOT_DIR, "data", "raw", "player-profiles");

function oefbId(kind, ...parts) {
  return `oefb:${kind}:${parts.filter(Boolean).join(":")}`;
}

function sortById(rows) {
  return [...rows].sort((left, right) => left.id.localeCompare(right.id, "de"));
}

function hashText(value) {
  return createHash("sha1").update(value).digest("hex");
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
    limit: null,
    offset: 0,
    refresh: false,
    concurrency: 6,
  };

  for (const arg of argv) {
    if (arg.startsWith("--scope=")) {
      options.scope = arg.split("=")[1];
    } else if (arg.startsWith("--limit=")) {
      options.limit = Number.parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--offset=")) {
      options.offset = Number.parseInt(arg.split("=")[1], 10);
    } else if (arg === "--refresh") {
      options.refresh = true;
    } else if (arg.startsWith("--concurrency=")) {
      options.concurrency = Number.parseInt(arg.split("=")[1], 10);
    }
  }

  if (!["current", "all"].includes(options.scope)) {
    throw new Error(`Unsupported scope: ${options.scope}`);
  }

  if (options.limit != null && (!Number.isFinite(options.limit) || options.limit <= 0)) {
    throw new Error("Limit must be a positive integer");
  }

  if (!Number.isFinite(options.offset) || options.offset < 0) {
    throw new Error("Offset must be a non-negative integer");
  }

  if (!Number.isFinite(options.concurrency) || options.concurrency <= 0) {
    throw new Error("Concurrency must be a positive integer");
  }

  return options;
}

function absolutizeUrl(value) {
  if (!value || value === "#") {
    return null;
  }

  try {
    return new URL(value, "https://www.oefb.at").href;
  } catch {
    return null;
  }
}

function parsePublicPersonId(url) {
  const value = String(url ?? "");
  const match = value.match(/\/(?:Profile|bewerbe)\/(?:Spieler|Trainer)\/(\d+)/);
  return match?.[1] ?? null;
}

/**
 * Öffentliche Profil-URL vereinheitlichen: /Profile/Spieler/358876/U15 und ?Name
 * → https://www.oefb.at/Profile/Spieler/358876 (stabile App-Preloads inkl. Jahrgang).
 */
function canonicalPublicSpielerUrl(url) {
  if (!url) {
    return null;
  }
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/Profile\/Spieler\/(\d+)/i);
    if (m) {
      return `https://www.oefb.at/Profile/Spieler/${m[1]}`;
    }
  } catch {
    return null;
  }
  return null;
}

function profileFileStem(target) {
  return (
    target.public_person_id ??
    target.legacy_profile_key ??
    target.source_person_id ??
    hashText(target.person_id)
  );
}

function findDetailsPreload(preloads) {
  return findFirstPreload(
    preloads,
    (value) =>
      Array.isArray(value) &&
      value[0] &&
      value[0].vorname != null &&
      value[0].nachname != null &&
      "geburtsdatum" in value[0],
  );
}

function findTeamsPreload(preloads) {
  return findFirstPreload(
    preloads,
    (value) => Array.isArray(value) && value[0] && Array.isArray(value[0].teams),
  );
}

function findAchievementsPreload(preloads) {
  return findFirstPreload(
    preloads,
    (value) => Array.isArray(value) && value[0] && Array.isArray(value[0].erfolge),
  );
}

function normalizeDetailsPayload(payload) {
  if (!payload) {
    return null;
  }

  return {
    ...payload,
    vereinUrl: absolutizeUrl(payload.vereinUrl),
    vereine: (payload.vereine ?? []).map((club) => ({
      ...club,
      url: absolutizeUrl(club.url),
    })),
  };
}

function normalizeTeamsPayload(payload) {
  if (!payload) {
    return null;
  }

  return {
    ...payload,
    teams: (payload.teams ?? []).map((team) => ({
      ...team,
    })),
  };
}

function normalizeAchievementsPayload(payload) {
  if (!payload) {
    return null;
  }

  return {
    ...payload,
    erfolge: (payload.erfolge ?? []).map((entry) => ({
      ...entry,
      vereinHomepageUrl: absolutizeUrl(entry.vereinHomepageUrl),
    })),
  };
}

async function resolveProfileUrl(target) {
  if (target.public_profile_url) {
    const raw = target.public_profile_url;
    const canon = canonicalPublicSpielerUrl(raw) ?? raw;
    return {
      requestedUrl: raw,
      resolvedPublicUrl: canon,
      resolvedViaLegacy: false,
    };
  }

  const legacyUrl = target.legacy_profile_url;
  if (!legacyUrl) {
    return {
      requestedUrl: null,
      resolvedPublicUrl: null,
      resolvedViaLegacy: false,
    };
  }

  /** Legacy-Detail-URL → Redirect; nicht bewerbe/Spieler/{legacy_key} (anderer ID-Raum als Profile/Spieler/{id}). */
  const legacyHtml = await fetchText(legacyUrl);
  const redirectMatch = legacyHtml.match(/window\.location\s*=\s*"([^"]+)"/);
  let resolvedPublicUrl = absolutizeUrl(redirectMatch?.[1] ?? legacyUrl);
  resolvedPublicUrl =
    canonicalPublicSpielerUrl(resolvedPublicUrl) ?? resolvedPublicUrl;

  return {
    requestedUrl: legacyUrl,
    resolvedPublicUrl,
    resolvedViaLegacy: true,
  };
}

function buildExtract(target, requestedUrl, resolvedPublicUrl, preloads) {
  const detailsPreload = findDetailsPreload(preloads);
  const teamsPreload = findTeamsPreload(preloads);
  const achievementsPreload = findAchievementsPreload(preloads);

  return {
    target_id: target.id,
    person_id: target.person_id,
    source_person_id: target.source_person_id,
    display_name: target.display_name,
    role_types: target.role_types,
    requested_url: requestedUrl,
    resolved_public_url: resolvedPublicUrl,
    public_person_id: parsePublicPersonId(resolvedPublicUrl) ?? target.public_person_id ?? null,
    legacy_profile_key: target.legacy_profile_key ?? null,
    details: detailsPreload
      ? {
          preload_id: detailsPreload.preloadId,
          data: normalizeDetailsPayload(detailsPreload.value[0]),
        }
      : null,
    teams: teamsPreload
      ? {
          preload_id: teamsPreload.preloadId,
          data: normalizeTeamsPayload(teamsPreload.value[0]),
        }
      : null,
    achievements: achievementsPreload
      ? {
          preload_id: achievementsPreload.preloadId,
          data: normalizeAchievementsPayload(achievementsPreload.value[0]),
        }
      : null,
  };
}

async function runPool(items, concurrency, worker) {
  const queue = [...items];
  const results = [];
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      results.push(await worker(item));
    }
  });
  await Promise.all(workers);
  return results;
}

async function loadTargets(scope) {
  const suffix = scope === "all" ? "all" : "current";
  const manifestPath = path.join(DERIVED_DIR, `player-profile-targets.${suffix}.json`);

  try {
    return await readJson(manifestPath);
  } catch {
    const manifest = await buildPlayerProfileTargets({ scope });
    await writePlayerProfileTargets(manifest);
    return manifest;
  }
}

async function getProfileData(target, scope, refresh) {
  const fileStem = profileFileStem(target);
  const htmlPath = path.join(PROFILE_DIR, scope, "html", `${fileStem}.html`);
  const preloadsPath = path.join(PROFILE_DIR, scope, "preloads", `${fileStem}.json`);
  const extractPath = path.join(PROFILE_DIR, scope, "extracts", `${fileStem}.json`);

  if (!refresh) {
    try {
      const [html, preloads, extract] = await Promise.all([
        readFile(htmlPath, "utf8"),
        readJson(preloadsPath),
        readJson(extractPath),
      ]);
      return {
        html,
        preloads,
        extract,
        fromCache: true,
        paths: {
          htmlPath,
          preloadsPath,
          extractPath,
        },
      };
    } catch {
      // Cache miss.
    }
  }

  if (!refresh && scope === "all") {
    const currentHtmlPath = path.join(PROFILE_DIR, "current", "html", `${fileStem}.html`);
    const currentPreloadsPath = path.join(PROFILE_DIR, "current", "preloads", `${fileStem}.json`);
    const currentExtractPath = path.join(PROFILE_DIR, "current", "extracts", `${fileStem}.json`);

    const currentExists = await Promise.all([
      fileExists(currentHtmlPath),
      fileExists(currentPreloadsPath),
      fileExists(currentExtractPath),
    ]);

    if (currentExists.every(Boolean)) {
      await ensureDir(path.dirname(htmlPath));
      await ensureDir(path.dirname(preloadsPath));
      await ensureDir(path.dirname(extractPath));
      await Promise.all([
        copyFile(currentHtmlPath, htmlPath),
        copyFile(currentPreloadsPath, preloadsPath),
        copyFile(currentExtractPath, extractPath),
      ]);

      const [html, preloads, extract] = await Promise.all([
        readFile(htmlPath, "utf8"),
        readJson(preloadsPath),
        readJson(extractPath),
      ]);
      return {
        html,
        preloads,
        extract,
        fromCache: true,
        paths: {
          htmlPath,
          preloadsPath,
          extractPath,
        },
      };
    }
  }

  const { requestedUrl, resolvedPublicUrl } = await resolveProfileUrl(target);
  if (!resolvedPublicUrl) {
    throw new Error(`No profile URL could be resolved for ${target.id}`);
  }

  const html = await fetchText(resolvedPublicUrl);
  const preloads = extractAllAppPreloads(html);
  const extract = buildExtract(target, requestedUrl, resolvedPublicUrl, preloads);

  await ensureDir(path.dirname(htmlPath));
  await ensureDir(path.dirname(preloadsPath));
  await ensureDir(path.dirname(extractPath));
  await writeFile(htmlPath, html, "utf8");
  await writeJson(preloadsPath, preloads);
  await writeJson(extractPath, extract);

  return {
    html,
    preloads,
    extract,
    fromCache: false,
    paths: {
      htmlPath,
      preloadsPath,
      extractPath,
    },
  };
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function materializePlayerProfileCollection(options = {}) {
  const config = {
    scope: options.scope ?? "current",
  };

  const targetsManifest = await loadTargets(config.scope);
  const targets = targetsManifest.targets ?? [];
  const pages = [];
  const errors = [];
  const stats = {
    fetched_pages: 0,
    cache_hits: 0,
    with_details: 0,
    with_teams: 0,
    with_achievements: 0,
  };

  for (const target of targets) {
    const fileStem = profileFileStem(target);
    const htmlPath = path.join(PROFILE_DIR, config.scope, "html", `${fileStem}.html`);
    const preloadsPath = path.join(PROFILE_DIR, config.scope, "preloads", `${fileStem}.json`);
    const extractPath = path.join(PROFILE_DIR, config.scope, "extracts", `${fileStem}.json`);

    const exists = await Promise.all([
      fileExists(htmlPath),
      fileExists(preloadsPath),
      fileExists(extractPath),
    ]);

    if (!exists.every(Boolean)) {
      errors.push({
        target_id: target.id,
        person_id: target.person_id,
        preferred_profile_url: target.preferred_profile_url,
        message: "Missing cached profile files",
      });
      continue;
    }

    const extract = await readJson(extractPath);
    stats.cache_hits += 1;
    if (extract.details) {
      stats.with_details += 1;
    }
    if (extract.teams) {
      stats.with_teams += 1;
    }
    if (extract.achievements) {
      stats.with_achievements += 1;
    }

    pages.push({
      id: oefbId(
        "player-profile-page",
        target.public_person_id ?? target.legacy_profile_key ?? hashText(target.person_id),
      ),
      target_id: target.id,
      person_id: target.person_id,
      display_name: target.display_name,
      source_person_id: target.source_person_id,
      requested_url: extract.requested_url,
      resolved_public_url: extract.resolved_public_url,
      public_person_id: extract.public_person_id,
      legacy_profile_key: extract.legacy_profile_key,
      role_types: target.role_types,
      details_found: Boolean(extract.details),
      teams_found: Boolean(extract.teams),
      achievements_found: Boolean(extract.achievements),
      html_path: htmlPath,
      preloads_path: preloadsPath,
      extract_path: extractPath,
      from_cache: true,
    });
  }

  return {
    generated_at: new Date().toISOString(),
    scope: config.scope,
    summary: {
      offset: 0,
      targets_selected: targets.length,
      pages_collected: pages.length,
      errors: errors.length,
      ...stats,
    },
    pages: sortById(pages),
    errors,
  };
}

export async function collectPlayerProfiles(options = {}) {
  const config = {
    scope: options.scope ?? "current",
    limit: options.limit ?? null,
    offset: options.offset ?? 0,
    refresh: options.refresh ?? false,
    concurrency: options.concurrency ?? 6,
  };

  const targetsManifest = await loadTargets(config.scope);
  let targets = targetsManifest.targets ?? [];
  if (config.offset > 0) {
    targets = targets.slice(config.offset);
  }
  if (config.limit != null) {
    targets = targets.slice(0, config.limit);
  }

  const pages = [];
  const errors = [];
  const stats = {
    fetched_pages: 0,
    cache_hits: 0,
    with_details: 0,
    with_teams: 0,
    with_achievements: 0,
  };

  await runPool(targets, config.concurrency, async (target) => {
    try {
      const result = await getProfileData(target, config.scope, config.refresh);
      if (result.fromCache) {
        stats.cache_hits += 1;
      } else {
        stats.fetched_pages += 1;
      }
      if (result.extract.details) {
        stats.with_details += 1;
      }
      if (result.extract.teams) {
        stats.with_teams += 1;
      }
      if (result.extract.achievements) {
        stats.with_achievements += 1;
      }

      pages.push({
        id: oefbId(
          "player-profile-page",
          target.public_person_id ?? target.legacy_profile_key ?? hashText(target.person_id),
        ),
        target_id: target.id,
        person_id: target.person_id,
        display_name: target.display_name,
        source_person_id: target.source_person_id,
        requested_url: result.extract.requested_url,
        resolved_public_url: result.extract.resolved_public_url,
        public_person_id: result.extract.public_person_id,
        legacy_profile_key: result.extract.legacy_profile_key,
        role_types: target.role_types,
        details_found: Boolean(result.extract.details),
        teams_found: Boolean(result.extract.teams),
        achievements_found: Boolean(result.extract.achievements),
        html_path: result.paths.htmlPath,
        preloads_path: result.paths.preloadsPath,
        extract_path: result.paths.extractPath,
        from_cache: result.fromCache,
      });
    } catch (error) {
      errors.push({
        target_id: target.id,
        person_id: target.person_id,
        preferred_profile_url: target.preferred_profile_url,
        message: error.message,
      });
    }
  });

  return {
    generated_at: new Date().toISOString(),
    scope: config.scope,
    summary: {
      offset: config.offset,
      targets_selected: targets.length,
      pages_collected: pages.length,
      errors: errors.length,
      ...stats,
    },
    pages: sortById(pages),
    errors,
  };
}

export async function writePlayerProfileCollection(manifest) {
  await ensureDir(DERIVED_DIR);
  const suffix = manifest.scope === "all" ? "all" : "current";
  const manifestPath = path.join(DERIVED_DIR, `player-profile-collection.${suffix}.json`);
  const summaryPath = path.join(
    DERIVED_DIR,
    `player-profile-collection.${suffix}.summary.json`,
  );

  await writeJson(manifestPath, manifest);
  await writeJson(summaryPath, {
    generated_at: manifest.generated_at,
    scope: manifest.scope,
    summary: manifest.summary,
    errors: manifest.errors.slice(0, 20),
  });

  return {
    manifestPath,
    summaryPath,
  };
}

export { parseArgs, profileFileStem };
