import { readFile } from "node:fs/promises";
import path from "node:path";

import { DISCOVERY_DIR } from "./discovery-manifest.mjs";
import { SFV_VERBAND_ID } from "./sfv-constants.mjs";

const SFV_VERBAND_ROW_ID = `oefb:verband:${SFV_VERBAND_ID}`;

/**
 * Reduziert das volle Discovery-Manifest auf SFV-Salzburg (Metadaten + Rohpayloads passend zum SFV-Crawl).
 * Nutzt `data/discovery/sfv-scope-competitions.json` für die exakte Gruppenliste (z. B. nur KM/RES-Ligen).
 */
export async function filterDiscoveryManifestForSfv(manifest) {
  const sfvScopePath = path.join(DISCOVERY_DIR, "sfv-scope-competitions.json");
  const sfvRows = JSON.parse(await readFile(sfvScopePath, "utf8"));
  const allowedGroupSourceIds = new Set(sfvRows.map((row) => String(row.group_id)));

  const tables = manifest.tables ?? {};

  const verbaende = (tables["core.verbaende"] ?? []).filter(
    (row) => row.source_id === SFV_VERBAND_ID,
  );

  const gruppen = (tables["core.gruppen"] ?? []).filter(
    (row) =>
      row.verband_id === SFV_VERBAND_ROW_ID &&
      allowedGroupSourceIds.has(String(row.source_id)),
  );
  const gruppeIds = new Set(gruppen.map((row) => row.id));

  const serien = (tables["core.bewerb_serien"] ?? []).filter(
    (row) => row.verband_id === SFV_VERBAND_ROW_ID && gruppeIds.has(row.gruppe_id),
  );
  const serieIds = new Set(serien.map((row) => row.id));

  const editionsAll = tables["core.bewerb_editionen"] ?? [];
  const editions = editionsAll.filter((row) => {
    if (row.meta?.verband_source_id === SFV_VERBAND_ID) {
      return true;
    }
    if (serieIds.has(row.serie_id)) {
      return true;
    }
    return false;
  });
  const editionIds = new Set(editions.map((row) => row.id));

  const saisonIds = new Set();
  for (const row of editions) {
    if (row.saison_id) {
      saisonIds.add(row.saison_id);
    }
  }
  const saisonen = (tables["core.saisonen"] ?? []).filter((row) => saisonIds.has(row.id));

  const runden = (tables["core.bewerb_runden"] ?? []).filter((row) =>
    editionIds.has(row.bewerb_edition_id),
  );

  const rawPayloads = (tables["raw.payloads"] ?? []).filter((row) => {
    const rel = row.meta?.relative_path ?? "";
    if (
      rel.includes("salzburger-fu-ballverband") ||
      rel.includes("sfv-scope-competitions") ||
      rel.includes("sfv-collection-summary")
    ) {
      return true;
    }
    if (rel === "data/discovery/verbands.json") {
      return true;
    }
    return false;
  });

  return {
    ...manifest,
    generated_at: manifest.generated_at,
    source_system: manifest.source_system,
    sfv_filter: true,
    summary: {
      raw_payloads: rawPayloads.length,
      verbaende: verbaende.length,
      saisonen: saisonen.length,
      gruppen: gruppen.length,
      bewerb_serien: serien.length,
      bewerb_editionen: editions.length,
      bewerb_runden: runden.length,
    },
    tables: {
      ...tables,
      "raw.payloads": rawPayloads,
      "core.verbaende": verbaende,
      "core.saisonen": saisonen,
      "core.gruppen": gruppen,
      "core.bewerb_serien": serien,
      "core.bewerb_editionen": editions,
      "core.bewerb_runden": runden,
    },
  };
}
