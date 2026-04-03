import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.resolve(__dirname, "..", "..");
export const DATA_DIR = path.join(ROOT_DIR, "data");
export const DISCOVERY_DIR = path.join(DATA_DIR, "discovery");
export const BY_VERBAND_DIR = path.join(DISCOVERY_DIR, "by_verband");
export const DERIVED_DIR = path.join(DATA_DIR, "derived");

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

function parseBewerbSourceId(url) {
  const match = String(url ?? "").match(/\/Bewerb\/(\d+)/);
  return match?.[1] ?? null;
}

function parseSeasonId(jahr1, jahr2) {
  return oefbId("saison", `${jahr1}-${jahr2}`);
}

function inferPayloadKind(relativePath) {
  if (relativePath.endsWith("verbands.json")) {
    return "verband_catalog";
  }
  if (relativePath.endsWith("target-amateur-men-competitions.json")) {
    return "target_competitions";
  }
  if (relativePath.endsWith("current-season-groups.json")) {
    return "current_groups";
  }
  if (relativePath.endsWith("collection-summary.json")) {
    return "discovery_summary";
  }
  if (relativePath.endsWith("errors.json")) {
    return "discovery_errors";
  }
  if (relativePath.endsWith("/seasons.json")) {
    return "verband_seasons";
  }
  if (relativePath.includes("/groups-")) {
    return "verband_groups";
  }
  if (relativePath.includes("/competitions-")) {
    return "gruppe_competitions";
  }
  return "discovery_file";
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function listJsonFiles(directory, acc = []) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await listJsonFiles(fullPath, acc);
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      acc.push(fullPath);
    }
  }
  return acc;
}

function addRawPayload(rawPayloads, relativePath, payload, extra = {}) {
  rawPayloads.push({
    id: oefbId("raw", slugify(relativePath)),
    source_system: "oefb",
    payload_kind: inferPayloadKind(relativePath),
    source_url: extra.source_url ?? null,
    source_id: extra.source_id ?? null,
    payload_format: "json",
    payload_hash: null,
    payload_json: payload,
    meta: {
      relative_path: relativePath,
      ...extra.meta,
    },
  });
}

export async function buildDiscoveryManifest() {
  const verbands = await readJson(path.join(DISCOVERY_DIR, "verbands.json"));
  const currentGroups = await readJson(path.join(DISCOVERY_DIR, "current-season-groups.json"));
  const targetCompetitions = await readJson(
    path.join(DISCOVERY_DIR, "target-amateur-men-competitions.json"),
  );
  let sfvScopeCompetitions = [];
  try {
    sfvScopeCompetitions = await readJson(
      path.join(DISCOVERY_DIR, "sfv-scope-competitions.json"),
    );
  } catch {
    // Optional: run scripts/collect-sfv-scope.mjs first
  }
  const collectionSummary = await readJson(path.join(DISCOVERY_DIR, "collection-summary.json"));
  const discoveryErrors = await readJson(path.join(DISCOVERY_DIR, "errors.json"));

  const rawPayloads = [];
  addRawPayload(rawPayloads, "data/discovery/verbands.json", verbands);
  addRawPayload(rawPayloads, "data/discovery/current-season-groups.json", currentGroups);
  addRawPayload(rawPayloads, "data/discovery/target-amateur-men-competitions.json", targetCompetitions);
  if (sfvScopeCompetitions.length > 0) {
    addRawPayload(rawPayloads, "data/discovery/sfv-scope-competitions.json", sfvScopeCompetitions, {
      meta: { scope: "sfv_salzburg" },
    });
  }
  addRawPayload(rawPayloads, "data/discovery/collection-summary.json", collectionSummary);
  addRawPayload(rawPayloads, "data/discovery/errors.json", discoveryErrors);

  const verbaende = verbands.map((verband) => ({
    id: oefbId("verband", verband.id),
    source_system: "oefb",
    source_id: verband.id,
    slug: slugify(verband.name),
    name: verband.name,
    source_url: verband.url,
    current_discovery_url: verband.url,
    meta: {},
  }));

  const saisonMap = new Map();
  const addSeason = (season) => {
    const seasonId = parseSeasonId(season.jahr1, season.jahr2);
    const existing = saisonMap.get(seasonId);
    if (!existing) {
      saisonMap.set(seasonId, {
        id: seasonId,
        source_system: "oefb",
        source_key: `${season.jahr1}-${season.jahr2}`,
        name: season.name,
        jahr1: season.jahr1,
        jahr2: season.jahr2,
        is_current: Boolean(season.aktuell),
        meta: {},
      });
      return;
    }

    existing.is_current = existing.is_current || Boolean(season.aktuell);
  };

  const groupSummaryById = new Map(currentGroups.map((row) => [row.group_id, row]));
  const summaryByCompetitionId = new Map(
    targetCompetitions.map((row) => [String(row.competition_id), row]),
  );
  for (const row of sfvScopeCompetitions) {
    summaryByCompetitionId.set(String(row.competition_id), row);
  }

  const gruppen = currentGroups.map((group) => {
    addSeason({
      name: group.season_name,
      jahr1: group.season_jahr2 - 1,
      jahr2: group.season_jahr2,
      aktuell: true,
    });

    return {
      id: oefbId("gruppe", group.group_id),
      verband_id: oefbId("verband", group.verband_id),
      current_saison_id: parseSeasonId(group.season_jahr2 - 1, group.season_jahr2),
      source_system: "oefb",
      source_id: group.group_id,
      slug: slugify(group.group_name),
      name: group.group_name,
      source_url: group.group_url,
      target_adult_amateur_group: Boolean(group.target_adult_amateur_group),
      meta: {
        verband_name: group.verband_name,
        season_name: group.season_name,
      },
    };
  });

  const bewerbSerienMap = new Map();
  const editionMap = new Map();
  const roundMap = new Map();

  const discoveryFiles = await listJsonFiles(BY_VERBAND_DIR);
  for (const filePath of discoveryFiles) {
    const relativePath = path.relative(ROOT_DIR, filePath).split(path.sep).join("/");
    const payload = await readJson(filePath);
    addRawPayload(rawPayloads, relativePath, payload);

    if (!relativePath.includes("/competitions-")) {
      continue;
    }

    for (const competition of payload) {
      const summary = summaryByCompetitionId.get(String(competition.id));
      if (!summary) {
        continue;
      }

      const seriesId = oefbId("bewerb-serie", String(competition.id));

      if (!bewerbSerienMap.has(seriesId)) {
        bewerbSerienMap.set(seriesId, {
          id: seriesId,
          verband_id: oefbId("verband", summary.verband_id),
          gruppe_id: oefbId("gruppe", summary.group_id),
          source_system: "oefb",
          series_key: String(competition.id),
          title: competition.name,
          normalized_title: slugify(competition.name),
          competition_bucket: summary.competition_bucket,
          reserve_competition: Boolean(summary.reserve_competition),
          target_adult_amateur_group: Boolean(summary.target_adult_amateur_group),
          current_source_id: String(competition.id),
          current_source_url: competition.url,
          meta: {
            historical_season_count: Array.isArray(competition.saisonen)
              ? competition.saisonen.length
              : 0,
            round_count: Array.isArray(competition.runden) ? competition.runden.length : 0,
          },
        });
      }

      for (const season of competition.saisonen ?? []) {
        addSeason(season);
        const editionSourceId = parseBewerbSourceId(season.url);
        if (!editionSourceId) {
          continue;
        }

        const editionId = oefbId("bewerb-edition", editionSourceId);
        const currentRound = (competition.runden ?? []).find((round) => round.aktuell);
        const editionRow = editionMap.get(editionId) ?? {
          id: editionId,
          serie_id: seriesId,
          saison_id: parseSeasonId(season.jahr1, season.jahr2),
          source_system: "oefb",
          source_id: editionSourceId,
          title: competition.name,
          source_url: season.url,
          statistik_url: season.aktuell ? competition.statistikUrl ?? null : null,
          is_current: Boolean(season.aktuell),
          round_count: season.aktuell ? (competition.runden ?? []).length : null,
          current_round_number: season.aktuell ? currentRound?.nr ?? null : null,
          reserve_competition: Boolean(summary.reserve_competition),
          competition_bucket: summary.competition_bucket,
          historical_season_count: competition.saisonen?.length ?? 0,
          meta: {
            verband_name: summary.verband_name,
            group_name: summary.group_name,
            verband_source_id: summary.verband_id,
          },
        };

        if (season.aktuell) {
          editionRow.is_current = true;
          editionRow.round_count = (competition.runden ?? []).length;
          editionRow.current_round_number = currentRound?.nr ?? null;
          editionRow.statistik_url = competition.statistikUrl ?? null;
          editionRow.source_url = competition.url;
        }

        editionMap.set(editionId, editionRow);
      }

      for (const round of competition.runden ?? []) {
        const roundId = oefbId("bewerb-runde", competition.id, String(round.nr));
        roundMap.set(roundId, {
          id: roundId,
          bewerb_edition_id: oefbId("bewerb-edition", competition.id),
          round_number: round.nr,
          name: round.name,
          source_url: round.url,
          statistik_url: round.statistikUrl ?? null,
          date_label: round.date ?? null,
          is_current: Boolean(round.aktuell),
          meta: {},
        });
      }
    }
  }

  const manifest = {
    generated_at: new Date().toISOString(),
    source_system: "oefb",
    summary: {
      raw_payloads: rawPayloads.length,
      verbaende: verbaende.length,
      saisonen: saisonMap.size,
      gruppen: gruppen.length,
      bewerb_serien: bewerbSerienMap.size,
      bewerb_editionen: editionMap.size,
      bewerb_runden: roundMap.size,
    },
    tables: {
      "raw.payloads": sortById(rawPayloads),
      "core.verbaende": sortById(verbaende),
      "core.saisonen": sortById([...saisonMap.values()]),
      "core.gruppen": sortById(gruppen),
      "core.bewerb_serien": sortById([...bewerbSerienMap.values()]),
      "core.bewerb_editionen": sortById([...editionMap.values()]),
      "core.bewerb_runden": sortById([...roundMap.values()]),
    },
  };

  return manifest;
}

export async function writeDiscoveryManifest(manifest) {
  await mkdir(DERIVED_DIR, { recursive: true });
  const manifestPath = path.join(DERIVED_DIR, "discovery-manifest.json");
  const summaryPath = path.join(DERIVED_DIR, "discovery-manifest.summary.json");

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(
    summaryPath,
    `${JSON.stringify(
      {
        generated_at: manifest.generated_at,
        source_system: manifest.source_system,
        summary: manifest.summary,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return {
    manifestPath,
    summaryPath,
  };
}
