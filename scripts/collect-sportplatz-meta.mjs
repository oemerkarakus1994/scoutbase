#!/usr/bin/env node
/**
 * Crawlt für SFV-Vereine die ÖFB-Seite …/Sportplatz/ und extrahiert Spielort-Daten
 * aus SG.container.appPreloads (Spielortinfos).
 *
 * Ausgabe: data/derived/sportplatz-meta.sfv.json
 *
 * Nutzung:
 *   node scripts/collect-sportplatz-meta.mjs
 *   node scripts/collect-sportplatz-meta.mjs --limit=20
 *   node scripts/collect-sportplatz-meta.mjs --slug=UskElsbethen
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fetchText } from "./lib/oefb-http.mjs";
import {
  buildVereinMetaFromSpielortRow,
  extractSpielortFromSportplatzHtml,
} from "./lib/sportplatz-extract.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CLUBS = "https://vereine.oefb.at";
const TARGETS_PATH = path.join(ROOT, "data", "derived", "team-targets.sfv.json");
const OUT_PATH = path.join(ROOT, "data", "derived", "sportplatz-meta.sfv.json");

function parseArgs(argv) {
  const opts = { limit: null, slug: null, concurrency: 3, delayMs: 400 };
  for (const arg of argv) {
    if (arg.startsWith("--limit=")) {
      opts.limit = Number.parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--slug=")) {
      opts.slug = arg.split("=")[1]?.trim() || null;
    } else if (arg.startsWith("--concurrency=")) {
      opts.concurrency = Number.parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--delay-ms=")) {
      opts.delayMs = Number.parseInt(arg.split("=")[1], 10);
    }
  }
  return opts;
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  let slugs = [];
  if (opts.slug) {
    slugs = [opts.slug];
  } else {
    const raw = JSON.parse(await readFile(TARGETS_PATH, "utf8"));
    const set = new Set();
    for (const t of raw.targets ?? []) {
      if (t.club_slug) {
        set.add(t.club_slug);
      }
    }
    slugs = [...set].sort((a, b) => a.localeCompare(b, "de"));
  }

  if (opts.limit != null && Number.isFinite(opts.limit) && opts.limit > 0) {
    slugs = slugs.slice(0, opts.limit);
  }

  const results = [];
  let ok = 0;
  let fail = 0;

  for (let i = 0; i < slugs.length; i += 1) {
    const clubSlug = slugs[i];
    const url = `${CLUBS}/${clubSlug}/Sportplatz/`;
    try {
      const html = await fetchText(url);
      const { row } = extractSpielortFromSportplatzHtml(html);
      if (!row) {
        results.push({
          club_slug: clubSlug,
          sportplatz_url: url,
          ok: false,
          error: "Kein Spielort-Preload (spielfelder) gefunden",
        });
        fail += 1;
      } else {
        const metaPatch = buildVereinMetaFromSpielortRow(row, url);
        results.push({
          club_slug: clubSlug,
          sportplatz_url: url,
          ok: true,
          meta_patch: metaPatch,
        });
        ok += 1;
      }
    } catch (e) {
      results.push({
        club_slug: clubSlug,
        sportplatz_url: url,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
      fail += 1;
    }
    if (opts.delayMs > 0 && i < slugs.length - 1) {
      await sleep(opts.delayMs);
    }
  }

  const out = {
    generated_at: new Date().toISOString(),
    source: "vereine.oefb.at/{slug}/Sportplatz/",
    summary: {
      total: results.length,
      ok,
      fail,
    },
    entries: results,
  };

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        output: OUT_PATH,
        summary: out.summary,
      },
      null,
      2,
    ),
  );
}

await main();
