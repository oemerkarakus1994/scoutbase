import { createWriteStream } from "node:fs";
import { access, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { ROOT_DIR, DERIVED_DIR } from "./discovery-manifest.mjs";
import { buildAssetTargets, writeAssetTargets } from "./asset-targets.mjs";

const ASSET_DIR = path.join(ROOT_DIR, "data", "raw", "assets");
const REQUEST_TIMEOUT_MS = 30000;
const DEFAULT_HEADERS = {
  "accept-language": "de-AT,de;q=0.9,en;q=0.8",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
};

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
    limit: null,
    refresh: false,
    concurrency: 6,
    kinds: null,
  };

  for (const arg of argv) {
    if (arg.startsWith("--scope=")) {
      options.scope = arg.split("=")[1];
    } else if (arg.startsWith("--limit=")) {
      options.limit = Number.parseInt(arg.split("=")[1], 10);
    } else if (arg === "--refresh") {
      options.refresh = true;
    } else if (arg.startsWith("--concurrency=")) {
      options.concurrency = Number.parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--kinds=")) {
      options.kinds = arg
        .split("=")[1]
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    }
  }

  if (!["current", "all"].includes(options.scope)) {
    throw new Error(`Unsupported scope: ${options.scope}`);
  }

  if (options.limit != null && (!Number.isFinite(options.limit) || options.limit <= 0)) {
    throw new Error("Limit must be a positive integer");
  }

  if (!Number.isFinite(options.concurrency) || options.concurrency <= 0) {
    throw new Error("Concurrency must be a positive integer");
  }

  if (options.kinds != null) {
    const unsupportedKinds = options.kinds.filter(
      (kind) => !["person_photo", "club_logo", "team_logo"].includes(kind),
    );
    if (unsupportedKinds.length > 0) {
      throw new Error(`Unsupported asset kinds: ${unsupportedKinds.join(", ")}`);
    }
  }

  return options;
}

async function runPool(items, concurrency, worker) {
  const queue = [...items];
  const results = [];
  const workers = Array.from({ length: Math.min(concurrency, items.length || 1) }, async () => {
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
  const manifestPath = path.join(DERIVED_DIR, `asset-targets.${suffix}.json`);

  try {
    return await readJson(manifestPath);
  } catch {
    const manifest = await buildAssetTargets({ scope });
    await writeAssetTargets(manifest);
    return manifest;
  }
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function downloadCandidate(url, filePath) {
  const tempPath = `${filePath}.tmp`;
  await ensureDir(path.dirname(filePath));
  await rm(tempPath, { force: true });

  try {
    const response = await fetch(url, {
      headers: DEFAULT_HEADERS,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? null;
    if (contentType && !contentType.startsWith("image/")) {
      throw new Error(`Unexpected content type: ${contentType}`);
    }

    if (response.body) {
      await pipeline(Readable.fromWeb(response.body), createWriteStream(tempPath));
    } else {
      const buffer = Buffer.from(await response.arrayBuffer());
      await writeFile(tempPath, buffer);
    }

    await rename(tempPath, filePath);
    const fileStats = await stat(filePath);

    return {
      fileSize: fileStats.size,
      contentType,
      lastModified: response.headers.get("last-modified") ?? null,
      etag: response.headers.get("etag") ?? null,
    };
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

async function collectAsset(target, scope, refresh) {
  const filePath = path.join(ASSET_DIR, scope, target.asset_kind, `${target.source_asset_id}.png`);

  if (!refresh && (await fileExists(filePath))) {
    const fileStats = await stat(filePath);
    return {
      fromCache: true,
      filePath,
      downloadedFrom: null,
      candidateLabel: null,
      fileSize: fileStats.size,
      contentType: "image/png",
      lastModified: null,
      etag: null,
    };
  }

  const failures = [];
  for (const candidate of target.download_candidates ?? []) {
    try {
      const result = await downloadCandidate(candidate.url, filePath);
      return {
        fromCache: false,
        filePath,
        downloadedFrom: candidate.url,
        candidateLabel: candidate.label,
        ...result,
      };
    } catch (error) {
      failures.push(`${candidate.label}: ${error.message}`);
    }
  }

  throw new Error(
    failures.length > 0
      ? `All candidates failed for ${target.id}: ${failures.join(" | ")}`
      : `No download candidates for ${target.id}`,
  );
}

export async function collectAssets(options = {}) {
  const config = {
    scope: options.scope ?? "current",
    limit: options.limit ?? null,
    refresh: options.refresh ?? false,
    concurrency: options.concurrency ?? 6,
    kinds: options.kinds ?? null,
  };

  const targetsManifest = await loadTargets(config.scope);
  let targets = targetsManifest.targets ?? [];

  if (config.kinds?.length) {
    const kinds = new Set(config.kinds);
    targets = targets.filter((target) => kinds.has(target.asset_kind));
  }

  if (config.limit != null) {
    targets = targets.slice(0, config.limit);
  }

  const assets = [];
  const errors = [];
  const stats = {
    fetched_assets: 0,
    cache_hits: 0,
    downloaded_bytes: 0,
  };
  const byKind = {
    person_photo: 0,
    club_logo: 0,
    team_logo: 0,
  };

  await runPool(targets, config.concurrency, async (target) => {
    try {
      const result = await collectAsset(target, config.scope, config.refresh);
      if (result.fromCache) {
        stats.cache_hits += 1;
      } else {
        stats.fetched_assets += 1;
      }
      stats.downloaded_bytes += result.fileSize ?? 0;
      byKind[target.asset_kind] += 1;

      assets.push({
        id: oefbId("asset-file", target.asset_kind, target.source_asset_id),
        asset_id: target.id,
        asset_kind: target.asset_kind,
        source_asset_id: target.source_asset_id,
        file_path: result.filePath,
        downloaded_from: result.downloadedFrom,
        candidate_label: result.candidateLabel,
        content_type: result.contentType,
        file_size: result.fileSize,
        related_entities: target.related_entities,
        from_cache: result.fromCache,
        meta: {
          last_modified: result.lastModified,
          etag: result.etag,
        },
      });
    } catch (error) {
      errors.push({
        asset_id: target.id,
        asset_kind: target.asset_kind,
        source_asset_id: target.source_asset_id,
        message: error.message,
      });
    }
  });

  return {
    generated_at: new Date().toISOString(),
    scope: config.scope,
    summary: {
      targets_selected: targets.length,
      assets_collected: assets.length,
      errors: errors.length,
      ...stats,
      by_kind: byKind,
    },
    assets: sortById(assets),
    errors,
  };
}

export async function writeAssetCollection(manifest) {
  const suffix = manifest.scope === "all" ? "all" : "current";
  const manifestPath = path.join(DERIVED_DIR, `asset-collection.${suffix}.json`);
  const summaryPath = path.join(DERIVED_DIR, `asset-collection.${suffix}.summary.json`);

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
