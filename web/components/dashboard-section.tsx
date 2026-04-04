"use client";

import Image from "next/image";
import { ProfilePreviewLink } from "@/components/profile-preview-link";
import { useEffect, useId, useRef, useState } from "react";

import type { DashboardRankRow } from "@/lib/home-dashboard";
import {
  DashboardStatIcon,
  type DashboardStatKind,
} from "@/components/ui/dashboard-icons";
import { cn } from "@/lib/cn";

type Props = {
  title: string;
  /** Kurzbeschreibung nur für Screenreader */
  description?: string;
  viewAllLabel?: string;
  icon: DashboardStatKind;
  rows: DashboardRankRow[];
  /** Vollständige Rangliste fürs Modal (meist alle Einträge; Vorschau bleibt bei `rows`) */
  modalRows: DashboardRankRow[];
  emptyHint?: string;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (
      parts[0]![0] + parts[parts.length - 1]![0]
    ).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "—";
}

function parseValueDisplay(valueLabel: string): {
  primary: string;
  rest?: string;
  formChars?: string[];
} {
  const t = valueLabel.trim();
  if (/^[WDL]+$/i.test(t)) {
    return { primary: "", formChars: t.split("") };
  }
  const m = t.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (m) {
    return {
      primary: m[1]!,
      rest: m[2]!.trim() || undefined,
    };
  }
  return { primary: t };
}

function RankRowInner({
  row,
  title,
}: {
  row: DashboardRankRow;
  title: string;
}) {
  const stat = parseValueDisplay(row.valueLabel);
  return (
    <>
      <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-muted">
        {row.rank}
      </span>
      {row.photoUrl ? (
        <Image
          src={row.photoUrl}
          width={40}
          height={40}
          alt=""
          className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-border"
          sizes="40px"
        />
      ) : (
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-panel text-[11px] font-bold text-muted ring-1 ring-border"
          aria-hidden
        >
          {initials(row.name)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium leading-snug text-foreground">
          {row.name}
        </p>
        <p className="truncate text-xs leading-snug text-muted">
          {row.subtitle}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {stat.formChars ? (
          <div className="flex justify-end gap-0.5">
            {stat.formChars.map((c, i) => (
              <span
                key={`${title}-${row.rank}-${i}-${c}`}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded border text-[10px] font-bold",
                  c.toUpperCase() === "W" &&
                    "border-rose-300 bg-brand text-white dark:border-brand/40",
                  c.toUpperCase() === "D" &&
                    "border-slate-200 bg-slate-200 text-slate-800",
                  c.toUpperCase() === "L" &&
                    "border-red-200 bg-red-100 text-red-800",
                )}
              >
                {c.toUpperCase()}
              </span>
            ))}
          </div>
        ) : (
          <>
            <p className="text-xl font-bold tabular-nums leading-none text-brand">
              {stat.primary}
            </p>
            {stat.rest ? (
              <p className="mt-0.5 text-[11px] font-medium text-muted">
                {stat.rest}
              </p>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

function RankRowList({
  rows,
  title,
}: {
  rows: DashboardRankRow[];
  title: string;
}) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => {
        const inner = <RankRowInner row={row} title={title} />;
        return (
          <li key={`${title}-${row.rank}-${row.name}-${row.valueLabel}`}>
            {row.href ? (
              <ProfilePreviewLink
                href={row.href}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-panel"
              >
                {inner}
              </ProfilePreviewLink>
            ) : (
              <div className="flex items-center gap-3 px-2 py-2.5">
                {inner}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function DashboardSection({
  title,
  description,
  viewAllLabel = "Alle anzeigen",
  icon,
  rows,
  modalRows,
  emptyHint = "Noch keine Einträge in den Importdaten.",
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();

  const listForModal = modalRows.length > 0 ? modalRows : rows;
  const canExpand = listForModal.length > 0;

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

  function close() {
    setOpen(false);
  }

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_4px_24px_-4px_rgba(0,0,0,0.35)]">
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 pb-4 pt-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <DashboardStatIcon name={icon} />
          <div>
            <h2 className="text-base font-semibold leading-tight tracking-tight text-foreground">
              {title}
            </h2>
            {description ? (
              <p className="sr-only">{description}</p>
            ) : null}
          </div>
        </div>
        {canExpand ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 text-sm font-semibold text-brand hover:underline"
          >
            {viewAllLabel}
            <span aria-hidden> →</span>
          </button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="flex-1 px-5 py-8 text-sm text-muted">{emptyHint}</p>
      ) : (
        <div className="flex-1 px-3 pb-4 pt-1">
          <RankRowList rows={rows} title={title} />
        </div>
      )}

      <dialog
        ref={dialogRef}
        onClose={close}
        className={cn(
          "fixed inset-0 z-[60] m-0 h-dvh max-h-none w-full max-w-none border-0 bg-transparent p-4 shadow-none sm:p-6",
          "[&::backdrop]:bg-black/70 [&::backdrop]:backdrop-blur-sm",
        )}
        aria-labelledby={titleId}
      >
        {open ? (
          <div
            className="flex h-full min-h-0 w-full cursor-default items-center justify-center"
            onClick={close}
            role="presentation"
          >
            <div
              className="flex max-h-[min(88vh,900px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <DashboardStatIcon name={icon} />
                  <h2
                    id={titleId}
                    className="text-lg font-semibold leading-tight text-foreground"
                  >
                    {title}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={close}
                  className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-panel hover:text-foreground"
                >
                  Schließen
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-2">
                <RankRowList rows={listForModal} title={`${title}-modal`} />
              </div>
            </div>
          </div>
        ) : null}
      </dialog>
    </section>
  );
}
