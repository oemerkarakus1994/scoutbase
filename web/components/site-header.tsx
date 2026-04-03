"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { GlobalSearchInput } from "@/components/global-search-input";
import { IconLogIn } from "@/components/ui/dashboard-icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/cn";

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/spieler", label: "Spieler" },
  { href: "/trainer", label: "Trainer" },
  { href: "/vereine", label: "Vereine" },
  { href: "/boerse", label: "Börse" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 overflow-visible border-b border-slate-200/80 bg-white/95 backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/95">
      <div className="mx-auto flex min-h-[76px] max-w-[1400px] items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-3.5 lg:px-8">
        <Link
          href="/"
          className="shrink-0 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
        >
          ScoutBase
        </Link>

        <div className="hidden min-w-0 flex-1 justify-center overflow-visible px-2 md:flex">
          <GlobalSearchInput className="w-full max-w-md" />
        </div>

        <div className="flex flex-1 items-center justify-end gap-1 sm:gap-2 md:flex-none">
          <ThemeToggle />

          <nav
            className="hidden max-w-[min(100%,28rem)] items-center gap-0.5 overflow-x-auto overflow-y-hidden md:flex [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            aria-label="Hauptnavigation"
          >
            {nav.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium leading-snug transition-colors",
                    active
                      ? "border-brand text-brand"
                      : "border-transparent text-slate-600 hover:border-slate-200 hover:text-slate-900 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-100",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <Link
            href="/anmelden"
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand/90 sm:px-5 [&_svg]:text-white"
          >
            <span className="hidden sm:inline">Anmelden</span>
            <span className="sm:hidden">Login</span>
            <IconLogIn className="text-white" />
          </Link>
        </div>
      </div>

      <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800 md:hidden">
        <GlobalSearchInput className="w-full overflow-visible" />
      </div>
    </header>
  );
}
