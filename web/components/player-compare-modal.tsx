"use client";

import Image from "next/image";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { IconSearch } from "@/components/ui/dashboard-icons";
import { cn } from "@/lib/cn";
import { buildPlayerPhotoUrlCandidates } from "@/lib/oefb-assets";
import type { SfvPlayerProfileData } from "@/lib/sfv-player-profile";
import type { SearchSuggestion } from "@/lib/search-suggest";

type Props = {
  open: boolean;
  onClose: () => void;
  baseProfile: SfvPlayerProfileData;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0] + parts[parts.length - 1]![0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "—";
}

function CompareMiniAvatar({
  fotoPublicUid,
  displayName,
}: {
  fotoPublicUid: string | null | undefined;
  displayName: string;
}) {
  const candidates = useMemo(
    () => buildPlayerPhotoUrlCandidates(fotoPublicUid),
    [fotoPublicUid],
  );

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setAttempt(0);
  }, [candidates.join("|")]);

  const src = attempt < candidates.length ? candidates[attempt]! : null;

  if (!src) {
    return (
      <span
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200"
        aria-hidden
      >
        {initials(displayName)}
      </span>
    );
  }

  return (
    <Image
      key={src}
      src={src}
      width={56}
      height={56}
      alt=""
      unoptimized
      className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-border"
      sizes="56px"
      onError={() => setAttempt((a) => a + 1)}
    />
  );
}

function PlayerMiniCard({
  profile,
  label,
}: {
  profile: SfvPlayerProfileData;
  label: string;
}) {
  const pos =
    profile.primaryPositions.length > 0 || profile.secondaryPositions.length > 0
      ? [...profile.primaryPositions, ...profile.secondaryPositions].join(", ")
      : profile.primary?.position_label ?? "—";
  const club = profile.primary?.verein_name ?? "—";
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border-2 border-emerald-500/80 bg-panel p-4 shadow-sm",
        "dark:border-emerald-500/60 dark:bg-slate-900/50",
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <div className="flex items-start gap-3">
        <CompareMiniAvatar
          key={profile.person.id}
          fotoPublicUid={profile.person.foto_public_uid}
          displayName={profile.displayName}
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight text-foreground">
            {profile.displayName}
          </p>
          <p className="mt-0.5 text-xs text-muted">{pos}</p>
          <p className="text-xs text-muted">
            {profile.age != null ? `${profile.age} Jahre` : "—"}
          </p>
          <p className="truncate text-xs text-muted">{club}</p>
        </div>
        <span className="flex h-10 min-w-10 items-center justify-center rounded-lg bg-emerald-600 px-2 text-lg font-bold text-white shadow-inner dark:bg-emerald-700">
          {profile.rating}
        </span>
      </div>
    </div>
  );
}

function CompareRows({ a, b }: { a: SfvPlayerProfileData; b: SfvPlayerProfileData }) {
  const rows: { k: string; av: string; bv: string }[] = [
    { k: "Rating", av: String(a.rating), bv: String(b.rating) },
    {
      k: "Tore (gesamt)",
      av: String(a.totals.goals),
      bv: String(b.totals.goals),
    },
    {
      k: "Einsätze",
      av: String(a.totals.appearances),
      bv: String(b.totals.appearances),
    },
    {
      k: "Karten",
      av: String(a.totals.cards),
      bv: String(b.totals.cards),
    },
    {
      k: "Liga",
      av: a.primary?.liga_label ?? "—",
      bv: b.primary?.liga_label ?? "—",
    },
  ];
  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-panel/80 text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <th className="px-3 py-2">Kennzahl</th>
            <th className="px-3 py-2">{a.displayName}</th>
            <th className="px-3 py-2">{b.displayName}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.k}
              className="border-b border-border/80 last:border-0 odd:bg-card/50"
            >
              <td className="px-3 py-2 font-medium text-muted">{r.k}</td>
              <td className="px-3 py-2 tabular-nums text-foreground">{r.av}</td>
              <td className="px-3 py-2 tabular-nums text-foreground">{r.bv}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PlayerCompareModal({ open, onClose, baseProfile }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [second, setSecond] = useState<SfvPlayerProfileData | null>(null);
  const [loadingSecond, setLoadingSecond] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    const d = dialogRef.current;
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
    if (!open) {
      setSecond(null);
      setQ("");
      setSuggestions([]);
      setHint(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const t = setTimeout(() => {
      const s = q.trim();
      if (s.length < 2) {
        setSuggestions([]);
        return;
      }
      fetch(`/api/search-suggest?q=${encodeURIComponent(s)}`)
        .then((r) => r.json())
        .then((j: { suggestions?: SearchSuggestion[] }) => {
          const list = j.suggestions ?? [];
          setSuggestions(list.filter((x) => x.entity === "person"));
        })
        .catch(() => setSuggestions([]));
    }, 280);
    return () => clearTimeout(t);
  }, [q, open]);

  async function pickSecond(s: SearchSuggestion) {
    setHint(null);
    if (s.id === baseProfile.person.id) {
      setHint("Bitte einen anderen Spieler wählen.");
      return;
    }
    setLoadingSecond(true);
    try {
      const res = await fetch(
        `/api/spieler-profile?personId=${encodeURIComponent(s.id)}`,
      );
      const json = (await res.json()) as
        | SfvPlayerProfileData
        | { error?: string };
      if (!res.ok || "error" in json) {
        setHint(
          typeof (json as { error?: string }).error === "string"
            ? (json as { error: string }).error
            : "Profil konnte nicht geladen werden.",
        );
        return;
      }
      setSecond(json as SfvPlayerProfileData);
      setSuggestions([]);
      setQ("");
    } catch {
      setHint("Profil konnte nicht geladen werden.");
    } finally {
      setLoadingSecond(false);
    }
  }

  function close() {
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={close}
      className={cn(
        "fixed inset-0 z-[90] m-0 h-dvh max-h-none w-full max-w-none border-0 bg-transparent p-4 shadow-none sm:p-6",
        "[&::backdrop]:bg-black/70 [&::backdrop]:backdrop-blur-sm",
      )}
      aria-labelledby={titleId}
    >
      {open ? (
        <div
          className="flex h-full min-h-0 w-full cursor-default items-start justify-center p-0 pt-3 pb-6 sm:pt-4 sm:pb-8"
          onClick={close}
          role="presentation"
        >
          <div
            className="flex max-h-[min(88dvh,920px)] w-full max-w-profile-modal shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
              <h2
                id={titleId}
                className="text-lg font-semibold leading-tight text-foreground"
              >
                Spieler vergleichen
              </h2>
              <button
                type="button"
                onClick={close}
                className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-panel hover:text-foreground"
              >
                Schließen
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <PlayerMiniCard profile={baseProfile} label="Spieler 1" />
                {second ? (
                  <div className="relative">
                    <PlayerMiniCard profile={second} label="Spieler 2" />
                    <button
                      type="button"
                      onClick={() => {
                        setSecond(null);
                        setHint(null);
                      }}
                      className="mt-2 w-full rounded-lg border border-border py-1.5 text-xs font-medium text-muted transition hover:bg-panel"
                    >
                      Anderen Spieler wählen
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col rounded-xl border border-border bg-panel/50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Zweiten Spieler auswählen
                    </p>
                    <label className="relative mt-3 block">
                      <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                      <input
                        type="search"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Spieler suchen…"
                        autoComplete="off"
                        className="h-10 w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground outline-none ring-0 placeholder:text-muted focus:border-brand/40 focus:ring-1 focus:ring-brand/20"
                      />
                    </label>
                    {loadingSecond ? (
                      <p className="mt-3 text-xs text-muted">Laden…</p>
                    ) : null}
                    {hint ? (
                      <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                        {hint}
                      </p>
                    ) : null}
                    {suggestions.length > 0 ? (
                      <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border bg-card text-sm shadow-inner">
                        {suggestions.map((s) => (
                          <li key={s.id}>
                            <button
                              type="button"
                              onClick={() => void pickSecond(s)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-panel"
                            >
                              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                                {s.name}
                              </span>
                              <span className="shrink-0 text-[10px] uppercase text-muted">
                                {s.kindLabel}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : q.trim().length >= 2 && !loadingSecond ? (
                      <p className="mt-3 text-xs text-muted">
                        Keine Treffer — anderen Suchbegriff versuchen.
                      </p>
                    ) : !loadingSecond ? (
                      <p className="mt-4 text-center text-sm text-muted">
                        Wählen Sie einen zweiten Spieler aus, um den Vergleich zu
                        starten.
                      </p>
                    ) : null}
                  </div>
                )}
              </div>

              {second ? (
                <CompareRows a={baseProfile} b={second} />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
