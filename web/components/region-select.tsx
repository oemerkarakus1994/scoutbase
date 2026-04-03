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
    <div className="flex w-full max-w-2xl items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800/50">
      <IconMapPin />
      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
        <span className="shrink-0 text-sm font-medium text-slate-700 dark:text-slate-300">
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
          className="h-10 w-full min-w-0 flex-1 cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-brand/50 focus:bg-white focus:ring-2 focus:ring-brand/15 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100 dark:focus:bg-slate-900"
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
