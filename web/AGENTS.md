<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## ScoutBase — Standard-Layout (verbindlich)

- **App-Rahmen:** `components/app-shell.tsx` wird **einmal** in `app/layout.tsx` um `{children}` gelegt — jede Route hat automatisch die Shell. **Kopfzeile:** Logo „ScoutBase“, **sichtbare Hauptnavigation** (Dashboard, Spieler, Trainer, Vereine, Ligen, Börse), Suche, Anmelden. Navigation **nicht** mit `hidden` verstecken; keine alleinige Desktop-**Sidebar** als einzige Navigation.
- **Theme:** Dunkel über `app/layout.tsx` (`<html class="dark">`). **Kein** `next-themes` / Theme-Toggle im Produktlayout. Farben: `app/globals.css` (`.dark`, `--brand` = Rot/Rose).
- **Neue Seiten** unter `app/`: **kein** eigenes `<AppShell>` — nur Seiteninhalt (`<main>`, …).

Bei Layout-Änderungen: diesen Abschnitt und `app-shell.tsx` anpassen, nicht stillschweigend auf ein altes grünes oder sidebar-only-Layout zurückfallen.
