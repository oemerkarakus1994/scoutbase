import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ROOT_DIR, DERIVED_DIR, buildDiscoveryManifest } from "./discovery-manifest.mjs";
import { fetchText } from "./oefb-http.mjs";
import { extractAllAppPreloads, findFirstPreload } from "./oefb-preloads.mjs";

const RAW_COMPETITION_DIR = path.join(ROOT_DIR, "data", "raw", "competition-pages");

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

function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function parseArgs(argv) {
  const options = {
    scope: "current",
    limit: null,
    refresh: false,
    concurrency: 6,
    verbandSourceId: null,
    outputSuffix: null,
    cacheScope: null,
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
    } else if (arg.startsWith("--verband-source-id=")) {
      options.verbandSourceId = arg.split("=")[1];
    } else if (arg.startsWith("--output-suffix=")) {
      options.outputSuffix = arg.split("=")[1];
    } else if (arg.startsWith("--cache-scope=")) {
      options.cacheScope = arg.split("=")[1];
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

  return options;
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

function hashText(value) {
  return createHash("sha1").update(value).digest("hex");
}

function parseMatchIdFromUrl(value) {
  const match = String(value ?? "").match(/\/Spiel(?:bericht)?\/(\d+)/);
  if (match) {
    return match[1];
  }
  const altMatch = String(value ?? "").match(/\/Spielbericht\/\?[^#]*&:s=(\d+)/);
  return altMatch?.[1] ?? null;
}

function pickMatchUrl(entry) {
  const candidates = [
    entry.actionLink,
    entry.spielbericht,
    ...(entry.links ?? []).map((link) => link.link),
  ].filter(Boolean);

  return candidates.find((candidate) => String(candidate).includes("/Spiel")) ?? null;
}

function parseGoals(entry) {
  if (typeof entry.ergebnisShort === "string") {
    const match = entry.ergebnisShort.match(/(\d+)\s*:\s*(\d+)/);
    if (match) {
      return {
        homeGoals: Number.parseInt(match[1], 10),
        awayGoals: Number.parseInt(match[2], 10),
      };
    }
  }

  if (
    Number.isInteger(entry.ergebnisHeim) &&
    Number.isInteger(entry.ergebnisGast) &&
    !String(entry.ergebnisShort ?? "").includes("-:-")
  ) {
    return {
      homeGoals: entry.ergebnisHeim,
      awayGoals: entry.ergebnisGast,
    };
  }

  return {
    homeGoals: null,
    awayGoals: null,
  };
}

function inferFinished(kind, entry) {
  if (kind === "ergebnisse") {
    return true;
  }

  const status = String(entry.status ?? "").toLowerCase();
  if (["bestaetigt", "strafverifiziert", "abgeschlossen", "beendet"].includes(status)) {
    return true;
  }

  return false;
}

function inferCancelled(entry) {
  const status = String(entry.status ?? "").toLowerCase();
  return status.includes("abgesagt") || status.includes("annulliert");
}

function findHeaderPreload(preloads) {
  return findFirstPreload(
    preloads,
    (value) => Array.isArray(value) && value[0] && value[0].bezeichnung && value[0].verband,
  );
}

function findTablePreload(preloads) {
  return findFirstPreload(
    preloads,
    (value) => Array.isArray(value) && value[0] && value[0].bewerbName && value[0].eintraege,
  );
}

function findPlayplanPreload(preloads) {
  return findFirstPreload(
    preloads,
    (value) => Array.isArray(value) && value[0] && value[0].ergebnisse && value[0].spiele,
  );
}

async function getCompetitionPageData(edition, cacheScope, refresh) {
  const htmlPath = path.join(RAW_COMPETITION_DIR, cacheScope, "html", `${edition.source_id}.html`);
  const preloadsPath = path.join(
    RAW_COMPETITION_DIR,
    cacheScope,
    "preloads",
    `${edition.source_id}.json`,
  );

  if (!refresh) {
    try {
      const [html, preloads] = await Promise.all([readFile(htmlPath, "utf8"), readJson(preloadsPath)]);
      return { html, preloads, fromCache: true };
    } catch {
      // Cache miss, fetch below.
    }
  }

  const html = await fetchText(edition.source_url);
  const preloads = extractAllAppPreloads(html);
  await ensureDir(path.dirname(htmlPath));
  await ensureDir(path.dirname(preloadsPath));
  await writeFile(htmlPath, html, "utf8");
  await writeJson(preloadsPath, preloads);

  return { html, preloads, fromCache: false };
}

function normalizeDateLabel(roundsByNumber, roundNumber) {
  return roundsByNumber.get(roundNumber)?.bezeichnung ?? null;
}

function buildGameRow({ edition, payloadId, entry, entryKind, roundsByNumber }) {
  const matchUrl = pickMatchUrl(entry);
  const parsedMatchId = parseMatchIdFromUrl(matchUrl);
  const fallbackSourceId = `synthetic:${edition.source_id}:${hashText(
    [
      entry.runde,
      entry.anstoss,
      entry.heimMannschaft,
      entry.gastMannschaft,
      entryKind,
    ].join("|"),
  )}`;
  const sourceId = parsedMatchId ?? fallbackSourceId;
  const { homeGoals, awayGoals } = parseGoals(entry);

  return {
    id: oefbId("spiel", sourceId),
    source_system: "oefb",
    source_id: sourceId,
    bewerb_edition_id: edition.id,
    saison_id: edition.saison_id,
    round_number: entry.runde ?? null,
    round_label: normalizeDateLabel(roundsByNumber, entry.runde ?? null),
    source_url: matchUrl,
    kickoff_at: entry.anstoss ? new Date(entry.anstoss).toISOString() : null,
    status: entry.status ?? null,
    finished: inferFinished(entryKind, entry),
    cancelled: inferCancelled(entry),
    live: Boolean(entry.live),
    home_team_id: null,
    away_team_id: null,
    home_team_name: entry.heimMannschaft,
    away_team_name: entry.gastMannschaft,
    venue_name: entry.spielortBezeichnung ?? entry.spielort ?? null,
    result_full: entry.ergebnis ?? null,
    result_halftime: entry.ergebnisHalbzeit ?? null,
    home_goals: homeGoals,
    away_goals: awayGoals,
    attendance: Number.isInteger(entry.zuschauer) ? entry.zuschauer : null,
    referee_name: entry.schiedsrichter || null,
    meta: {
      payload_id: payloadId,
      entry_kind: entryKind,
      bewerb: entry.bewerb ?? null,
      spielart: entry.spielart ?? null,
      spiel_type: entry.spielType ?? null,
      team_type: entry.teamType ?? null,
      action_text: entry.actionText ?? null,
      home_team_source_key: entry.heimMannschaftId ?? null,
      away_team_source_key: entry.gastMannschaftId ?? null,
      home_team_url: entry.heimMannschaftUrl ?? null,
      away_team_url: entry.gastMannschaftUrl ?? null,
      home_team_logo: entry.heimMannschaftLogo ?? null,
      away_team_logo: entry.gastMannschaftLogo ?? null,
      venue_city: entry.spielortStadt ?? null,
      venue_country: entry.spielortLand ?? null,
      links: entry.links ?? [],
      raw_status: entry.status ?? null,
      synthetic_source_id: parsedMatchId == null,
    },
  };
}

function buildTableSnapshotRow({ snapshotId, row }) {
  return {
    id: oefbId("tabellen-snapshot-row", snapshotId, String(row.rang), slugify(row.mannschaft)),
    snapshot_id: snapshotId,
    rank: row.rang,
    team_id: null,
    team_name: row.mannschaft,
    team_short_name: row.mannschaftKurzbezeichnung || row.mannschaftKuerzel || null,
    source_team_url: row.mannschaftLink ?? null,
    played: row.spiele ?? null,
    wins: row.siege ?? null,
    draws: row.unentschieden ?? null,
    losses: row.niederlagen ?? null,
    goals_for: row.toreErzielt ?? null,
    goals_against: row.toreErhalten ?? null,
    goal_difference: row.tordifferenz ?? null,
    points: row.punkte ?? null,
    status_flags: {
      trend: row.tendenz ?? null,
      promoted: Boolean(row.aufstieg),
      promoted_playoff: Boolean(row.aufstiegRelegation),
      relegation_playoff: Boolean(row.abstiegRelegation),
      relegated: Boolean(row.abstieg),
      ranking_penalty: Boolean(row.rueckreihungPunktgleichheit),
      ranking_to_bottom: Boolean(row.rueckreihungTabellenende),
      withdrawn: Boolean(row.zurueckgezogen),
      penalty_stars: row.anzahlStrafsterne ?? 0,
      team_icon_public_uid: row.mannschaftIconPublicUid ?? null,
    },
    meta: {},
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

export async function buildCompetitionContentManifest(options = {}) {
  const config = {
    scope: options.scope ?? "current",
    limit: options.limit ?? null,
    refresh: options.refresh ?? false,
    concurrency: options.concurrency ?? 6,
    verbandSourceId: options.verbandSourceId ?? null,
    outputSuffix: options.outputSuffix ?? null,
    cacheScope: options.cacheScope ?? null,
  };

  const fileSuffix =
    config.outputSuffix ??
    (config.verbandSourceId ? "sfv" : config.scope === "all" ? "all" : "current");

  const cacheScope =
    config.cacheScope ?? (config.verbandSourceId ? "sfv" : config.scope);

  const discoveryManifest = await buildDiscoveryManifest();
  let editions = discoveryManifest.tables["core.bewerb_editionen"];
  if (config.scope === "current") {
    editions = editions.filter((edition) => edition.is_current);
  }
  if (config.verbandSourceId) {
    editions = editions.filter(
      (edition) => edition.meta?.verband_source_id === config.verbandSourceId,
    );
  }
  if (config.limit != null) {
    editions = editions.slice(0, config.limit);
  }

  const rawPayloads = [];
  const spieleMap = new Map();
  const snapshots = [];
  const snapshotRows = [];
  const errors = [];
  const stats = {
    fetched_pages: 0,
    cache_hits: 0,
    pages_with_table: 0,
    pages_with_playplan: 0,
  };

  const editionResults = await runPool(editions, config.concurrency, async (edition) => {
    try {
      const { preloads, fromCache } = await getCompetitionPageData(
        edition,
        cacheScope,
        config.refresh,
      );

      if (fromCache) {
        stats.cache_hits += 1;
      } else {
        stats.fetched_pages += 1;
      }

      const headerPreload = findHeaderPreload(preloads);
      const tablePreload = findTablePreload(preloads);
      const playplanPreload = findPlayplanPreload(preloads);

      return {
        edition,
        headerPreload,
        tablePreload,
        playplanPreload,
        preloads,
      };
    } catch (error) {
      errors.push({
        edition_id: edition.id,
        source_id: edition.source_id,
        source_url: edition.source_url,
        message: error.message,
      });
      return null;
    }
  });

  for (const result of editionResults.filter(Boolean)) {
    const { edition, headerPreload, tablePreload, playplanPreload } = result;
    const payloadId = oefbId("raw", "bewerb-page", edition.source_id);
    const extractedPayload = {
      source_id: edition.source_id,
      source_url: edition.source_url,
      header_preload_id: headerPreload?.preloadId ?? null,
      table_preload_id: tablePreload?.preloadId ?? null,
      playplan_preload_id: playplanPreload?.preloadId ?? null,
      header: headerPreload?.value?.[0] ?? null,
      table: tablePreload?.value?.[0] ?? null,
      playplan: playplanPreload?.value?.[0] ?? null,
    };

    rawPayloads.push({
      id: payloadId,
      source_system: "oefb",
      payload_kind: "bewerb_page_extract",
      source_url: edition.source_url,
      source_id: edition.source_id,
      payload_format: "json",
      payload_hash: hashText(JSON.stringify(extractedPayload)),
      payload_json: extractedPayload,
      meta: {
        scope: config.scope,
        cache_scope: cacheScope,
        edition_id: edition.id,
      },
    });

    if (tablePreload?.value?.[0]?.eintraege) {
      stats.pages_with_table += 1;
      const snapshotId = oefbId("tabellen-snapshot", edition.source_id, "overall");
      snapshots.push({
        id: snapshotId,
        bewerb_edition_id: edition.id,
        snapshot_kind: "overall",
        round_number: null,
        label: tablePreload.value[0].bewerbName ?? edition.title,
        source_url: edition.source_url,
        source_payload_id: payloadId,
        captured_at: new Date().toISOString(),
        meta: {
          preload_id: tablePreload.preloadId,
          hint_ranking_penalty: tablePreload.value[0].hintRueckreihungPunktgleichheit ?? null,
          hint_ranking_to_bottom: tablePreload.value[0].hintRueckreihungTabellenende ?? null,
          hint_team_withdrawal: tablePreload.value[0].hintMannschaftsrueckziehung ?? null,
          hint_free_text: tablePreload.value[0].hintFreitext ?? null,
          gruppen: tablePreload.value[0].gruppen ?? null,
          bewerb_kuerzel: tablePreload.value[0].bewerbKurzZeichen ?? null,
        },
      });

      for (const row of tablePreload.value[0].eintraege) {
        snapshotRows.push(buildTableSnapshotRow({ snapshotId, row }));
      }
    }

    if (playplanPreload?.value?.[0]) {
      stats.pages_with_playplan += 1;
      const roundsByNumber = new Map(
        (headerPreload?.value?.[0]?.runden ?? []).map((round) => [round.runde, round]),
      );
      for (const entryKind of ["ergebnisse", "spiele"]) {
        for (const entry of playplanPreload.value[0][entryKind] ?? []) {
          const gameRow = buildGameRow({
            edition,
            payloadId,
            entry,
            entryKind,
            roundsByNumber,
          });

          const existing = spieleMap.get(gameRow.id);
          if (!existing) {
            spieleMap.set(gameRow.id, gameRow);
            continue;
          }

          const preferCurrent =
            existing.finished === false && gameRow.finished === true ? gameRow : existing;
          spieleMap.set(gameRow.id, {
            ...preferCurrent,
            meta: {
              ...preferCurrent.meta,
              merged_from_duplicate: true,
            },
          });
        }
      }
    }
  }

  const manifest = {
    generated_at: new Date().toISOString(),
    scope: config.scope,
    file_suffix: fileSuffix,
    cache_scope: cacheScope,
    verband_source_id: config.verbandSourceId,
    summary: {
      editions_selected: editions.length,
      raw_payloads: rawPayloads.length,
      spiele: spieleMap.size,
      tabellen_snapshots: snapshots.length,
      tabellen_snapshot_rows: snapshotRows.length,
      errors: errors.length,
      ...stats,
    },
    tables: {
      "raw.payloads": sortById(rawPayloads),
      "core.spiele": sortById([...spieleMap.values()]),
      "core.tabellen_snapshots": sortById(snapshots),
      "core.tabellen_snapshot_rows": sortById(snapshotRows),
    },
    errors,
  };

  return manifest;
}

export async function writeCompetitionContentManifest(manifest) {
  await ensureDir(DERIVED_DIR);
  const suffix =
    manifest.file_suffix ?? (manifest.scope === "all" ? "all" : "current");
  const manifestPath = path.join(DERIVED_DIR, `competition-content-manifest.${suffix}.json`);
  const summaryPath = path.join(
    DERIVED_DIR,
    `competition-content-manifest.${suffix}.summary.json`,
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

export { parseArgs };
