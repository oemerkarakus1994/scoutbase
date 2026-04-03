import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ROOT_DIR, DERIVED_DIR } from "./discovery-manifest.mjs";
import { buildOefbImageUrl } from "./asset-targets.mjs";

const APP_DIR = path.join(ROOT_DIR, "data", "app");

function normalizeName(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function sortByName(rows, key = "name") {
  return [...rows].sort((left, right) =>
    String(left[key] ?? "").localeCompare(String(right[key] ?? ""), "de"),
  );
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

export function parseArgs(argv) {
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

function mapPhotoUrl(publicUid) {
  return publicUid ? buildOefbImageUrl(publicUid, "320x320") : null;
}

function mapMembershipStats(stats) {
  return {
    appearances: stats?.appearances ?? null,
    goals: stats?.goals ?? null,
    yellow_cards: stats?.yellow_cards ?? null,
    yellow_red_cards: stats?.yellow_red_cards ?? null,
    red_cards: stats?.red_cards ?? null,
    blue_cards: stats?.blue_cards ?? null,
  };
}

export async function buildAppSamples(options = {}) {
  const config = {
    scope: options.scope ?? "current",
  };
  const suffix = config.scope === "all" ? "all" : "current";

  const teamContentManifest = await readJson(
    path.join(DERIVED_DIR, `team-content-manifest.${suffix}.json`),
  );
  const profileContentManifest = await readJson(
    path.join(DERIVED_DIR, `profile-content-manifest.${suffix}.json`),
  );

  const clubs = new Map();
  for (const club of teamContentManifest.tables["core.vereine"] ?? []) {
    clubs.set(club.id, club);
  }
  for (const club of profileContentManifest.tables["core.vereine"] ?? []) {
    clubs.set(club.id, {
      ...(clubs.get(club.id) ?? {}),
      ...club,
    });
  }

  const teams = new Map((teamContentManifest.tables["core.teams"] ?? []).map((team) => [team.id, team]));
  const persons = new Map((teamContentManifest.tables["core.personen"] ?? []).map((person) => [person.id, person]));
  for (const person of profileContentManifest.tables["core.personen"] ?? []) {
    persons.set(person.id, {
      ...(persons.get(person.id) ?? {}),
      ...person,
      meta: {
        ...((persons.get(person.id) ?? {}).meta ?? {}),
        ...(person.meta ?? {}),
      },
    });
  }

  const rolesByPersonId = new Map();
  for (const role of teamContentManifest.tables["core.person_rollen"] ?? []) {
    const list = rolesByPersonId.get(role.person_id) ?? [];
    list.push(role);
    rolesByPersonId.set(role.person_id, list);
  }

  const membershipsByPersonId = new Map();
  const membershipsByTeamId = new Map();
  for (const membership of teamContentManifest.tables["core.team_memberships"] ?? []) {
    const byPerson = membershipsByPersonId.get(membership.person_id) ?? [];
    byPerson.push(membership);
    membershipsByPersonId.set(membership.person_id, byPerson);

    const byTeam = membershipsByTeamId.get(membership.team_id) ?? [];
    byTeam.push(membership);
    membershipsByTeamId.set(membership.team_id, byTeam);
  }

  const transfers = teamContentManifest.tables["core.transfers"] ?? [];
  const transfersByTeamId = new Map();
  for (const transfer of transfers) {
    const list = transfersByTeamId.get(transfer.team_id) ?? [];
    list.push(transfer);
    transfersByTeamId.set(transfer.team_id, list);
  }

  const stationenByPersonId = new Map();
  for (const station of profileContentManifest.tables["core.person_stationen"] ?? []) {
    const list = stationenByPersonId.get(station.person_id) ?? [];
    list.push(station);
    stationenByPersonId.set(station.person_id, list);
  }

  const achievementsByPersonId = new Map();
  for (const achievement of profileContentManifest.tables["core.person_achievements"] ?? []) {
    const list = achievementsByPersonId.get(achievement.person_id) ?? [];
    list.push(achievement);
    achievementsByPersonId.set(achievement.person_id, list);
  }

  const historyByPersonId = new Map();
  for (const historyItem of profileContentManifest.tables["core.person_team_history"] ?? []) {
    const list = historyByPersonId.get(historyItem.person_id) ?? [];
    list.push(historyItem);
    historyByPersonId.set(historyItem.person_id, list);
  }

  const statsByPersonId = new Map();
  for (const statItem of profileContentManifest.tables["core.person_statistiken"] ?? []) {
    const list = statsByPersonId.get(statItem.person_id) ?? [];
    list.push(statItem);
    statsByPersonId.set(statItem.person_id, list);
  }

  const playerIndex = [];
  for (const person of persons.values()) {
    const roles = rolesByPersonId.get(person.id) ?? [];
    const memberships = membershipsByPersonId.get(person.id) ?? [];
    if (!roles.some((role) => role.role_type === "spieler") && !memberships.some((m) => m.role_type === "player")) {
      continue;
    }

    const currentTeams = memberships
      .filter((membership) => membership.left_on == null)
      .map((membership) => {
        const team = teams.get(membership.team_id);
        const club = team ? clubs.get(team.verein_id) : null;
        return {
          team_id: team?.id ?? membership.team_id,
          team_name: team?.name ?? null,
          team_type: team?.team_type ?? null,
          verein_id: club?.id ?? null,
          verein_name: club?.name ?? null,
          saison_id: membership.saison_id,
          role_type: membership.role_type,
          role_label: membership.role_label,
          shirt_number: membership.shirt_number,
          position_label: membership.position_label,
          stats: mapMembershipStats(membership.stats),
        };
      });

    playerIndex.push({
      person_id: person.id,
      display_name: person.display_name,
      vorname: person.vorname,
      nachname: person.nachname,
      geburtsdatum: person.geburtsdatum,
      nationalitaet: person.nationalitaet,
      foto_public_uid: person.foto_public_uid,
      foto_url: mapPhotoUrl(person.foto_public_uid),
      rollen: [...new Set(roles.map((role) => role.role_type))],
      aktuelle_teams: currentTeams,
      station_count: (stationenByPersonId.get(person.id) ?? []).length,
      achievement_count: (achievementsByPersonId.get(person.id) ?? []).length,
      team_history_count: (historyByPersonId.get(person.id) ?? []).length,
    });
  }

  const clubIndex = [];
  for (const club of clubs.values()) {
    const clubTeams = [...teams.values()].filter((team) => team.verein_id === club.id);
    const clubMemberships = clubTeams.flatMap((team) => membershipsByTeamId.get(team.id) ?? []);
    clubIndex.push({
      verein_id: club.id,
      name: club.name,
      short_name: club.short_name,
      slug: club.slug,
      verband_id: club.verband_id,
      logo_public_uid: club.logo_public_uid,
      logo_url: mapPhotoUrl(club.logo_public_uid),
      source_url: club.source_url,
      team_count: clubTeams.length,
      reserve_team_count: clubTeams.filter((team) => Boolean(team.meta?.reserve_team)).length,
      player_count: new Set(
        clubMemberships.filter((membership) => membership.role_type === "player").map((membership) => membership.person_id),
      ).size,
      staff_count: new Set(
        clubMemberships
          .filter((membership) => ["trainer", "staff"].includes(membership.role_type))
          .map((membership) => membership.person_id),
      ).size,
    });
  }

  const teamIndex = [];
  for (const team of teams.values()) {
    const club = clubs.get(team.verein_id);
    const teamMemberships = membershipsByTeamId.get(team.id) ?? [];
    teamIndex.push({
      team_id: team.id,
      team_name: team.name,
      category_label: team.category_label,
      team_type: team.team_type,
      saison_id: team.saison_id,
      logo_public_uid: team.logo_public_uid,
      logo_url: mapPhotoUrl(team.logo_public_uid),
      source_url: team.source_url,
      reserve_team: Boolean(team.meta?.reserve_team),
      verein_id: club?.id ?? null,
      verein_name: club?.name ?? null,
      verband_id: club?.verband_id ?? null,
      kader_count: new Set(
        teamMemberships.filter((membership) => membership.role_type === "player").map((membership) => membership.person_id),
      ).size,
      staff_count: new Set(
        teamMemberships
          .filter((membership) => ["trainer", "staff"].includes(membership.role_type))
          .map((membership) => membership.person_id),
      ).size,
    });
  }

  const transferFeed = transfers.map((transfer) => {
    const person = persons.get(transfer.person_id);
    const team = teams.get(transfer.team_id);
    return {
      transfer_id: transfer.id,
      transfer_date: transfer.transfer_date,
      category_label: transfer.category_label,
      position_label: transfer.position_label,
      age: transfer.age,
      appearances: transfer.appearances,
      person_id: person?.id ?? transfer.person_id,
      display_name: person?.display_name ?? null,
      foto_public_uid: person?.foto_public_uid ?? null,
      foto_url: mapPhotoUrl(person?.foto_public_uid),
      team_id: team?.id ?? transfer.team_id,
      team_name: team?.name ?? null,
      from_verein_id: transfer.from_verein_id,
      from_verein_name: transfer.from_verein_name,
      to_verein_id: transfer.to_verein_id,
      to_verein_name: transfer.to_verein_name,
      source_profile_url: transfer.source_profile_url,
      source_person_url: transfer.source_person_url,
      direction: transfer.meta?.direction ?? null,
    };
  });

  const samplePlayer = playerIndex.find((player) => player.station_count > 0) ?? playerIndex[0] ?? null;
  const playerDetail = samplePlayer
    ? {
        person: samplePlayer,
        stationen: (stationenByPersonId.get(samplePlayer.person_id) ?? []).map((station) => ({
          ...station,
          logo_url: mapPhotoUrl(station.logo_public_uid),
        })),
        achievements: (achievementsByPersonId.get(samplePlayer.person_id) ?? []).map((achievement) => ({
          ...achievement,
          logo_url: mapPhotoUrl(achievement.logo_public_uid),
        })),
        team_history: historyByPersonId.get(samplePlayer.person_id) ?? [],
        statistiken: statsByPersonId.get(samplePlayer.person_id) ?? [],
      }
    : null;

  const sampleTeam =
    teamIndex.find((team) => team.kader_count > 0 && team.staff_count > 0) ??
    teamIndex.find((team) => team.kader_count > 0) ??
    teamIndex[0] ??
    null;
  const teamDetail = sampleTeam
    ? {
        team: sampleTeam,
        kader: (membershipsByTeamId.get(sampleTeam.team_id) ?? [])
          .filter((membership) => membership.role_type === "player")
          .map((membership) => {
            const person = persons.get(membership.person_id);
            return {
              person_id: membership.person_id,
              display_name: person?.display_name ?? null,
              foto_public_uid: person?.foto_public_uid ?? null,
              foto_url: mapPhotoUrl(person?.foto_public_uid),
              shirt_number: membership.shirt_number,
              position_label: membership.position_label,
              stats: mapMembershipStats(membership.stats),
            };
          }),
        staff: (membershipsByTeamId.get(sampleTeam.team_id) ?? [])
          .filter((membership) => ["trainer", "staff"].includes(membership.role_type))
          .map((membership) => {
            const person = persons.get(membership.person_id);
            return {
              person_id: membership.person_id,
              display_name: person?.display_name ?? null,
              foto_public_uid: person?.foto_public_uid ?? null,
              foto_url: mapPhotoUrl(person?.foto_public_uid),
              role_type: membership.role_type,
              role_label: membership.role_label,
              contact: membership.contact,
            };
          }),
        transfers: (transfersByTeamId.get(sampleTeam.team_id) ?? []).map((transfer) => ({
          ...transfer,
          person_name: persons.get(transfer.person_id)?.display_name ?? null,
        })),
      }
    : null;

  return {
    generated_at: new Date().toISOString(),
    scope: config.scope,
    summary: {
      player_index_rows: playerIndex.length,
      club_index_rows: clubIndex.length,
      team_index_rows: teamIndex.length,
      transfer_feed_rows: transferFeed.length,
      sample_player_id: playerDetail?.person?.person_id ?? null,
      sample_team_id: teamDetail?.team?.team_id ?? null,
    },
    outputs: {
      player_index: sortByName(playerIndex, "display_name"),
      club_index: sortByName(clubIndex, "name"),
      team_index: sortByName(teamIndex, "team_name"),
      transfer_feed: [...transferFeed].sort((left, right) =>
        String(right.transfer_date ?? "").localeCompare(String(left.transfer_date ?? ""), "de"),
      ),
      player_detail: playerDetail,
      team_detail: teamDetail,
    },
  };
}

export async function writeAppSamples(manifest) {
  const suffix = manifest.scope === "all" ? "all" : "current";
  const baseDir = path.join(APP_DIR, suffix);

  await writeJson(path.join(baseDir, "player-index.sample.json"), manifest.outputs.player_index);
  await writeJson(path.join(baseDir, "club-index.sample.json"), manifest.outputs.club_index);
  await writeJson(path.join(baseDir, "team-index.sample.json"), manifest.outputs.team_index);
  await writeJson(path.join(baseDir, "transfer-feed.sample.json"), manifest.outputs.transfer_feed);
  await writeJson(path.join(baseDir, "player-detail.sample.json"), manifest.outputs.player_detail);
  await writeJson(path.join(baseDir, "team-detail.sample.json"), manifest.outputs.team_detail);
  await writeJson(path.join(baseDir, "summary.json"), {
    generated_at: manifest.generated_at,
    scope: manifest.scope,
    summary: manifest.summary,
  });

  return {
    outputDir: baseDir,
    summaryPath: path.join(baseDir, "summary.json"),
  };
}
