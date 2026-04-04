"use client";

import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { PlayerProfileView } from "@/components/player-profile-view";
import {
  VereinProfileView,
  type VereinProfileTab,
} from "@/components/verein-profile-view";
import { cn } from "@/lib/cn";
import type { VereinProfileBundleData } from "@/lib/verein-profile-bundle";
import type { SfvPlayerProfileData } from "@/lib/sfv-player-profile";

import type { ProfilePreviewState } from "./profile-preview-context";

type VereinApiPayload = VereinProfileBundleData & {
  activeTab: VereinProfileTab;
  activeSegment: "km" | "res";
  vereinPath: string;
};

type Props = {
  state: ProfilePreviewState;
  onClose: () => void;
};

export function EntityProfileModal({ state, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const [personProfile, setPersonProfile] = useState<SfvPlayerProfileData | null>(
    null,
  );
  const [personErr, setPersonErr] = useState<string | null>(null);
  const [personLoading, setPersonLoading] = useState(false);

  const [vereinUi, setVereinUi] = useState<{
    id: string;
    tab: VereinProfileTab;
    seg: "km" | "res";
  } | null>(null);
  const [vereinPayload, setVereinPayload] = useState<VereinApiPayload | null>(
    null,
  );
  const [vereinErr, setVereinErr] = useState<string | null>(null);
  const [vereinLoading, setVereinLoading] = useState(false);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) {
      return;
    }
    if (state) {
      d.showModal();
    } else if (d.open) {
      d.close();
    }
  }, [state]);

  useEffect(() => {
    if (!state) {
      setPersonProfile(null);
      setPersonErr(null);
      setVereinPayload(null);
      setVereinErr(null);
      setVereinUi(null);
      return;
    }
    if (state.kind === "person") {
      setVereinPayload(null);
      setVereinErr(null);
      setVereinUi(null);
      return;
    }
    if (state.kind === "verein") {
      setVereinUi((prev) => {
        if (prev?.id === state.id) {
          return prev;
        }
        return { id: state.id, tab: "uebersicht", seg: "km" };
      });
    }
  }, [state]);

  useEffect(() => {
    if (!state || state.kind !== "person") {
      return;
    }
    let cancelled = false;
    setPersonLoading(true);
    setPersonErr(null);
    setPersonProfile(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/spieler-profile?personId=${encodeURIComponent(state.id)}`,
        );
        const json = (await res.json()) as
          | SfvPlayerProfileData
          | { error?: string };
        if (cancelled) {
          return;
        }
        if (!res.ok || "error" in json) {
          setPersonErr(
            typeof (json as { error?: string }).error === "string"
              ? (json as { error: string }).error
              : "Profil konnte nicht geladen werden.",
          );
          return;
        }
        setPersonProfile(json as SfvPlayerProfileData);
      } catch {
        if (!cancelled) {
          setPersonErr("Profil konnte nicht geladen werden.");
        }
      } finally {
        if (!cancelled) {
          setPersonLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state]);

  useEffect(() => {
    if (!state || state.kind !== "verein" || !vereinUi) {
      return;
    }
    if (vereinUi.id !== state.id) {
      return;
    }
    let cancelled = false;
    setVereinLoading(true);
    setVereinErr(null);
    setVereinPayload(null);
    void (async () => {
      try {
        const q = new URLSearchParams({
          vereinId: state.id,
          tab: vereinUi.tab,
          segment: vereinUi.seg,
        });
        const res = await fetch(`/api/verein-profile?${q.toString()}`);
        const json: unknown = await res.json();
        if (cancelled) {
          return;
        }
        if (
          !res.ok ||
          !json ||
          typeof json !== "object" ||
          "error" in json
        ) {
          const msg =
            json &&
            typeof json === "object" &&
            "error" in json &&
            typeof (json as { error: unknown }).error === "string"
              ? (json as { error: string }).error
              : "Vereinsprofil konnte nicht geladen werden.";
          setVereinErr(msg);
          return;
        }
        setVereinPayload(json as VereinApiPayload);
      } catch {
        if (!cancelled) {
          setVereinErr("Vereinsprofil konnte nicht geladen werden.");
        }
      } finally {
        if (!cancelled) {
          setVereinLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state, vereinUi]);

  /** Oberen Bereich sichtbar: nicht vertikal zentrieren + Scroll bei neuem Inhalt nach oben */
  useLayoutEffect(() => {
    if (!state) {
      return;
    }
    const el = scrollBodyRef.current;
    if (el) {
      el.scrollTop = 0;
    }
  }, [state, personProfile, vereinPayload]);

  function handleVereinTabChange(
    tab: VereinProfileTab,
    segment: "km" | "res",
  ) {
    setVereinUi((prev) => {
      if (!prev) {
        return prev;
      }
      return { ...prev, tab, seg: segment };
    });
  }

  const fullPageHref =
    state?.kind === "person"
      ? `/spieler/${encodeURIComponent(state.id)}`
      : state?.kind === "verein"
        ? `/vereine/${encodeURIComponent(state.id)}`
        : null;

  const title =
    state?.kind === "person"
      ? "Spielerprofil"
      : state?.kind === "verein"
        ? "Vereinsprofil"
        : "Profil";

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className={cn(
        "fixed inset-0 z-[70] m-0 h-dvh max-h-none w-full max-w-none border-0 bg-transparent p-4 shadow-none sm:p-6",
        "[&::backdrop]:bg-black/70 [&::backdrop]:backdrop-blur-sm",
      )}
      aria-labelledby={titleId}
    >
      {state ? (
        <div
          className="flex h-full min-h-0 w-full cursor-default items-start justify-center p-0 pt-3 pb-6 sm:pt-4 sm:pb-8"
          onClick={onClose}
          role="presentation"
        >
          <div
            className={cn(
              "flex max-h-[min(88dvh,920px)] w-full max-w-profile-modal shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
              <h2
                id={titleId}
                className="text-base font-semibold leading-tight text-foreground sm:text-lg"
              >
                {title}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {fullPageHref ? (
                  <Link
                    href={fullPageHref}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-brand transition hover:bg-brand/10"
                    onClick={(e) => {
                      if (
                        e.button === 0 &&
                        !e.metaKey &&
                        !e.ctrlKey &&
                        !e.shiftKey &&
                        !e.altKey
                      ) {
                        onClose();
                      }
                    }}
                  >
                    Volle Seite öffnen
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-panel hover:text-foreground"
                >
                  Schließen
                </button>
              </div>
            </div>

            <div
              ref={scrollBodyRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4 pt-2 sm:px-4"
            >
              {state.kind === "person" ? (
                <>
                  {personLoading ? (
                    <p className="px-2 py-8 text-center text-sm text-muted">
                      Profil wird geladen…
                    </p>
                  ) : personErr ? (
                    <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                      {personErr}
                    </p>
                  ) : personProfile ? (
                    <PlayerProfileView
                      key={state.id}
                      profile={personProfile}
                      showBackToDirectory={false}
                      variant="modal"
                    />
                  ) : null}
                </>
              ) : (
                <>
                  {vereinLoading ? (
                    <p className="px-2 py-8 text-center text-sm text-muted">
                      Vereinsprofil wird geladen…
                    </p>
                  ) : vereinErr ? (
                    <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                      {vereinErr}
                    </p>
                  ) : vereinPayload ? (
                    <VereinProfileView
                      key={state.id}
                      club={vereinPayload.club}
                      teams={vereinPayload.teams}
                      kader={vereinPayload.kader}
                      ligaTabelle={vereinPayload.ligaTabelle}
                      ergebnisse={vereinPayload.ergebnisse}
                      hasKmTeam={vereinPayload.hasKmTeam}
                      hasResTeam={vereinPayload.hasResTeam}
                      vereinPath={vereinPayload.vereinPath}
                      activeTab={vereinPayload.activeTab}
                      activeSegment={vereinPayload.activeSegment}
                      onTabChange={handleVereinTabChange}
                    />
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
