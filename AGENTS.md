# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Church management platform ("Источник жизни" / Source of Life). Monorepo with two packages:
- **Backend API** (Express/TypeScript) in `/src/` — entry point `src/main.ts`, runs on port 40978
- **Frontend SPA** (React/Vite) in `/web-react/` — separate `package.json`, dev server on port 5173

Package manager: **npm** (lockfiles: `package-lock.json` in root and `web-react/`).

### Prerequisites

- **Node.js 20+** (repo targets Node 20; this VM runs Node 22, which works).
- **PostgreSQL 16** installed **natively** on the VM. Docker is NOT installed here — do not use the docker-compose DB commands. Postgres data persists in the VM snapshot; the service is started per session (not by the update script).

### Running services

1. **PostgreSQL**: start the native cluster: `sudo pg_ctlcluster 16 main start`. Connection: `postgresql://postgres:postgres@localhost:5432/istochik_db` (already in `.env`). The DB schema + a seeded admin persist in the snapshot, so normally you only need to start the cluster.
   - **Rebuild the DB only if it is empty/missing** (idempotent): `node scripts/dev-db-bootstrap.js`. This is required because neither `initDb` (`src/config/initDb.ts`) nor the `supabase/migrations/*` history is cleanly re-runnable from an empty DB on its own — the script combines them in the only working order (see its header comment for details). After it runs once, the app's own `initDb()` re-runs cleanly on every boot.
2. **API dev server**: `npx ts-node-dev --transpile-only --respawn src/main.ts` from project root. The `--transpile-only` flag is required because `ts-node-dev` fails to resolve Express type augmentations in `src/types/express.d.ts`; `tsc --noEmit` validates types separately.
3. **Frontend dev server**: `npm run web:dev` (runs `vite` in `web-react/`).
4. Alternatively: `npm run dev:all` runs both API and Vite concurrently, but API needs `--transpile-only`.

### Logging in / admin account

Login is by phone number + password. A dev admin is seeded: phone `9001234567` (stored `+79001234567`), password `Admin12345`. Recreate/reset it with: `UPSERT_ADMIN_PASSWORD='Admin12345' node dist/cli/upsertAdminMember.js 9001234567 '' Влад Админ` (needs `npm run build` first if `dist/` is missing).

### Viewing the app in a browser

The **Vite dev server (5173) currently does NOT load in a browser**: it eagerly pre-bundles `simple-peer`, whose `randombytes` dependency references `global` (undefined in browsers), throwing `ReferenceError: global is not defined` and leaving the SPA stuck on the splash screen. The production build works because `simple-peer` is only in a lazy chunk. Vite dev itself runs fine (HMR, module serving) — this is a pre-existing frontend polyfill gap, not a setup issue. To exercise the UI in-browser, use the **API-served built SPA**: run `cd web-react && npm run build` once, then open a non-root route on the API, e.g. `http://localhost:40978/login` or `http://localhost:40978/dashboard`. Note `http://localhost:40978/` returns the API JSON (`{"message":"Server is running"}`) — the SPA is served on all other non-`/api` paths. (A future fix for dev mode would be adding `define: { global: 'globalThis' }` to `web-react/vite.config.ts` or a `global` polyfill in `index.html`.)

### Environment

`.env` is created from `.env.local.example` (Postgres on localhost:5432, `NODE_ENV=development`). Recreate with `cp .env.local.example .env` if missing.

### Lint / Test / Build

| Check | Command | Notes |
|-------|---------|-------|
| Backend lint | `npm run lint` | ~10 pre-existing errors on `main` (unused vars, a surrogate-pair regex). Not introduced by setup. |
| Backend type-check | `npx tsc --noEmit` | Clean |
| Backend build | `npm run build` | Outputs to `dist/` |
| Frontend tests | `cd web-react && npx vitest run` | All pass (15 files / 71 tests) |
| Frontend build | `cd web-react && npm run build` | Vite build to `web-react/dist/` |

### Gotchas

- The `npm run dev` / `npm run db:up` scripts are Docker-oriented and don't work here (no Docker). Use the native Postgres + `ts-node-dev --transpile-only` commands above.
- `npm run dev` without `--transpile-only` fails with TS errors about Express augmented types. Always add `--transpile-only` (or run `tsc` separately for type checking).
- Vite dev server on port 5173 proxies `/api`, `/uploads`, and `/health` to the API on port 40978 — no CORS config needed in dev.
- Redis, Supabase Storage, SMS.ru, Telegram, and Firebase are all optional for core functionality.
