"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { IconMoon, IconSun } from "@/components/ui/dashboard-icons";
import { cn } from "@/lib/cn";

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button
        type="button"
        className="rounded-full p-2 text-muted"
        aria-hidden
        tabIndex={-1}
      >
        <IconMoon />
      </button>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "rounded-full p-2 transition-colors",
        "text-muted hover:bg-panel hover:text-foreground",
      )}
      aria-label={isDark ? "Hellmodus aktivieren" : "Dunkelmodus aktivieren"}
      aria-pressed={isDark}
    >
      {isDark ? <IconSun /> : <IconMoon />}
    </button>
  );
}
