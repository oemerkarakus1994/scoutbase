"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { useProfilePreview } from "@/components/profile-preview-context";
import { IconSearch } from "@/components/ui/dashboard-icons";
import { cn } from "@/lib/cn";
import {
  type SearchSuggestion,
  searchSuggestionHref,
} from "@/lib/search-suggest";

const DEBOUNCE_MS = 280;
const INPUT_CLASS =
  "h-10 w-full rounded-full border border-border bg-card pl-10 pr-4 text-sm text-foreground outline-none ring-brand/0 transition placeholder:text-muted focus:border-brand focus:bg-card focus:ring-2 focus:ring-brand/25";

type Props = {
  className?: string;
  inputClassName?: string;
};

export function GlobalSearchInput({ className, inputClassName }: Props) {
  const router = useRouter();
  const profilePreview = useProfilePreview();
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [value, setValue] = useState("");
  /** Panel zugeklappt z. B. nach Klick außerhalb; wieder auf bei Fokus / Tippen. */
  const [panelDismissed, setPanelDismissed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SearchSuggestion[]>([]);
  const [highlight, setHighlight] = useState(0);

  const fetchSuggest = useCallback(async (q: string) => {
    const t = q.trim();
    if (t.length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/search-suggest?q=${encodeURIComponent(t)}`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as { suggestions?: SearchSuggestion[] };
      setItems(json.suggestions ?? []);
      setHighlight(0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    const t = value.trim();
    if (t.length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => {
      void fetchSuggest(value);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [value, fetchSuggest]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setPanelDismissed(true);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const panelVisible =
    value.trim().length >= 2 && !panelDismissed;

  function goToSuggestion(s: SearchSuggestion) {
    setPanelDismissed(true);
    setValue("");
    setItems([]);
    if (s.entity === "liga") {
      router.push(searchSuggestionHref(s));
      return;
    }
    if (profilePreview) {
      if (s.entity === "person") {
        profilePreview.openPerson(s.id);
      } else {
        profilePreview.openVerein(s.id);
      }
      return;
    }
    router.push(searchSuggestionHref(s));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const list = items;
    if (e.key === "ArrowDown" && panelVisible && list.length > 0) {
      e.preventDefault();
      setHighlight((h) => (h + 1) % list.length);
      return;
    }
    if (e.key === "ArrowUp" && panelVisible && list.length > 0) {
      e.preventDefault();
      setHighlight((h) => (h - 1 + list.length) % list.length);
      return;
    }
    if (e.key === "Enter") {
      if (panelVisible && list.length > 0 && list[highlight]) {
        e.preventDefault();
        goToSuggestion(list[highlight]!);
      }
      return;
    }
    if (e.key === "Escape") {
      setPanelDismissed(true);
    }
  }

  return (
    <div ref={containerRef} className={cn("relative z-[60]", className)}>
      <label className="relative block w-full">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
          <IconSearch />
        </span>
        <input
          type="search"
          name="q"
          value={value}
          autoComplete="off"
          placeholder="Spieler, Trainer, Vereine und Ligen …"
          role="combobox"
          aria-expanded={panelVisible}
          aria-controls={panelVisible ? listId : undefined}
          aria-autocomplete="list"
          className={cn(INPUT_CLASS, inputClassName)}
          onChange={(e) => {
            setValue(e.target.value);
            setPanelDismissed(false);
          }}
          onFocus={() => {
            if (value.trim().length >= 2) {
              setPanelDismissed(false);
            }
          }}
          onKeyDown={onKeyDown}
        />
      </label>

      {panelVisible ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] max-h-[min(60vh,320px)] overflow-auto rounded-xl border border-border bg-card py-1 shadow-xl shadow-black/40"
        >
          {loading ? (
            <li className="px-3 py-2 text-sm text-muted">
              Suche…
            </li>
          ) : items.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">
              Keine Treffer
            </li>
          ) : (
            items.map((s, i) => (
              <li
                key={`${s.entity}-${s.id}`}
                role="option"
                aria-selected={i === highlight}
              >
                <Link
                  href={searchSuggestionHref(s)}
                  className={cn(
                    "flex flex-col gap-0.5 px-3 py-2 text-left text-sm transition-colors",
                    i === highlight
                      ? "bg-brand/15 text-foreground"
                      : "text-foreground hover:bg-panel",
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.preventDefault();
                    goToSuggestion(s);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs text-muted">
                    {s.kindLabel}
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
