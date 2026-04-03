/**
 * ScoutBase-Spieler-Rating 1–99: gewichtete Faktoren (Liga, Minuten, Teamtabellenplatz, Alter, Tore/90).
 */

export type ScoutbaseRatingInput = {
  /** Anzeige-Liga z. B. aus Team-Meta / Bewerb-Edition */
  ligaLabel: string | null;
  /** Einsatzminuten (Saison gesamt, Import) */
  minutesTotal: number;
  goals: number;
  /** Volljahre; fehlend → mittleres Alter-Preset */
  age: number | null;
  /** 1 = Tabellenspitze */
  tablePosition: number | null;
  /** Anzahl Teams in derselben Tabelle */
  teamsInLeague: number | null;
};

/** Liga-Level (Spielniveau), grob an österreichische Amateurligen angelehnt. */
export function leagueScoreFromLigaLabel(
  label: string | null | undefined,
): number {
  if (!label?.trim()) {
    return 55;
  }
  const n = label.toLowerCase();
  if (/bundesliga/i.test(n) && !/regionalliga/i.test(n)) {
    return 100;
  }
  if (/regionalliga/i.test(n)) {
    return 100;
  }
  if (/landesliga/i.test(n)) {
    return 85;
  }
  if (/bezirksliga/i.test(n)) {
    return 70;
  }
  if (/\b1\.?\s*klasse\b/i.test(n) || /1\.\s*klasse/i.test(n)) {
    return 60;
  }
  if (/\b2\.?\s*klasse\b/i.test(n) || /2\.\s*klasse/i.test(n)) {
    return 50;
  }
  if (/salzburger\s+liga/i.test(n)) {
    return 80;
  }
  return 55;
}

/** Vertrauen / Stammspieler: bis 1800 Min = volle Punktzahl. */
export function minutesScore(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return 0;
  }
  return Math.min(minutes / 1800, 1) * 100;
}

/** Tabellenplatz: Platz 1 → 100, letzter Platz → niedrig. */
export function teamScoreFromRank(
  tablePosition: number | null,
  teamsInLeague: number | null,
): number {
  if (
    tablePosition == null ||
    teamsInLeague == null ||
    teamsInLeague <= 0 ||
    tablePosition < 1 ||
    tablePosition > teamsInLeague
  ) {
    return 50;
  }
  return ((teamsInLeague - tablePosition + 1) / teamsInLeague) * 100;
}

/** Potential nach Altersband (17–19, 20–22, …). */
export function ageScore(age: number | null): number {
  if (age == null || !Number.isFinite(age)) {
    return 70;
  }
  if (age < 20) {
    return 100;
  }
  if (age <= 22) {
    return 90;
  }
  if (age <= 26) {
    return 80;
  }
  if (age <= 30) {
    return 70;
  }
  return 60;
}

/** Tore pro 90 Minuten, gedeckelt (Bonus; Verteidiger oft 0). */
export function goalScoreBonus(goals: number, minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0 || goals <= 0) {
    return 0;
  }
  const per90 = (goals / minutes) * 90;
  return Math.min(per90 * 100, 100);
}

/**
 * Gewichtung: Liga 30 %, Minuten 25 %, Team 15 %, Alter 15 %, Tore-Bonus 15 %.
 * Weniger als 400 Minuten: Gesamtwert × 0,7 (kein hohes Rating ohne Einsatzzeit).
 */
export function scoutbaseRating99(input: ScoutbaseRatingInput): number {
  const ls = leagueScoreFromLigaLabel(input.ligaLabel);
  const ms = minutesScore(input.minutesTotal);
  const ts = teamScoreFromRank(input.tablePosition, input.teamsInLeague);
  const as = ageScore(input.age);
  const gs = goalScoreBonus(input.goals, input.minutesTotal);

  let r =
    0.3 * ls +
    0.25 * ms +
    0.15 * ts +
    0.15 * as +
    0.15 * gs;

  if (input.minutesTotal < 400) {
    r *= 0.7;
  }

  const rounded = Math.round(r);
  return Math.min(99, Math.max(1, rounded));
}

/**
 * @deprecated Nutze {@link scoutbaseRating99}; nur noch für Tests / Legacy-Hinweise.
 * Alte Heuristik aus reinen Toren/Einsätzen.
 */
export function rating99FromGoalsAndApps(
  goals: number,
  appearances: number,
): number {
  if (appearances <= 0 || goals <= 0) {
    return 1;
  }
  const gpg = goals / appearances;
  const t = Math.min(1, gpg);
  const r = Math.round(1 + 98 * t);
  return Math.min(99, Math.max(1, r));
}
