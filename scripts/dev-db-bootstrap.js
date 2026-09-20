/**
 * Idempotent local DEV database bootstrap (plain PostgreSQL, no Docker/Supabase).
 *
 * Why this exists:
 *   The app can be initialized two ways in production:
 *     - Supabase-hosted: the full schema comes from `supabase/migrations/*` (app runs
 *       with SKIP_DB_INIT_ON_START=true).
 *     - Docker Postgres: `src/config/initDb.ts` (INIT_SQL) builds the schema at boot.
 *   Neither history is cleanly re-runnable from an EMPTY database on its own:
 *     - INIT_SQL forward-references `service_plans` (created only by the planner
 *       migrations) and touches `studio_versions` before creating it.
 *     - The Supabase migration history references `members.is_active` before any
 *       migration adds it (that column is defined by INIT_SQL).
 *   This script combines both, in the only order that works on a fresh DB:
 *     1) Supabase-compat shims (roles + a stub `auth` schema).
 *     2) INIT_SQL with the 3 forward-dependent statements stripped (all no-ops on an
 *        empty DB) → the coherent CORE schema (members incl. is_active, songs, …).
 *     3) MEMBER_SEED_SQL (base member seed).
 *     4) All `supabase/migrations/*.sql` in order (idempotent CREATE/ALTER … IF NOT
 *        EXISTS), which adds service_plans + planner/media/music schedule columns and
 *        fills every remaining gap. The 2 Storage-only migrations are skipped (they
 *        need Supabase Storage and are optional for core functionality).
 *   After this runs once, the app's own `initDb()` re-runs cleanly (idempotent) on
 *   every boot with the default `.env` (SKIP_DB_INIT_ON_START=false).
 *
 * Usage (Postgres must already be running and DATABASE_URL set in .env):
 *   node scripts/dev-db-bootstrap.js
 *
 * Safe to run repeatedly.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.resolve(__dirname, '..');

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) {
    const line = fs.readFileSync(envPath, 'utf8').split('\n').find((l) => l.startsWith('DATABASE_URL='));
    if (line) return line.slice('DATABASE_URL='.length).trim();
  }
  throw new Error('DATABASE_URL not set (env or .env). Example: postgresql://postgres:postgres@localhost:5432/istochik_db');
}

function extractTemplate(src, marker) {
  const startIdx = src.indexOf(marker);
  if (startIdx === -1) throw new Error('marker not found: ' + marker);
  const open = src.indexOf('`', startIdx);
  const close = src.indexOf('`;', open + 1);
  return src.slice(open + 1, close);
}

function buildCoreSql() {
  const initSrc = fs.readFileSync(path.join(ROOT, 'src/config/initDb.ts'), 'utf8');
  let sql = extractTemplate(initSrc, 'const INIT_SQL =');
  const strip = (re, label) => {
    const before = sql.length;
    sql = sql.replace(re, `-- [dev-db-bootstrap] stripped ${label}\n`);
    if (sql.length === before) throw new Error(`Failed to strip ${label} from INIT_SQL`);
  };
  // studio_versions backfill UPDATE (runs before CREATE TABLE studio_versions)
  strip(/UPDATE songs s\nSET content = sub\.content,[\s\S]*?= '';\n/, 'studio_versions backfill');
  // setlists -> service_plans FK (service_plans created later by planner migrations)
  strip(/DO \$\$\nBEGIN\n  IF NOT EXISTS \(\n    SELECT 1 FROM pg_constraint WHERE conname = 'setlists_source_service_plan_id_fkey'[\s\S]*?END \$\$;\n/, 'setlists->service_plans FK');
  // media_assignments table (FK to service_plans) — recreated by media_schedule migration
  strip(/CREATE TABLE IF NOT EXISTS media_assignments \([\s\S]*?idx_media_assignments_role_id ON media_assignments \(role_id\);\n/, 'media_assignments table');
  return sql;
}

const AUTH_SHIMS_SQL = `
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
`;

const SKIP_MIGRATIONS = new Set([
  '20260415120000_storage_buckets_app_uploads.sql',
  '20260503120000_storage_chat_authenticated_insert.sql',
]);

async function ensureRolesAndDb(dbName) {
  // Connect to the maintenance DB to create roles + the target DB if missing.
  const admin = new Client({ connectionString: adminConnString });
  await admin.connect();
  try {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const extra = role === 'service_role' ? 'BYPASSRLS' : '';
      await admin.query(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role} NOLOGIN NOINHERIT ${extra}; END IF; END $$;`);
    }
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [dbName]);
    if (exists.rowCount === 0) {
      await admin.query(`CREATE DATABASE ${JSON.stringify(dbName).replace(/"/g, '"')}`);
      console.log(`[dev-db-bootstrap] created database ${dbName}`);
    }
  } finally {
    await admin.end();
  }
}

const DATABASE_URL = loadDatabaseUrl();
const parsed = new URL(DATABASE_URL);
const dbName = parsed.pathname.replace(/^\//, '') || 'postgres';
const adminUrl = new URL(DATABASE_URL);
adminUrl.pathname = '/postgres';
const adminConnString = adminUrl.toString();

(async () => {
  await ensureRolesAndDb(dbName);

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(AUTH_SHIMS_SQL);
    console.log('[dev-db-bootstrap] auth/roles shims ensured');

    const initSrc = fs.readFileSync(path.join(ROOT, 'src/config/initDb.ts'), 'utf8');
    const seedSrc = fs.readFileSync(path.join(ROOT, 'src/config/memberSeedSql.ts'), 'utf8');
    await client.query(buildCoreSql());
    await client.query(extractTemplate(seedSrc, 'MEMBER_SEED_SQL ='));
    console.log('[dev-db-bootstrap] core schema (INIT_SQL + member seed) applied');

    const migDir = path.join(ROOT, 'supabase/migrations');
    const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
    let ok = 0;
    let skipped = 0;
    for (const f of files) {
      if (SKIP_MIGRATIONS.has(f)) { skipped++; continue; }
      const sql = fs.readFileSync(path.join(migDir, f), 'utf8');
      try {
        await client.query(sql);
        ok++;
      } catch (e) {
        // Data-only alignment migrations may no-op/fail harmlessly on a fresh DB.
        console.warn(`[dev-db-bootstrap] migration warning ${f}: ${e.message.split('\n')[0]}`);
      }
    }
    console.log(`[dev-db-bootstrap] migrations applied ok=${ok} skipped(storage)=${skipped}`);

    const t = await client.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'");
    console.log(`[dev-db-bootstrap] done. public tables: ${t.rows[0].n}`);
  } finally {
    await client.end();
  }
})().catch((e) => { console.error('[dev-db-bootstrap] failed:', e); process.exit(1); });
