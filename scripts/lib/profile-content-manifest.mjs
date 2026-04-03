import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ROOT_DIR, DERIVED_DIR } from "./discovery-manifest.mjs";

function oefbId(kind, ...parts) {
  return `oefb:${kind}:${parts.filter(Boolean).join(":")}`;
}

function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function sortById(rows) {
  return [...rows].sort((left, right) => left.id.localeCompare(right.id, "de"));
}

function hashText(value) {
  return createHash("sha1").update(value).digest("hex");
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
  };

  for (const arg of argv) {
    if (arg.startsWith("--scope=")) {
      options.scope = arg.split("=")[1];
    }
  }

  if (!["current", "all"].includes(options.scope)) {
    throw new Error(`Unsupported scope: ${options.scope}`);
  }

  return options;
}

function chooseFirst(...values) {
  return values.find((value) => value != null && value !== "") ?? null;
}

function normalizeName(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toDateOnly(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function parseSeasonLabelToId(value) {
  const match = String(value ?? "").match(/^(\d{4})\/(\d{2})$/);
  if (!match) {
    return null;
  }

  const jahr1 = Number.parseInt(match[1], 10);
  const jahr2 = Number.parseInt(`${String(jahr1).slice(0, 2)}${match[2]}`, 10);
  return oefbId("saison", `${jahr1}-${jahr2}`);
}

function parseClubSlug(url) {
  try {
    const parsed = new URL(String(url ?? ""));
    return parsed.pathname.split("/").filter(Boolean)[0] ?? null;
  } catch {
    return null;
  }
}

function normalizeClubUrl(url) {
  const clubSlug = parseClubSlug(url);
  return clubSlug ? `https://vereine.oefb.at/${clubSlug}/` : null;
}

function buildClubStub(club) {
  const clubSlug = parseClubSlug(club.url);
  const clubId = club.vereinId
    ? oefbId("verein", String(club.vereinId))
    : clubSlug
      ? oefbId("verein-url", slugify(clubSlug))
      : oefbId("verein-ref", hashText(normalizeName(club.verein)));

  const name = normalizeName(club.verein) || "Unbekannt";

  return {
    id: clubId,
    verband_id: null,
    source_system: "oefb",
    source_id: club.vereinId ? String(club.vereinId) : null,
    verein_nr: club.vereinId ? String(club.vereinId) : null,
    name,
    short_name: null,
    slug: clubSlug ? slugify(clubSlug) : null,
    source_url: normalizeClubUrl(club.url),
    homepage_url: normalizeClubUrl(club.url),
    logo_public_uid: club.logo ?? null,
    address_text: null,
    meta: {
      stub: true,
    },
  };
}

function mergeClub(existing, incoming) {
  if (!existing) {
    return {
      ...incoming,
      meta: {
        ...(incoming.meta ?? {}),
      },
    };
  }

  return {
    ...existing,
    source_id: chooseFirst(existing.source_id, incoming.source_id),
    verein_nr: chooseFirst(existing.verein_nr, incoming.verein_nr),
    name: chooseFirst(existing.name, incoming.name),
    slug: chooseFirst(existing.slug, incoming.slug),
    source_url: chooseFirst(existing.source_url, incoming.source_url),
    homepage_url: chooseFirst(existing.homepage_url, incoming.homepage_url),
    logo_public_uid: chooseFirst(existing.logo_public_uid, incoming.logo_public_uid),
    meta: {
      ...(existing.meta ?? {}),
      ...(incoming.meta ?? {}),
    },
  };
}

function addRawPayload(rawPayloads, extractPath, extract) {
  rawPayloads.push({
    id: oefbId("raw", "player-profile-extract", hashText(extractPath)),
    source_system: "oefb",
    payload_kind: "player_profile_extract",
    source_url: extract.resolved_public_url ?? extract.requested_url ?? null,
    source_id: extract.public_person_id ?? extract.legacy_profile_key ?? null,
    payload_format: "json",
    payload_hash: hashText(JSON.stringify(extract)),
    payload_json: null,
    meta: {
      person_id: extract.person_id,
      target_id: extract.target_id,
      relative_path: path.relative(ROOT_DIR, extractPath).split(path.sep).join("/"),
    },
  });
}

export async function buildProfileContentManifest(options = {}) {
  const config = {
    scope: options.scope ?? "current",
  };

  const suffix = config.scope === "all" ? "all" : "current";
  const teamContentManifest = await readJson(
    path.join(DERIVED_DIR, `team-content-manifest.${suffix}.json`),
  );
  const profileCollection = await readJson(
    path.join(DERIVED_DIR, `player-profile-collection.${suffix}.json`),
  );

  const clubsMap = new Map(
    (teamContentManifest.tables["core.vereine"] ?? []).map((club) => [club.id, club]),
  );
  const personsMap = new Map(
    (teamContentManifest.tables["core.personen"] ?? []).map((person) => [person.id, person]),
  );

  const rawPayloads = [];
  const updatedPersons = new Map();
  const stationenMap = new Map();
  const teamHistoryMap = new Map();
  const achievementsMap = new Map();
  const statistikenMap = new Map();

  for (const page of profileCollection.pages ?? []) {
    const extract = await readJson(page.extract_path);
    addRawPayload(rawPayloads, page.extract_path, extract);

    const existingPerson = personsMap.get(extract.person_id);
    if (!existingPerson) {
      continue;
    }

    const details = extract.details?.data ?? null;
    const teams = extract.teams?.data?.teams ?? [];
    const achievements = extract.achievements?.data?.erfolge ?? [];

    updatedPersons.set(extract.person_id, {
      ...existingPerson,
      display_name: chooseFirst(
        existingPerson.display_name,
        normalizeName(`${details?.vorname ?? ""} ${details?.nachname ?? ""}`),
      ),
      vorname: chooseFirst(existingPerson.vorname, details?.vorname ?? null),
      nachname: chooseFirst(existingPerson.nachname, details?.nachname ?? null),
      geburtsdatum: chooseFirst(existingPerson.geburtsdatum, toDateOnly(details?.geburtsdatum)),
      nationalitaet: chooseFirst(existingPerson.nationalitaet, details?.nationalitaet ?? null),
      foto_public_uid: chooseFirst(existingPerson.foto_public_uid, details?.foto ?? null),
      meta: {
        ...(existingPerson.meta ?? {}),
        public_profile_url: chooseFirst(
          existingPerson.meta?.public_profile_url,
          extract.resolved_public_url,
        ),
        legacy_profile_url: chooseFirst(
          existingPerson.meta?.legacy_profile_url,
          extract.requested_url?.includes("/spielerdetails/") ? extract.requested_url : null,
        ),
        role_types: extract.role_types ?? [],
        source_verein_id: details?.vereinId ? String(details.vereinId) : null,
        source_verein_url: details?.vereinUrl ?? null,
        source_verein_name: details?.verein ?? null,
        verbands_kuerzel: details?.verbandsKuerzel ?? null,
        nachwuchs: details?.nachwuchs ?? null,
        blue_cards: details?.blueCards ?? null,
        groesse: details?.groesse ?? null,
        gewicht: details?.gewicht ?? null,
      },
    });

    for (const club of details?.vereine ?? []) {
      const stub = buildClubStub({
        verein: club.verein,
        vereinId: club.vereinId ? String(club.vereinId) : null,
        url: club.url,
        logo: club.logo,
      });
      clubsMap.set(stub.id, mergeClub(clubsMap.get(stub.id), stub));

      const sourceItemKey = [
        club.vereinId ?? slugify(club.verein),
        toDateOnly(club.ab),
        club.landCode ?? "",
      ].join(":");

      stationenMap.set(oefbId("person-station", extract.person_id, hashText(sourceItemKey)), {
        id: oefbId("person-station", extract.person_id, hashText(sourceItemKey)),
        person_id: extract.person_id,
        verein_id: stub.id,
        source_system: "oefb",
        source_item_key: sourceItemKey,
        verein_name: normalizeName(club.verein),
        started_on: toDateOnly(club.ab),
        country_code: club.landCode ?? null,
        country_label: club.position ?? null,
        source_url: normalizeClubUrl(club.url),
        logo_public_uid: club.logo ?? null,
        meta: {},
      });
    }

    for (const team of teams) {
      const sourceItemKey = [
        team.publicUid ?? slugify(team.mannschaft),
        team.kategorie ?? "",
      ].join(":");

      teamHistoryMap.set(oefbId("person-team-history", extract.person_id, hashText(sourceItemKey)), {
        id: oefbId("person-team-history", extract.person_id, hashText(sourceItemKey)),
        person_id: extract.person_id,
        team_id: null,
        source_system: "oefb",
        source_item_key: sourceItemKey,
        team_name: normalizeName(team.mannschaft),
        category_label: team.kategorie ?? null,
        source_team_public_uid: team.publicUid ? String(team.publicUid) : null,
        meta: {},
      });
    }

    for (const achievement of achievements) {
      const stub = buildClubStub({
        verein: achievement.verein,
        vereinId: null,
        url: achievement.vereinHomepageUrl,
        logo: achievement.vereinsLogo,
      });
      clubsMap.set(stub.id, mergeClub(clubsMap.get(stub.id), stub));

      const sourceItemKey = [
        slugify(achievement.verein),
        achievement.saison ?? "",
        achievement.kategorie ?? "",
        achievement.ziel ?? "",
      ].join(":");

      achievementsMap.set(
        oefbId("person-achievement", extract.person_id, hashText(sourceItemKey)),
        {
          id: oefbId("person-achievement", extract.person_id, hashText(sourceItemKey)),
          person_id: extract.person_id,
          verein_id: stub.id,
          saison_id: parseSeasonLabelToId(achievement.saison),
          source_system: "oefb",
          source_item_key: sourceItemKey,
          verein_name: normalizeName(achievement.verein),
          category_label: achievement.kategorie ?? null,
          season_label: achievement.saison ?? null,
          achievement_text: achievement.ziel ?? null,
          source_url: normalizeClubUrl(achievement.vereinHomepageUrl),
          logo_public_uid: achievement.vereinsLogo ?? null,
          meta: {},
        },
      );
    }

    for (const statistik of details?.statistiken ?? []) {
      const sourceItemKey = [
        statistik.kategorie ?? "",
        statistik.bezeichnung ?? "",
      ].join(":");

      statistikenMap.set(
        oefbId("person-statistik", extract.person_id, hashText(sourceItemKey)),
        {
          id: oefbId("person-statistik", extract.person_id, hashText(sourceItemKey)),
          person_id: extract.person_id,
          source_system: "oefb",
          source_item_key: sourceItemKey,
          category_label: statistik.kategorie ?? null,
          label: statistik.bezeichnung ?? null,
          stats: {
            siege: statistik.siege ?? null,
            unentschieden: statistik.unentschieden ?? null,
            niederlagen: statistik.niederlagen ?? null,
            spiele: statistik.spiele ?? null,
            turnier_einsaetze: statistik.turnierEinsaetze ?? null,
            tore_pro_spiel: statistik.toreProSpiel ?? null,
            einsatzminuten: statistik.einsatzminuten ?? null,
            minuten_pro_spiel: statistik.minutenProSpiel ?? null,
            einwechslungen: statistik.einwechslungen ?? null,
            auswechslungen: statistik.auswechslungen ?? null,
            gelbe: statistik.gelbe ?? null,
            gelbrote: statistik.gelbrote ?? null,
            rote: statistik.rote ?? null,
            tore: statistik.tore ?? null,
            spiele_bewerb: statistik.spieleBewerb ?? null,
            einsatzminuten_bewerb: statistik.einsatzminutenBewerb ?? null,
            tore_bewerb: statistik.toreBewerb ?? null,
            spiele_freundschaft: statistik.spieleFreundschaft ?? null,
            einsatzminuten_freundschaft: statistik.einsatzminutenFreundschaft ?? null,
            tore_freundschaft: statistik.toreFreundschaft ?? null,
          },
          meta: {},
        },
      );
    }
  }

  return {
    generated_at: new Date().toISOString(),
    scope: config.scope,
    summary: {
      raw_payloads: rawPayloads.length,
      personen_updates: updatedPersons.size,
      person_stationen: stationenMap.size,
      person_team_history: teamHistoryMap.size,
      person_achievements: achievementsMap.size,
      person_statistiken: statistikenMap.size,
    },
    tables: {
      "raw.payloads": sortById(rawPayloads),
      "core.personen": sortById([...updatedPersons.values()]),
      "core.vereine": sortById([...clubsMap.values()]),
      "core.person_stationen": sortById([...stationenMap.values()]),
      "core.person_team_history": sortById([...teamHistoryMap.values()]),
      "core.person_achievements": sortById([...achievementsMap.values()]),
      "core.person_statistiken": sortById([...statistikenMap.values()]),
    },
  };
}

export async function writeProfileContentManifest(manifest) {
  await ensureDir(DERIVED_DIR);
  const suffix = manifest.scope === "all" ? "all" : "current";
  const manifestPath = path.join(DERIVED_DIR, `profile-content-manifest.${suffix}.json`);
  const summaryPath = path.join(DERIVED_DIR, `profile-content-manifest.${suffix}.summary.json`);

  await writeJson(manifestPath, manifest);
  await writeJson(summaryPath, {
    generated_at: manifest.generated_at,
    scope: manifest.scope,
    summary: manifest.summary,
  });

  return {
    manifestPath,
    summaryPath,
  };
}

export { parseArgs };
