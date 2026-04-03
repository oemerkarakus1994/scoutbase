import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { DERIVED_DIR } from "./discovery-manifest.mjs";
import {
  buildCompetitionContentManifest,
  writeCompetitionContentManifest,
} from "./competition-content-manifest.mjs";
import { isKmOrResTeamSegment } from "./sfv-filters.mjs";

const CLUBS_BASE_URL = "https://vereine.oefb.at";

function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function oefbId(kind, ...parts) {
  return `oefb:${kind}:${parts.filter(Boolean).join(":")}`;
}

function sortById(rows) {
  return [...rows].sort((left, right) => left.id.localeCompare(right.id, "de"));
}

function pickMostFrequent(entries) {
  return [...entries.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      if (left[0].length !== right[0].length) {
        return left[0].length - right[0].length;
      }
      return left[0].localeCompare(right[0], "de");
    })
    .at(0)?.[0] ?? null;
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
    competitionManifestSuffix: null,
    outputSuffix: null,
    kmResOnly: null,
  };

  for (const arg of argv) {
    if (arg.startsWith("--scope=")) {
      options.scope = arg.split("=")[1];
    } else if (arg.startsWith("--competition-manifest-suffix=")) {
      options.competitionManifestSuffix = arg.split("=")[1];
    } else if (arg.startsWith("--output-suffix=")) {
      options.outputSuffix = arg.split("=")[1];
    } else if (arg === "--km-res-only") {
      options.kmResOnly = true;
    } else if (arg === "--all-teams") {
      options.kmResOnly = false;
    }
  }

  if (!["current", "all", "sfv"].includes(options.scope)) {
    throw new Error(`Unsupported scope: ${options.scope}`);
  }

  return options;
}

function normalizeTeamUrl(value) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value, CLUBS_BASE_URL);
    url.hash = "";
    url.search = "";
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
    return url.href;
  } catch {
    return null;
  }
}

function isInvalidTeamUrl(url) {
  return !url || url === `${CLUBS_BASE_URL}/` || url === `${CLUBS_BASE_URL}/#`;
}

function parseSeasonSegment(segment) {
  const match = String(segment ?? "").match(/^Saison-(\d{4})-(\d{2})$/);
  if (!match) {
    return {
      season_segment: segment ?? null,
      season_label: null,
      saison_id: null,
    };
  }

  const jahr1 = Number.parseInt(match[1], 10);
  const jahr2 = Number.parseInt(`${String(jahr1).slice(0, 2)}${match[2]}`, 10);

  return {
    season_segment: match[0],
    season_label: `${jahr1}/${match[2]}`,
    saison_id: oefbId("saison", `${jahr1}-${jahr2}`),
  };
}

function parseTeamRoute(url) {
  try {
    const parsedUrl = new URL(url);
    const segments = parsedUrl.pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));

    if (segments.length < 5 || segments[1] !== "Mannschaften") {
      return null;
    }

    const [clubSlug, , seasonSegment, teamSegment, pageSegment] = segments;
    const season = parseSeasonSegment(seasonSegment);

    return {
      club_slug: clubSlug,
      club_slug_normalized: slugify(clubSlug),
      season_segment: seasonSegment,
      season_label: season.season_label,
      saison_id: season.saison_id,
      team_segment: teamSegment,
      team_segment_normalized: slugify(teamSegment),
      page_segment: pageSegment,
      normalized_url: normalizeTeamUrl(url),
      file_key: [
        slugify(clubSlug),
        slugify(seasonSegment),
        slugify(teamSegment),
      ].join("__"),
    };
  } catch {
    return null;
  }
}

function buildPageUrls(route) {
  const base = `${CLUBS_BASE_URL}/${route.club_slug}/Mannschaften/${route.season_segment}/${route.team_segment}`;
  return {
    kader: `${base}/Kader/`,
    staff: `${base}/Trainer-Betreuer/`,
    schedule: `${base}/Spiele/`,
    tables: `${base}/Tabellen/`,
    transfers: `${base}/Zu-Abgaenge/`,
    club_home: `${CLUBS_BASE_URL}/${route.club_slug}/`,
    club_news: `${CLUBS_BASE_URL}/${route.club_slug}/News/`,
    club_functionaries: `${CLUBS_BASE_URL}/${route.club_slug}/Verein/Funktionaere/`,
    club_trainers: `${CLUBS_BASE_URL}/${route.club_slug}/Verein/Trainer/`,
  };
}

function inferReserveTeam(target) {
  const haystack = [
    target.team_segment,
    target.team_type,
    target.canonical_team_name,
    ...(target.aliases ?? []),
  ]
    .filter(Boolean)
    .join(" ");

  return /\b(u23|u24|1b|reserve|reserven|amat\.?|amateure?|ii|iii|junior(?:s)?|res)\b/i.test(
    haystack,
  );
}

async function loadCompetitionContentManifest(scope, manifestSuffix) {
  const suffix = manifestSuffix ?? (scope === "all" ? "all" : "current");
  const manifestPath = path.join(DERIVED_DIR, `competition-content-manifest.${suffix}.json`);

  try {
    return await readJson(manifestPath);
  } catch {
    const manifest = await buildCompetitionContentManifest({ scope });
    await writeCompetitionContentManifest(manifest);
    return manifest;
  }
}

function touchTarget(targetMap, observation) {
  const normalizedUrl = normalizeTeamUrl(observation.url);
  if (isInvalidTeamUrl(normalizedUrl)) {
    return {
      valid: false,
      normalizedUrl,
    };
  }

  const route = parseTeamRoute(normalizedUrl);
  if (!route) {
    return {
      valid: false,
      normalizedUrl,
    };
  }

  const existing =
    targetMap.get(normalizedUrl) ??
    {
      normalized_url: normalizedUrl,
      route,
      observation_count: 0,
      match_count: 0,
      table_count: 0,
      home_count: 0,
      away_count: 0,
      competition_edition_ids: new Set(),
      source_keys: new Set(),
      logo_public_uids: new Set(),
      names: new Map(),
    };

  existing.observation_count += 1;
  if (observation.origin === "match") {
    existing.match_count += 1;
  }
  if (observation.origin === "table") {
    existing.table_count += 1;
  }
  if (observation.side === "home") {
    existing.home_count += 1;
  }
  if (observation.side === "away") {
    existing.away_count += 1;
  }
  if (observation.competitionEditionId) {
    existing.competition_edition_ids.add(observation.competitionEditionId);
  }
  if (observation.sourceKey) {
    existing.source_keys.add(String(observation.sourceKey));
  }
  if (observation.logoPublicUid) {
    existing.logo_public_uids.add(String(observation.logoPublicUid));
  }
  if (observation.teamName) {
    existing.names.set(
      observation.teamName,
      (existing.names.get(observation.teamName) ?? 0) + 1,
    );
  }

  targetMap.set(normalizedUrl, existing);
  return {
    valid: true,
    normalizedUrl,
  };
}

export async function buildTeamTargetsManifest(options = {}) {
  const manifestSuffixEarly =
    options.competitionManifestSuffix ?? (options.scope === "sfv" ? "sfv" : null);
  const outputSuffixEarly =
    options.outputSuffix ??
    (options.scope === "sfv" ? "sfv" : null) ??
    options.competitionManifestSuffix ??
    null;
  const defaultKmResOnly =
    manifestSuffixEarly === "sfv" ||
    outputSuffixEarly === "sfv" ||
    options.scope === "sfv";

  const config = {
    scope: options.scope ?? "current",
    competitionManifestSuffix: options.competitionManifestSuffix ?? null,
    outputSuffix: options.outputSuffix ?? null,
    kmResOnly: options.kmResOnly ?? defaultKmResOnly,
  };

  const manifestSuffix =
    config.competitionManifestSuffix ?? (config.scope === "sfv" ? "sfv" : null);
  const fallbackCompetitionScope = config.scope === "all" ? "all" : "current";

  const competitionManifest = await loadCompetitionContentManifest(
    fallbackCompetitionScope,
    manifestSuffix,
  );
  const matches = competitionManifest.tables["core.spiele"] ?? [];
  const snapshots = competitionManifest.tables["core.tabellen_snapshots"] ?? [];
  const snapshotRows = competitionManifest.tables["core.tabellen_snapshot_rows"] ?? [];

  const snapshotById = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const targetMap = new Map();
  const invalidUrls = [];

  for (const match of matches) {
    for (const side of ["home", "away"]) {
      const result = touchTarget(targetMap, {
        url: match.meta?.[`${side}_team_url`] ?? null,
        teamName: match[`${side}_team_name`] ?? null,
        sourceKey: match.meta?.[`${side}_team_source_key`] ?? null,
        logoPublicUid: match.meta?.[`${side}_team_logo`] ?? null,
        competitionEditionId: match.bewerb_edition_id ?? null,
        origin: "match",
        side,
      });

      if (!result.valid) {
        invalidUrls.push({
          origin: "match",
          side,
          source_url: match.source_url,
          raw_team_url: match.meta?.[`${side}_team_url`] ?? null,
          team_name: match[`${side}_team_name`] ?? null,
        });
      }
    }
  }

  for (const row of snapshotRows) {
    const snapshot = snapshotById.get(row.snapshot_id);
    const result = touchTarget(targetMap, {
      url: row.source_team_url ?? null,
      teamName: row.team_name ?? null,
      sourceKey: null,
      logoPublicUid: row.status_flags?.team_icon_public_uid ?? null,
      competitionEditionId: snapshot?.bewerb_edition_id ?? null,
      origin: "table",
      side: null,
    });

    if (!result.valid) {
      invalidUrls.push({
        origin: "table",
        snapshot_id: row.snapshot_id,
        raw_team_url: row.source_team_url ?? null,
        team_name: row.team_name ?? null,
      });
    }
  }

  const targets = sortById(
    [...targetMap.values()].map((entry) => {
      const pageUrls = buildPageUrls(entry.route);
      const sourceKeys = [...entry.source_keys].sort((left, right) => left.localeCompare(right, "de"));
      const aliases = [...entry.names.keys()].sort((left, right) => left.localeCompare(right, "de"));
      const canonicalTeamName = pickMostFrequent(entry.names) ?? aliases[0] ?? entry.route.team_segment;

      const target = {
        id: sourceKeys[0]
          ? oefbId("team-target", sourceKeys[0])
          : oefbId("team-target-url", entry.route.file_key),
        source_system: "oefb",
        source_id: sourceKeys[0] ?? null,
        source_url: entry.normalized_url,
        file_key: entry.route.file_key,
        club_slug: entry.route.club_slug,
        club_home_url: pageUrls.club_home,
        club_news_url: pageUrls.club_news,
        club_functionaries_url: pageUrls.club_functionaries,
        club_trainers_url: pageUrls.club_trainers,
        season_segment: entry.route.season_segment,
        season_label: entry.route.season_label,
        saison_id: entry.route.saison_id,
        team_segment: entry.route.team_segment,
        team_type: entry.route.team_segment,
        canonical_team_name: canonicalTeamName,
        aliases,
        logo_public_uids: [...entry.logo_public_uids].sort((left, right) =>
          left.localeCompare(right, "de"),
        ),
        competition_edition_ids: [...entry.competition_edition_ids].sort((left, right) =>
          left.localeCompare(right, "de"),
        ),
        reserve_team: false,
        page_urls: {
          kader: pageUrls.kader,
          staff: pageUrls.staff,
          schedule: pageUrls.schedule,
          tables: pageUrls.tables,
          transfers: pageUrls.transfers,
        },
        meta: {
          observation_count: entry.observation_count,
          observed_in_matches: entry.match_count,
          observed_in_table_rows: entry.table_count,
          seen_as_home: entry.home_count,
          seen_as_away: entry.away_count,
        },
      };

      target.reserve_team = inferReserveTeam(target);
      return target;
    }),
  );

  const beforeKmRes = targets.length;
  const filteredTargets = config.kmResOnly
    ? targets.filter((target) => isKmOrResTeamSegment(target.team_segment))
    : targets;

  const outputSuffix =
    config.outputSuffix ??
    (config.scope === "sfv" ? "sfv" : null) ??
    config.competitionManifestSuffix ??
    (config.scope === "all" ? "all" : "current");

  const manifest = {
    generated_at: new Date().toISOString(),
    scope: config.scope,
    output_suffix: outputSuffix,
    km_res_only: config.kmResOnly,
    summary: {
      distinct_targets: filteredTargets.length,
      targets_before_km_res_filter: config.kmResOnly ? beforeKmRes : null,
      unique_clubs: new Set(filteredTargets.map((target) => target.club_slug)).size,
      unique_saisonen: new Set(filteredTargets.map((target) => target.saison_id).filter(Boolean)).size,
      reserve_targets: filteredTargets.filter((target) => target.reserve_team).length,
      invalid_urls: invalidUrls.length,
    },
    targets: filteredTargets,
    invalid_urls: invalidUrls,
  };

  return manifest;
}

export async function writeTeamTargetsManifest(manifest) {
  await ensureDir(DERIVED_DIR);
  const suffix =
    manifest.output_suffix ?? (manifest.scope === "all" ? "all" : "current");
  const manifestPath = path.join(DERIVED_DIR, `team-targets.${suffix}.json`);
  const summaryPath = path.join(DERIVED_DIR, `team-targets.${suffix}.summary.json`);

  await writeJson(manifestPath, manifest);
  await writeJson(summaryPath, {
    generated_at: manifest.generated_at,
    scope: manifest.scope,
    summary: manifest.summary,
    invalid_urls_sample: manifest.invalid_urls.slice(0, 20),
  });

  return {
    manifestPath,
    summaryPath,
  };
}

export { parseArgs };
