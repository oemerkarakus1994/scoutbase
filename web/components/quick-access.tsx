import Link from "next/link";

const items = [
  {
    href: "/spieler",
    title: "Spieler durchsuchen",
    text: "Kader und Profile aus dem Import.",
  },
  {
    href: "/trainer",
    title: "Trainer finden",
    text: "Rollen und Zuordnung zu Teams.",
  },
  {
    href: "/vereine",
    title: "Vereine erkunden",
    text: "Mannschaften im SFV-Scope.",
  },
  {
    href: "/ligen",
    title: "Ligen & Bewerbe",
    text: "Aktuelle Bewerb-Editionen.",
  },
] as const;

export function QuickAccess() {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_4px_24px_-4px_rgba(0,0,0,0.35)]">
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <h2 className="text-base font-semibold text-foreground">
          Schnellzugriff
        </h2>
        <p className="mt-1 text-sm text-muted">
          Häufig genutzte Bereiche
        </p>
      </div>
      <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="bg-card p-5 transition hover:bg-panel"
          >
            <span className="font-semibold text-brand">{item.title}</span>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {item.text}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
