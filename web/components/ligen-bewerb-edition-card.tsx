import Link from "next/link";

import { bewerbEditionElementId } from "@/lib/ligen-anchor";
import { IconExternalLink } from "@/components/ui/dashboard-icons";
import { cn } from "@/lib/cn";

export type BewerbEditionCardRow = {
  id: string;
  title: string;
  source_url: string;
  is_current: boolean;
};

type Props = {
  edition: BewerbEditionCardRow;
};

export function LigenBewerbEditionCard({ edition }: Props) {
  const anchorId = bewerbEditionElementId(edition.id);

  return (
    <article
      id={anchorId}
      className={cn(
        "group scroll-mt-28 rounded-2xl border bg-card p-5 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.45)] transition",
        edition.is_current
          ? "border-brand/35 ring-1 ring-brand/20"
          : "border-border ring-1 ring-white/[0.06]",
        "hover:border-brand/40 hover:shadow-[0_12px_40px_-8px_rgba(0,0,0,0.55)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {edition.is_current ? (
            <p className="mb-2">
              <span className="inline-flex items-center rounded-full border border-brand/40 bg-brand/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand">
                Aktuelle Saison
              </span>
            </p>
          ) : null}
          <h2 className="text-base font-semibold leading-snug text-foreground sm:text-[17px]">
            <Link
              href={edition.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-start gap-1.5 text-brand transition hover:text-rose-300 hover:underline"
            >
              <span className="min-w-0">{edition.title}</span>
              <IconExternalLink className="mt-0.5 h-4 w-4 shrink-0 opacity-70 group-hover:opacity-100" />
            </Link>
          </h2>
        </div>
      </div>
      <p
        className="mt-3 font-mono text-[10px] leading-relaxed text-muted/90 break-all sm:text-[11px]"
        title={edition.id}
      >
        {edition.id}
      </p>
      <p className="mt-3 text-xs text-muted">
        Offizielle Bewerb-Edition im ÖFB-System — Tabellen und Spielpläne auf der
        verlinkten Seite.
      </p>
    </article>
  );
}
