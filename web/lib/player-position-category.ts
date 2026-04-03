import type { SupabaseClient } from "@supabase/supabase-js";

export type PositionCategory = "tw" | "def" | "mid" | "fwd";

/** Grobe Zuordnung für Filter (Kategorien + Spielfeld). */
export function positionLabelToCategories(
  label: string | null | undefined,
): Set<PositionCategory> {
  const out = new Set<PositionCategory>();
  if (!label?.trim()) {
    return out;
  }
  const n = label.toLowerCase();

  if (/tor|keeper|goalie|\btw\b/i.test(n)) {
    out.add("tw");
  }
  if (
    /verteid|abwehr|innenverteid|aussenverteid|außenverteid|lv\b|rv\b|iv\b|innenraum/i.test(
      n,
    )
  ) {
    out.add("def");
  }
  if (
    /mittelfeld|defensives|offensives|zentral|zm\b|zdm|zom|raumdeuter/i.test(n)
  ) {
    out.add("mid");
  }
  if (/stürmer|stuermer|angriff|sturm|flügel|fluegel|lf\b|rf\b|\bst\b/i.test(n)) {
    out.add("fwd");
  }

  return out;
}

/** Spielfeld-Slot-IDs (Kreis-Filter); passen zu `PITCH_SLOTS` in spieler-directory. */
export type PitchSlotId =
  | "tw"
  | "lv"
  | "iv"
  | "rv"
  | "zdm"
  | "zm"
  | "zom"
  | "lf"
  | "rf"
  | "st";

/**
 * Ob die Positionsbezeichnung exakt zu einem Spielfeld-Slot passt (z. B. nur ZOM, nur ZDM).
 * Bewusst strenger als {@link positionLabelToCategories}: vage Labels wie nur „Mittelfeld“
 * matchen keinen der drei ZM-Slots.
 */
export function positionLabelMatchesPitchSlot(
  label: string | null | undefined,
  slotId: PitchSlotId,
): boolean {
  if (!label?.trim()) {
    return false;
  }
  const n = label.toLowerCase();

  switch (slotId) {
    case "tw":
      return /tor|keeper|goalie|\btw\b/i.test(n);
    case "lv":
      return /linksverteid|\blv\b|linker verteid|links außenverteid/i.test(n);
    case "iv":
      return /innenverteid|\biv\b|innenraumverteid/i.test(n);
    case "rv":
      return /rechtsverteid|\brv\b|rechter verteid|rechts außenverteid/i.test(n);
    case "zdm": {
      if (/\bzom\b/i.test(n) || /offensiv\w*mittelfeld/i.test(n)) {
        return false;
      }
      return (
        /\bzdm\b/i.test(n) ||
        /defensiv\w*mittelfeld|mittelfeld\w*defensiv|sechser|doppel.?6/i.test(n)
      );
    }
    case "zom": {
      if (/\bzdm\b/i.test(n) || /defensiv\w*mittelfeld/i.test(n)) {
        return false;
      }
      return (
        /\bzom\b/i.test(n) ||
        /offensiv\w*mittelfeld|mittelfeld\w*offensiv|hängende|haengende|raumdeuter|10er|zehner/i.test(
          n,
        )
      );
    }
    case "zm": {
      if (
        /\bzdm\b|\bzom\b/i.test(n) ||
        /defensiv\w*mittelfeld|offensiv\w*mittelfeld/i.test(n)
      ) {
        return false;
      }
      if (
        /\bzm\b/i.test(n) ||
        /zentral\w*mittelfeld|zentrales mittelfeld|zentrale mitte/i.test(n)
      ) {
        return true;
      }
      // Unspezifisches „Mittelfeld“ → nur ZM-Slot, nicht ZOM/ZDM
      return /\bmittelfeld\b/.test(n);
    }
    case "lf":
      return /linksaußen|links aussen|\blf\b|links flügel|linksflügel|linksfluegel/i.test(
        n,
      );
    case "rf":
      return /rechtsaußen|rechts aussen|\brf\b|rechts flügel|rechtsflügel|rechtsfluegel/i.test(
        n,
      );
    case "st":
      return (
        /stürmer|stuermer|\bst\b|spitze|mittelstürmer|mittelstuermer|angriffssp|center forward/i.test(
          n,
        )
      );
    default:
      return false;
  }
}

/**
 * Kleine Chunks: `.in(person_id, …)` landet in der GET-URL — zu viele IDs → 414 / Fehler,
 * dann schlägt `loadPositionLabelsForPrimaryTeams` fehl und alle Positionen fehlen.
 */
const POSITION_QUERY_CHUNK = 55;

/**
 * Kader-Zeilen aus dem Import haben fast immer role_type "player"; in älteren Daten
 * kann das Feld fehlen — dann nicht ausschließen (sonst erscheint überall „—“).
 * Alles außer eindeutigem Betreuer/Trainer zählt als Spieler-Mitgliedschaft.
 */
function membershipCountsAsPlayer(role: string | null | undefined): boolean {
  const t = (role ?? "").trim().toLowerCase();
  if (!t) {
    return true;
  }
  if (
    t === "trainer" ||
    t === "staff" ||
    t === "betreuer" ||
    t.includes("trainer")
  ) {
    return false;
  }
  return true;
}

/** Mehrere Membership-Zeilen pro Spieler/Mannschaft (z. B. andere source_item_key): nicht erste mit leerer Position nehmen. */
function pickBestPositionLabel(
  candidates: (string | null | undefined)[],
): string | null {
  const labels = candidates
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);
  if (labels.length === 0) {
    return null;
  }
  return [...labels].sort((a, b) => b.length - a.length)[0] ?? null;
}

export async function loadPositionLabelsForPrimaryTeams(
  supabase: SupabaseClient,
  personIds: string[],
  primaryTeamId: Map<string, string>,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (personIds.length === 0) {
    return out;
  }

  for (let i = 0; i < personIds.length; i += POSITION_QUERY_CHUNK) {
    const chunk = personIds.slice(i, i + POSITION_QUERY_CHUNK);
    const { data, error } = await supabase
      .schema("core")
      .from("team_memberships")
      .select("person_id,team_id,role_type,position_label")
      .in("person_id", chunk)
      .is("left_on", null);

    if (error) {
      throw new Error(
        `team_memberships position batch ${i}-${i + chunk.length}: ${error.message}`,
      );
    }

    const primaryByPerson = new Map<string, string[]>();
    const anyTeamByPerson = new Map<string, string[]>();
    for (const raw of data ?? []) {
      const m = raw as {
        person_id: string | null;
        team_id: string;
        role_type: string;
        position_label: string | null;
      };
      if (!m.person_id || !membershipCountsAsPlayer(m.role_type)) {
        continue;
      }
      const label = m.position_label?.trim() || "";
      const anyList = anyTeamByPerson.get(m.person_id) ?? [];
      anyList.push(label);
      anyTeamByPerson.set(m.person_id, anyList);

      const want = primaryTeamId.get(m.person_id);
      if (want && m.team_id === want) {
        const pl = primaryByPerson.get(m.person_id) ?? [];
        pl.push(label);
        primaryByPerson.set(m.person_id, pl);
      }
    }

    for (const pid of chunk) {
      if (!primaryTeamId.has(pid)) {
        continue;
      }
      const fromPrimary = pickBestPositionLabel(primaryByPerson.get(pid) ?? []);
      const fromAny = pickBestPositionLabel(anyTeamByPerson.get(pid) ?? []);
      out.set(pid, fromPrimary ?? fromAny ?? null);
    }
  }

  return out;
}
