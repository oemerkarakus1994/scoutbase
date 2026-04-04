import { createHash } from "node:crypto";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ROOT_DIR, DERIVED_DIR } from "./discovery-manifest.mjs";
import { fetchText } from "./oefb-http.mjs";
import { extractAllAppPreloads, findFirstPreload } from "./oefb-preloads.mjs";
import { buildTeamTargetsManifest, writeTeamTargetsManifest } from "./team-targets.mjs";

const CLUBS_BASE_URL = "https://vereine.oefb.at";
const TEAM_PAGES_DIR = path.join(ROOT_DIR, "data", "raw", "team-pages");
const ALLOWED_TYPES = ["kader", "staff", "transfers", "schedule"];

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
    limit: null,
    offset: 0,
    refresh: false,
    concurrency: 4,
    types: [...ALLOWED_TYPES],
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
    } else if (arg.startsWith("--types=")) {
      options.types = arg
        .split("=")[1]
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    }
  }

  if (!["current", "all", "sfv", "sfv-5y"].includes(options.scope)) {
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

  if (options.types.length === 0 || options.types.some((type) => !ALLOWED_TYPES.includes(type))) {
    throw new Error(`Types must be a comma-separated subset of: ${ALLOWED_TYPES.join(", ")}`);
  }

  return options;
}

function absolutizeUrl(value) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value, CLUBS_BASE_URL).href;
  } catch {
    return value;
  }
}

function hashText(value) {
  return createHash("sha1").update(value).digest("hex");
}

function findClubPreload(preloads) {
  return findFirstPreload(
    preloads,
    (value) => Array.isArray(value) && value[0] && value[0].name && value[0].logo && value[0].startseiteUrl,
  );
}

function findTeamSwitcherPreload(preloads) {
  return findFirstPreload(
    preloads,
    (value) => Array.isArray(value) && value[0] && Array.isArray(value[0].mannschaften) && value[0].saison,
  );
}

function findTeamNavigationPreload(preloads) {
  return findFirstPreload(
    preloads,
    (value) => Array.isArray(value) && value[0] && Array.isArray(value[0].result),
  );
}

function findSpecificPreload(preloads, type) {
  if (type === "kader") {
    return findFirstPreload(
      preloads,
      (value) => Array.isArray(value) && value[0] && value[0].type === "KADER",
    );
  }

  if (type === "staff") {
    return findFirstPreload(
      preloads,
      (value) =>
        Array.isArray(value) &&
        value[0] &&
        (Array.isArray(value[0].trainer) || Array.isArray(value[0].betreuer)),
    );
  }

  if (type === "transfers") {
    return findFirstPreload(
      preloads,
      (value) =>
        Array.isArray(value) &&
        value[0] &&
        Array.isArray(value[0].zugaenge) &&
        Array.isArray(value[0].abgaenge),
    );
  }

  if (type === "schedule") {
    return findFirstPreload(
      preloads,
      (value) => Array.isArray(value) && value[0] && value[0].type === "SPIELPLAN_MANNSCHAFT",
    );
  }

  return null;
}

function parseProxyVereinId(html) {
  const proxyMatch = html.match(/"proxyInfo":\{"path":"\/proxy\/vereine\/(\d+)"/);
  if (proxyMatch) {
    return proxyMatch[1];
  }

  const projectMatch = html.match(/"project":\{"name":"(\d+)"/);
  return projectMatch?.[1] ?? null;
}

function normalizeTeamSwitcherPayload(payload) {
  if (!payload) {
    return null;
  }

  return {
    ...payload,
    prevSaisonUrl: absolutizeUrl(payload.prevSaisonUrl),
    nextSaisonUrl: absolutizeUrl(payload.nextSaisonUrl),
    mannschaften: (payload.mannschaften ?? []).map((team) => ({
      ...team,
      url: absolutizeUrl(team.url),
    })),
  };
}

function normalizeTeamNavigationPayload(payload) {
  if (!payload) {
    return null;
  }

  return {
    ...payload,
    result: (payload.result ?? []).map((item) => ({
      ...item,
      url: absolutizeUrl(item.url),
    })),
  };
}

function buildExtract(target, type, html, preloads) {
  const clubPreload = findClubPreload(preloads);
  const teamSwitcherPreload = findTeamSwitcherPreload(preloads);
  const teamNavigationPreload = findTeamNavigationPreload(preloads);
  const specificPreload = findSpecificPreload(preloads, type);

  return {
    target_id: target.id,
    source_id: target.source_id,
    page_type: type,
    source_url: target.page_urls[type],
    proxy_verein_id: parseProxyVereinId(html),
    club: clubPreload
      ? {
          preload_id: clubPreload.preloadId,
          data: {
            ...clubPreload.value[0],
            startseiteUrl: absolutizeUrl(clubPreload.value[0].startseiteUrl),
          },
        }
      : null,
    team_switcher: teamSwitcherPreload
      ? {
          preload_id: teamSwitcherPreload.preloadId,
          data: normalizeTeamSwitcherPayload(teamSwitcherPreload.value[0]),
        }
      : null,
    team_navigation: teamNavigationPreload
      ? {
          preload_id: teamNavigationPreload.preloadId,
          data: normalizeTeamNavigationPayload(teamNavigationPreload.value[0]),
        }
      : null,
    specific: specificPreload
      ? {
          preload_id: specificPreload.preloadId,
          data: specificPreload.value[0],
        }
      : null,
  };
}

function summarizeSpecificExtract(type, extract) {
  const data = extract?.specific?.data;
  if (!data) {
    return {
      item_count: 0,
      found: false,
    };
  }

  if (type === "kader") {
    return {
      item_count: (data.kader ?? []).length,
      found: true,
    };
  }

  if (type === "staff") {
    return {
      item_count: (data.trainer ?? []).length + (data.betreuer ?? []).length,
      found: true,
    };
  }

  if (type === "transfers") {
    return {
      item_count: (data.zugaenge ?? []).length + (data.abgaenge ?? []).length,
      found: true,
    };
  }

  if (type === "schedule") {
    return {
      item_count: (data.spiele ?? []).length,
      found: true,
    };
  }

  return {
    item_count: 0,
    found: false,
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

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadTeamTargetsManifest(scope) {
  const suffix = scope === "all" ? "all" : scope === "current" ? "current" : scope;
  const manifestPath = path.join(DERIVED_DIR, `team-targets.${suffix}.json`);

  try {
    return await readJson(manifestPath);
  } catch {
    if (suffix !== "current" && suffix !== "all") {
      throw new Error(
        `Missing ${manifestPath}. Build team targets first (e.g. npm run build:team-targets:sfv).`,
      );
    }
    const manifest = await buildTeamTargetsManifest({ scope });
    await writeTeamTargetsManifest(manifest);
    return manifest;
  }
}

async function getTeamPageData(target, type, scope, refresh) {
  const fileStem = target.file_key || hashText(`${target.id}:${type}`);
  const htmlPath = path.join(TEAM_PAGES_DIR, scope, type, "html", `${fileStem}.html`);
  const preloadsPath = path.join(TEAM_PAGES_DIR, scope, type, "preloads", `${fileStem}.json`);
  const extractPath = path.join(TEAM_PAGES_DIR, scope, type, "extracts", `${fileStem}.json`);

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
    const currentHtmlPath = path.join(TEAM_PAGES_DIR, "current", type, "html", `${fileStem}.html`);
    const currentPreloadsPath = path.join(
      TEAM_PAGES_DIR,
      "current",
      type,
      "preloads",
      `${fileStem}.json`,
    );
    const currentExtractPath = path.join(
      TEAM_PAGES_DIR,
      "current",
      type,
      "extracts",
      `${fileStem}.json`,
    );

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

  const html = await fetchText(target.page_urls[type]);
  const preloads = extractAllAppPreloads(html);
  const extract = buildExtract(target, type, html, preloads);

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

export async function materializeTeamPageCollection(options = {}) {
  const config = {
    scope: options.scope ?? "current",
    types: options.types ?? [...ALLOWED_TYPES],
  };

  const targetsManifest = await loadTeamTargetsManifest(config.scope);
  const targets = targetsManifest.targets ?? [];
  const tasks = targets.flatMap((target) =>
    config.types.map((type) => ({
      target,
      type,
    })),
  );

  const pages = [];
  const errors = [];
  const perType = Object.fromEntries(
    config.types.map((type) => [
      type,
      {
        pages: 0,
        fetched_pages: 0,
        cache_hits: 0,
        found_specific_extracts: 0,
        extracted_items: 0,
      },
    ]),
  );

  for (const { target, type } of tasks) {
    const fileStem = target.file_key || hashText(`${target.id}:${type}`);
    const htmlPath = path.join(TEAM_PAGES_DIR, config.scope, type, "html", `${fileStem}.html`);
    const preloadsPath = path.join(
      TEAM_PAGES_DIR,
      config.scope,
      type,
      "preloads",
      `${fileStem}.json`,
    );
    const extractPath = path.join(
      TEAM_PAGES_DIR,
      config.scope,
      type,
      "extracts",
      `${fileStem}.json`,
    );

    const exists = await Promise.all([
      fileExists(htmlPath),
      fileExists(preloadsPath),
      fileExists(extractPath),
    ]);

    if (!exists.every(Boolean)) {
      errors.push({
        target_id: target.id,
        source_id: target.source_id,
        page_type: type,
        source_url: target.page_urls[type],
        message: "Missing cached team page files",
      });
      continue;
    }

    const extract = await readJson(extractPath);
    const specificSummary = summarizeSpecificExtract(type, extract);
    const stats = perType[type];

    stats.pages += 1;
    stats.cache_hits += 1;
    stats.extracted_items += specificSummary.item_count;
    if (specificSummary.found) {
      stats.found_specific_extracts += 1;
    }

    pages.push({
      id: oefbId("team-page", target.source_id ?? target.file_key, type),
      target_id: target.id,
      source_id: target.source_id,
      file_key: target.file_key,
      page_type: type,
      source_url: target.page_urls[type],
      from_cache: true,
      proxy_verein_id: extract.proxy_verein_id,
      club_name: extract.club?.data?.name ?? null,
      saison_label: extract.team_switcher?.data?.saison ?? target.season_label,
      specific_preload_found: specificSummary.found,
      extracted_item_count: specificSummary.item_count,
      html_path: htmlPath,
      preloads_path: preloadsPath,
      extract_path: extractPath,
    });
  }

  return {
    generated_at: new Date().toISOString(),
    scope: config.scope,
    summary: {
      offset: 0,
      targets_selected: targets.length,
      page_types: config.types,
      total_pages_requested: tasks.length,
      total_pages_collected: pages.length,
      errors: errors.length,
      per_type: perType,
    },
    pages: sortById(pages),
    errors,
  };
}

export async function collectTeamPages(options = {}) {
  const config = {
    scope: options.scope ?? "current",
    limit: options.limit ?? null,
    offset: options.offset ?? 0,
    refresh: options.refresh ?? false,
    concurrency: options.concurrency ?? 4,
    types: options.types ?? [...ALLOWED_TYPES],
  };

  const targetsManifest = await loadTeamTargetsManifest(config.scope);
  let targets = targetsManifest.targets ?? [];
  if (config.offset > 0) {
    targets = targets.slice(config.offset);
  }
  if (config.limit != null) {
    targets = targets.slice(0, config.limit);
  }

  const tasks = targets.flatMap((target) =>
    config.types.map((type) => ({
      target,
      type,
    })),
  );

  const pages = [];
  const errors = [];
  const perType = Object.fromEntries(
    config.types.map((type) => [
      type,
      {
        pages: 0,
        fetched_pages: 0,
        cache_hits: 0,
        found_specific_extracts: 0,
        extracted_items: 0,
      },
    ]),
  );

  await runPool(tasks, config.concurrency, async ({ target, type }) => {
    try {
      const result = await getTeamPageData(target, type, config.scope, config.refresh);
      const specificSummary = summarizeSpecificExtract(type, result.extract);
      const stats = perType[type];

      stats.pages += 1;
      stats.extracted_items += specificSummary.item_count;
      if (specificSummary.found) {
        stats.found_specific_extracts += 1;
      }
      if (result.fromCache) {
        stats.cache_hits += 1;
      } else {
        stats.fetched_pages += 1;
      }

      pages.push({
        id: oefbId("team-page", target.source_id ?? target.file_key, type),
        target_id: target.id,
        source_id: target.source_id,
        file_key: target.file_key,
        page_type: type,
        source_url: target.page_urls[type],
        from_cache: result.fromCache,
        proxy_verein_id: result.extract.proxy_verein_id,
        club_name: result.extract.club?.data?.name ?? null,
        saison_label: result.extract.team_switcher?.data?.saison ?? target.season_label,
        specific_preload_found: specificSummary.found,
        extracted_item_count: specificSummary.item_count,
        html_path: result.paths.htmlPath,
        preloads_path: result.paths.preloadsPath,
        extract_path: result.paths.extractPath,
      });
    } catch (error) {
      errors.push({
        target_id: target.id,
        source_id: target.source_id,
        page_type: type,
        source_url: target.page_urls[type],
        message: error.message,
      });
    }
  });

  const manifest = {
    generated_at: new Date().toISOString(),
    scope: config.scope,
    summary: {
      offset: config.offset,
      targets_selected: targets.length,
      page_types: config.types,
      total_pages_requested: tasks.length,
      total_pages_collected: pages.length,
      errors: errors.length,
      per_type: perType,
    },
    pages: sortById(pages),
    errors,
  };

  return manifest;
}

export async function writeTeamPageCollectionManifest(manifest) {
  await ensureDir(DERIVED_DIR);
  const suffix =
    manifest.scope === "all" ? "all" : manifest.scope === "current" ? "current" : manifest.scope;
  const manifestPath = path.join(DERIVED_DIR, `team-page-collection.${suffix}.json`);
  const summaryPath = path.join(DERIVED_DIR, `team-page-collection.${suffix}.summary.json`);

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

export { parseArgs };
