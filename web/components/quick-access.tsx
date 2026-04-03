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
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:border-slate-700/90 dark:bg-slate-800/40 dark:shadow-none">
      <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-700/80 sm:px-6">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Schnellzugriff
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Häufig genutzte Bereiche
        </p>
      </div>
      <div className="grid gap-px bg-slate-100 dark:bg-slate-700/80 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="bg-white p-5 transition hover:bg-slate-50 dark:bg-slate-800/40 dark:hover:bg-slate-700/40"
          >
            <span className="font-semibold text-brand">{item.title}</span>
            <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              {item.text}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
