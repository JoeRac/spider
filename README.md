# Spider

Workflow + content hub for agency clients. Sits downstream of [Badger](https://github.com/JoeRac/badger): every closed-as-won dealership becomes a Spider client workspace, where each public surface (Google My Business, Facebook, Twitter, YouTube, Instagram, LinkedIn, TikTok, website blog) is managed end-to-end — AI-generated content fanning out to every connected channel on a daily cadence.

## Stack

- Next.js 16 (App Router), React 19, TypeScript
- Tailwind 3 with the shared Coldbrain design tokens (light theme, indigo accent)
- Neon Postgres + Drizzle ORM
- TanStack Query
- Vercel for hosting + cron + blob storage
- Z.AI GLM 4.6 for content generation (phase 3+)

## Build phases

| Phase | Scope |
|-------|-------|
| **1 — Foundation** *(shipped)* | Schema (clients, integrations, content, jobs, audit), Badger WON import, clients list/detail UI, channel matrix surface, design system mirroring Raven. |
| 2 — Integration OAuth | Per-channel OAuth flows + credential vault + token refresh + status sync. |
| 3 — Content engine | Z.AI GLM 4.6 generation pipeline. Per-client voice + templates. Library, edit, schedule. |
| 4 — Autopilot | Cron-driven daily generation + multi-channel publish fan-out. SEO publishing + backlinks. |

## Quick start

```bash
pnpm install
cp .env.example .env.local       # fill in DATABASE_URL + BADGER_API_KEY
pnpm db:push                      # initial schema → Neon
pnpm dev
```

## Importing clients from Badger

```bash
pnpm import:badger                # CLI
# or hit POST /api/clients/import-badger from the Clients page
```
