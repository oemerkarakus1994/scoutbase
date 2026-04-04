"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { cn } from "@/lib/cn";
import {
  appendMyAdId,
  BOERSE_CONTACT_REQUESTS_KEY,
  countContactRequestsForMyAds,
  getContactRequestsMap,
  getMyAdIds,
  recordContactRequest,
  type BoerseKontaktAnfrage,
} from "@/lib/boerse-kontakt";
import { useSupabaseAuthSession } from "@/lib/supabase/use-auth-session";
import {
  BOERSE_BUNDESLAENDER,
  BOERSE_BUNDESLAENDER_FORM,
  BOERSE_DEMO_ANZEIGEN,
  boerseNeueAnzeigeBauen,
  type BoerseAnzeigeTyp,
  type BoerseDemoAnzeige,
  type BoerseRolle,
} from "@/lib/boerse-demo-data";

/** Lokale Liste (ohne Backend); nach dem ersten Speichern wird aus localStorage gelesen. */
const BOERSE_STORAGE_KEY = "scoutbase-boerse-anzeigen-v1";

function loadBoerseAnzeigenFromStorage(): BoerseDemoAnzeige[] | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = localStorage.getItem(BOERSE_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }
    return parsed as BoerseDemoAnzeige[];
  } catch {
    return null;
  }
}

const FILTER_SELECT =
  "mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none transition focus:border-brand/40 focus:ring-1 focus:ring-brand/25";

type ViewMode = "table" | "grid";

/** Sortierbare Spalten — entsprechen den Filterfeldern (+ Datum, Text, Ref). */
type BoerseSortKey =
  | "typ"
  | "rolle"
  | "datum"
  | "region"
  | "position"
  | "niveau"
  | "lizenz"
  | "verf"
  | "beschreibung"
  | "ref";

function parseDatumLabel(label: string): number {
  const m = label.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) {
    return 0;
  }
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const t = d.getTime();
  return Number.isFinite(t) ? t : 0;
}

function verfLabel(a: BoerseDemoAnzeige): string {
  return a.verfuegbarkeit === "sofort" ? "Sofort" : a.verfuegbarkeit;
}

function boerseHatKontakt(a: BoerseDemoAnzeige): boolean {
  return !!(a.kontaktEmail?.trim() || a.kontaktHandy?.trim());
}

function isValidKontaktEmailField(s: string): boolean {
  const t = s.trim();
  if (!t) {
    return true;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

function isValidKontaktHandyField(s: string): boolean {
  const t = s.trim();
  if (!t) {
    return true;
  }
  const digits = t.replace(/\D/g, "");
  return digits.length >= 6 && digits.length <= 15;
}

/** Position/Lizenz je nach Rolle — die jeweils andere Spalte ist im Formular nicht vorgesehen. */
function BoerseCellNichtZutreffend() {
  return (
    <span className="text-muted" title="Nicht zutreffend">
      n. z.
    </span>
  );
}

function IconPin({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={cn("h-4 w-4 shrink-0 text-muted", className)}
      aria-hidden
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function IconUser({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={cn("h-4 w-4 shrink-0 text-muted", className)}
      aria-hidden
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconMedal({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={cn("h-4 w-4 shrink-0 text-muted", className)}
      aria-hidden
    >
      <path d="M7.21 15 2.66 7.97a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.97a2 2 0 0 1 .1 2.2L16.79 15" />
      <path d="M11 12 5.12 2.2" />
      <path d="m13 12 5.88-9.8" />
      <path d="M8 7h8" />
      <circle cx="12" cy="17" r="5" />
      <path d="M12 18v-2h-.5" />
    </svg>
  );
}

function IconCalendar({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={cn("h-4 w-4 shrink-0 text-muted", className)}
      aria-hidden
    >
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
    </svg>
  );
}

function IconFoot({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={cn("h-4 w-4 shrink-0 text-muted", className)}
      aria-hidden
    >
      <path d="M4 14c0-2 1.5-4 4-4" />
      <path d="M8 10c-1-3 2-6 5-5" />
      <path d="M14 6c2 0 4 2 4 5v3" />
      <path d="M18 16c0 3-2 5-5 5s-5-2-6-4" />
    </svg>
  );
}

function IconCheck({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={cn("h-4 w-4 shrink-0 text-muted", className)}
      aria-hidden
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function IconMessage({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={cn("h-4 w-4", className)}
      aria-hidden
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconPlusDoc({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={cn("h-4 w-4", className)}
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <line x1="12" x2="12" y1="18" y2="12" />
      <line x1="9" x2="15" y1="15" y2="15" />
    </svg>
  );
}

function IconFunnel({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={cn("h-5 w-5 text-brand", className)}
      aria-hidden
    >
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function IconX({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={cn("h-5 w-5", className)}
      aria-hidden
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/** Minimal: Tabellenzeilen (Ansicht) */
function IconViewTable({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <line x1="4" x2="20" y1="6" y2="6" />
      <line x1="4" x2="20" y1="12" y2="12" />
      <line x1="4" x2="20" y1="18" y2="18" />
      <line x1="4" x2="4" y1="5" y2="19" />
      <line x1="20" x2="20" y1="5" y2="19" />
    </svg>
  );
}

/** Minimal: 2×2 Kacheln (Ansicht) */
function IconViewGrid({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <rect height="7" width="7" x="4" y="4" rx="1" />
      <rect height="7" width="7" x="13" y="4" rx="1" />
      <rect height="7" width="7" x="4" y="13" rx="1" />
      <rect height="7" width="7" x="13" y="13" rx="1" />
    </svg>
  );
}

function SortGlyph({
  active,
  dir,
}: {
  active: boolean;
  dir: "asc" | "desc";
}) {
  return (
    <span
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center opacity-50",
        active && "opacity-100",
      )}
      aria-hidden
    >
      {active ? (
        dir === "asc" ? (
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M12 6l8 10H4l8-10z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M12 18l-8-10h16l-8 10z" />
          </svg>
        )
      ) : (
        <svg
          viewBox="0 0 24 24"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />
        </svg>
      )}
    </span>
  );
}

function BoerseSortableTh({
  label,
  columnKey,
  activeKey,
  dir,
  onSort,
  className,
}: {
  label: string;
  columnKey: BoerseSortKey;
  activeKey: BoerseSortKey;
  dir: "asc" | "desc";
  onSort: (k: BoerseSortKey) => void;
  className?: string;
}) {
  const active = activeKey === columnKey;
  return (
    <th
      scope="col"
      className={cn(
        "px-3 py-3.5 text-left font-bold uppercase tracking-wide text-white",
        className,
      )}
      aria-sort={
        active ? (dir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className="inline-flex max-w-full items-center gap-1 rounded-md py-0.5 text-left text-white transition hover:bg-white/10 hover:text-rose-50"
      >
        <span className="min-w-0 leading-tight">{label}</span>
        <SortGlyph active={active} dir={dir} />
      </button>
    </th>
  );
}

function DetailFact({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-panel/60 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-1 text-sm leading-snug text-foreground">{children}</p>
    </div>
  );
}

function AnzeigeDetailView({
  a,
  onKontakt,
}: {
  a: BoerseDemoAnzeige;
  onKontakt?: () => void;
}) {
  const typLabel = a.typ === "suche" ? "Suche" : "Biete";
  const rolleLabel = a.rolle === "spieler" ? "Spieler" : "Trainer";
  const kontaktMoeglich = boerseHatKontakt(a);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide",
            a.typ === "suche"
              ? "border-sky-500/40 bg-sky-950/50 text-sky-200"
              : "border-emerald-500/40 bg-emerald-950/40 text-emerald-200",
          )}
        >
          {typLabel}
        </span>
        <span className="rounded-full border border-border bg-panel px-3 py-1 text-[11px] font-medium text-foreground">
          {rolleLabel}
        </span>
        <span className="inline-flex items-center gap-1.5 text-sm text-muted">
          <IconCalendar className="h-4 w-4" />
          {a.datumLabel}
        </span>
      </div>

      <p className="font-mono text-xs text-muted">
        Referenz: <span className="text-foreground/90">{a.refId}</span>
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <DetailFact label="Bundesland">{a.bundesland}</DetailFact>
        <DetailFact label="Verfügbarkeit">
          <span
            className={cn(
              a.verfuegbarkeit.toLowerCase() === "sofort" && "font-medium text-emerald-400",
            )}
          >
            {verfLabel(a)}
          </span>
        </DetailFact>
      </div>

      {a.rolle === "spieler" ? (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Spieler
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <DetailFact label="Position">{a.position}</DetailFact>
            <DetailFact label="Niveau">{a.niveau?.trim() ? a.niveau : "—"}</DetailFact>
            <DetailFact label="Jahrgang">{a.jahrgang?.trim() ? a.jahrgang : "—"}</DetailFact>
            <DetailFact label="Starker Fuß">
              {a.starkerFus?.trim() ? (
                <span className="capitalize">{a.starkerFus}</span>
              ) : (
                "—"
              )}
            </DetailFact>
          </div>
        </section>
      ) : (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Trainer
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <DetailFact label="Lizenz">{a.lizenz}</DetailFact>
            <DetailFact label="Erfahrung">{a.erfahrungTrainer}</DetailFact>
          </div>
        </section>
      )}

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Beschreibung
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-foreground">{a.beschreibung}</p>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-5">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand/35 bg-brand/10 px-4 py-2.5 text-sm font-semibold text-brand transition hover:bg-brand/20 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!kontaktMoeglich}
          title={
            kontaktMoeglich
              ? "Kontakt aufnehmen"
              : "Keine Kontaktdaten für diese Anzeige"
          }
          onClick={(e) => {
            e.stopPropagation();
            if (kontaktMoeglich) {
              onKontakt?.();
            }
          }}
        >
          <IconMessage className="text-brand" />
          Kontaktieren
        </button>
      </div>
    </div>
  );
}

const BOERSE_KONTAKT_NACHRICHT_MAX = 2000;

function BoerseKontaktaufnahmeDialog({
  anzeige,
  open,
  onClose,
}: {
  anzeige: BoerseDemoAnzeige | null;
  open: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [nachricht, setNachricht] = useState("");
  const [ihreEmail, setIhreEmail] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) {
      return;
    }
    if (open && anzeige) {
      d.showModal();
    } else if (d.open) {
      d.close();
    }
  }, [open, anzeige]);

  useEffect(() => {
    if (open) {
      setNachricht("");
      setIhreEmail("");
      setDone(false);
    }
  }, [open, anzeige?.id]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!anzeige || !boerseHatKontakt(anzeige)) {
      return;
    }
    const msg = nachricht.trim() || "(Keine Nachricht)";
    const viewer = ihreEmail.trim();
    recordContactRequest(anzeige.id, {
      message: msg,
      viewerEmail: viewer || undefined,
    });
    const hasEmail = !!anzeige.kontaktEmail?.trim();
    if (hasEmail && anzeige.kontaktEmail) {
      const subject = `ScoutBase Börse: Kontakt zu ${anzeige.refId}`;
      const body = `${msg}\n\n---\nReferenz: ${anzeige.refId}\n${viewer ? `Antwort an: ${viewer}\n` : ""}`;
      const url = `mailto:${anzeige.kontaktEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    }
    setDone(true);
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className={cn(
        "fixed inset-0 z-[60] m-0 h-dvh max-h-none w-full max-w-none border-0 bg-transparent p-4 shadow-none sm:p-6",
        "[&::backdrop]:bg-black/70 [&::backdrop]:backdrop-blur-sm",
      )}
      aria-labelledby="boerse-kontakt-title"
    >
      {open && anzeige ? (
        <div
          className="flex h-full min-h-0 w-full items-center justify-center"
          onClick={onClose}
        >
          <div
            className="flex max-h-[min(88vh,640px)] w-[min(100vw-2rem,440px)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-black text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-white/10 px-5 py-4">
              <h2 id="boerse-kontakt-title" className="text-lg font-bold text-white">
                Kontakt aufnehmen
              </h2>
              <p className="mt-1 font-mono text-xs text-zinc-500">{anzeige.refId}</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {!boerseHatKontakt(anzeige) ? (
                <p className="text-sm text-zinc-400">
                  Für diese Anzeige sind keine Kontaktdaten hinterlegt (ältere
                  Demo-Einträge).
                </p>
              ) : done ? (
                <div className="space-y-3 text-sm text-zinc-300">
                  <p>
                    Die Kontaktanfrage wurde gespeichert. Der Inserent sieht sie in
                    diesem Browser unter „Kontaktanfragen“, sofern er die Anzeige hier
                    geschaltet hat.
                  </p>
                  {anzeige.kontaktEmail?.trim() ? (
                    <p className="text-zinc-400">
                      Sollte sich Ihr E-Mail-Programm geöffnet haben, senden Sie die
                      Nachricht dort ab — dann erhält der Inserent sie im Postfach.
                    </p>
                  ) : null}
                  {anzeige.kontaktHandy?.trim() ? (
                    <p className="rounded-lg border border-white/10 bg-zinc-950/80 p-3 text-zinc-200">
                      Telefon:{" "}
                      <a
                        className="font-medium text-emerald-400 underline"
                        href={`tel:${anzeige.kontaktHandy.replace(/\s+/g, "")}`}
                      >
                        {anzeige.kontaktHandy}
                      </a>
                    </p>
                  ) : null}
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <p className="text-sm text-zinc-400">
                    Ihre Anfrage wird lokal gespeichert und dem Inserenten in diesem
                    Browser angezeigt. Optional öffnet sich eine E-Mail an die
                    angegebene Adresse des Inserenten.
                  </p>
                  <label className="block text-sm font-medium text-zinc-200">
                    Nachricht
                    <textarea
                      value={nachricht}
                      onChange={(e) =>
                        setNachricht(
                          e.target.value.slice(0, BOERSE_KONTAKT_NACHRICHT_MAX),
                        )
                      }
                      rows={4}
                      placeholder="Kurz beschreiben, worum es geht…"
                      className="mt-1.5 w-full rounded-lg border border-white/15 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-white/35"
                    />
                  </label>
                  <label className="block text-sm font-medium text-zinc-200">
                    Ihre E-Mail für Rückfragen (optional)
                    <input
                      type="email"
                      value={ihreEmail}
                      onChange={(e) => setIhreEmail(e.target.value)}
                      className="mt-1.5 h-11 w-full rounded-lg border border-white/15 bg-zinc-950 px-3 text-sm text-white outline-none focus:border-white/35"
                      placeholder="name@beispiel.at"
                    />
                  </label>
                  <div className="flex flex-wrap justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-lg border border-white/25 bg-black px-4 py-2 text-sm text-white hover:bg-white/10"
                    >
                      Schließen
                    </button>
                    <button
                      type="submit"
                      className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-900/50"
                    >
                      Anfrage senden
                    </button>
                  </div>
                </form>
              )}
            </div>
            {done || !boerseHatKontakt(anzeige) ? (
              <div className="shrink-0 border-t border-white/10 px-5 py-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-lg border border-white/20 bg-zinc-800 py-2.5 text-sm font-medium text-white hover:bg-zinc-700"
                >
                  Fertig
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}

function MeineKontaktanfragenDialog({
  open,
  onClose,
  anzeigen,
}: {
  open: boolean;
  onClose: () => void;
  anzeigen: BoerseDemoAnzeige[];
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) {
      return;
    }
    if (open) {
      d.showModal();
    } else if (d.open) {
      d.close();
    }
  }, [open]);

  const myIds = typeof window !== "undefined" ? getMyAdIds() : [];
  const map = typeof window !== "undefined" ? getContactRequestsMap() : {};
  const rows: { ad: BoerseDemoAnzeige; list: BoerseKontaktAnfrage[] }[] = [];
  for (const id of myIds) {
    const list = map[id];
    if (!list?.length) {
      continue;
    }
    const ad = anzeigen.find((x) => x.id === id);
    if (ad) {
      rows.push({ ad, list });
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className={cn(
        "fixed inset-0 z-[60] m-0 h-dvh max-h-none w-full max-w-none border-0 bg-transparent p-4 shadow-none sm:p-6",
        "[&::backdrop]:bg-black/70 [&::backdrop]:backdrop-blur-sm",
      )}
      aria-labelledby="boerse-meine-anfragen-title"
    >
      {open ? (
        <div
          className="flex h-full min-h-0 w-full items-center justify-center"
          onClick={onClose}
        >
          <div
            className="flex max-h-[min(88vh,560px)] w-[min(100vw-2rem,480px)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-border px-5 py-4">
              <h2
                id="boerse-meine-anfragen-title"
                className="text-lg font-semibold"
              >
                Kontaktanfragen zu Ihren Anzeigen
              </h2>
              <p className="mt-1 text-xs text-muted">
                Nur in diesem Browser, ohne Server. Öffnen Sie die Börse im selben
                Browser, in dem Sie die Anzeige erstellt haben.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {rows.length === 0 ? (
                <p className="text-sm text-muted">Noch keine Anfragen.</p>
              ) : (
                <ul className="space-y-4">
                  {rows.map(({ ad, list }) => (
                    <li key={ad.id} className="rounded-xl border border-border bg-panel/60 p-3">
                      <p className="font-mono text-xs text-muted">{ad.refId}</p>
                      <ul className="mt-2 space-y-2">
                        {list.map((r, i) => (
                          <li
                            key={`${r.at}-${i}`}
                            className="rounded-lg border border-border/80 bg-background/80 px-3 py-2 text-sm"
                          >
                            <p className="text-xs text-muted">
                              {new Date(r.at).toLocaleString("de-AT")}
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-foreground">
                              {r.message}
                            </p>
                            {r.viewerEmail ? (
                              <p className="mt-1 text-xs text-muted">
                                Antwort an: {r.viewerEmail}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="shrink-0 border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-lg border border-border bg-panel py-2.5 text-sm font-medium hover:bg-panel/80"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}

function AnzeigeDetailDialog({
  anzeige,
  onClose,
  onKontaktieren,
}: {
  anzeige: BoerseDemoAnzeige | null;
  onClose: () => void;
  onKontaktieren?: (a: BoerseDemoAnzeige) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) {
      return;
    }
    if (anzeige) {
      d.showModal();
    } else if (d.open) {
      d.close();
    }
  }, [anzeige]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className={cn(
        "fixed inset-0 z-50 m-0 h-dvh max-h-none w-full max-w-none border-0 bg-transparent p-4 shadow-none sm:p-6",
        "[&::backdrop]:bg-black/65 [&::backdrop]:backdrop-blur-[2px]",
      )}
      aria-labelledby={anzeige ? `boerse-detail-title-${anzeige.id}` : undefined}
    >
      {anzeige ? (
        <div
          className="flex h-full min-h-0 w-full items-center justify-center"
          onClick={onClose}
        >
          <div
            className={cn(
              "flex max-h-[min(92vh,820px)] w-[min(100vw-2rem,560px)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl ring-1 ring-white/[0.06]",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border bg-gradient-to-r from-brand/20 via-rose-950/40 to-background px-5 py-4">
              <div className="min-w-0">
                <p
                  id={`boerse-detail-title-${anzeige.id}`}
                  className="text-lg font-semibold tracking-tight text-foreground"
                >
                  Anzeige
                </p>
                <p className="mt-0.5 truncate font-mono text-xs text-muted">
                  {anzeige.refId}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                }}
                className="shrink-0 rounded-lg border border-border/80 bg-panel/80 p-2 text-muted transition hover:border-brand/35 hover:text-foreground"
                aria-label="Schließen"
              >
                <IconX />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
              <AnzeigeDetailView
                a={anzeige}
                onKontakt={
                  boerseHatKontakt(anzeige) && onKontaktieren
                    ? () => onKontaktieren(anzeige)
                    : undefined
                }
              />
            </div>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}

const BOERSE_WEITERE_MAX = 500;

const BOERSE_FORM_NIVEAU = [
  "Regionalliga",
  "Salzburger Liga",
  "1./2. Landesliga",
  "1./2. Klasse",
  "Reserve",
] as const;

const BOERSE_FORM_STARKER_FUSS = [
  { value: "links", label: "Links" },
  { value: "rechts", label: "Rechts" },
  { value: "beidfüßig", label: "Beidfüßig" },
] as const;

/** Spieler-Positionen (max. 2 wählbar: Primär + optional Sekundär) */
const BOERSE_FORM_POSITION_CODES = [
  "TW",
  "LV",
  "IV",
  "RV",
  "ZDM",
  "ZM",
  "ZOM",
  "LF",
  "RF",
  "ST",
] as const;

const BOERSE_FORM_LIZENZ = [
  "A-Diplom",
  "B-Diplom",
  "C-Diplom",
  "D-Diplom",
  "Keine Lizenz",
] as const;

/** Trainer Erfahrung — Mehrfachauswahl, Speicherung als kommagetrennte Liste */
const BOERSE_FORM_ERFAHRUNG = [
  "Herren",
  "Damen",
  "Jugend",
  "Senioren",
] as const;

function formatTrErfahrungStorage(selected: string[]): string {
  return BOERSE_FORM_ERFAHRUNG.filter((k) => selected.includes(k)).join(", ");
}

const trainerErfahrungCheckboxClass =
  "flex cursor-pointer items-center gap-2.5 rounded-lg border border-white/10 bg-zinc-900/70 px-3 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-white/15 hover:bg-zinc-800/80";

/** Dunkle Eingaben in Detail-Blöcken (Spieler / Trainer) — wie restliches Modal */
const cardSelect =
  "mt-1.5 h-11 w-full rounded-lg border border-white/15 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-white/35 focus:ring-2 focus:ring-white/10";

const cardLabel = "text-sm font-semibold text-zinc-100";

function todayIsoDateLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

/** Spieler-Formular: „sofort“ oder gespeichert als `ab TT.MM.JJJJ` */
function verfuegbarkeitFromSpielerForm(
  art: "" | "sofort" | "datum",
  iso: string,
): string {
  if (art === "sofort") {
    return "sofort";
  }
  if (art === "datum" && iso) {
    const [y, m, d] = iso.split("-");
    if (y && m && d) {
      return `ab ${d}.${m}.${y}`;
    }
  }
  return "sofort";
}

function BoerseCreateAnzeigeDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (a: BoerseDemoAnzeige) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [typ, setTyp] = useState("");
  const [rolle, setRolle] = useState("");
  const [bundesland, setBundesland] = useState("Salzburg");
  const [weitere, setWeitere] = useState("");

  const [spPos1, setSpPos1] = useState("");
  const [spPos2, setSpPos2] = useState("");
  const [spNiveau, setSpNiveau] = useState("");
  const [spVerfArt, setSpVerfArt] = useState<"" | "sofort" | "datum">("");
  const [spVerfDatum, setSpVerfDatum] = useState("");
  const [spStarkerFus, setSpStarkerFus] = useState("");
  const [spJahrgang, setSpJahrgang] = useState("");
  /** Nur Typ „Suche“ + Spieler: Jahrgangsspanne wie im Mock */
  const [spJahrgangVon, setSpJahrgangVon] = useState("");
  const [spJahrgangBis, setSpJahrgangBis] = useState("");

  const [trLizenz, setTrLizenz] = useState("");
  const [trErfahrung, setTrErfahrung] = useState<string[]>([]);

  const [kontaktEmail, setKontaktEmail] = useState("");
  const [kontaktHandy, setKontaktHandy] = useState("");

  useEffect(() => {
    const d = ref.current;
    if (!d) {
      return;
    }
    if (open) {
      d.showModal();
    } else if (d.open) {
      d.close();
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      setTyp("");
      setRolle("");
      setBundesland("Salzburg");
      setWeitere("");
      setSpPos1("");
      setSpPos2("");
      setSpNiveau("");
      setSpVerfArt("");
      setSpVerfDatum("");
      setSpStarkerFus("");
      setSpJahrgang("");
      setSpJahrgangVon("");
      setSpJahrgangBis("");
      setTrLizenz("");
      setTrErfahrung([]);
      setKontaktEmail("");
      setKontaktHandy("");
    }
  }, [open]);

  function spielerPositionAuswahl(): string {
    const a = spPos1.trim();
    const b = spPos2.trim();
    if (a && b && a !== b) {
      return `${a}, ${b}`;
    }
    if (a) {
      return a;
    }
    if (b) {
      return b;
    }
    return "";
  }

  const verfSpielerComplete =
    spVerfArt === "sofort" ||
    (spVerfArt === "datum" && spVerfDatum !== "");

  const basisOk =
    (typ === "suche" || typ === "biete") &&
    (rolle === "spieler" || rolle === "trainer") &&
    bundesland === "Salzburg";

  const spielerDetailsOk =
    rolle !== "spieler" ||
    (typ === "suche"
      ? spPos1 !== "" &&
        spNiveau !== "" &&
        spStarkerFus !== "" &&
        spJahrgangVon.length === 4 &&
        spJahrgangBis.length === 4 &&
        verfSpielerComplete
      : typ === "biete"
        ? spPos1 !== "" &&
          spNiveau !== "" &&
          verfSpielerComplete &&
          spStarkerFus !== "" &&
          spJahrgang.trim() !== ""
        : false);

  const trainerDetailsOk =
    rolle !== "trainer" ||
    (trLizenz !== "" && trErfahrung.length > 0);

  const em = kontaktEmail.trim();
  const ha = kontaktHandy.trim();
  const kontaktOk =
    (em.length > 0 || ha.length > 0) &&
    isValidKontaktEmailField(kontaktEmail) &&
    isValidKontaktHandyField(kontaktHandy);

  const canSubmit =
    basisOk && spielerDetailsOk && trainerDetailsOk && kontaktOk;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      return;
    }
    const r = rolle as BoerseRolle;
    let ad: BoerseDemoAnzeige;
    if (r === "spieler") {
      const position = spielerPositionAuswahl().trim();
      if (!position) {
        return;
      }
      ad = boerseNeueAnzeigeBauen({
        typ: typ as BoerseAnzeigeTyp,
        rolle: "spieler",
        bundesland,
        beschreibung: weitere,
        verfuegbarkeit: verfuegbarkeitFromSpielerForm(spVerfArt, spVerfDatum),
        position,
        niveau: spNiveau,
        jahrgang:
          (typ as BoerseAnzeigeTyp) === "suche"
            ? `${spJahrgangVon.trim()}–${spJahrgangBis.trim()}`
            : spJahrgang.trim(),
        starkerFus: spStarkerFus,
        kontaktEmail,
        kontaktHandy,
      });
    } else {
      const lizenz = trLizenz.trim();
      const erfahrungTrainer = formatTrErfahrungStorage(trErfahrung).trim();
      if (!lizenz || !erfahrungTrainer) {
        return;
      }
      ad = boerseNeueAnzeigeBauen({
        typ: typ as BoerseAnzeigeTyp,
        rolle: "trainer",
        bundesland,
        beschreibung: weitere,
        verfuegbarkeit: "sofort",
        lizenz,
        erfahrungTrainer,
        kontaktEmail,
        kontaktHandy,
      });
    }
    onCreated(ad);
    onClose();
  }

  const fieldLabel =
    "text-sm font-medium text-white [&>span]:ml-0.5 [&>span]:text-red-500";

  const fieldSelect =
    "mt-1.5 h-11 w-full rounded-lg border border-white/15 bg-zinc-950 px-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-white/35 focus:ring-2 focus:ring-white/15";

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className={cn(
        "fixed inset-0 z-50 m-0 h-dvh max-h-none w-full max-w-none border-0 bg-transparent p-4 shadow-none sm:p-6",
        "[&::backdrop]:bg-black/70 [&::backdrop]:backdrop-blur-sm",
      )}
      aria-labelledby="boerse-create-title"
    >
      {open ? (
        <div
          className="flex h-full min-h-0 w-full items-center justify-center"
          onClick={onClose}
        >
          <div
            className="flex max-h-[min(92vh,860px)] w-[min(100vw-2rem,520px)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-black text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 px-6 pt-6">
              <div className="min-w-0 pr-2">
                <h2
                  id="boerse-create-title"
                  className="text-xl font-bold tracking-tight text-white"
                >
                  Neue Anzeige erstellen
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  E-Mail oder Handynummer ist Pflicht — so können Interessenten
                  Kontakt aufnehmen und Sie werden benachrichtigt. Die Anzeige wird in
                  Ihrem Browser gespeichert (ohne Server).
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                aria-label="Schließen"
              >
                <span className="text-lg leading-none" aria-hidden>
                  ✕
                </span>
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="flex min-h-0 flex-1 flex-col px-6 pb-6 pt-5"
            >
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pr-1 [scrollbar-color:rgb(63_63_70)_rgb(24_24_27)] [scrollbar-width:thin]">
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className={fieldLabel}>
                    Typ<span aria-hidden>*</span>
                    <select
                      required
                      className={fieldSelect}
                      value={typ}
                      onChange={(e) => setTyp(e.target.value)}
                    >
                      <option value="">Auswählen</option>
                      <option value="suche">Suche</option>
                      <option value="biete">Biete</option>
                    </select>
                  </label>
                  <label className={fieldLabel}>
                    Rolle<span aria-hidden>*</span>
                    <select
                      required
                      className={fieldSelect}
                      value={rolle}
                      onChange={(e) => setRolle(e.target.value)}
                    >
                      <option value="">Auswählen</option>
                      <option value="spieler">Spieler</option>
                      <option value="trainer">Trainer</option>
                    </select>
                  </label>
                </div>

                <label className={fieldLabel}>
                  Bundesland<span aria-hidden>*</span>
                  <select
                    required
                    className={fieldSelect}
                    value={bundesland}
                    onChange={(e) => setBundesland(e.target.value)}
                  >
                    <option value="">Auswählen</option>
                    {BOERSE_BUNDESLAENDER_FORM.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </label>

                {rolle === "spieler" && typ === "suche" ? (
                  <div className="rounded-xl border border-white/10 bg-zinc-950/85 p-4 text-zinc-100 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] ring-1 ring-white/[0.06]">
                    <h3 className="text-sm font-bold text-white">
                      Spieler-Details
                    </h3>
                    <p className="mt-1 text-xs text-zinc-400">
                      Suchprofil — wen sucht ihr?
                    </p>

                    <div className="mt-4 space-y-2">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className={cardLabel}>
                          Position Primär<span className="text-red-400">*</span>
                          <select
                            required
                            className={cardSelect}
                            value={spPos1}
                            onChange={(e) => {
                              const v = e.target.value;
                              setSpPos1(v);
                              if (!v) {
                                setSpPos2("");
                              } else if (spPos2 === v) {
                                setSpPos2("");
                              }
                            }}
                          >
                            <option value="">Auswählen</option>
                            {BOERSE_FORM_POSITION_CODES.map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label
                          className={cn(
                            cardLabel,
                            !spPos1 && "text-zinc-500",
                          )}
                        >
                          Position Sekundär
                          <span className="ml-1 text-xs font-normal text-zinc-500">
                            (optional)
                          </span>
                          <select
                            disabled={!spPos1}
                            className={cn(
                              cardSelect,
                              !spPos1 &&
                                "cursor-not-allowed opacity-45",
                            )}
                            value={spPos1 ? spPos2 : ""}
                            onChange={(e) => setSpPos2(e.target.value)}
                            aria-disabled={!spPos1}
                            title={
                              spPos1
                                ? undefined
                                : "Zuerst Position Primär wählen"
                            }
                          >
                            <option value="">
                              {spPos1 ? "—" : "Zuerst Primär wählen"}
                            </option>
                            {BOERSE_FORM_POSITION_CODES.filter((p) => p !== spPos1).map(
                              (p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                      </div>
                      <p className="text-xs text-zinc-500">
                        Maximal zwei Positionen (Kürzel). Sekundär erst nach
                        Primär.
                      </p>
                    </div>

                    <label className={cn(cardLabel, "mt-5 block")}>
                      Niveau<span className="text-red-400">*</span>
                      <select
                        required
                        className={cardSelect}
                        value={spNiveau}
                        onChange={(e) => setSpNiveau(e.target.value)}
                      >
                        <option value="">Auswählen</option>
                        {BOERSE_FORM_NIVEAU.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="mt-4 max-w-full sm:max-w-[min(100%,240px)]">
                      <label className={cardLabel}>
                        Starker Fuß<span className="text-red-400">*</span>
                        <select
                          required
                          className={cardSelect}
                          value={spStarkerFus}
                          onChange={(e) => setSpStarkerFus(e.target.value)}
                        >
                          <option value="">Auswählen</option>
                          {BOERSE_FORM_STARKER_FUSS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-4">
                      <label className={cardLabel}>
                        Jahrgang von<span className="text-red-400">*</span>
                        <input
                          type="number"
                          min={1970}
                          max={2100}
                          placeholder="z.B. 1998"
                          className={cn(
                            cardSelect,
                            "tabular-nums [appearance:auto]",
                          )}
                          value={spJahrgangVon || ""}
                          onChange={(e) => {
                            const v = e.target.value.slice(0, 4);
                            setSpJahrgangVon(v.replace(/\D/g, ""));
                          }}
                        />
                      </label>
                      <label className={cardLabel}>
                        Jahrgang bis<span className="text-red-400">*</span>
                        <input
                          type="number"
                          min={1970}
                          max={2100}
                          placeholder="z.B. 2003"
                          className={cn(
                            cardSelect,
                            "tabular-nums [appearance:auto]",
                          )}
                          value={spJahrgangBis || ""}
                          onChange={(e) => {
                            const v = e.target.value.slice(0, 4);
                            setSpJahrgangBis(v.replace(/\D/g, ""));
                          }}
                        />
                      </label>
                    </div>

                    <div className="mt-4 space-y-2">
                      <label className={cn(cardLabel, "block")}>
                        Verfügbarkeit<span className="text-red-400">*</span>
                        <select
                          required
                          className={cardSelect}
                          value={spVerfArt}
                          onChange={(e) => {
                            const v = e.target.value as "" | "sofort" | "datum";
                            setSpVerfArt(v);
                            if (v !== "datum") {
                              setSpVerfDatum("");
                            }
                          }}
                        >
                          <option value="">Auswählen</option>
                          <option value="sofort">Sofort</option>
                          <option value="datum">Ab Datum</option>
                        </select>
                      </label>
                      {spVerfArt === "datum" ? (
                        <input
                          type="date"
                          required
                          min={todayIsoDateLocal()}
                          className={cardSelect}
                          value={spVerfDatum}
                          onChange={(e) => setSpVerfDatum(e.target.value)}
                          aria-label="Verfügbar ab Datum"
                        />
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {rolle === "spieler" && typ === "biete" ? (
                  <div className="rounded-xl border border-white/10 bg-zinc-950/85 p-4 text-zinc-100 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] ring-1 ring-white/[0.06]">
                    <h3 className="text-sm font-bold text-white">
                      Spieler-Details
                    </h3>
                    <p className="mt-1 text-xs text-zinc-400">
                      Spielbereiche und Profil
                    </p>

                    <div className="mt-4 space-y-2">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className={cardLabel}>
                          Position Primär<span className="text-red-400">*</span>
                          <select
                            required
                            className={cardSelect}
                            value={spPos1}
                            onChange={(e) => {
                              const v = e.target.value;
                              setSpPos1(v);
                              if (!v) {
                                setSpPos2("");
                              } else if (spPos2 === v) {
                                setSpPos2("");
                              }
                            }}
                          >
                            <option value="">Auswählen</option>
                            {BOERSE_FORM_POSITION_CODES.map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label
                          className={cn(
                            cardLabel,
                            !spPos1 && "text-zinc-500",
                          )}
                        >
                          Position Sekundär
                          <span className="ml-1 text-xs font-normal text-zinc-500">
                            (optional)
                          </span>
                          <select
                            disabled={!spPos1}
                            className={cn(
                              cardSelect,
                              !spPos1 &&
                                "cursor-not-allowed opacity-45",
                            )}
                            value={spPos1 ? spPos2 : ""}
                            onChange={(e) => setSpPos2(e.target.value)}
                            aria-disabled={!spPos1}
                            title={
                              spPos1
                                ? undefined
                                : "Zuerst Position Primär wählen"
                            }
                          >
                            <option value="">
                              {spPos1 ? "—" : "Zuerst Primär wählen"}
                            </option>
                            {BOERSE_FORM_POSITION_CODES.filter((p) => p !== spPos1).map(
                              (p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                      </div>
                      <p className="text-xs text-zinc-500">
                        Maximal zwei Positionen (Kürzel). Sekundär erst nach
                        Primär.
                      </p>
                    </div>

                    <label className={cn(cardLabel, "mt-5 block")}>
                      Niveau<span className="text-red-400">*</span>
                      <select
                        required
                        className={cardSelect}
                        value={spNiveau}
                        onChange={(e) => setSpNiveau(e.target.value)}
                      >
                        <option value="">Auswählen</option>
                        {BOERSE_FORM_NIVEAU.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className={cardLabel}>
                          Verfügbarkeit<span className="text-red-400">*</span>
                          <select
                            required
                            className={cardSelect}
                            value={spVerfArt}
                            onChange={(e) => {
                              const v = e.target.value as
                                | ""
                                | "sofort"
                                | "datum";
                              setSpVerfArt(v);
                              if (v !== "datum") {
                                setSpVerfDatum("");
                              }
                            }}
                          >
                            <option value="">Auswählen</option>
                            <option value="sofort">Sofort</option>
                            <option value="datum">Ab Datum</option>
                          </select>
                        </label>
                        {spVerfArt === "datum" ? (
                          <input
                            type="date"
                            required
                            min={todayIsoDateLocal()}
                            className={cardSelect}
                            value={spVerfDatum}
                            onChange={(e) => setSpVerfDatum(e.target.value)}
                            aria-label="Verfügbar ab Datum"
                          />
                        ) : null}
                      </div>
                      <label className={cardLabel}>
                        Starker Fuß<span className="text-red-400">*</span>
                        <select
                          required
                          className={cardSelect}
                          value={spStarkerFus}
                          onChange={(e) => setSpStarkerFus(e.target.value)}
                        >
                          <option value="">Auswählen</option>
                          {BOERSE_FORM_STARKER_FUSS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <label className={cn(cardLabel, "mt-4 block")}>
                      Jahrgang<span className="text-red-400">*</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]{4}"
                        placeholder="z.B. 2000"
                        className={cn(cardSelect, "tabular-nums")}
                        value={spJahrgang}
                        onChange={(e) =>
                          setSpJahrgang(
                            e.target.value.replace(/\D/g, "").slice(0, 4),
                          )
                        }
                      />
                    </label>
                  </div>
                ) : null}

                {rolle === "trainer" ? (
                  <div className="rounded-xl border border-white/10 bg-zinc-950/85 p-4 text-zinc-100 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] ring-1 ring-white/[0.06]">
                    <h3 className="text-sm font-bold text-white">
                      Trainer-Details
                    </h3>
                    <p className="mt-1 text-xs text-zinc-400">
                      Qualifikation und Erfahrung
                    </p>

                    <label className={cn(cardLabel, "mt-4 block")}>
                      Lizenz<span className="text-red-400">*</span>
                      <select
                        required={rolle === "trainer"}
                        className={cardSelect}
                        value={trLizenz}
                        onChange={(e) => setTrLizenz(e.target.value)}
                      >
                        <option value="">Auswählen</option>
                        {BOERSE_FORM_LIZENZ.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="mt-4">
                      <p className={cardLabel}>
                        Erfahrung<span className="text-red-400">*</span>
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Mehrfachauswahl möglich.
                      </p>
                      <div
                        className="mt-2 grid grid-cols-2 gap-3 sm:gap-4"
                        role="group"
                        aria-label="Erfahrung Bereiche"
                      >
                        {BOERSE_FORM_ERFAHRUNG.map((x) => (
                          <label key={x} className={trainerErfahrungCheckboxClass}>
                            <input
                              type="checkbox"
                              checked={trErfahrung.includes(x)}
                              onChange={() => {
                                setTrErfahrung((prev) =>
                                  prev.includes(x)
                                    ? prev.filter((t) => t !== x)
                                    : [...prev, x],
                                );
                              }}
                              className="h-4 w-4 rounded border-zinc-500 bg-zinc-950 text-emerald-400 focus:ring-emerald-500/30"
                            />
                            {x}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="rounded-xl border border-white/10 bg-zinc-950/85 p-4 ring-1 ring-white/[0.06]">
                  <h3 className="text-sm font-bold text-white">
                    Kontakt für Rückmeldungen
                  </h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    Mindestens eines ausfüllen — Pflichtfeld.
                  </p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className={fieldLabel}>
                      E-Mail
                      <input
                        type="email"
                        autoComplete="email"
                        value={kontaktEmail}
                        onChange={(e) => setKontaktEmail(e.target.value)}
                        placeholder="name@beispiel.at"
                        className={fieldSelect}
                      />
                    </label>
                    <label className={fieldLabel}>
                      Handynummer
                      <input
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        value={kontaktHandy}
                        onChange={(e) => setKontaktHandy(e.target.value)}
                        placeholder="+43 …"
                        className={fieldSelect}
                      />
                    </label>
                  </div>
                  {!kontaktOk && (em.length > 0 || ha.length > 0) ? (
                    <p className="mt-2 text-xs text-amber-400">
                      Bitte gültige E-Mail und/oder Telefonnummer (mind. 6 Ziffern)
                      angeben.
                    </p>
                  ) : null}
                  {em.length === 0 && ha.length === 0 ? (
                    <p className="mt-2 text-xs text-zinc-500">
                      Geben Sie mindestens E-Mail oder Handynummer an.
                    </p>
                  ) : null}
                </div>

                <label className="block">
                  <span className="text-sm font-medium text-white">
                    Weitere Informationen{" "}
                    <span className="font-normal text-zinc-500">
                      ({weitere.length}/{BOERSE_WEITERE_MAX} Zeichen)
                    </span>
                  </span>
                  <textarea
                    value={weitere}
                    onChange={(e) =>
                      setWeitere(
                        e.target.value.slice(0, BOERSE_WEITERE_MAX),
                      )
                    }
                    rows={5}
                    placeholder="Beschreiben Sie hier weitere Details zur Anzeige…"
                    className={cn(
                      fieldSelect,
                      "mt-1.5 min-h-[120px] resize-y py-3 leading-relaxed",
                    )}
                  />
                </label>
              </div>

              <div className="mt-6 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-white/25 bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="rounded-lg border border-white/20 bg-zinc-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Anzeige erstellen
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}

function AnzeigeCard({
  a,
  onOpen,
  onKontakt,
}: {
  a: BoerseDemoAnzeige;
  onOpen: () => void;
  onKontakt: () => void;
}) {
  const typLabel = a.typ === "suche" ? "Suche" : "Biete";
  const rolleLabel = a.rolle === "spieler" ? "Spieler" : "Trainer";
  const kontaktMoeglich = boerseHatKontakt(a);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`Anzeige ${a.refId} öffnen`}
      className={cn(
        "flex h-full cursor-pointer flex-col rounded-2xl border border-border bg-card p-5 shadow-[0_8px_30px_-10px_rgba(0,0,0,0.5)] ring-1 ring-white/[0.04] transition hover:border-brand/35 hover:ring-brand/10",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
              a.typ === "suche"
                ? "border-sky-500/40 bg-sky-950/50 text-sky-200"
                : "border-emerald-500/40 bg-emerald-950/40 text-emerald-200",
            )}
          >
            {typLabel}
          </span>
          <span className="rounded-full border border-border bg-panel px-2.5 py-0.5 text-[11px] font-medium text-foreground">
            {rolleLabel}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <IconCalendar />
          {a.datumLabel}
        </div>
      </div>

      <dl className="mt-4 space-y-2.5 text-sm">
        <div className="flex gap-2">
          <IconPin />
          <div>
            <dt className="sr-only">Region</dt>
            <dd className="text-foreground">{a.bundesland}</dd>
          </div>
        </div>
        {a.rolle === "spieler" ? (
          <div className="flex gap-2">
            <IconUser />
            <div>
              <dt className="sr-only">Position</dt>
              <dd>
                <span className="text-muted">Position: </span>
                <span className="text-foreground">{a.position}</span>
              </dd>
            </div>
          </div>
        ) : null}
        {a.rolle === "spieler" && a.niveau ? (
          <div className="flex gap-2">
            <IconMedal />
            <div>
              <dt className="sr-only">Niveau</dt>
              <dd>
                <span className="text-muted">Niveau: </span>
                <span className="text-foreground">{a.niveau}</span>
              </dd>
            </div>
          </div>
        ) : null}
        {a.rolle === "trainer" ? (
          <div className="flex gap-2">
            <IconMedal />
            <div>
              <dt className="sr-only">Lizenz</dt>
              <dd>
                <span className="text-muted">Lizenz: </span>
                <span className="text-foreground">{a.lizenz}</span>
              </dd>
            </div>
          </div>
        ) : null}
        {a.rolle === "trainer" ? (
          <div className="flex gap-2">
            <IconUser />
            <div>
              <dt className="sr-only">Erfahrung</dt>
              <dd>
                <span className="text-muted">Erfahrung: </span>
                <span className="text-foreground">{a.erfahrungTrainer}</span>
              </dd>
            </div>
          </div>
        ) : null}
        {a.jahrgang ? (
          <div className="flex gap-2">
            <IconCalendar />
            <div>
              <dt className="sr-only">Jahrgang</dt>
              <dd>
                <span className="text-muted">Jahrgang: </span>
                <span className="text-foreground">{a.jahrgang}</span>
              </dd>
            </div>
          </div>
        ) : null}
        {a.starkerFus ? (
          <div className="flex gap-2">
            <IconFoot />
            <div>
              <dt className="sr-only">Starker Fuß</dt>
              <dd>
                <span className="text-muted">Starker Fuß: </span>
                <span className="text-foreground capitalize">{a.starkerFus}</span>
              </dd>
            </div>
          </div>
        ) : null}
        <div className="flex gap-2">
          <IconCheck />
          <div>
            <dt className="sr-only">Verfügbarkeit</dt>
            <dd>
              <span className="text-muted">Verfügbar: </span>
              <span
                className={cn(
                  "font-medium",
                  a.verfuegbarkeit.toLowerCase().includes("sofort")
                    ? "text-emerald-400"
                    : "text-foreground",
                )}
              >
                {a.verfuegbarkeit === "sofort" ? "Sofort" : a.verfuegbarkeit}
              </span>
            </dd>
          </div>
        </div>
      </dl>

      <div className="mt-4 rounded-xl border border-border/80 bg-panel/80 px-3 py-3 text-sm leading-relaxed text-muted">
        {a.beschreibung}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4">
        <p className="font-mono text-[10px] text-muted">Ref: {a.refId}</p>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand/35 bg-brand/10 px-3 py-2 text-xs font-semibold text-brand transition hover:bg-brand/20 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!kontaktMoeglich}
          title={
            kontaktMoeglich
              ? "Kontakt aufnehmen"
              : "Keine Kontaktdaten für diese Anzeige"
          }
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            if (kontaktMoeglich) {
              onKontakt();
            }
          }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <IconMessage className="text-brand" />
          Kontaktieren
        </button>
      </div>
    </article>
  );
}

export function BoerseMarketplace() {
  const [view, setView] = useState<ViewMode>("table");
  const [sortKey, setSortKey] = useState<BoerseSortKey>("datum");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [q, setQ] = useState("");
  const [typ, setTyp] = useState<string>("alle");
  const [rolle, setRolle] = useState<string>("alle");
  const [bundesland, setBundesland] = useState<string>("Alle Bundesländer");
  const [position, setPosition] = useState<string>("alle");
  const [lizenz, setLizenz] = useState<string>("alle");
  const [niveau, setNiveau] = useState<string>("alle");
  const [verf, setVerf] = useState<string>("alle");
  const [detailAnzeige, setDetailAnzeige] = useState<BoerseDemoAnzeige | null>(
    null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [kontaktAnzeige, setKontaktAnzeige] = useState<BoerseDemoAnzeige | null>(
    null,
  );
  const [meineAnfragenOpen, setMeineAnfragenOpen] = useState(false);
  const [anfragenCount, setAnfragenCount] = useState(0);
  const [anzeigen, setAnzeigen] = useState<BoerseDemoAnzeige[]>(() => [
    ...BOERSE_DEMO_ANZEIGEN,
  ]);
  const [storageReady, setStorageReady] = useState(false);

  const { session: authSession, isLoading: authLoading } =
    useSupabaseAuthSession();
  const isLoggedIn = Boolean(authSession?.user);

  useEffect(() => {
    const tick = () => setAnfragenCount(countContactRequestsForMyAds());
    tick();
    window.addEventListener("storage", onStorage);
    window.addEventListener("scoutbase-boerse-anfrage", tick);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("scoutbase-boerse-anfrage", tick);
    };
    function onStorage(e: StorageEvent) {
      if (e.key === BOERSE_CONTACT_REQUESTS_KEY) {
        tick();
      }
    }
  }, []);

  useEffect(() => {
    const fromLs = loadBoerseAnzeigenFromStorage();
    if (fromLs) {
      setAnzeigen(fromLs);
    }
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) {
      return;
    }
    try {
      localStorage.setItem(BOERSE_STORAGE_KEY, JSON.stringify(anzeigen));
    } catch {
      /* Quota oder private mode */
    }
  }, [anzeigen, storageReady]);

  function handleSort(key: BoerseSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "datum" ? "desc" : "asc");
    }
  }

  const filtered = useMemo(() => {
    return anzeigen.filter((a) => {
      const hay = `${a.beschreibung} ${a.position ?? ""} ${a.bundesland} ${a.refId}`.toLowerCase();
      if (q.trim() && !hay.includes(q.trim().toLowerCase())) {
        return false;
      }
      if (typ !== "alle" && a.typ !== typ) {
        return false;
      }
      if (rolle !== "alle" && a.rolle !== rolle) {
        return false;
      }
      if (bundesland !== "Alle Bundesländer" && a.bundesland !== bundesland) {
        return false;
      }
      if (position !== "alle") {
        if (a.rolle !== "spieler") {
          return false;
        }
        const hay = (a.position ?? "").toUpperCase();
        const f = position.toUpperCase();
        const tokens = hay.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);
        if (!tokens.some((t) => t === f)) {
          return false;
        }
      }
      if (lizenz !== "alle" && a.rolle === "trainer") {
        if ((a.lizenz ?? "").trim() !== lizenz) {
          return false;
        }
      }
      if (lizenz !== "alle" && a.rolle === "spieler") {
        return false;
      }
      if (niveau !== "alle" && a.rolle === "spieler") {
        if ((a.niveau ?? "").trim() !== niveau) {
          return false;
        }
      }
      if (niveau !== "alle" && a.rolle === "trainer") {
        return false;
      }
      if (verf !== "alle") {
        const v = a.verfuegbarkeit.toLowerCase();
        if (verf === "sofort" && v !== "sofort") {
          return false;
        }
        if (verf === "spaeter" && v === "sofort") {
          return false;
        }
      }
      return true;
    });
  }, [anzeigen, q, typ, rolle, bundesland, position, lizenz, niveau, verf]);

  const sortedRows = useMemo(() => {
    const out = [...filtered];
    out.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "typ":
          cmp = a.typ.localeCompare(b.typ);
          break;
        case "rolle":
          cmp = a.rolle.localeCompare(b.rolle);
          break;
        case "datum":
          cmp =
            parseDatumLabel(a.datumLabel) - parseDatumLabel(b.datumLabel);
          break;
        case "region":
          cmp = a.bundesland.localeCompare(b.bundesland, "de");
          break;
        case "position":
          cmp = (a.position ?? "").localeCompare(b.position ?? "", "de");
          break;
        case "niveau":
          cmp = (a.niveau ?? "").localeCompare(b.niveau ?? "", "de");
          break;
        case "lizenz": {
          const la = `${a.lizenz ?? ""} ${a.erfahrungTrainer ?? ""}`.trim();
          const lb = `${b.lizenz ?? ""} ${b.erfahrungTrainer ?? ""}`.trim();
          cmp = la.localeCompare(lb, "de");
          break;
        }
        case "beschreibung":
          cmp = a.beschreibung.localeCompare(b.beschreibung, "de");
          break;
        case "verf":
          cmp = verfLabel(a).localeCompare(verfLabel(b), "de");
          break;
        case "ref":
          cmp = a.refId.localeCompare(b.refId);
          break;
        default:
          cmp = 0;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [filtered, sortKey, sortDir]);

  const total = anzeigen.length;

  function resetFilters() {
    setQ("");
    setTyp("alle");
    setRolle("alle");
    setBundesland("Alle Bundesländer");
    setPosition("alle");
    setLizenz("alle");
    setNiveau("alle");
    setVerf("alle");
  }

  return (
    <>
      <BoerseKontaktaufnahmeDialog
        anzeige={kontaktAnzeige}
        open={kontaktAnzeige !== null}
        onClose={() => setKontaktAnzeige(null)}
      />
      <MeineKontaktanfragenDialog
        open={meineAnfragenOpen}
        onClose={() => setMeineAnfragenOpen(false)}
        anzeigen={anzeigen}
      />
      <AnzeigeDetailDialog
        anzeige={detailAnzeige}
        onClose={() => setDetailAnzeige(null)}
        onKontaktieren={(a) => {
          setDetailAnzeige(null);
          setKontaktAnzeige(a);
        }}
      />
      <BoerseCreateAnzeigeDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(a) => {
          appendMyAdId(a.id);
          setAnzeigen((prev) => [a, ...prev]);
        }}
      />
      <div className="flex shrink-0 flex-col gap-4 border-b border-brand/15 bg-gradient-to-b from-rose-950/35 via-background to-background px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Börse
            </h1>
            <p className="mt-2 text-sm text-muted">
              {filtered.length} von {total} Anzeigen
              {filtered.length < total ? " (gefiltert)" : ""}
            </p>
            {anfragenCount > 0 && isLoggedIn && !authLoading ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand/10 px-3 py-2 text-sm text-foreground">
                <span className="font-medium text-brand">
                  {anfragenCount} neue Kontaktanfrage
                  {anfragenCount === 1 ? "" : "n"}
                </span>
                <span className="text-muted">zu Ihren Anzeigen</span>
                <button
                  type="button"
                  onClick={() => setMeineAnfragenOpen(true)}
                  className="rounded-lg border border-brand/40 bg-background/80 px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand/15"
                >
                  Anzeigen
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-brand/40 bg-brand/15 px-4 py-3 text-sm font-semibold text-brand shadow-sm transition hover:bg-brand/25 sm:w-auto"
          >
            <IconPlusDoc />
            Anzeige erstellen
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
        <section
          className="rounded-2xl border border-border bg-card p-5 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.45)] sm:p-6"
          aria-labelledby="boerse-filter-heading"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <IconFunnel />
              <h2
                id="boerse-filter-heading"
                className="text-base font-semibold text-foreground"
              >
                Filter &amp; Suche
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-brand/40 bg-brand/15 px-4 py-2.5 text-sm font-semibold text-brand shadow-sm transition hover:bg-brand/25 sm:w-auto"
            >
              <IconPlusDoc />
              Anzeige erstellen
            </button>
          </div>

          <label className="mt-4 block">
            <span className="text-xs font-medium text-muted">Suche in Anzeigen</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Suche in Anzeigen…"
              className="mt-1.5 h-11 w-full rounded-xl border border-border bg-panel px-4 text-sm text-foreground placeholder:text-muted outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/20"
            />
          </label>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-xs font-medium text-muted">
              Typ
              <select
                className={FILTER_SELECT}
                value={typ}
                onChange={(e) => setTyp(e.target.value)}
              >
                <option value="alle">Alle Typen</option>
                <option value="suche">Suche</option>
                <option value="biete">Biete</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-muted">
              Rolle
              <select
                className={FILTER_SELECT}
                value={rolle}
                onChange={(e) => setRolle(e.target.value)}
              >
                <option value="alle">Alle Rollen</option>
                <option value="spieler">Spieler</option>
                <option value="trainer">Trainer</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-muted">
              Bundesland
              <select
                className={FILTER_SELECT}
                value={bundesland}
                onChange={(e) => setBundesland(e.target.value)}
              >
                {BOERSE_BUNDESLAENDER.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-muted">
              Position (Spieler)
              <select
                className={FILTER_SELECT}
                value={position}
                onChange={(e) => setPosition(e.target.value)}
              >
                <option value="alle">Alle Positionen</option>
                {BOERSE_FORM_POSITION_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-muted">
              Lizenz (Trainer)
              <select
                className={FILTER_SELECT}
                value={lizenz}
                onChange={(e) => setLizenz(e.target.value)}
              >
                <option value="alle">Alle Lizenzen</option>
                {BOERSE_FORM_LIZENZ.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-muted">
              Niveau (Spieler)
              <select
                className={FILTER_SELECT}
                value={niveau}
                onChange={(e) => setNiveau(e.target.value)}
              >
                <option value="alle">Alle Niveaus</option>
                {BOERSE_FORM_NIVEAU.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-muted">
              Verfügbarkeit
              <select
                className={FILTER_SELECT}
                value={verf}
                onChange={(e) => setVerf(e.target.value)}
              >
                <option value="alle">Alle</option>
                <option value="sofort">Sofort</option>
                <option value="spaeter">Später / Datum</option>
              </select>
            </label>
          </div>

          <div className="mt-6 border-t border-border/80 pt-5">
            <button
              type="button"
              onClick={resetFilters}
              className="text-sm font-medium text-brand hover:underline"
            >
              Filter zurücksetzen
            </button>
          </div>
        </section>

        {filtered.length === 0 ? (
          <p className="mt-10 text-center text-sm text-muted">
            Keine Anzeigen passend zu den Filtern.
          </p>
        ) : (
          <>
            <div
              className="mt-8 border-t border-border/50 pt-5"
              aria-label="Ansicht wechseln"
            >
              <div className="flex justify-end">
                <div
                  className="inline-flex items-center gap-0.5 rounded-xl border border-border/70 bg-card/60 p-1 shadow-sm ring-1 ring-white/[0.04]"
                  role="group"
                >
                  <button
                    type="button"
                    onClick={() => setView("table")}
                    title="Tabellenansicht"
                    aria-pressed={view === "table"}
                    className={cn(
                      "rounded-lg p-2.5 transition-colors",
                      "text-muted hover:bg-panel hover:text-foreground",
                      view === "table" &&
                        "bg-panel text-foreground ring-1 ring-border shadow-sm",
                    )}
                  >
                    <IconViewTable className="h-5 w-5" />
                    <span className="sr-only">Tabellenansicht</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("grid")}
                    title="Kachelansicht"
                    aria-pressed={view === "grid"}
                    className={cn(
                      "rounded-lg p-2.5 transition-colors",
                      "text-muted hover:bg-panel hover:text-foreground",
                      view === "grid" &&
                        "bg-panel text-foreground ring-1 ring-border shadow-sm",
                    )}
                  >
                    <IconViewGrid className="h-5 w-5" />
                    <span className="sr-only">Kachelansicht</span>
                  </button>
                </div>
              </div>
            </div>

            {view === "table" ? (
          <div className="mt-6 space-y-2">
            <p className="text-xs leading-relaxed text-muted">
              Sortierung nur lokal in deinem Browser — es werden keine personenbezogenen
              Daten erhoben. Anzeigen sind anonym; die Ref. dient nur der Zuordnung in
              ScoutBase.
            </p>
            <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-[0_8px_32px_-12px_rgba(0,0,0,0.45)] ring-1 ring-white/[0.04]">
            <table className="w-full min-w-[1280px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-gradient-to-r from-brand/90 via-rose-800 to-rose-950 text-xs">
                  <BoerseSortableTh
                    label="Typ"
                    columnKey="typ"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={handleSort}
                    className="pl-4"
                  />
                  <BoerseSortableTh
                    label="Rolle"
                    columnKey="rolle"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={handleSort}
                  />
                  <BoerseSortableTh
                    label="Datum"
                    columnKey="datum"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={handleSort}
                    className="whitespace-nowrap"
                  />
                  <BoerseSortableTh
                    label="Bundesland"
                    columnKey="region"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={handleSort}
                  />
                  <BoerseSortableTh
                    label="Position"
                    columnKey="position"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={handleSort}
                    className="max-w-[140px]"
                  />
                  <BoerseSortableTh
                    label="Niveau"
                    columnKey="niveau"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={handleSort}
                    className="max-w-[120px]"
                  />
                  <BoerseSortableTh
                    label="Lizenz"
                    columnKey="lizenz"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={handleSort}
                    className="max-w-[130px]"
                  />
                  <BoerseSortableTh
                    label="Verfügbar"
                    columnKey="verf"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={handleSort}
                  />
                  <BoerseSortableTh
                    label="Text"
                    columnKey="beschreibung"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={handleSort}
                    className="min-w-[180px]"
                  />
                  <BoerseSortableTh
                    label="Ref"
                    columnKey="ref"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={handleSort}
                    className="font-mono text-[10px] text-rose-100"
                  />
                  <th
                    scope="col"
                    className="px-3 py-3.5 pr-4 text-right text-xs font-bold uppercase tracking-wide text-white"
                  >
                    Aktion
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedRows.map((a) => (
                  <tr
                    key={a.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Anzeige ${a.refId} öffnen`}
                    onClick={() => setDetailAnzeige(a)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDetailAnzeige(a);
                      }
                    }}
                    className="cursor-pointer bg-card transition hover:bg-panel/60"
                  >
                    <td className="px-3 py-3 pl-4 align-middle">
                      <span
                        className={cn(
                          "inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                          a.typ === "suche"
                            ? "border-sky-500/40 bg-sky-950/50 text-sky-200"
                            : "border-emerald-500/40 bg-emerald-950/40 text-emerald-200",
                        )}
                      >
                        {a.typ === "suche" ? "Suche" : "Biete"}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-middle text-foreground">
                      {a.rolle === "spieler" ? "Spieler" : "Trainer"}
                    </td>
                    <td className="px-3 py-3 align-middle whitespace-nowrap text-muted tabular-nums">
                      {a.datumLabel}
                    </td>
                    <td className="px-3 py-3 align-middle text-foreground">
                      {a.bundesland}
                    </td>
                    <td className="max-w-[140px] px-3 py-3 align-middle text-sm text-foreground">
                      {a.rolle === "spieler" ? (
                        a.position
                      ) : (
                        <BoerseCellNichtZutreffend />
                      )}
                    </td>
                    <td className="max-w-[120px] px-3 py-3 align-middle text-sm text-foreground">
                      {a.rolle === "spieler" ? (
                        a.niveau ?? "—"
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="max-w-[130px] px-3 py-3 align-middle text-sm text-foreground">
                      {a.rolle === "trainer" ? (
                        <span className="block">
                          {a.lizenz}
                          <span className="mt-0.5 block text-xs text-muted">
                            {a.erfahrungTrainer}
                          </span>
                        </span>
                      ) : (
                        <BoerseCellNichtZutreffend />
                      )}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-3 align-middle whitespace-nowrap",
                        a.verfuegbarkeit.toLowerCase() === "sofort"
                          ? "font-medium text-emerald-400"
                          : "text-foreground",
                      )}
                    >
                      {verfLabel(a)}
                    </td>
                    <td className="min-w-[180px] max-w-[280px] px-3 py-3 align-middle text-xs leading-snug text-muted">
                      <span className="line-clamp-3 text-foreground">
                        {a.beschreibung}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-middle font-mono text-[10px] text-muted">
                      {a.refId}
                    </td>
                    <td className="px-3 py-3 pr-4 align-middle text-right">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg border border-brand/35 bg-brand/10 px-2.5 py-1.5 text-xs font-semibold text-brand transition hover:bg-brand/20 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={!boerseHatKontakt(a)}
                        title={
                          boerseHatKontakt(a)
                            ? "Kontakt aufnehmen"
                            : "Keine Kontaktdaten"
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          if (boerseHatKontakt(a)) {
                            setKontaktAnzeige(a);
                          }
                        }}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <IconMessage className="h-3.5 w-3.5 text-brand" />
                        Kontakt
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
            ) : (
              <ul className="mt-6 grid gap-5 sm:grid-cols-2">
                {sortedRows.map((a) => (
                  <li key={a.id}>
                    <AnzeigeCard
                      a={a}
                      onOpen={() => setDetailAnzeige(a)}
                      onKontakt={() => setKontaktAnzeige(a)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </>
  );
}
