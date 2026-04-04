/**
 * Liest KM/Res-Kader-Extracts unter
 *   data/raw/team-pages/sfv/kader/extracts/
 *   data/raw/team-pages/sfv-5y/kader/extracts/ (nach collect:team-pages:sfv-5y)
 * und erzeugt Updates für team_memberships.stats.seasons (Meisterschaft, kein Cup-Split).
 *
 * Voraussetzung: data/derived/team-content-manifest.sfv.json (Personen mit legacy_profile_url).
 *
 * Nutzung:
 *   node scripts/merge-kader-season-stats-from-extracts.mjs
 *
 * Optional: SCOUTBASE_TOP_LEVEL_IMPORT_SEASON=2025/26 — diese Saison wird
 * übersprungen (liegt schon in team_memberships.stats ohne stats.seasons).
 *
 * Ausgabe: data/derived/membership-season-stats-patch.json
 * Anwenden: z. B. mit Supabase-Client oder SQL jsonb_set (manuell prüfen).
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ROOT_DIR } from "./lib/discovery-manifest.mjs";

const KADER_DIRS = [
  path.join(ROOT_DIR, "data/raw/team-pages/sfv/kader/extracts"),
  path.join(ROOT_DIR, "data/raw/team-pages/sfv-5y/kader/extracts"),
];
const MANIFEST_PATH = path.join(
  ROOT_DIR,
  "data/derived/team-content-manifest.sfv.json",
);
const OUT_PATH = path.join(
  ROOT_DIR,
  "data/derived/membership-season-stats-patch.json",
);

const OEFB_BASE = "https://www.oefb.at";

/** Liegt bereits als Top-Level-Stats im Import; nicht nochmal unter stats.seasons legen. */
const TOP_LEVEL_IMPORT_SEASON =
  process.env.SCOUTBASE_TOP_LEVEL_IMPORT_SEASON?.trim() ?? "2025/26";

function absolutizeUrl(value) {
  if (!value || value === "#") {
    return null;
  }
  try {
    return new URL(value, OEFB_BASE).href;
  } catch {
    return null;
  }
}

/** `saison-2024-25` → `2024/25` */
function seasonLabelFromFilenamePart(y1, y2) {
  return `${y1}/${String(y2).padStart(2, "0")}`;
}

function statsFromKaderPlayer(player) {
  return {
    appearances: player.einsaetze ?? null,
    goals: player.tore ?? null,
    yellow_cards: player.kartenGelb ?? null,
    yellow_red_cards: player.kartenGelbRot ?? null,
    red_cards: player.kartenRot ?? null,
    blue_cards: Boolean(player.blueCards),
    minutes:
      player.einsatzminuten ?? player.minuten ?? player.einsatzMinuten ?? null,
    minutes_per_game:
      player.minutenProSpiel ??
      player.minuten_pro_spiel ??
      player.durchschnittlicheSpielzeit ??
      null,
  };
}

async function main() {
  const raw = await readFile(MANIFEST_PATH, "utf8");
  const manifest = JSON.parse(raw);
  const personen = manifest.tables["core.personen"] ?? [];
  const memberships = manifest.tables["core.team_memberships"] ?? [];

  const legacyUrlToPersonId = new Map();
  for (const p of personen) {
    const u = p.meta?.legacy_profile_url;
    if (typeof u === "string" && u.trim()) {
      const abs = absolutizeUrl(u);
      if (abs) {
        legacyUrlToPersonId.set(abs, p.id);
      }
    }
  }

  const memByTeamPerson = new Map();
  for (const m of memberships) {
    if (m.role_type !== "player") {
      continue;
    }
    memByTeamPerson.set(`${m.team_id}|${m.person_id}`, m);
  }

  /** @type {{ dir: string; name: string }[]} */
  const kaderFiles = [];
  const seen = new Set();
  for (const dir of KADER_DIRS) {
    let names = [];
    try {
      names = await readdir(dir);
    } catch {
      continue;
    }
    for (const f of names) {
      const lower = f.toLowerCase();
      if (!lower.endsWith(".json")) {
        continue;
      }
      if (!/__km\.json$/i.test(f) && !/__res\.json$/i.test(f)) {
        continue;
      }
      if (/\bu\d{1,2}/i.test(f) || /u\d{2}-[a-z]/i.test(f)) {
        continue;
      }
      const key = `${dir}/${f}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      kaderFiles.push({ dir, name: f });
    }
  }

  const re = /^.+__saison-(\d{4})-(\d{2})__(km|res)\.json$/i;

  /** @type {Map<string, { id: string, stats: object }>} */
  const byMembershipId = new Map();

  let filesRead = 0;
  let rowsApplied = 0;
  const unmatched = [];

  for (const { dir, name: fname } of kaderFiles) {
    const m = fname.match(re);
    if (!m) {
      continue;
    }
    const seasonLabel = seasonLabelFromFilenamePart(m[1], m[2]);
    const extractPath = path.join(dir, fname);
    const extract = JSON.parse(await readFile(extractPath, "utf8"));
    if (seasonLabel === TOP_LEVEL_IMPORT_SEASON) {
      continue;
    }
    const sourceId = extract.source_id;
    if (!sourceId) {
      continue;
    }
    const teamId = `oefb:team:${sourceId}`;
    const kader = extract.specific?.data?.kader ?? [];
    filesRead += 1;

    for (const player of kader) {
      const legacyUrl = absolutizeUrl(player.spielerProfilUrl);
      if (!legacyUrl) {
        continue;
      }
      const personId = legacyUrlToPersonId.get(legacyUrl);
      if (!personId) {
        unmatched.push({
          file: fname,
          teamId,
          person: player.spielerName,
          legacyUrl,
        });
        continue;
      }
      const mem = memByTeamPerson.get(`${teamId}|${personId}`);
      if (!mem) {
        unmatched.push({
          file: fname,
          teamId,
          personId,
          person: player.spielerName,
          reason: "no_membership",
        });
        continue;
      }
      const prev = byMembershipId.get(mem.id) ?? {
        id: mem.id,
        stats: { ...(mem.stats ?? {}) },
      };
      const seasons = { ...(prev.stats.seasons ?? {}) };
      seasons[seasonLabel] = statsFromKaderPlayer(player);
      prev.stats = { ...prev.stats, seasons };
      byMembershipId.set(mem.id, prev);
      rowsApplied += 1;
    }
  }

  const updates = [...byMembershipId.values()].sort((a, b) =>
    a.id.localeCompare(b.id, "de"),
  );

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(
    OUT_PATH,
    `${JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        source_kader_dirs: KADER_DIRS.map((d) => path.relative(ROOT_DIR, d)),
        files_matched_km_res: filesRead,
        membership_rows_touched: updates.length,
        stat_rows_written: rowsApplied,
        unmatched_sample: unmatched.slice(0, 80),
        unmatched_total: unmatched.length,
        updates,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(
    `Wrote ${updates.length} Mitgliedschaften (${rowsApplied} Saison-Zeilen), ${unmatched.length} nicht zugeordnet → ${path.relative(ROOT_DIR, OUT_PATH)}`,
  );
  if (filesRead === 0 && kaderFiles.length > 0) {
    console.log(
      `Hinweis: Alle Kader-Dateien sind Saison „${TOP_LEVEL_IMPORT_SEASON}“ — die wird übersprungen (Stats schon Top-Level). Für Einträge unter stats.seasons brauchst du Extracts mit anderer Saison im Dateinamen (z. B. …__saison-2024-25__km.json).`,
    );
  }
  if (kaderFiles.length === 0) {
    console.log(
      `Hinweis: Keine Kader-JSONs gefunden. Erwartet unter u. a. data/raw/team-pages/sfv/kader/extracts/ — für ältere Saisons: npm run collect:team-pages:sfv-5y`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
