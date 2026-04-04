import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  ROOT_DIR,
  DERIVED_DIR,
  buildDiscoveryManifest,
} from "./discovery-manifest.mjs";

const CLUBS_BASE_URL = "https://vereine.oefb.at";
const OEFB_BASE_URL = "https://www.oefb.at";

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

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeName(value) {
  return normalizeWhitespace(value);
}

function absolutizeUrl(value, baseUrl = OEFB_BASE_URL) {
  if (!value || value === "#") {
    return null;
  }

  try {
    return new URL(value, baseUrl).href;
  } catch {
    return null;
  }
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

function parsePublicPersonId(url) {
  const value = String(url ?? "");
  const match = value.match(/\/(?:Profile|bewerbe)\/(?:Spieler|Trainer)\/(\d+)/);
  return match?.[1] ?? null;
}

function parseLegacyProfileKey(url) {
  const value = String(url ?? "");
  const match = value.match(/\/spielerdetails\/\d+\/[^_]+_(\d+)~\d+\.htm/i);
  return match?.[1] ?? null;
}

function parseRoleFromPublicUrl(url) {
  const value = String(url ?? "");
  if (value.includes("/Trainer/")) {
    return "trainer";
  }
  return "spieler";
}

function parseClubSlug(url) {
  try {
    const parsed = new URL(url);
    const [slug] = parsed.pathname.split("/").filter(Boolean);
    return slug ?? null;
  } catch {
    return null;
  }
}

function normalizeClubUrl(url) {
  const clubSlug = parseClubSlug(url);
  return clubSlug ? `${CLUBS_BASE_URL}/${clubSlug}/` : null;
}

function chooseFirst(...values) {
  return values.find((value) => value != null && value !== "") ?? null;
}

function addRawPayload(rawPayloads, extractPath, extract) {
  rawPayloads.push({
    id: oefbId("raw", "team-page-extract", hashText(extractPath)),
    source_system: "oefb",
    payload_kind: "team_page_extract",
    source_url: extract.source_url ?? null,
    source_id: extract.source_id ?? null,
    payload_format: "json",
    payload_hash: hashText(JSON.stringify(extract)),
    payload_json: null,
    meta: {
      target_id: extract.target_id,
      page_type: extract.page_type,
      relative_path: path.relative(ROOT_DIR, extractPath).split(path.sep).join("/"),
    },
  });
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

  if (!["current", "all", "sfv"].includes(options.scope)) {
    throw new Error(`Unsupported scope: ${options.scope}`);
  }

  return options;
}

async function loadJsonOrBuild(filePath, builder) {
  try {
    return await readJson(filePath);
  } catch {
    return builder();
  }
}

function buildEditionVerbandMap(discoveryManifest) {
  const serienById = new Map(
    (discoveryManifest.tables["core.bewerb_serien"] ?? []).map((serie) => [serie.id, serie]),
  );

  return new Map(
    (discoveryManifest.tables["core.bewerb_editionen"] ?? []).map((edition) => [
      edition.id,
      serienById.get(edition.serie_id)?.verband_id ?? null,
    ]),
  );
}

function createClubResolver() {
  const clubSlugToId = new Map();
  const sourceIdToId = new Map();

  function register(row, aliases = {}) {
    if (row.source_id) {
      sourceIdToId.set(String(row.source_id), row.id);
    }
    if (aliases.clubSlug) {
      clubSlugToId.set(aliases.clubSlug, row.id);
    }
    if (row.slug) {
      clubSlugToId.set(row.slug, row.id);
    }
  }

  function resolveBySourceId(sourceId) {
    return sourceId ? sourceIdToId.get(String(sourceId)) ?? null : null;
  }

  function resolveBySlug(clubSlug) {
    return clubSlug ? clubSlugToId.get(slugify(clubSlug)) ?? null : null;
  }

  return {
    register,
    resolveBySourceId,
    resolveBySlug,
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
    verband_id: chooseFirst(existing.verband_id, incoming.verband_id),
    source_id: chooseFirst(existing.source_id, incoming.source_id),
    verein_nr: chooseFirst(existing.verein_nr, incoming.verein_nr),
    name: chooseFirst(existing.name, incoming.name),
    short_name: chooseFirst(existing.short_name, incoming.short_name),
    slug: chooseFirst(existing.slug, incoming.slug),
    source_url: chooseFirst(existing.source_url, incoming.source_url),
    homepage_url: chooseFirst(existing.homepage_url, incoming.homepage_url),
    logo_public_uid: chooseFirst(existing.logo_public_uid, incoming.logo_public_uid),
    address_text: chooseFirst(existing.address_text, incoming.address_text),
    meta: {
      ...(existing.meta ?? {}),
      ...(incoming.meta ?? {}),
    },
  };
}

function mergeTeam(existing, incoming) {
  if (!existing) {
    return {
      ...incoming,
      meta: {
        ...(incoming.meta ?? {}),
      },
    };
  }

  const competitionEditionIds = new Set([
    ...(existing.meta?.competition_edition_ids ?? []),
    ...(incoming.meta?.competition_edition_ids ?? []),
  ]);

  return {
    ...existing,
    verein_id: chooseFirst(existing.verein_id, incoming.verein_id),
    saison_id: chooseFirst(existing.saison_id, incoming.saison_id),
    source_id: chooseFirst(existing.source_id, incoming.source_id),
    name: chooseFirst(existing.name, incoming.name),
    category_label: chooseFirst(existing.category_label, incoming.category_label),
    team_type: chooseFirst(existing.team_type, incoming.team_type),
    source_url: chooseFirst(existing.source_url, incoming.source_url),
    logo_public_uid: chooseFirst(existing.logo_public_uid, incoming.logo_public_uid),
    meta: {
      ...(existing.meta ?? {}),
      ...(incoming.meta ?? {}),
      competition_edition_ids: [...competitionEditionIds].sort((left, right) =>
        left.localeCompare(right, "de"),
      ),
    },
  };
}

function selectCanonicalPersonId(aliasKeys) {
  const preferred = aliasKeys.find((key) => key.startsWith("public:"));
  if (preferred) {
    return oefbId("person", preferred.replace(":", "-"));
  }

  const legacy = aliasKeys.find((key) => key.startsWith("legacy:"));
  if (legacy) {
    return oefbId("person", legacy.replace(":", "-"));
  }

  const photo = aliasKeys.find((key) => key.startsWith("photo:"));
  if (photo) {
    return oefbId("person", photo.replace(":", "-"));
  }

  return oefbId("person", hashText(aliasKeys[0]));
}

function createPersonStore() {
  const persons = new Map();
  const aliasToPersonId = new Map();

  function ensure(entity) {
    const aliasKeys = entity.aliasKeys.filter(Boolean);
    let personId = null;

    for (const aliasKey of aliasKeys) {
      const existingId = aliasToPersonId.get(aliasKey);
      if (existingId) {
        personId = existingId;
        break;
      }
    }

    if (!personId) {
      personId = selectCanonicalPersonId(aliasKeys);
    }

    const existing = persons.get(personId);
    const mergedAliases = new Set([...(existing?.meta?.alias_keys ?? []), ...aliasKeys]);

    const merged = {
      id: personId,
      source_system: "oefb",
      source_person_id: chooseFirst(existing?.source_person_id, entity.source_person_id),
      display_name: chooseFirst(existing?.display_name, entity.display_name),
      vorname: chooseFirst(existing?.vorname, entity.vorname),
      nachname: chooseFirst(existing?.nachname, entity.nachname),
      geburtsdatum: chooseFirst(existing?.geburtsdatum, entity.geburtsdatum),
      nationalitaet: chooseFirst(existing?.nationalitaet, entity.nationalitaet),
      foto_public_uid: chooseFirst(existing?.foto_public_uid, entity.foto_public_uid),
      meta: {
        ...(existing?.meta ?? {}),
        ...(entity.meta ?? {}),
        public_profile_url: chooseFirst(
          existing?.meta?.public_profile_url,
          entity.meta?.public_profile_url,
        ),
        legacy_profile_url: chooseFirst(
          existing?.meta?.legacy_profile_url,
          entity.meta?.legacy_profile_url,
        ),
        alias_keys: [...mergedAliases].sort((left, right) => left.localeCompare(right, "de")),
      },
    };

    persons.set(personId, merged);
    for (const aliasKey of aliasKeys) {
      aliasToPersonId.set(aliasKey, personId);
    }

    return merged;
  }

  function values() {
    return [...persons.values()];
  }

  return {
    ensure,
    values,
  };
}

function buildPersonEntity({
  displayName,
  legacyProfileUrl,
  publicProfileUrl,
  photoId,
  birthDate,
  nationality,
  teamId,
  scopeKey,
}) {
  const normalizedName = normalizeName(displayName);
  const legacyUrl = absolutizeUrl(legacyProfileUrl, OEFB_BASE_URL);
  const publicUrl = absolutizeUrl(publicProfileUrl, OEFB_BASE_URL);
  const publicPersonId = parsePublicPersonId(publicUrl);
  const legacyPersonKey = parseLegacyProfileKey(legacyUrl);

  const aliasKeys = [];
  if (publicPersonId) {
    aliasKeys.push(`public:${publicPersonId}`);
  }
  if (legacyPersonKey) {
    aliasKeys.push(`legacy:${legacyPersonKey}`);
  }
  if (photoId) {
    aliasKeys.push(`photo:${photoId}`);
  }
  aliasKeys.push(`scoped:${teamId}:${scopeKey}:${slugify(normalizedName)}`);

  const [vorname, ...rest] = normalizedName.split(" ");
  const nachname = rest.length > 0 ? rest.join(" ") : null;

  return {
    source_person_id: chooseFirst(publicPersonId, legacyPersonKey),
    display_name: normalizedName,
    vorname: vorname || normalizedName,
    nachname,
    geburtsdatum: birthDate ?? null,
    nationalitaet: nationality ?? null,
    foto_public_uid: photoId ?? null,
    aliasKeys,
    meta: {
      public_profile_url: publicUrl,
      legacy_profile_url: legacyUrl,
    },
  };
}

function makeRoleId(personId, roleType, sourceRoleId, sourceUrl) {
  if (sourceRoleId) {
    return oefbId("person-rolle", personId, roleType, sourceRoleId);
  }

  return oefbId("person-rolle", personId, roleType, hashText(String(sourceUrl ?? roleType)));
}

function createMembershipId(teamId, roleType, sourceItemKey) {
  return oefbId("team-membership", teamId, roleType, sourceItemKey);
}

function createTransferId(teamId, sourceKey) {
  return oefbId("transfer", teamId, hashText(sourceKey));
}

function inferVerbandId(target, editionVerbandMap) {
  const candidateIds = (target.competition_edition_ids ?? [])
    .map((editionId) => editionVerbandMap.get(editionId))
    .filter(Boolean);

  return candidateIds[0] ?? null;
}

function inferTeamSourceId(target, extractsByType) {
  return (
    target.source_id ??
    extractsByType.transfers?.specific?.data?.mannschaftId ??
    extractsByType.schedule?.specific?.data?.mannschaftId ??
    null
  );
}

function inferTeamName(target, extractsByType) {
  return (
    extractsByType.transfers?.specific?.data?.mannschaft ??
    target.canonical_team_name ??
    normalizeName(target.team_segment)
  );
}

function inferTeamLogo(target, extractsByType) {
  return (
    extractsByType.transfers?.specific?.data?.mannschaftLogoId ??
    extractsByType.kader?.club?.data?.logo ??
    target.logo_public_uids?.[0] ??
    null
  );
}

function buildClubRow(target, extractsByType, editionVerbandMap) {
  const proxyVereinId =
    extractsByType.kader?.proxy_verein_id ??
    extractsByType.staff?.proxy_verein_id ??
    extractsByType.transfers?.proxy_verein_id ??
    extractsByType.schedule?.proxy_verein_id ??
    null;
  const clubName =
    extractsByType.kader?.club?.data?.name ??
    extractsByType.staff?.club?.data?.name ??
    extractsByType.transfers?.club?.data?.name ??
    extractsByType.schedule?.club?.data?.name ??
    normalizeName(target.club_slug);
  const clubSlug = slugify(target.club_slug);

  return {
    row: {
      id: proxyVereinId ? oefbId("verein", proxyVereinId) : oefbId("verein-url", clubSlug),
      verband_id: inferVerbandId(target, editionVerbandMap),
      source_system: "oefb",
      source_id: proxyVereinId,
      verein_nr: proxyVereinId,
      name: clubName,
      short_name: null,
      slug: clubSlug,
      source_url: normalizeClubUrl(target.club_home_url) ?? target.club_home_url,
      homepage_url: normalizeClubUrl(target.club_home_url) ?? target.club_home_url,
      logo_public_uid:
        extractsByType.kader?.club?.data?.logo ??
        extractsByType.staff?.club?.data?.logo ??
        target.logo_public_uids?.[0] ??
        null,
      address_text: null,
      meta: {
        club_slug: target.club_slug,
        club_news_url: target.club_news_url,
        club_functionaries_url: target.club_functionaries_url,
        club_trainers_url: target.club_trainers_url,
      },
    },
    sourceId: proxyVereinId,
    clubSlug,
  };
}

function buildTeamRow(target, clubId, extractsByType) {
  const teamSourceId = inferTeamSourceId(target, extractsByType);
  return {
    id: teamSourceId ? oefbId("team", teamSourceId) : oefbId("team-url", target.file_key),
    verein_id: clubId,
    saison_id: target.saison_id,
    source_system: "oefb",
    source_id: teamSourceId,
    name: inferTeamName(target, extractsByType),
    category_label:
      extractsByType.kader?.specific?.data?.bezeichnung ??
      extractsByType.schedule?.specific?.data?.bezeichnung ??
      target.team_segment,
    team_type: target.team_type ?? target.team_segment,
    source_url: target.page_urls.kader,
    logo_public_uid: inferTeamLogo(target, extractsByType),
    meta: {
      reserve_team: Boolean(target.reserve_team),
      aliases: target.aliases ?? [],
      page_urls: target.page_urls,
      competition_edition_ids: target.competition_edition_ids ?? [],
      source_target_id: target.id,
    },
  };
}

function buildClubStubRow({ clubId, clubSlug, clubName, clubUrl, logoPublicUid }) {
  return {
    id: clubId,
    verband_id: null,
    source_system: "oefb",
    source_id: null,
    verein_nr: null,
    name: normalizeName(clubName),
    short_name: null,
    slug: clubSlug ? slugify(clubSlug) : null,
    source_url: clubUrl ?? null,
    homepage_url: clubUrl ?? null,
    logo_public_uid: logoPublicUid ?? null,
    address_text: null,
    meta: {
      stub: true,
    },
  };
}

function ensureTransferClub({ name, url, logo, clubsMap, clubResolver }) {
  const normalizedUrl = normalizeClubUrl(url);
  const clubSlug = parseClubSlug(normalizedUrl);
  const resolvedId = clubResolver.resolveBySlug(clubSlug);
  if (resolvedId) {
    return resolvedId;
  }

  const clubId = clubSlug
    ? oefbId("verein-url", slugify(clubSlug))
    : oefbId("verein-ref", hashText(normalizeName(name)));

  const existing = clubsMap.get(clubId);
  clubsMap.set(
    clubId,
    mergeClub(
      existing,
      buildClubStubRow({
        clubId,
        clubSlug,
        clubName: name,
        clubUrl: normalizedUrl,
        logoPublicUid: logo,
      }),
    ),
  );

  if (clubSlug) {
    clubResolver.register(clubsMap.get(clubId), { clubSlug: slugify(clubSlug) });
  }

  return clubId;
}

export async function buildTeamContentManifest(options = {}) {
  const config = {
    scope: options.scope ?? "current",
  };

  const suffix =
    config.scope === "all" ? "all" : config.scope === "current" ? "current" : config.scope;
  const discoveryManifestPath = path.join(DERIVED_DIR, "discovery-manifest.json");
  const targetsManifestPath = path.join(DERIVED_DIR, `team-targets.${suffix}.json`);
  const collectionManifestPath = path.join(DERIVED_DIR, `team-page-collection.${suffix}.json`);

  const discoveryManifest = await loadJsonOrBuild(discoveryManifestPath, () => buildDiscoveryManifest());
  const targetsManifest = await readJson(targetsManifestPath);
  const collectionManifest = await readJson(collectionManifestPath);

  const editionVerbandMap = buildEditionVerbandMap(discoveryManifest);
  const pageEntries = collectionManifest.pages ?? [];
  const targets = targetsManifest.targets ?? [];

  const pagesByTargetId = new Map();
  for (const pageEntry of pageEntries) {
    const targetPages = pagesByTargetId.get(pageEntry.target_id) ?? {};
    targetPages[pageEntry.page_type] = pageEntry;
    pagesByTargetId.set(pageEntry.target_id, targetPages);
  }

  const rawPayloads = [];
  const clubsMap = new Map();
  const teamsMap = new Map();
  const personStore = createPersonStore();
  const rolesMap = new Map();
  const membershipsMap = new Map();
  const transfersMap = new Map();
  const clubResolver = createClubResolver();
  const teamByTargetId = new Map();
  const errors = [];

  for (const target of targets) {
    const pageInfoByType = pagesByTargetId.get(target.id) ?? {};
    const extractsByType = {};

    for (const type of ["kader", "staff", "transfers", "schedule"]) {
      const pageInfo = pageInfoByType[type];
      if (!pageInfo?.extract_path) {
        continue;
      }

      try {
        const extract = await readJson(pageInfo.extract_path);
        extractsByType[type] = extract;
        addRawPayload(rawPayloads, pageInfo.extract_path, extract);
      } catch (error) {
        errors.push({
          target_id: target.id,
          page_type: type,
          extract_path: pageInfo.extract_path,
          message: error.message,
        });
      }
    }

    if (Object.keys(extractsByType).length === 0) {
      continue;
    }

    const clubDescriptor = buildClubRow(target, extractsByType, editionVerbandMap);
    const mergedClub = mergeClub(clubsMap.get(clubDescriptor.row.id), clubDescriptor.row);
    clubsMap.set(clubDescriptor.row.id, mergedClub);
    clubResolver.register(mergedClub, {
      clubSlug: clubDescriptor.clubSlug,
    });

    const teamRow = buildTeamRow(target, mergedClub.id, extractsByType);
    const mergedTeam = mergeTeam(teamsMap.get(teamRow.id), teamRow);
    teamsMap.set(teamRow.id, mergedTeam);
    teamByTargetId.set(target.id, mergedTeam);

    const kaderEntries = extractsByType.kader?.specific?.data?.kader ?? [];
    for (const player of kaderEntries) {
      const person = personStore.ensure(
        buildPersonEntity({
          displayName: player.spielerName,
          legacyProfileUrl: player.spielerProfilUrl,
          publicProfileUrl: null,
          photoId: player.spielerFotoId,
          birthDate: null,
          nationality: null,
          teamId: mergedTeam.id,
          scopeKey: "kader",
        }),
      );

      const roleSourceId =
        parsePublicPersonId(person.meta?.public_profile_url) ??
        parseLegacyProfileKey(person.meta?.legacy_profile_url) ??
        null;
      const roleId = makeRoleId(
        person.id,
        "spieler",
        roleSourceId,
        person.meta?.public_profile_url ?? person.meta?.legacy_profile_url,
      );
      rolesMap.set(roleId, {
        id: roleId,
        person_id: person.id,
        source_system: "oefb",
        role_type: "spieler",
        source_role_id: roleSourceId,
        primary_source_url: person.meta?.public_profile_url ?? person.meta?.legacy_profile_url ?? null,
        meta: {},
      });

      const sourceItemKey = chooseFirst(
        roleSourceId ? `source:${roleSourceId}` : null,
        player.spielerFotoId ? `photo:${player.spielerFotoId}` : null,
        `name:${slugify(player.spielerName)}`,
      );
      const membershipId = createMembershipId(mergedTeam.id, "player", sourceItemKey);

      membershipsMap.set(membershipId, {
        id: membershipId,
        team_id: mergedTeam.id,
        saison_id: mergedTeam.saison_id,
        person_id: person.id,
        role_type: "player",
        role_label: "Spieler",
        source_item_key: sourceItemKey,
        source_profile_url:
          person.meta?.public_profile_url ?? person.meta?.legacy_profile_url ?? null,
        shirt_number: normalizeWhitespace(player.rueckenNummer) || null,
        position_label: normalizeWhitespace(player.position) || null,
        joined_on: null,
        left_on: null,
        stats: {
          appearances: player.einsaetze ?? null,
          goals: player.tore ?? null,
          yellow_cards: player.kartenGelb ?? null,
          yellow_red_cards: player.kartenGelbRot ?? null,
          red_cards: player.kartenRot ?? null,
          blue_cards: Boolean(player.blueCards),
          /** ÖFB Profil / erweiterte Kader-Daten (optional) */
          minutes:
            player.einsatzminuten ?? player.minuten ?? player.einsatzMinuten ?? null,
          minutes_per_game:
            player.minutenProSpiel ??
            player.minuten_pro_spiel ??
            player.durchschnittlicheSpielzeit ??
            null,
        },
        contact: {},
        meta: {},
      });
    }

    const trainerEntries = extractsByType.staff?.specific?.data?.trainer ?? [];
    const betreuerEntries = extractsByType.staff?.specific?.data?.betreuer ?? [];

    for (const staffMember of [
      ...trainerEntries.map((entry) => ({ ...entry, membershipRoleType: "trainer" })),
      ...betreuerEntries.map((entry) => ({ ...entry, membershipRoleType: "staff" })),
    ]) {
      const person = personStore.ensure(
        buildPersonEntity({
          displayName: staffMember.name,
          legacyProfileUrl: null,
          publicProfileUrl: null,
          photoId: staffMember.fotoId,
          birthDate: null,
          nationality: null,
          teamId: mergedTeam.id,
          scopeKey: staffMember.membershipRoleType,
        }),
      );

      const roleId = makeRoleId(person.id, staffMember.membershipRoleType, null, mergedTeam.source_url);
      rolesMap.set(roleId, {
        id: roleId,
        person_id: person.id,
        source_system: "oefb",
        role_type: staffMember.membershipRoleType,
        source_role_id: null,
        primary_source_url: mergedTeam.source_url,
        meta: {},
      });

      const sourceItemKey = chooseFirst(
        staffMember.fotoId ? `photo:${staffMember.fotoId}` : null,
        `name:${slugify(staffMember.name)}:${slugify(staffMember.funktion)}`,
      );
      const membershipId = createMembershipId(
        mergedTeam.id,
        staffMember.membershipRoleType,
        sourceItemKey,
      );

      membershipsMap.set(membershipId, {
        id: membershipId,
        team_id: mergedTeam.id,
        saison_id: mergedTeam.saison_id,
        person_id: person.id,
        role_type: staffMember.membershipRoleType,
        role_label: normalizeWhitespace(staffMember.funktion) || null,
        source_item_key: sourceItemKey,
        source_profile_url: null,
        shirt_number: null,
        position_label: null,
        joined_on: toDateOnly(staffMember.funktionSeit),
        left_on: null,
        stats: {},
        contact: {
          telefon: normalizeWhitespace(staffMember.telefon) || null,
          mobil: normalizeWhitespace(staffMember.mobil) || null,
          email: normalizeWhitespace(staffMember.email) || null,
        },
        meta: {},
      });
    }

    const transferPayload = extractsByType.transfers?.specific?.data;
    for (const [direction, transferEntries] of [
      ["incoming", transferPayload?.zugaenge ?? []],
      ["outgoing", transferPayload?.abgaenge ?? []],
    ]) {
      for (const transfer of transferEntries) {
        const person = personStore.ensure(
          buildPersonEntity({
            displayName: transfer.spielername,
            legacyProfileUrl: transfer.spielerprofilUrl,
            publicProfileUrl: transfer.spielerUrl,
            photoId: transfer.spielerfoto,
            birthDate: null,
            nationality: null,
            teamId: mergedTeam.id,
            scopeKey: `transfer-${direction}`,
          }),
        );

        const roleType = parseRoleFromPublicUrl(person.meta?.public_profile_url);
        const roleSourceId =
          parsePublicPersonId(person.meta?.public_profile_url) ??
          parseLegacyProfileKey(person.meta?.legacy_profile_url) ??
          null;
        const roleId = makeRoleId(
          person.id,
          roleType,
          roleSourceId,
          person.meta?.public_profile_url ?? person.meta?.legacy_profile_url,
        );
        rolesMap.set(roleId, {
          id: roleId,
          person_id: person.id,
          source_system: "oefb",
          role_type: roleType,
          source_role_id: roleSourceId,
          primary_source_url: person.meta?.public_profile_url ?? person.meta?.legacy_profile_url ?? null,
          meta: {},
        });

        const fromVereinId = ensureTransferClub({
          name: transfer.vereinAltName,
          url: transfer.vereinAltUrl,
          logo: transfer.vereinAltLogo,
          clubsMap,
          clubResolver,
        });
        const toVereinId = ensureTransferClub({
          name: transfer.vereinNeuName,
          url: transfer.vereinNeuUrl,
          logo: transfer.vereinNeuLogo,
          clubsMap,
          clubResolver,
        });

        const sourceKey = [
          mergedTeam.id,
          direction,
          person.id,
          toDateOnly(transfer.transferDatum),
          normalizeName(transfer.vereinAltName),
          normalizeName(transfer.vereinNeuName),
        ].join("|");

        const transferId = createTransferId(mergedTeam.id, sourceKey);
        transfersMap.set(transferId, {
          id: transferId,
          source_system: "oefb",
          source_key: sourceKey,
          team_id: mergedTeam.id,
          person_id: person.id,
          from_verein_id: fromVereinId,
          to_verein_id: toVereinId,
          from_verein_name: normalizeName(transfer.vereinAltName) || null,
          to_verein_name: normalizeName(transfer.vereinNeuName) || null,
          transfer_date: toDateOnly(transfer.transferDatum),
          age: Number.isInteger(transfer.alter) ? transfer.alter : null,
          category_label: normalizeWhitespace(transfer.kategorie) || null,
          position_label: normalizeWhitespace(transfer.position) || null,
          appearances: Number.isInteger(transfer.einsaetze) ? transfer.einsaetze : null,
          source_profile_url: person.meta?.legacy_profile_url ?? null,
          source_person_url: person.meta?.public_profile_url ?? null,
          meta: {
            direction,
            current_team_name: mergedTeam.name,
            from_verein_logo: transfer.vereinAltLogo ?? null,
            to_verein_logo: transfer.vereinNeuLogo ?? null,
          },
        });
      }
    }
  }

  const clubs = sortById([...clubsMap.values()]);
  const teams = sortById([...teamsMap.values()]);
  const personen = sortById(personStore.values());
  const personRollen = sortById([...rolesMap.values()]);
  const memberships = sortById([...membershipsMap.values()]);
  const transfers = sortById([...transfersMap.values()]);

  const manifest = {
    generated_at: new Date().toISOString(),
    scope: config.scope,
    summary: {
      raw_payloads: rawPayloads.length,
      vereine: clubs.length,
      teams: teams.length,
      personen: personen.length,
      person_rollen: personRollen.length,
      team_memberships: memberships.length,
      transfers: transfers.length,
      errors: errors.length,
    },
    tables: {
      "raw.payloads": sortById(rawPayloads),
      "core.vereine": clubs,
      "core.teams": teams,
      "core.personen": personen,
      "core.person_rollen": personRollen,
      "core.team_memberships": memberships,
      "core.transfers": transfers,
    },
    errors,
  };

  return manifest;
}

export async function writeTeamContentManifest(manifest) {
  await ensureDir(DERIVED_DIR);
  const suffix =
    manifest.scope === "all" ? "all" : manifest.scope === "current" ? "current" : manifest.scope;
  const manifestPath = path.join(DERIVED_DIR, `team-content-manifest.${suffix}.json`);
  const summaryPath = path.join(DERIVED_DIR, `team-content-manifest.${suffix}.summary.json`);

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
