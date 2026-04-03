#!/usr/bin/env node
/**
 * Crawlt ausschließlich den SFV (Salzburg) über die öffentlichen ÖFB-Datenservice-APIs:
 * Saisonen, Gruppen, Bewerbe je Gruppe.
 * Schreibt:
 * - data/discovery/sfv-scope-competitions.json (alle Bewerbe, inkl. Jugend/Frauen/Cup …)
 * - data/discovery/by_verband/salzburger-fu-ballverband/*.json
 */

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { SFV_VERBAND_ID, SFV_VERBAND_NAME } from "./lib/sfv-constants.mjs";
import { isAllowedSfvHerrenGroupName } from "./lib/sfv-filters.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DISCOVERY_DIR = path.join(ROOT_DIR, "data", "discovery");
const SFV_VERBAND_DIR = path.join(
  DISCOVERY_DIR,
  "by_verband",
  "salzburger-fu-ballverband",
);

const BASE_URL = "https://www.oefb.at";
const HOME_PAGE_OID = "1473983024629548524";
const REQUEST_DELAY_MS = 150;
const REQUEST_TIMEOUT_MS = 30000;

const execFileAsync = promisify(execFile);
const DEFAULT_HEADERS = {
  "accept-language": "de-AT,de;q=0.9,en;q=0.8",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
};

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

async function fetchText(url) {
  try {
    const { stdout } = await execFileAsync(
      "curl",
      [
        "-fsSL",
        "--max-time",
        String(Math.ceil(REQUEST_TIMEOUT_MS / 1000)),
        "-A",
        DEFAULT_HEADERS["user-agent"],
        "-H",
        `Accept-Language: ${DEFAULT_HEADERS["accept-language"]}`,
        url,
      ],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    return stdout;
  } catch (error) {
    throw new Error(`Request failed for ${url}: ${error.message}`);
  }
}

async function fetchJson(url) {
  const text = await fetchText(url);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON for ${url}: ${error.message}`);
  }
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isTargetAdultAmateurGroup(groupName) {
  const value = normalizeText(groupName);
  const excluded =
    /frauen|madchen|junior|jugend|nachwuchs|\bu\d{1,2}\b|cup|futsal|hobby|schuler|hallen|diozesan|masters|senioren|trainer|schiedsrichter/.test(
      value,
    );
  if (excluded) {
    return false;
  }
  return /regionalliga|stadtliga|landesliga|eliteliga|salzburger liga|oberliga|unterliga|gebietsliga|bezirksliga|1\.?\s*klasse|2\.?\s*klasse/.test(
    value,
  );
}

function inferCompetitionBucket(groupName, competitionName) {
  const value = normalizeText(`${groupName} ${competitionName}`);
  if (/frauen|madchen|girl/.test(value)) {
    return "frauen";
  }
  if (/futsal/.test(value)) {
    return "futsal";
  }
  if (/jugend|nachwuchs|\bu\d{1,2}\b|uniere|junioren/.test(value)) {
    return "jugend";
  }
  if (/cup|pokal|bewerb/.test(value) && /cup|pokal|landescup|sparkassen/.test(value)) {
    return "cup";
  }
  if (/regionalliga/.test(value)) {
    return "regionalliga";
  }
  if (
    /stadtliga|landesliga|eliteliga|salzburger liga|oberliga/.test(value) &&
    !/2\.?\s*landesliga/.test(value)
  ) {
    return "landesverbands-topliga";
  }
  if (/2\.?\s*landesliga/.test(value)) {
    return "2-landesliga";
  }
  if (/oberliga/.test(value)) {
    return "oberliga";
  }
  if (/unterliga|gebietsliga|bezirksliga/.test(value)) {
    return "unterliga-gebietsliga";
  }
  if (/1\.?\s*klasse/.test(value)) {
    return "1-klasse";
  }
  if (/2\.?\s*klasse/.test(value)) {
    return "2-klasse";
  }
  return "other";
}

function isReserveCompetition(competitionName) {
  const value = normalizeText(competitionName);
  return /\bu23\b|\bu24\b|\breserve\b|\breserven\b|\b1b\b/.test(value);
}

async function main() {
  await ensureDir(SFV_VERBAND_DIR);

  const seasonsUrl = `${BASE_URL}/datenservice/rest/oefb/datenservice/saisonen/${SFV_VERBAND_ID}`;
  const seasons = await fetchJson(seasonsUrl);
  await writeJson(path.join(SFV_VERBAND_DIR, "seasons.json"), seasons);
  await sleep(REQUEST_DELAY_MS);

  const currentSeason = seasons.find((s) => s.aktuell) ?? seasons[0];
  if (!currentSeason) {
    throw new Error("No season returned for SFV");
  }

  const groupsUrl =
    `${BASE_URL}/datenservice/rest/oefb/datenservice/gruppen/${SFV_VERBAND_ID}` +
    `;jahr=${currentSeason.jahr2};homepage=${HOME_PAGE_OID}`;
  const groups = await fetchJson(groupsUrl);
  await writeJson(
    path.join(SFV_VERBAND_DIR, `groups-${currentSeason.jahr2}.json`),
    groups,
  );
  await sleep(REQUEST_DELAY_MS);

  const allCompetitions = [];
  const errors = [];
  const skippedGroups = [];

  for (const group of groups) {
    if (!isAllowedSfvHerrenGroupName(group.name)) {
      skippedGroups.push({ group_id: group.id, group_name: group.name });
      continue;
    }

    const groupSlug = slugify(group.name);
    const competitionsUrl =
      `${BASE_URL}/datenservice/rest/oefb/datenservice/bewerbe/${group.id}` +
      `;homepage=${HOME_PAGE_OID};runden=true`;

    let competitions;
    try {
      competitions = await fetchJson(competitionsUrl);
      await writeJson(
        path.join(
          SFV_VERBAND_DIR,
          `competitions-${currentSeason.jahr2}-${groupSlug}.json`,
        ),
        competitions,
      );
      await sleep(REQUEST_DELAY_MS);
    } catch (error) {
      errors.push({
        stage: "competitions",
        group_id: group.id,
        group_name: group.name,
        message: error.message,
      });
      continue;
    }

    for (const competition of competitions) {
      allCompetitions.push({
        verband_id: SFV_VERBAND_ID,
        verband_name: SFV_VERBAND_NAME,
        season_name: currentSeason.name,
        season_jahr2: currentSeason.jahr2,
        group_id: group.id,
        group_name: group.name,
        group_url: group.url,
        competition_id: competition.id,
        competition_name: competition.name,
        competition_url: competition.url,
        rounds_count: Array.isArray(competition.runden) ? competition.runden.length : 0,
        season_count: Array.isArray(competition.saisonen) ? competition.saisonen.length : 0,
        reserve_competition: isReserveCompetition(competition.name),
        target_adult_amateur_group: isTargetAdultAmateurGroup(group.name),
        competition_bucket: inferCompetitionBucket(group.name, competition.name),
      });
    }
  }

  allCompetitions.sort((a, b) =>
    `${a.group_name}|${a.competition_name}`.localeCompare(
      `${b.group_name}|${b.competition_name}`,
      "de",
    ),
  );

  await writeJson(
    path.join(DISCOVERY_DIR, "sfv-scope-competitions.json"),
    allCompetitions,
  );

  const summary = {
    generated_at: new Date().toISOString(),
    verband_id: SFV_VERBAND_ID,
    verband_name: SFV_VERBAND_NAME,
    season: currentSeason.name,
    season_jahr2: currentSeason.jahr2,
    group_count_total: groups.length,
    group_count_included: groups.length - skippedGroups.length,
    group_count_skipped: skippedGroups.length,
    competition_count: allCompetitions.length,
    errors: errors.length,
  };

  await writeJson(path.join(DISCOVERY_DIR, "sfv-collection-summary.json"), {
    ...summary,
    skipped_groups: skippedGroups,
    error_detail: errors,
  });

  console.log(JSON.stringify({ ok: true, ...summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
