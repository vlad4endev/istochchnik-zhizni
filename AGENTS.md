# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Church management platform ("Источник жизни" / Source of Life). Monorepo with two packages:
- **Backend API** (Express/TypeScript) in `/src/` — entry point `src/main.ts`, runs on port 40978
- **Frontend SPA** (React/Vite) in `/web-react/` — separate `package.json`, dev server on port 5173

Package manager: **npm** (lockfiles: `package-lock.json` in root and `web-react/`).

### Prerequisites

- **Node.js 20** (matches Dockerfile)
- **Docker** — required for PostgreSQL (`postgres:16-alpine`)

### Running services

1. **PostgreSQL**: `docker run -d --name istochnik-postgres -e POSTGRES_DB=istochik_db -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16-alpine` (or reuse existing container: `docker start istochnik-postgres`)
2. **API dev server**: `npx ts-node-dev --transpile-only --respawn src/main.ts` from project root. The `--transpile-only` flag is required because `ts-node-dev` fails to resolve Express type augmentations in `src/types/express.d.ts`; `tsc --noEmit` validates types separately.
3. **Frontend dev server**: `npm run web:dev` (runs `vite` in `web-react/`)
4. Alternatively: `npm run dev:all` runs both API and Vite concurrently, but API needs `--transpile-only`.

### Environment

Copy `.env.local.example` to `.env` before starting. The `.env.local.example` has correct defaults for local dev (Postgres on localhost:5432, `NODE_ENV=development`).

### Lint / Test / Build

| Check | Command | Notes |
|-------|---------|-------|
| Backend lint | `npm run lint` | 1 pre-existing unused-var warning in `telegramService.ts` |
| Backend type-check | `npx tsc --noEmit` | Clean |
| Backend build | `npm run build` | Outputs to `dist/` |
| Frontend tests | `cd web-react && npx vitest run` | 1 pre-existing test failure in `chordLineRender.test.tsx` |
| Frontend build | `cd web-react && npm run build` | Vite build to `web-react/dist/` |

### Gotchas

- The `npm run dev` script uses `ts-node-dev --respawn src/main.ts` without `--transpile-only`. This fails with TS errors about Express augmented types. Use `--transpile-only` flag or run `tsc` separately for type checking.
- The `npm run db:up` command expects a `db` service in the compose stack, but the main `docker-compose.yml` doesn't define one (it's in `docker-compose.prod.yml`). For local dev, run PostgreSQL as a standalone Docker container instead.
- Vite dev server on port 5173 proxies `/api`, `/uploads`, and `/health` to the API on port 40978 — no need for CORS config in dev.
- Redis, Supabase Storage, SMS.ru, Telegram, and Firebase are all optional for core functionality.
