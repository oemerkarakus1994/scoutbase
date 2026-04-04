"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ProfilePreviewProvider } from "@/components/profile-preview-context";
import { GlobalSearchInput } from "@/components/global-search-input";
import { IconLogIn } from "@/components/ui/dashboard-icons";
import { cn } from "@/lib/cn";

const mobileNav = [
  { href: "/", label: "Dashboard" },
  { href: "/spieler", label: "Spieler" },
  { href: "/trainer", label: "Trainer" },
  { href: "/vereine", label: "Vereine" },
  { href: "/ligen", label: "Ligen" },
  { href: "/boerse", label: "Börse" },
] as const;

type Props = {
  children: React.ReactNode;
};

function navLinkClass(active: boolean) {
  return cn(
    "shrink-0 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors sm:text-[13px]",
    active
      ? "bg-brand/15 text-brand"
      : "text-muted hover:bg-card hover:text-foreground",
  );
}

/**
 * ScoutBase-Standard-Shell (verbindlich): **einmal** in `app/layout.tsx` um alle Routen.
 * Kopfzeile mit **immer sichtbarer** Hauptnavigation, Suche, Anmelden — kein Sidebar-Navigationsbaum.
 * Theme: `layout.tsx` → `html.dark`, Farben `globals.css` (`text-brand` / `--brand`).
 * Änderungen nur bewusst; siehe `.cursor/rules/scoutbase-layout.mdc`.
 */
export function AppShell({ children }: Props) {
  const pathname = usePathname();

  const navItems = (
    <>
      {mobileNav.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href ||
              pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={navLinkClass(active)}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="relative flex min-h-full flex-1 bg-background">
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_100%_55%_at_50%_-8%,rgba(190,18,60,0.22),transparent_55%)] dark:bg-[radial-gradient(ellipse_100%_50%_at_50%_-10%,rgba(190,18,60,0.28),transparent_50%)]"
        aria-hidden
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-50 border-b border-brand/25 bg-gradient-to-b from-rose-950/70 via-card/92 to-card/95 shadow-[0_1px_0_0_rgba(244,63,94,0.12)] backdrop-blur-md dark:from-rose-950/80 dark:via-card/95 dark:to-card/95 dark:shadow-[0_1px_0_0_rgba(244,63,94,0.18)]">
          <div className="mx-auto flex min-h-[72px] max-w-[1600px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:gap-4 sm:px-6 lg:px-8">
            <Link
              href="/"
              className="shrink-0 text-lg font-bold tracking-tight"
            >
              <span className="text-brand">Scout</span>
              <span className="text-foreground">Base</span>
            </Link>

            <div className="order-3 flex flex-1 basis-full items-center gap-1 overflow-x-auto overflow-y-hidden lg:order-none lg:basis-auto lg:flex-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <nav
                className="flex min-w-0 items-center gap-0.5"
                aria-label="Hauptnavigation"
              >
                {navItems}
              </nav>
            </div>

            <div className="hidden min-w-0 flex-1 justify-center overflow-visible px-1 md:flex md:max-w-xl lg:order-2 lg:flex-1">
              <GlobalSearchInput className="w-full max-w-xl" />
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Link
                href="/anmelden"
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-semibold text-brand-foreground shadow-sm transition hover:opacity-90 sm:px-4 [&_svg]:text-brand-foreground"
              >
                <span className="hidden sm:inline">Anmelden</span>
                <span className="sm:hidden">Login</span>
                <IconLogIn className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="border-t border-brand/15 px-4 py-3 md:hidden">
            <GlobalSearchInput className="w-full overflow-visible" />
          </div>
        </header>

        <ProfilePreviewProvider>{children}</ProfilePreviewProvider>
      </div>
    </div>
  );
}
