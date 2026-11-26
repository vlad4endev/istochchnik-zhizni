import fs from 'node:fs/promises';
import path from 'node:path';
import type { Request } from 'express';
import { pool } from '../config/db';
import { getUploadsRoot } from '../config/uploadsRoot';
import type { AutomatedTestResult, AutomatedTestsReport } from './types';

type Tier = AutomatedTestResult['tier'];

const RESPONSE_PREVIEW_MAX = 8000;

function clipBody(text: string, max = RESPONSE_PREVIEW_MAX): string {
  const normalized = text.replace(/\r\n/g, '\n');
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}\n… [обрезано ${normalized.length - max} символов]`;
}

type CaseOutcome = {
  ok: boolean;
  message: string;
  detail?: string;
  httpStatus?: number;
  responsePreview?: string;
};

function httpFailure(response: { status: number; text: string }, headline: string): CaseOutcome {
  return {
    ok: false,
    message: headline,
    httpStatus: response.status,
    responsePreview: clipBody(response.text),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Надёжный локальный адрес собственного процесса (127.0.0.1:PORT).
 * В отличие от `req.protocol://req.get('host')`, не ломается за Nginx/Cloudflare/Docker
 * из-за hairpin NAT, самоподписанного TLS или HTTP→HTTPS редиректов.
 */
export function resolveInternalBaseUrl(fallbackReq?: Request): string {
  const port = Number(process.env.PORT);
  if (Number.isFinite(port) && port > 0 && port < 65536) {
    return `http://127.0.0.1:${port}`;
  }
  if (fallbackReq) {
    const host = fallbackReq.get('host');
    if (host) return `${fallbackReq.protocol}://${host}`;
  }
  return 'http://127.0.0.1:40978';
}

async function fetchProbe(
  baseUrl: string,
  targetPath: string,
  init?: { headers?: Record<string, string>; timeoutMs?: number },
): Promise<{ status: number; durationMs: number; text: string }> {
  const timeoutMs = init?.timeoutMs ?? 12_000;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    const response = await fetch(`${baseUrl}${targetPath}`, {
      headers: init?.headers,
      signal: controller.signal,
    });
    const text = await response.text();
    return { status: response.status, durationMs: Date.now() - started, text };
  } finally {
    clearTimeout(timer);
  }
}

function parseJsonSafe(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function isAdminUser(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const o = payload as Record<string, unknown>;
  if (o.app_role === 'admin') return true;
  if (Array.isArray(o.app_roles) && o.app_roles.some((r) => r === 'admin')) return true;
  return false;
}

function buildAuthForwardHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  const cookie = req.get('cookie');
  if (cookie) headers.Cookie = cookie;
  const authorization = req.get('authorization');
  if (authorization) headers.Authorization = authorization;
  return headers;
}

export async function runAutomatedTestSuite(
  baseUrlInput: string,
  req: Request,
): Promise<AutomatedTestsReport> {
  const startedAt = Date.now();
  const baseUrl = baseUrlInput || resolveInternalBaseUrl(req);
  const authForward = buildAuthForwardHeaders(req);
  const hasAuthForward = Object.keys(authForward).length > 0;
  const isProd = process.env.NODE_ENV === 'production';

  const results: AutomatedTestResult[] = [];
  const smokeEndpoints: AutomatedTestsReport['smokeEndpoints'] = [];

  async function runCase(options: {
    id: string;
    name: string;
    category: string;
    tier: Tier;
    fn: () => Promise<CaseOutcome>;
  }): Promise<void> {
    const t0 = Date.now();
    try {
      const out = await options.fn();
      results.push({
        id: options.id,
        name: options.name,
        category: options.category,
        tier: options.tier,
        status: out.ok ? 'passed' : 'failed',
        durationMs: Date.now() - t0,
        message: out.message,
        detail: out.detail,
        httpStatus: out.httpStatus,
        responsePreview: out.responsePreview,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      results.push({
        id: options.id,
        name: options.name,
        category: options.category,
        tier: options.tier,
        status: 'failed',
        durationMs: Date.now() - t0,
        message: `Исключение: ${message}`,
        detail: stack ? clipBody(stack, 6000) : undefined,
      });
    }
  }

  function pushSmoke(
    targetPath: string,
    ok: boolean,
    status: number,
    durationMs: number,
    note?: string,
  ): void {
    smokeEndpoints.push({ path: targetPath, ok, status, durationMs, note });
  }

  // ── 1. Публичные HTTP и Health ─────────────────────────────
  await runCase({
    id: 'http_health',
    name: 'GET /health — JSON и статус БД',
    category: 'HTTP · публичное API',
    tier: 'critical',
    fn: async () => {
      const r = await fetchProbe(baseUrl, '/health');
      pushSmoke('/health', r.status === 200, r.status, r.durationMs);
      if (r.status !== 200) {
        return httpFailure(r, `Ожидался 200, получен ${r.status}`);
      }
      const json = parseJsonSafe(r.text) as Record<string, unknown> | null;
      if (!json || json.status !== 'ok') {
        return {
          ok: false,
          message: `Некорректный статус health: ${String(json?.status ?? '—')}`,
          httpStatus: r.status,
          responsePreview: clipBody(r.text),
        };
      }
      return { ok: true, message: `status=ok · database=${String(json.database ?? '—')}` };
    },
  });

  await runCase({
    id: 'http_root',
    name: 'GET / — корень API',
    category: 'HTTP · публичное API',
    tier: 'critical',
    fn: async () => {
      const r = await fetchProbe(baseUrl, '/');
      pushSmoke('/', r.status === 200, r.status, r.durationMs);
      if (r.status !== 200) return httpFailure(r, `HTTP ${r.status}`);
      const json = parseJsonSafe(r.text) as Record<string, unknown> | null;
      if (!json?.message) {
        return {
          ok: false,
          message: 'Нет поля message в JSON',
          httpStatus: r.status,
          responsePreview: clipBody(r.text),
        };
      }
      return { ok: true, message: String(json.message).slice(0, 80) };
    },
  });

  await runCase({
    id: 'http_health_livekit',
    name: 'GET /health/livekit — статус Room Service',
    category: 'HTTP · публичное API',
    tier: 'optional',
    fn: async () => {
      const r = await fetchProbe(baseUrl, '/health/livekit');
      pushSmoke('/health/livekit', r.status === 200, r.status, r.durationMs);
      if (r.status !== 200) return httpFailure(r, `HTTP ${r.status}`);
      const json = parseJsonSafe(r.text) as Record<string, unknown> | null;
      if (!json) return httpFailure(r, 'Ответ не JSON');
      if (json.configured && json.status !== 'ok') {
        return {
          ok: false,
          message: `LiveKit настроен, но недоступен: ${String(json.error ?? 'down')}`,
          httpStatus: r.status,
          responsePreview: clipBody(r.text),
        };
      }
      return {
        ok: true,
        message: json.configured ? `LiveKit ok (${String(json.url ?? '')})` : 'LiveKit не настроен',
      };
    },
  });

  await runCase({
    id: 'http_podcasts',
    name: 'GET /api/resources/podcasts',
    category: 'HTTP · контент',
    tier: 'standard',
    fn: async () => {
      const r = await fetchProbe(baseUrl, '/api/resources/podcasts');
      const ok = r.status === 200 || r.status === 204;
      pushSmoke('/api/resources/podcasts', ok, r.status, r.durationMs, 'Публичный контент');
      if (!ok) return httpFailure(r, `Неожиданный статус ${r.status}`);
      return { ok: true, message: `HTTP ${r.status}` };
    },
  });

  await runCase({
    id: 'http_calendar_events',
    name: 'GET /api/calendar/events',
    category: 'HTTP · календарь',
    tier: 'standard',
    fn: async () => {
      const r = await fetchProbe(baseUrl, '/api/calendar/events');
      const ok = r.status === 200;
      pushSmoke('/api/calendar/events', ok, r.status, r.durationMs);
      if (!ok) return httpFailure(r, `HTTP ${r.status}`);
      const json = parseJsonSafe(r.text);
      if (!Array.isArray(json)) {
        return {
          ok: false,
          message: 'Ожидался JSON-массив',
          httpStatus: r.status,
          responsePreview: clipBody(r.text),
        };
      }
      return { ok: true, message: `событий: ${json.length}` };
    },
  });

  await runCase({
    id: 'http_calendar_sunday_services',
    name: 'GET /api/calendar/sunday-services',
    category: 'HTTP · календарь',
    tier: 'standard',
    fn: async () => {
      const r = await fetchProbe(baseUrl, '/api/calendar/sunday-services');
      const ok = r.status === 200;
      pushSmoke('/api/calendar/sunday-services', ok, r.status, r.durationMs);
      if (!ok) return httpFailure(r, `HTTP ${r.status}`);
      const json = parseJsonSafe(r.text);
      if (!Array.isArray(json)) {
        return {
          ok: false,
          message: 'Ожидался JSON-массив',
          httpStatus: r.status,
          responsePreview: clipBody(r.text),
        };
      }
      return { ok: true, message: `служений: ${json.length}` };
    },
  });

  await runCase({
    id: 'sec_auth_session_hints_public',
    name: 'GET /api/auth/session-hints без сессии → 200',
    category: 'HTTP · публичное API',
    tier: 'standard',
    fn: async () => {
      const r = await fetchProbe(baseUrl, '/api/auth/session-hints');
      pushSmoke('/api/auth/session-hints', r.status === 200, r.status, r.durationMs, 'Публичный TTL');
      if (r.status !== 200) return httpFailure(r, `Ожидался 200, получен ${r.status}`);
      const j = parseJsonSafe(r.text) as { accessTokenTtlMinutes?: unknown } | null;
      if (!j || typeof j.accessTokenTtlMinutes !== 'number') {
        return { ok: false, message: 'Некорректное тело: ожидается { accessTokenTtlMinutes: number }' };
      }
      return { ok: true, message: `access TTL ${j.accessTokenTtlMinutes} мин` };
    },
  });

  await runCase({
    id: 'http_vapid',
    name: 'GET /api/notifications/vapid-public-key',
    category: 'Инфраструктура push',
    tier: 'optional',
    fn: async () => {
      const r = await fetchProbe(baseUrl, '/api/notifications/vapid-public-key');
      const ok = r.status === 200 || r.status === 503;
      pushSmoke('/api/notifications/vapid-public-key', ok, r.status, r.durationMs);
      if (r.status === 200) {
        const json = parseJsonSafe(r.text) as Record<string, unknown> | null;
        if (typeof json?.publicKey !== 'string' || !json.publicKey.length) {
          return {
            ok: false,
            message: 'Нет или пустой publicKey в JSON',
            httpStatus: r.status,
            responsePreview: clipBody(r.text),
          };
        }
        return { ok: true, message: 'VAPID publicKey ok' };
      }
      return { ok: true, message: 'VAPID не настроен (503) — допустимо для среды без push' };
    },
  });

  // ── 2. Безопасность (анонимные запросы должны блокироваться) ──
  const closedEndpoints: Array<{ id: string; path: string; tier: Tier; expected: number[] }> = [
    { id: 'sec_auth_me_closed', path: '/api/auth/me', tier: 'critical', expected: [401] },
    { id: 'sec_analytics_closed', path: '/api/analytics/overview', tier: 'critical', expected: [401, 403] },
    { id: 'sec_settings_logs_closed', path: '/api/settings/logs/admin', tier: 'critical', expected: [401, 403] },
    { id: 'sec_diagnostics_closed', path: '/api/diagnostics/health', tier: 'critical', expected: [401, 403] },
    { id: 'sec_monitor_closed', path: '/api/diagnostics/monitor/status', tier: 'critical', expected: [401, 403] },
    { id: 'sec_sms_settings_closed', path: '/api/sms/settings', tier: 'standard', expected: [401, 403] },
    { id: 'sec_backup_settings_closed', path: '/api/backup/settings', tier: 'critical', expected: [401, 403] },
  ];

  for (const ep of closedEndpoints) {
    await runCase({
      id: ep.id,
      name: `GET ${ep.path} без сессии → ${ep.expected.join('/')}`,
      category: 'Безопасность',
      tier: ep.tier,
      fn: async () => {
        const r = await fetchProbe(baseUrl, ep.path);
        const ok = ep.expected.includes(r.status);
        pushSmoke(`${ep.path} (anon)`, ok, r.status, r.durationMs, 'Должен быть закрыт');
        if (ok) return { ok: true, message: `Закрыто (HTTP ${r.status})` };
        return httpFailure(r, `Ожидался ${ep.expected.join('/')}, получен ${r.status}`);
      },
    });
  }

  // ── 3. База данных, схема и файловая система ─────────────────
  await runCase({
    id: 'db_ping',
    name: 'PostgreSQL SELECT 1 и состояние пула',
    category: 'База данных и хранилище',
    tier: 'critical',
    fn: async () => {
      if (!pool) {
        return {
          ok: false,
          message: 'pool отсутствует (DATABASE_URL не задан)',
          detail: 'Без PostgreSQL платформа не может хранить данные пользователей и расписания.',
        };
      }
      const t0 = Date.now();
      await pool.query('SELECT 1');
      const ms = Date.now() - t0;
      return {
        ok: true,
        message: `Соединение успешно за ${ms} ms (пул: ${pool.totalCount} total, ${pool.idleCount} idle, ${pool.waitingCount} waiting)`,
      };
    },
  });

  await runCase({
    id: 'db_schema_core_tables',
    name: 'PostgreSQL: наличие и доступность ключевых таблиц',
    category: 'База данных и хранилище',
    tier: 'critical',
    fn: async () => {
      if (!pool) return { ok: false, message: 'БД не подключена' };
      const requiredTables = [
        'members',
        'global_settings',
        'app_logs',
        'calendar_events',
        'push_subscriptions',
      ];
      const { rows } = await pool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
        [requiredTables],
      );
      const present = new Set(rows.map((r) => r.table_name));
      const missing = requiredTables.filter((t) => !present.has(t));
      if (missing.length > 0) {
        return {
          ok: false,
          message: `Отсутствуют критичные таблицы: ${missing.join(', ')}`,
          detail: 'Выполните инициализацию БД (npm run db:init) или проверьте миграции.',
        };
      }
      const countRes = await pool.query<{ c: string }>('SELECT COUNT(*)::text AS c FROM members');
      return {
        ok: true,
        message: `Все ${requiredTables.length} ключевых таблиц на месте · members: ${countRes.rows[0]?.c ?? 0}`,
      };
    },
  });

  await runCase({
    id: 'fs_uploads_writable',
    name: 'Файловая система: запись в каталог uploads',
    category: 'База данных и хранилище',
    tier: 'standard',
    fn: async () => {
      const uploadsDir = getUploadsRoot();
      const probeFile = path.join(uploadsDir, `.diag-test-${process.pid}-${Date.now()}`);
      await fs.mkdir(uploadsDir, { recursive: true });
      await fs.writeFile(probeFile, 'ok', 'utf8');
      await fs.unlink(probeFile);
      return { ok: true, message: `Каталог доступен на запись (${uploadsDir})` };
    },
  });

  // ── 4. Проверки под сессией администратора ───────────────────
  let sessionValid = false;
  let adminSession = false;

  if (hasAuthForward) {
    await runCase({
      id: 'auth_me_session',
      name: 'GET /api/auth/me с текущей сессией',
      category: 'Админ-сессия и доменные API',
      tier: 'critical',
      fn: async () => {
        const r = await fetchProbe(baseUrl, '/api/auth/me', { headers: authForward });
        sessionValid = r.status === 200;
        if (!sessionValid) {
          return httpFailure(r, `Сессия не принята (HTTP ${r.status})`);
        }
        const json = parseJsonSafe(r.text);
        adminSession = isAdminUser(json);
        return {
          ok: true,
          message: adminSession ? 'Роль admin подтверждена' : 'Сессия активна (не admin)',
        };
      },
    });

    await runCase({
      id: 'http_version',
      name: 'GET /api/version — метаданные сборки',
      category: 'Админ-сессия и доменные API',
      tier: 'standard',
      fn: async () => {
        const r = await fetchProbe(baseUrl, '/api/version', {
          headers: isProd ? authForward : undefined,
        });
        pushSmoke('/api/version', r.status === 200, r.status, r.durationMs);
        if (r.status !== 200) return httpFailure(r, `HTTP ${r.status}`);
        const json = parseJsonSafe(r.text) as Record<string, unknown> | null;
        if (!json || typeof json !== 'object') return httpFailure(r, 'Ответ не JSON');
        if (!isProd && !json.server_time) {
          return httpFailure(r, 'В development-режиме отсутствует server_time');
        }
        return {
          ok: true,
          message: `stamp=${String(json.api_build_stamp ?? '—')} · commit=${String(json.api_commit ?? '—')}`,
        };
      },
    });

    const authedEndpoints: Array<{ id: string; path: string; name: string; tier: Tier }> = [
      { id: 'diag_health_authed', path: '/api/diagnostics/health', name: 'GET /api/diagnostics/health', tier: 'critical' },
      { id: 'diag_monitor_authed', path: '/api/diagnostics/monitor/status', name: 'GET /api/diagnostics/monitor/status', tier: 'critical' },
      { id: 'analytics_overview_authed', path: '/api/analytics/overview', name: 'GET /api/analytics/overview', tier: 'standard' },
      { id: 'domain_users_authed', path: '/api/users', name: 'GET /api/users — каталог участников', tier: 'standard' },
      { id: 'domain_songs_authed', path: '/api/songs', name: 'GET /api/songs — песенник', tier: 'standard' },
      { id: 'domain_bible_authed', path: '/api/bible/translations', name: 'GET /api/bible/translations — Библия', tier: 'standard' },
      { id: 'domain_logs_authed', path: '/api/settings/logs/admin?limit=5', name: 'GET /api/settings/logs/admin — журнал', tier: 'standard' },
      { id: 'domain_backup_authed', path: '/api/backup/settings', name: 'GET /api/backup/settings — бекапы', tier: 'standard' },
    ];

    for (const ep of authedEndpoints) {
      await runCase({
        id: ep.id,
        name: ep.name,
        category: 'Админ-сессия и доменные API',
        tier: ep.tier,
        fn: async () => {
          if (!sessionValid || !adminSession) {
            return { ok: false, message: 'Пропуск: требуется активная сессия admin' };
          }
          const r = await fetchProbe(baseUrl, ep.path, { headers: authForward });
          pushSmoke(`${ep.path} (auth)`, r.status === 200, r.status, r.durationMs);
          if (r.status === 200) return { ok: true, message: `HTTP 200 за ${r.durationMs} ms` };
          return httpFailure(r, `Ожидался 200, получен ${r.status}`);
        },
      });
    }
  } else {
    results.push({
      id: 'auth_context',
      name: 'Расширенные проверки с сессией администратора',
      category: 'Админ-сессия и доменные API',
      tier: 'optional',
      status: 'skipped',
      durationMs: 0,
      message: 'Нет Cookie/Authorization в запросе — проверки админ-API пропущены',
    });
  }

  // ── 5. Производительность и отзывчивость ─────────────────────
  await runCase({
    id: 'perf_health_burst',
    name: 'Латентность /health (3 последовательных запроса)',
    category: 'Производительность',
    tier: 'standard',
    fn: async () => {
      const samples: number[] = [];
      for (let i = 0; i < 3; i += 1) {
        const r = await fetchProbe(baseUrl, '/health');
        if (r.status !== 200) return httpFailure(r, `Сбой на запросе #${i + 1}: HTTP ${r.status}`);
        samples.push(r.durationMs);
        await sleep(25);
      }
      const max = Math.max(...samples);
      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      const ok = max < 3000;
      return {
        ok,
        message: `avg ${avg.toFixed(0)} ms, max ${max} ms`,
        detail: ok ? undefined : 'Высокая латентность /health (>3000 ms) — проверьте БД и CPU',
      };
    },
  });

  const durationMs = Date.now() - startedAt;
  const passed = results.filter((x) => x.status === 'passed').length;
  const failed = results.filter((x) => x.status === 'failed').length;
  const skipped = results.filter((x) => x.status === 'skipped').length;
  const total = results.length;

  const criticalFailed = results.some((x) => x.tier === 'critical' && x.status === 'failed');
  const standardFailed = results.some((x) => x.tier === 'standard' && x.status === 'failed');

  let overall: AutomatedTestsReport['overall'] = 'passed';
  if (criticalFailed) overall = 'failed';
  else if (standardFailed) overall = 'degraded';

  return {
    generatedAt: new Date().toISOString(),
    baseUrl,
    durationMs,
    summary: { passed, failed, skipped, total },
    overall,
    authenticatedContext: Boolean(hasAuthForward && sessionValid && adminSession),
    results,
    smokeEndpoints,
  };
}
