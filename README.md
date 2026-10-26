# POD — three RAG projects

One monorepo, one hub, three separately deployed apps.

| App | Folder | What it is | Dev port |
| --- | --- | --- | --- |
| Hub | `apps/hub` | "Welcome to my POD" — links to every project | 3000 |
| GPO Annual Report | `apps/gpo-report` | Baseline RAG | 3001 |
| World Bank Economic Report | `apps/world-bank-report` | Advanced document RAG | 3002 |
| Apple iMac Environmental Report | `apps/imac-report` | Multimodal document RAG | 3003 |

Each project's plan lives in its own `docs/` folder (start with `docs/README.md`).

## Layout

```text
apps/            one Next.js app per project, each its own Vercel project
packages/config  shared tsconfig + ESLint rules                       (@pod/config)
packages/ui      design system, project list, shared RAG screens' parts (@pod/ui)
packages/ai      Gemini client, embeddings, error mapping, fake embedder (@pod/ai)
packages/rag     PDF text/outline, cleaning, splitting, citations, NDJSON, RRF, env/http helpers (@pod/rag)
packages/db      postgres.js per-app role, migrations, setup checks, PGlite test server (@pod/db)
packages/eval    retrieval metrics, LLM judges, report helpers       (@pod/eval)
```

Packages export behaviour only. They never read env vars or pick a
database: each app passes in its own keys and connection string.

The list of projects (names, briefs, production URLs) is in
`packages/ui/src/projects.ts` — the hub and every project page read it.

## Commands

Requires Node 22 (`nvm use`) and pnpm via Corepack (`corepack enable`).

```bash
pnpm install
pnpm dev                         # every app at once, on the ports above
pnpm --filter gpo-report dev     # one app
pnpm test                        # unit + end-to-end tests (in-memory Postgres + pgvector)
pnpm check                       # lint + typecheck + test + build, all workspaces
```

Each RAG app's own README covers its pipeline commands (`parse`, `ingest`,
`ask`, `eval`, …) and setup.

## Deploying

One Vercel project per app, all connected to this repo:

| Vercel project | Root Directory |
| --- | --- |
| hub | `apps/hub` |
| gpo-report | `apps/gpo-report` |
| world-bank-report | `apps/world-bank-report` |
| imac-report | `apps/imac-report` |

Framework and pnpm are detected automatically. Vercel skips building an app
when a commit didn't touch it or anything it depends on. After the projects
exist, put their production URLs into `packages/ui/src/projects.ts`.

## Isolation

Apps never share runtime state: separate deployments, separate env vars, and
a separate Postgres schema and login role per RAG app (`gpo`, `worldbank`,
`imac`) in one Supabase project. Each role can read only its own schema;
`check:setup` verifies that.
