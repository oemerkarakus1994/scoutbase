/** Demo-Anzeigen für die Börse (ohne Backend). Region: vorerst nur Salzburg (Datenbestand). */

export type BoerseAnzeigeTyp = "suche" | "biete";
export type BoerseRolle = "spieler" | "trainer";

/**
 * Eine Zeile in der Börse. Bei `rolle === "spieler"` ist `position` immer gesetzt
 * (Formular + `boerseNeueAnzeigeBauen`); im Typ optional wegen flachem Zugriff in Filtern/UI.
 */
export type BoerseDemoAnzeige = {
  id: string;
  refId: string;
  typ: BoerseAnzeigeTyp;
  rolle: BoerseRolle;
  /** Anzeigedatum */
  datumLabel: string;
  bundesland: string;
  /** Kürzel wie im Formular: TW, LV, IV, … (kommagetrennt bei zwei Positionen). Pflicht bei Spieler-Anzeigen. */
  position?: string;
  niveau?: string;
  jahrgang?: string;
  starkerFus?: string;
  /** `sofort` oder wie im Spieler-Formular: `ab TT.MM.JJJJ`. Trainer-Anzeigen: nur `sofort`. */
  verfuegbarkeit: string;
  /** Pflicht bei Trainer-Anzeigen (Formular). */
  lizenz?: string;
  /** Pflicht bei Trainer-Anzeigen (Formular). */
  erfahrungTrainer?: string;
  beschreibung: string;
  /** Mindestens eines von E-Mail oder Handynummer beim Schalten der Anzeige. */
  kontaktEmail?: string;
  kontaktHandy?: string;
};

export const BOERSE_DEMO_ANZEIGEN: BoerseDemoAnzeige[] = [
  {
    id: "1",
    refId: "SP-2025-0315-001",
    typ: "suche",
    rolle: "spieler",
    datumLabel: "15.03.2025",
    bundesland: "Salzburg",
    position: "ZM, ST",
    niveau: "Regionalliga",
    jahrgang: "1998–2003",
    starkerFus: "Rechts",
    verfuegbarkeit: "sofort",
    beschreibung:
      "Suchen offensiven Mittelfeldspieler mit Erfahrung in der Regionalliga. Teamgeist und Torchancenverwertung wichtig.",
  },
  {
    id: "2",
    refId: "SP-2025-0312-002",
    typ: "biete",
    rolle: "spieler",
    datumLabel: "12.03.2025",
    bundesland: "Salzburg",
    position: "IV",
    niveau: "1./2. Landesliga",
    jahrgang: "1998",
    starkerFus: "beidfüßig",
    verfuegbarkeit: "sofort",
    beschreibung:
      "Erfahrener IV sucht neue Herausforderung. Saisonziel: Aufstieg oder stabile Landesliga.",
  },
  {
    id: "3",
    refId: "TR-2025-0310-003",
    typ: "suche",
    rolle: "trainer",
    datumLabel: "10.03.2025",
    bundesland: "Salzburg",
    lizenz: "B-Diplom",
    erfahrungTrainer: "Herren, Jugend",
    verfuegbarkeit: "sofort",
    beschreibung:
      "Verein sucht Cheftrainer für 1. Klasse. Fokus Nachwuchs und Spielgestaltung.",
  },
  {
    id: "4",
    refId: "SP-2025-0308-004",
    typ: "biete",
    rolle: "spieler",
    datumLabel: "08.03.2025",
    bundesland: "Salzburg",
    position: "TW",
    niveau: "1./2. Klasse",
    jahrgang: "2003",
    starkerFus: "Rechts",
    verfuegbarkeit: "ab 01.07.2025",
    beschreibung:
      "Junger TW mit Reflextraining, sucht Einsatzzeit in unterer Amateurliga.",
  },
  {
    id: "5",
    refId: "SP-2025-0305-005",
    typ: "suche",
    rolle: "spieler",
    datumLabel: "05.03.2025",
    bundesland: "Salzburg",
    position: "ZM",
    niveau: "Reserve",
    jahrgang: "2000–2004",
    starkerFus: "Links",
    verfuegbarkeit: "sofort",
    beschreibung: "Team sucht Spielmacher mit Standards und Laufbereitschaft.",
  },
  {
    id: "6",
    refId: "TR-2025-0301-006",
    typ: "biete",
    rolle: "trainer",
    datumLabel: "01.03.2025",
    bundesland: "Salzburg",
    lizenz: "A-Diplom",
    erfahrungTrainer: "Jugend, Senioren",
    verfuegbarkeit: "sofort",
    beschreibung:
      "Co-Trainer mit Erfahrung in Talentförderung, kurzfristig verfügbar.",
  },
  {
    id: "7",
    refId: "SP-2025-0228-007",
    typ: "biete",
    rolle: "spieler",
    datumLabel: "28.02.2025",
    bundesland: "Salzburg",
    position: "LF, RF",
    niveau: "1./2. Landesliga",
    jahrgang: "1999",
    starkerFus: "Rechts",
    verfuegbarkeit: "sofort",
    beschreibung: "Schneller Flügelspieler, verletzungsfrei, motiviert.",
  },
  {
    id: "8",
    refId: "SP-2025-0225-008",
    typ: "suche",
    rolle: "spieler",
    datumLabel: "25.02.2025",
    bundesland: "Salzburg",
    position: "IV",
    niveau: "1./2. Klasse",
    jahrgang: "1995–2000",
    starkerFus: "Links",
    verfuegbarkeit: "ab 15.01.2026",
    beschreibung: "Defensive Stabilität gesucht, Kopfballstärke erwünscht.",
  },
  {
    id: "9",
    refId: "TR-2025-0220-009",
    typ: "suche",
    rolle: "trainer",
    datumLabel: "20.02.2025",
    bundesland: "Salzburg",
    lizenz: "Keine Lizenz",
    erfahrungTrainer: "Jugend, Damen",
    verfuegbarkeit: "sofort",
    beschreibung: "U15 sucht Betreuer mit pädagogischem Background.",
  },
  {
    id: "10",
    refId: "SP-2025-0218-010",
    typ: "biete",
    rolle: "spieler",
    datumLabel: "18.02.2025",
    bundesland: "Salzburg",
    position: "ST",
    niveau: "Salzburger Liga",
    jahrgang: "2001",
    starkerFus: "Rechts",
    verfuegbarkeit: "sofort",
    beschreibung: "Torgefährlicher Stürmer, zuletzt Regionalliga West.",
  },
  {
    id: "11",
    refId: "SP-2025-0215-011",
    typ: "suche",
    rolle: "spieler",
    datumLabel: "15.02.2025",
    bundesland: "Salzburg",
    position: "ZDM",
    niveau: "1./2. Landesliga",
    jahrgang: "1997–2002",
    starkerFus: "beidfüßig",
    verfuegbarkeit: "sofort",
    beschreibung: "Sechser mit Zweikampfquote und Passspiel für ambitioniertes Team.",
  },
  {
    id: "12",
    refId: "TR-2025-0210-012",
    typ: "biete",
    rolle: "trainer",
    datumLabel: "10.02.2025",
    bundesland: "Salzburg",
    lizenz: "B-Diplom",
    erfahrungTrainer: "Herren, Damen, Senioren",
    verfuegbarkeit: "sofort",
    beschreibung: "Trainer sucht Verein mit klarem Nachwuchskonzept.",
  },
];

/** Filter-Optionen; aktuell nur Salzburg (Rest Österreich folgt mit erweitertem Datenbestand). */
export const BOERSE_BUNDESLAENDER = ["Alle Bundesländer", "Salzburg"] as const;

/** Nur für Formulare (ohne „Alle Bundesländer“). */
export const BOERSE_BUNDESLAENDER_FORM = ["Salzburg"] as const;

type BoerseNeueInputSpieler = {
  typ: BoerseAnzeigeTyp;
  rolle: "spieler";
  bundesland: string;
  beschreibung: string;
  verfuegbarkeit?: string;
  position: string;
  niveau?: string;
  jahrgang?: string;
  starkerFus?: string;
  kontaktEmail: string;
  kontaktHandy: string;
};

type BoerseNeueInputTrainer = {
  typ: BoerseAnzeigeTyp;
  rolle: "trainer";
  bundesland: string;
  beschreibung: string;
  verfuegbarkeit?: string;
  lizenz: string;
  erfahrungTrainer: string;
  kontaktEmail: string;
  kontaktHandy: string;
};

/**
 * Neue Demo-Anzeige aus Formularwerten (lokal, ohne Backend).
 * `id` wird mit `crypto.randomUUID()` gesetzt — nur clientseitig aufrufen.
 * Spieler-Anzeigen erfordern eine nicht-leere `position`.
 * Trainer-Anzeigen erfordern nicht-leere `lizenz` und `erfahrungTrainer`.
 * Kontakt: mindestens eine nicht-leere von `kontaktEmail` oder `kontaktHandy` (nach trim).
 */
export function boerseNeueAnzeigeBauen(
  input: BoerseNeueInputSpieler | BoerseNeueInputTrainer,
): BoerseDemoAnzeige {
  const prefix = input.rolle === "spieler" ? "SP" : "TR";
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const da = String(now.getDate()).padStart(2, "0");
  const suffix = String(Math.floor(Math.random() * 900 + 100));
  const refId = `${prefix}-${y}-${mo}${da}-${suffix}`;
  const datumLabel = `${da}.${mo}.${y}`;
  const verf = (input.verfuegbarkeit ?? "sofort").trim() || "sofort";

  const email = input.kontaktEmail.trim();
  const handy = input.kontaktHandy.trim();
  if (!email && !handy) {
    throw new Error(
      "boerseNeueAnzeigeBauen: mindestens E-Mail oder Handynummer erforderlich",
    );
  }

  const base: Omit<
    BoerseDemoAnzeige,
    | "position"
    | "niveau"
    | "jahrgang"
    | "starkerFus"
    | "lizenz"
    | "erfahrungTrainer"
  > = {
    id: crypto.randomUUID(),
    refId,
    typ: input.typ,
    rolle: input.rolle,
    datumLabel,
    bundesland: input.bundesland,
    beschreibung: input.beschreibung.trim() || "—",
    verfuegbarkeit: verf,
    ...(email ? { kontaktEmail: email } : {}),
    ...(handy ? { kontaktHandy: handy } : {}),
  };

  if (input.rolle === "spieler") {
    const position = input.position.trim();
    if (!position) {
      throw new Error("boerseNeueAnzeigeBauen: Spieler-Anzeige erfordert position");
    }
    return {
      ...base,
      position,
      ...(input.niveau?.trim() ? { niveau: input.niveau.trim() } : {}),
      ...(input.jahrgang?.trim() ? { jahrgang: input.jahrgang.trim() } : {}),
      ...(input.starkerFus?.trim() ? { starkerFus: input.starkerFus.trim() } : {}),
    };
  }

  const lizenz = input.lizenz.trim();
  const erfahrungTrainer = input.erfahrungTrainer.trim();
  if (!lizenz) {
    throw new Error("boerseNeueAnzeigeBauen: Trainer-Anzeige erfordert lizenz");
  }
  if (!erfahrungTrainer) {
    throw new Error(
      "boerseNeueAnzeigeBauen: Trainer-Anzeige erfordert erfahrungTrainer",
    );
  }
  return {
    ...base,
    lizenz,
    erfahrungTrainer,
  };
}
