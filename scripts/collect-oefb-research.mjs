#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const RAW_HTML_DIR = path.join(DATA_DIR, "raw", "html");
const RAW_JS_DIR = path.join(DATA_DIR, "raw", "js");
const RAW_JSON_DIR = path.join(DATA_DIR, "raw", "json");
const DISCOVERY_DIR = path.join(DATA_DIR, "discovery");
const DISCOVERY_VERBAND_DIR = path.join(DISCOVERY_DIR, "by_verband");
const SAMPLE_DIR = path.join(DATA_DIR, "samples");
const SAMPLE_PRELOAD_DIR = path.join(SAMPLE_DIR, "preloads");

const BASE_URL = "https://www.oefb.at";
const BEWERBE_HOME_URL = `${BASE_URL}/bewerbe`;
const HOME_PAGE_OID = "1473983024629548524";
const REQUEST_DELAY_MS = 125;
const REQUEST_TIMEOUT_MS = 30000;
const execFileAsync = promisify(execFile);
const DEFAULT_HEADERS = {
  "accept-language": "de-AT,de;q=0.9,en;q=0.8",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
};

const SAMPLE_URLS = {
  competition: `${BASE_URL}/bewerbe/Bewerb/226635?Wiener-Stadtliga`,
  clubKmKader:
    "https://vereine.oefb.at/AtsvWolfsberg/Mannschaften/Saison-2025-26/KM/Kader/",
  clubKmStaff:
    "https://vereine.oefb.at/AtsvWolfsberg/Mannschaften/Saison-2025-26/KM/Trainer-Betreuer/",
  clubKmTransfers:
    "https://vereine.oefb.at/AtsvWolfsberg/Mannschaften/Saison-2025-26/KM/Zu-Abgaenge/",
  clubKmSchedule:
    "https://vereine.oefb.at/AtsvWolfsberg/Mannschaften/Saison-2025-26/KM/Spiele/",
  clubFunctionaries: "https://vereine.oefb.at/AtsvWolfsberg/Verein/Funktionaere/",
  sampleTable:
    `${BASE_URL}/datenservice/rest/oefb/spielbetrieb/tabelleByPublicUid/226635`,
  sampleCompetitionInfo:
    `${BASE_URL}/datenservice/rest/oefb/datenservice/226635;homepage=${HOME_PAGE_OID}`,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function writeText(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, value, "utf8");
}

async function writeJson(filePath, value) {
  await writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function csvEscape(value) {
  const stringValue = value == null ? "" : String(value);
  if (!/[",\n]/.test(stringValue)) {
    return stringValue;
  }
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function toCsv(rows) {
  if (rows.length === 0) {
    return "";
  }
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }
  return `${lines.join("\n")}\n`;
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
      {
        maxBuffer: 64 * 1024 * 1024,
      },
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

function extractBalancedJson(source, startIndex) {
  let index = startIndex;
  while (index < source.length && /\s/.test(source[index])) {
    index += 1;
  }

  const opener = source[index];
  const closer = opener === "[" ? "]" : opener === "{" ? "}" : null;
  if (!closer) {
    throw new Error(`Expected JSON value at index ${startIndex}`);
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let cursor = index; cursor < source.length; cursor += 1) {
    const char = source[cursor];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === opener) {
      depth += 1;
      continue;
    }

    if (char === closer) {
      depth -= 1;
      if (depth === 0) {
        const raw = source.slice(index, cursor + 1);
        return {
          endIndex: cursor + 1,
          value: JSON.parse(raw),
        };
      }
    }
  }

  throw new Error(`Could not parse JSON payload starting at index ${startIndex}`);
}

function extractAppPreload(html, preloadId) {
  const marker = `SG.container.appPreloads['${preloadId}']=`;
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) {
    return null;
  }
  const { value } = extractBalancedJson(html, markerIndex + marker.length);
  return value;
}

function extractAllAppPreloads(html) {
  const marker = "SG.container.appPreloads['";
  const result = {};
  let startIndex = 0;

  while (startIndex < html.length) {
    const markerIndex = html.indexOf(marker, startIndex);
    if (markerIndex === -1) {
      break;
    }

    const idStart = markerIndex + marker.length;
    const idEnd = html.indexOf("']", idStart);
    if (idEnd === -1) {
      break;
    }

    const preloadId = html.slice(idStart, idEnd);
    const equalsIndex = html.indexOf("=", idEnd);
    if (equalsIndex === -1) {
      break;
    }

    try {
      const { endIndex, value } = extractBalancedJson(html, equalsIndex + 1);
      result[preloadId] = value;
      startIndex = endIndex;
    } catch (error) {
      startIndex = idEnd + 2;
    }
  }

  return result;
}

function findFirstPreload(preloads, predicate) {
  for (const [preloadId, value] of Object.entries(preloads)) {
    if (predicate(value)) {
      return { preloadId, value };
    }
  }
  return null;
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isExcludedGroupName(groupName) {
  const value = normalizeText(groupName);
  const patterns = [
    /frauen/,
    /madchen/,
    /junior/,
    /jugend/,
    /nachwuchs/,
    /\bu\d{1,2}\b/,
    /cup/,
    /futsal/,
    /hobby/,
    /schuler/,
    /hallen/,
    /diozesan/,
    /diocesan/,
    /masters/,
    /senioren/,
    /trainer/,
    /schiedsrichter/,
  ];
  return patterns.some((pattern) => pattern.test(value));
}

function isTargetAdultAmateurGroup(groupName) {
  const value = normalizeText(groupName);
  if (isExcludedGroupName(groupName)) {
    return false;
  }

  const includePatterns = [
    /regionalliga/,
    /stadtliga/,
    /burgenlandliga/,
    /karntner liga/,
    /kaerntner liga/,
    /steirerliga/,
    /salzburger liga/,
    /tirol liga/,
    /vorarlbergliga/,
    /oo liga/,
    /ooe liga/,
    /ooberosterreich liga/,
    /landesliga/,
    /eliteliga/,
    /oberliga/,
    /unterliga/,
    /gebietsliga/,
    /bezirksliga/,
    /1\.?\s*klasse/,
    /2\.?\s*klasse/,
  ];

  return includePatterns.some((pattern) => pattern.test(value));
}

function inferCompetitionBucket(groupName, competitionName) {
  const value = normalizeText(`${groupName} ${competitionName}`);

  if (/regionalliga/.test(value)) {
    return "regionalliga";
  }

  if (
    /stadtliga|burgenlandliga|karntner liga|kaerntner liga|steirerliga|salzburger liga|tirol liga|vorarlbergliga|oo liga|ooe liga|landesliga|eliteliga/.test(
      value,
    ) &&
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

  return "other-adult-amateur";
}

function isReserveCompetition(competitionName) {
  const value = normalizeText(competitionName);
  return /\bu23\b|\bu24\b|\breserve\b|\breserven\b|\b1b\b/.test(value);
}

function buildPublicMatchReportUrl(clubMatchUrl) {
  if (!clubMatchUrl) {
    return null;
  }

  const match = clubMatchUrl.match(/[:?&]s=(\d+)/);
  if (!match) {
    return null;
  }

  return `${BASE_URL}/bewerbe/Spiel/Spielbericht/${match[1]}/`;
}

async function resolvePlayerProfileUrl(candidateUrl) {
  if (!candidateUrl || !candidateUrl.includes("/netzwerk/spielerdetails/")) {
    return candidateUrl;
  }

  const legacyHtml = await fetchText(candidateUrl);
  const redirectMatch = legacyHtml.match(/window\.location\s*=\s*"([^"]+)"/);
  return redirectMatch?.[1] ?? candidateUrl;
}

async function captureHtmlSample(name, url) {
  const html = await fetchText(url);
  await writeText(path.join(RAW_HTML_DIR, `${name}.html`), html);

  const preloads = extractAllAppPreloads(html);
  await writeJson(path.join(SAMPLE_PRELOAD_DIR, `${name}.json`), preloads);

  await sleep(REQUEST_DELAY_MS);

  return { html, preloads };
}

async function captureJsSample(name, url) {
  const js = await fetchText(url);
  await writeText(path.join(RAW_JS_DIR, `${name}.js`), js);
  await sleep(REQUEST_DELAY_MS);
}

async function main() {
  await ensureDir(RAW_HTML_DIR);
  await ensureDir(RAW_JS_DIR);
  await ensureDir(RAW_JSON_DIR);
  await ensureDir(DISCOVERY_DIR);
  await ensureDir(DISCOVERY_VERBAND_DIR);
  await ensureDir(SAMPLE_DIR);
  await ensureDir(SAMPLE_PRELOAD_DIR);

  const homeHtml = await fetchText(BEWERBE_HOME_URL);
  await writeText(path.join(RAW_HTML_DIR, "bewerbe-home.html"), homeHtml);
  const homePreloads = extractAllAppPreloads(homeHtml);
  await writeJson(path.join(SAMPLE_PRELOAD_DIR, "bewerbe-home.json"), homePreloads);

  const verbandsPreload = extractAppPreload(homeHtml, "277435996");
  const verbaende = Array.isArray(verbandsPreload?.[0]) ? verbandsPreload[0] : verbandsPreload;
  if (!Array.isArray(verbaende) || verbaende.length === 0) {
    throw new Error("Could not extract verband selection from https://www.oefb.at/bewerbe");
  }

  await writeJson(path.join(DISCOVERY_DIR, "verbands.json"), verbaende);

  const verbandSummaries = [];
  const currentSeasonGroups = [];
  const allCompetitions = [];
  const targetCompetitions = [];
  const errors = [];

  for (const verband of verbaende) {
    const verbandSlug = slugify(verband.name);
    const verbandDir = path.join(DISCOVERY_VERBAND_DIR, verbandSlug);
    await ensureDir(verbandDir);

    let seasons;
    try {
      const seasonsUrl = `${BASE_URL}/datenservice/rest/oefb/datenservice/saisonen/${verband.id}`;
      seasons = await fetchJson(seasonsUrl);
      await writeJson(path.join(verbandDir, "seasons.json"), seasons);
      await sleep(REQUEST_DELAY_MS);
    } catch (error) {
      errors.push({
        stage: "seasons",
        verband_id: verband.id,
        verband_name: verband.name,
        message: error.message,
      });
      continue;
    }

    const currentSeason = seasons.find((season) => season.aktuell) ?? seasons[0];

    let groups;
    try {
      const groupsUrl =
        `${BASE_URL}/datenservice/rest/oefb/datenservice/gruppen/${verband.id}` +
        `;jahr=${currentSeason.jahr2};homepage=${HOME_PAGE_OID}`;
      groups = await fetchJson(groupsUrl);
      await writeJson(path.join(verbandDir, `groups-${currentSeason.jahr2}.json`), groups);
      await sleep(REQUEST_DELAY_MS);
    } catch (error) {
      errors.push({
        stage: "groups",
        verband_id: verband.id,
        verband_name: verband.name,
        season_name: currentSeason.name,
        message: error.message,
      });
      continue;
    }

    verbandSummaries.push({
      verband_id: verband.id,
      verband_name: verband.name,
      current_season: currentSeason.name,
      current_season_jahr2: currentSeason.jahr2,
      season_count: seasons.length,
      group_count: groups.length,
    });

    for (const group of groups) {
      const targetAdultGroup = isTargetAdultAmateurGroup(group.name);

      currentSeasonGroups.push({
        verband_id: verband.id,
        verband_name: verband.name,
        season_name: currentSeason.name,
        season_jahr2: currentSeason.jahr2,
        group_id: group.id,
        group_name: group.name,
        group_url: group.url,
        target_adult_amateur_group: targetAdultGroup,
      });

      if (!targetAdultGroup) {
        continue;
      }

      const competitionsUrl =
        `${BASE_URL}/datenservice/rest/oefb/datenservice/bewerbe/${group.id}` +
        `;homepage=${HOME_PAGE_OID};runden=true`;
      let competitions;
      try {
        competitions = await fetchJson(competitionsUrl);
        const groupSlug = slugify(group.name);
        await writeJson(
          path.join(verbandDir, `competitions-${currentSeason.jahr2}-${groupSlug}.json`),
          competitions,
        );
        await sleep(REQUEST_DELAY_MS);
      } catch (error) {
        errors.push({
          stage: "competitions",
          verband_id: verband.id,
          verband_name: verband.name,
          season_name: currentSeason.name,
          group_id: group.id,
          group_name: group.name,
          message: error.message,
        });
        continue;
      }

      for (const competition of competitions) {
        const row = {
          verband_id: verband.id,
          verband_name: verband.name,
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
          target_adult_amateur_group: true,
          competition_bucket: inferCompetitionBucket(group.name, competition.name),
        };

        allCompetitions.push(row);
        targetCompetitions.push(row);
      }
    }
  }

  allCompetitions.sort((left, right) =>
    `${left.verband_name}|${left.group_name}|${left.competition_name}`.localeCompare(
      `${right.verband_name}|${right.group_name}|${right.competition_name}`,
      "de",
    ),
  );
  targetCompetitions.sort((left, right) =>
    `${left.verband_name}|${left.group_name}|${left.competition_name}`.localeCompare(
      `${right.verband_name}|${right.group_name}|${right.competition_name}`,
      "de",
    ),
  );

  await writeJson(path.join(DISCOVERY_DIR, "verband-summaries.json"), verbandSummaries);
  await writeJson(path.join(DISCOVERY_DIR, "current-season-groups.json"), currentSeasonGroups);
  await writeJson(path.join(DISCOVERY_DIR, "current-season-competitions.json"), allCompetitions);
  await writeText(
    path.join(DISCOVERY_DIR, "current-season-competitions.csv"),
    toCsv(allCompetitions),
  );
  await writeJson(
    path.join(DISCOVERY_DIR, "target-amateur-men-competitions.json"),
    targetCompetitions,
  );
  await writeText(
    path.join(DISCOVERY_DIR, "target-amateur-men-competitions.csv"),
    toCsv(targetCompetitions),
  );

  const sampleCache = {};
  for (const [name, url] of Object.entries({
    "sample-competition-page": SAMPLE_URLS.competition,
    "sample-club-km-kader": SAMPLE_URLS.clubKmKader,
    "sample-club-km-staff": SAMPLE_URLS.clubKmStaff,
    "sample-club-km-transfers": SAMPLE_URLS.clubKmTransfers,
    "sample-club-functionaries": SAMPLE_URLS.clubFunctionaries,
    "sample-club-km-schedule": SAMPLE_URLS.clubKmSchedule,
  })) {
    try {
      sampleCache[name] = await captureHtmlSample(name, url);
    } catch (error) {
      errors.push({
        stage: "sample_html",
        sample_name: name,
        url,
        message: error.message,
      });
      sampleCache[name] = null;
    }
  }

  const kmKaderPreload = findFirstPreload(
    sampleCache["sample-club-km-kader"]?.preloads ?? {},
    (value) => Array.isArray(value) && value[0] && value[0].type === "KADER",
  );
  const firstPlayerUrl = kmKaderPreload?.value?.[0]?.kader?.[0]?.spielerProfilUrl
    ? `${BASE_URL}${kmKaderPreload.value[0].kader[0].spielerProfilUrl}`
    : null;

  const kmSchedulePreload = findFirstPreload(
    sampleCache["sample-club-km-schedule"]?.preloads ?? {},
    (value) => Array.isArray(value) && value[0] && value[0].type === "SPIELPLAN_MANNSCHAFT",
  );
  const firstClubMatchUrl = kmSchedulePreload?.value?.[0]?.spiele?.[0]?.spielUrl ?? null;
  const publicMatchReportUrl = buildPublicMatchReportUrl(firstClubMatchUrl);

  let samplePlayerProfileUrl = null;
  let sampleMatchReportUrl = null;

  if (firstPlayerUrl) {
    samplePlayerProfileUrl = await resolvePlayerProfileUrl(firstPlayerUrl);
    try {
      await captureHtmlSample("sample-player-profile", samplePlayerProfileUrl);
    } catch (error) {
      errors.push({
        stage: "sample_html",
        sample_name: "sample-player-profile",
        url: samplePlayerProfileUrl,
        message: error.message,
      });
    }
  }

  if (publicMatchReportUrl) {
    sampleMatchReportUrl = publicMatchReportUrl;
    try {
      await captureHtmlSample("sample-match-report", publicMatchReportUrl);
    } catch (error) {
      errors.push({
        stage: "sample_html",
        sample_name: "sample-match-report",
        url: publicMatchReportUrl,
        message: error.message,
      });
    }
  }

  for (const [name, url] of Object.entries({
    "sample-wiener-stadtliga-table": SAMPLE_URLS.sampleTable,
    "sample-wiener-stadtliga-competition-info": SAMPLE_URLS.sampleCompetitionInfo,
  })) {
    try {
      const sampleJson = await fetchJson(url);
      await writeJson(path.join(RAW_JSON_DIR, `${name}.json`), sampleJson);
      await sleep(REQUEST_DELAY_MS);
    } catch (error) {
      errors.push({
        stage: "sample_json",
        sample_name: name,
        url,
        message: error.message,
      });
    }
  }

  for (const [name, url] of Object.entries({
    oefb3DatenserviceBanner:
      `${BASE_URL}/apps/VerbandMasterProject/oefb3DatenserviceBanner/oefb3DatenserviceBanner.js?version=9BT8vSxw`,
    oefb3Tabelle:
      `${BASE_URL}/apps/VerbandMasterProject/oefb3Tabelle/oefb3Tabelle.js?version=PLGMGPaO`,
    oefb3SpielerDetailStatistik:
      `${BASE_URL}/apps/VerbandMasterProject/oefb3SpielerDetailStatistik/oefb3SpielerDetailStatistik.js?version=Xmyl8DNB`,
    oefb3SpielSpielbericht:
      `${BASE_URL}/apps/VerbandMasterProject/oefb3SpielSpielbericht/oefb3SpielSpielbericht.js?version=p1y8AqOt`,
  })) {
    try {
      await captureJsSample(name, url);
    } catch (error) {
      errors.push({
        stage: "sample_js",
        sample_name: name,
        url,
        message: error.message,
      });
    }
  }

  await writeJson(path.join(SAMPLE_DIR, "sample-urls.json"), {
    ...SAMPLE_URLS,
    samplePlayerProfileUrl,
    sampleMatchReportUrl,
  });

  await writeJson(path.join(DISCOVERY_DIR, "collection-summary.json"), {
    generated_at: new Date().toISOString(),
    homepage_url: BEWERBE_HOME_URL,
    homepage_oid: HOME_PAGE_OID,
    verbands_count: verbaende.length,
    current_season_group_count: currentSeasonGroups.length,
    current_season_competition_count: allCompetitions.length,
    target_amateur_men_competition_count: targetCompetitions.length,
    sample_player_profile_url: samplePlayerProfileUrl,
    sample_match_report_url: sampleMatchReportUrl,
    error_count: errors.length,
  });
  await writeJson(path.join(DISCOVERY_DIR, "errors.json"), errors);

  console.log(
    [
      `Collected ${verbaende.length} verbaende.`,
      `Collected ${currentSeasonGroups.length} current-season groups.`,
      `Collected ${allCompetitions.length} current-season competitions.`,
      `Filtered ${targetCompetitions.length} target adult amateur competitions.`,
      `Recorded ${errors.length} recoverable errors.`,
      `Output written to ${ROOT_DIR}.`,
    ].join(" "),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
