"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { IconMapPin } from "@/components/ui/dashboard-icons";

export const AUSTRIA_REGIONS = [
  { slug: "alle", label: "Alle" },
  { slug: "wien", label: "Wien" },
  { slug: "niederoesterreich", label: "Niederösterreich" },
  { slug: "oberoesterreich", label: "Oberösterreich" },
  { slug: "salzburg", label: "Salzburg" },
  { slug: "tirol", label: "Tirol" },
  { slug: "vorarlberg", label: "Vorarlberg" },
  { slug: "kaernten", label: "Kärnten" },
  { slug: "steiermark", label: "Steiermark" },
  { slug: "burgenland", label: "Burgenland" },
] as const;

export function RegionSelect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("region") ?? "salzburg";

  return (
    <div className="flex w-full max-w-2xl items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-md">
      <IconMapPin />
      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
        <span className="shrink-0 text-sm font-medium text-foreground">
          Region:
        </span>
        <select
          aria-label="Region wählen"
          value={current}
          onChange={(e) => {
            const next = new URLSearchParams(searchParams.toString());
            next.set("region", e.target.value);
            router.push(`/?${next.toString()}`);
          }}
          className="h-10 w-full min-w-0 flex-1 cursor-pointer rounded-lg border border-border bg-panel px-3 text-sm font-medium text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
        >
          {AUSTRIA_REGIONS.map((r) => (
            <option key={r.slug} value={r.slug}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
