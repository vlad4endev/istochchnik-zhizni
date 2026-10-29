#!/usr/bin/env node
/**
 * Запуск CLI на хосте VPS, когда DATABASE_URL указывает на Docker-хост `db`
 * (имя видно только внутри compose-сети; с хоста — getaddrinfo EAI_AGAIN db).
 *
 * Подставляет IP контейнера Postgres и запускает команду:
 *   node scripts/withDockerDbUrl.mjs npm run bible:seed
 *   npm run bible:seed:vps
 *
 * Compose-файл: COMPOSE_FILE или docker-compose.prod.yml / docker-compose.yml.
 * Отключить: SEED_NO_DB_HOST_REWRITE=true
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadDotEnv() {
  const path = resolve(process.cwd(), '.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function composeFileArgs() {
  if (process.env.COMPOSE_FILE?.trim()) {
    return process.env.COMPOSE_FILE.split(',').flatMap((f) => ['-f', f.trim()]);
  }
  if (existsSync(resolve(process.cwd(), 'docker-compose.prod.yml'))) {
    return ['-f', 'docker-compose.prod.yml'];
  }
  return ['-f', 'docker-compose.yml'];
}

function dockerDbIp() {
  const args = [...composeFileArgs(), 'ps', '-q', 'db'];
  const cid = execFileSync('docker', ['compose', ...args], {
    encoding: 'utf8',
  }).trim();
  if (!cid) {
    throw new Error(
      'Контейнер db не запущен. Поднимите стек: docker compose -f docker-compose.prod.yml up -d'
    );
  }
  const raw = execFileSync(
    'docker',
    [
      'inspect',
      '-f',
      '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}',
      cid.split('\n')[0],
    ],
    { encoding: 'utf8' }
  ).trim();
  const ip = raw.split(/\s+/).find(Boolean);
  if (!ip) {
    throw new Error(`Не удалось получить IP контейнера db (${cid})`);
  }
  return ip;
}

function rewriteUrl(raw, ip) {
  const u = new URL(raw);
  if (u.hostname !== 'db') return raw;
  u.hostname = ip;
  if (!u.port) u.port = '5432';
  return u.toString();
}

loadDotEnv();

const cmd = process.argv.slice(2);
if (cmd.length === 0) {
  console.error('Usage: node scripts/withDockerDbUrl.mjs <command> [args...]');
  process.exit(2);
}

const raw = process.env.DATABASE_URL?.trim();
if (!raw) {
  console.error('[withDockerDbUrl] DATABASE_URL не задан в .env');
  process.exit(1);
}

if (
  process.env.SEED_NO_DB_HOST_REWRITE !== 'true' &&
  !existsSync('/.dockerenv')
) {
  try {
    const u = new URL(raw);
    if (u.hostname === 'db') {
      const ip = dockerDbIp();
      process.env.DATABASE_URL = rewriteUrl(raw, ip);
      // db.ts тоже не должен трогать уже переписанный URL (hostname !== db)
      console.warn(
        `[withDockerDbUrl] db → ${ip}:${u.port || '5432'} (IP контейнера Postgres)`
      );
    }
  } catch (err) {
    console.error(
      '[withDockerDbUrl]',
      err instanceof Error ? err.message : String(err)
    );
    process.exit(1);
  }
}

const result = spawnSync(cmd[0], cmd.slice(1), {
  stdio: 'inherit',
  env: process.env,
  shell: false,
});
process.exit(result.status ?? 1);
