This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Öffentlich deployen (Vercel)

Die Next-App liegt im Unterordner `web/` (Monorepo). So gehst du vor:

**Wichtig:** Wenn die Live-URL nur **404 NOT_FOUND** zeigt, ist fast immer das **Root Directory** falsch (Vercel baut dann nicht die Next-App). In Vercel: **Project → Settings → General → Root Directory** → **`web`** speichern, danach **Deployments → … → Redeploy**.

1. **GitHub:** Dieses Repository pushen (oder verbundenes Repo nutzen).
2. **[vercel.com](https://vercel.com)** → *Add New…* → *Project* → Repository importieren.
3. **Root Directory** auf **`web`** setzen (Framework *Next.js* sollte erkannt werden).  
   Ohne diesen Schritt findet Vercel kein `package.json` der App und die Seite bleibt leer (**404**).
4. **Environment Variables** (Production + Preview):

   | Name | Wert |
   |------|------|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → *Project Settings* → *API* → *Project URL* |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | dieselbe Seite → *anon public* Key |

   Gleiche Werte wie lokal in `web/.env.local` (nicht committen).

5. **Deploy** starten. Die Live-URL steht danach im Dashboard (`*.vercel.app`).

Optional: unter *Settings* → *Domains* eine eigene Domain anbinden.

Wenn ihr später Supabase Auth mit Redirects nutzt: Supabase → *Authentication* → *URL Configuration* → **Site URL** und **Redirect URLs** um die Vercel-Domain ergänzen.

Weitere Infos: [Next.js Deployment](https://nextjs.org/docs/app/building-your-application/deploying).
