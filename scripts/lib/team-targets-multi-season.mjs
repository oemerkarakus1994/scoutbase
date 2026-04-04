/**
 * Erzeugt Team-Ziele für mehrere Saisons (KM + Res) aus den Vereins-Slugs
 * des bestehenden SFV-Target-Manifests — ohne Spiele/Tabellen aus älteren Jahren.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { DERIVED_DIR, ROOT_DIR } from "./discovery-manifest.mjs";
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
  return [...rows].sort((left, right) => left.id.localeCompare(right, "de"));
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
      file_key: [slugify(clubSlug), slugify(seasonSegment), slugify(teamSegment)].join(
        "__",
      ),
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

/**
 * Letzte N Saisons inkl. aktueller (ÖFB-Notation 2025/26), jüngste zuerst.
 */
export function computeLastNSeasonLabels(n, now = new Date()) {
  const y = now.getFullYear();
  const mo = now.getMonth();
  const startYear = mo >= 6 ? y : y - 1;
  const labels = [];
  for (let i = 0; i < n; i++) {
    const sy = startYear - i;
    const ey2 = (sy + 1) % 100;
    labels.push(`${sy}/${String(ey2).padStart(2, "0")}`);
  }
  return labels;
}

function seasonLabelToSegment(label) {
  const m = /^(\d{4})\/(\d{2})$/.exec(String(label ?? "").trim());
  if (!m) {
    return null;
  }
  return `Saison-${m[1]}-${m[2]}`;
}

const DEFAULT_TEAM_SEGMENTS = ["KM", "Res"];

/**
 * @param {object} options
 * @param {string} [options.baseManifestPath] — z. B. team-targets.sfv.json
 * @param {number} [options.seasonCount]
 * @param {string[]} [options.teamSegments] — z. B. ["KM","Res"]
 */
export async function buildHistoricMultiSeasonTargets(options = {}) {
  const basePath =
    options.baseManifestPath ??
    path.join(DERIVED_DIR, "team-targets.sfv.json");
  const raw = await readFile(basePath, "utf8");
  const base = JSON.parse(raw);
  const baseTargets = base.targets ?? [];

  const clubSlugs = new Set();
  for (const t of baseTargets) {
    if (t.club_slug) {
      clubSlugs.add(t.club_slug);
    }
  }

  const seasonCount = Number.isFinite(options.seasonCount)
    ? Math.max(1, Math.min(20, options.seasonCount))
    : 5;
  const seasonLabels = computeLastNSeasonLabels(seasonCount);
  const teamSegments = Array.isArray(options.teamSegments)
    ? options.teamSegments
    : DEFAULT_TEAM_SEGMENTS;

  const targets = [];

  for (const clubSlug of [...clubSlugs].sort((a, b) => a.localeCompare(b, "de"))) {
    for (const seasonLabel of seasonLabels) {
      const seasonSeg = seasonLabelToSegment(seasonLabel);
      if (!seasonSeg) {
        continue;
      }
      for (const teamSeg of teamSegments) {
        if (!isKmOrResTeamSegment(teamSeg)) {
          continue;
        }
        const kaderUrl = `${CLUBS_BASE_URL}/${clubSlug}/Mannschaften/${seasonSeg}/${teamSeg}/Kader/`;
        const route = parseTeamRoute(kaderUrl);
        if (!route) {
          continue;
        }
        const pageUrls = buildPageUrls(route);
        const file_key = route.file_key;
        const canonical_team_name = clubSlug.replace(/-/g, " ");
        const target = {
          id: oefbId("team-target-url", file_key),
          source_system: "oefb",
          source_id: null,
          source_url: route.normalized_url,
          file_key,
          club_slug: route.club_slug,
          club_home_url: pageUrls.club_home,
          club_news_url: pageUrls.club_news,
          club_functionaries_url: pageUrls.club_functionaries,
          club_trainers_url: pageUrls.club_trainers,
          season_segment: route.season_segment,
          season_label: route.season_label,
          saison_id: route.saison_id,
          team_segment: route.team_segment,
          team_type: route.team_segment,
          canonical_team_name,
          aliases: [],
          logo_public_uids: [],
          competition_edition_ids: [],
          reserve_team: false,
          page_urls: {
            kader: pageUrls.kader,
            staff: pageUrls.staff,
            schedule: pageUrls.schedule,
            tables: pageUrls.tables,
            transfers: pageUrls.transfers,
          },
          meta: {
            observation_count: 0,
            observed_in_matches: 0,
            observed_in_table_rows: 0,
            seen_as_home: 0,
            seen_as_away: 0,
            synthetic_multi_season: true,
          },
        };
        target.reserve_team = inferReserveTeam(target);
        targets.push(target);
      }
    }
  }

  const manifest = {
    generated_at: new Date().toISOString(),
    scope: "sfv-5y",
    output_suffix: "sfv-5y",
    km_res_only: true,
    summary: {
      distinct_targets: targets.length,
      targets_before_km_res_filter: targets.length,
      unique_clubs: clubSlugs.size,
      unique_saisonen: new Set(targets.map((t) => t.saison_id).filter(Boolean)).size,
      reserve_targets: targets.filter((t) => t.reserve_team).length,
      invalid_urls: 0,
      season_labels: seasonLabels,
      source_manifest: path.relative(ROOT_DIR, basePath),
    },
    targets: sortById(targets),
    invalid_urls: [],
  };

  return manifest;
}
