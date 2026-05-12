import type { Request } from 'express';
import { pool } from '../config/db';
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

async function fetchProbe(
  baseUrl: string,
  path: string,
  init?: { headers?: Record<string, string>; timeoutMs?: number },
): Promise<{ status: number; durationMs: number; text: string }> {
  const timeoutMs = init?.timeoutMs ?? 15000;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
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
  const role = o.app_role;
  if (role === 'admin') return true;
  const roles = o.app_roles;
  if (Array.isArray(roles) && roles.some((r) => r === 'admin')) return true;
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

export async function runAutomatedTestSuite(baseUrl: string, req: Request): Promise<AutomatedTestsReport> {
  const startedAt = Date.now();
  const authForward = buildAuthForwardHeaders(req);
  const hasAuthForward = Object.keys(authForward).length > 0;

  const results: AutomatedTestResult[] = [];
  const smokeEndpoints: AutomatedTestsReport['smokeEndpoints'] = [];

  async function runCase(options: {
    id: string;
    name: string;
    category: string;
    tier: Tier;
    fn: () => Promise<CaseOutcome>;
    /** When true, omit from smoke strip chart */
    hideFromSmoke?: boolean;
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
    path: string,
    ok: boolean,
    status: number,
    durationMs: number,
    note?: string,
  ): void {
    smokeEndpoints.push({ path, ok, status, durationMs, note });
  }

  // ── Публичные HTTP и контракты ─────────────────────────────
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
      if (!json || typeof json.status !== 'string') {
        return {
          ok: false,
          message: 'Ответ не JSON или нет поля status',
          httpStatus: r.status,
          responsePreview: clipBody(r.text),
        };
      }
      if (json.status !== 'ok') {
        return {
          ok: false,
          message: `status=${String(json.status)}`,
          httpStatus: r.status,
          responsePreview: clipBody(r.text),
        };
      }
      return { ok: true, message: `database: ${String(json.database ?? '—')}` };
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
    id: 'http_version',
    name: 'GET /api/version — метаданные сборки',
    category: 'HTTP · публичное API',
    tier: 'critical',
    fn: async () => {
      const r = await fetchProbe(baseUrl, '/api/version');
      pushSmoke('/api/version', r.status === 200, r.status, r.durationMs);
      if (r.status !== 200) return httpFailure(r, `HTTP ${r.status}`);
      const json = parseJsonSafe(r.text) as Record<string, unknown> | null;
      if (!json?.server_time) {
        return {
          ok: false,
          message: 'Нет server_time',
          httpStatus: r.status,
          responsePreview: clipBody(r.text),
        };
      }
      return { ok: true, message: `node_env=${String(json.node_env ?? '—')}` };
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

  // ── Безопасность (без cookie) ─────────────────────────────
  await runCase({
    id: 'sec_auth_me_closed',
    name: 'GET /api/auth/me без сессии → 401',
    category: 'Безопасность',
    tier: 'critical',
    hideFromSmoke: true,
    fn: async () => {
      const r = await fetchProbe(baseUrl, '/api/auth/me');
      pushSmoke('/api/auth/me (anon)', r.status === 401, r.status, r.durationMs, 'Должен быть закрыт');
      if (r.status === 401) return { ok: true, message: '401 Unauthorized' };
      return httpFailure(r, `Получен ${r.status}, ожидался 401`);
    },
  });

  await runCase({
    id: 'sec_auth_session_hints_public',
    name: 'GET /api/auth/session-hints без сессии → 200',
    category: 'Безопасность',
    tier: 'standard',
    hideFromSmoke: true,
    fn: async () => {
      const r = await fetchProbe(baseUrl, '/api/auth/session-hints');
      pushSmoke('/api/auth/session-hints', r.status === 200, r.status, r.durationMs, 'Публичный TTL для SPA');
      if (r.status !== 200) return httpFailure(r, `Ожидался 200, получен ${r.status}`);
      const j = parseJsonSafe(r.text) as { accessTokenTtlMinutes?: unknown } | null;
      if (!j || typeof j.accessTokenTtlMinutes !== 'number') {
        return { ok: false, message: 'Некорректное тело: ожидается { accessTokenTtlMinutes: number }' };
      }
      return { ok: true, message: `access TTL ${j.accessTokenTtlMinutes} min` };
    },
  });

  await runCase({
    id: 'sec_analytics_closed',
    name: 'GET /api/analytics/overview без сессии → 401',
    category: 'Безопасность',
    tier: 'critical',
    fn: async () => {
      const r = await fetchProbe(baseUrl, '/api/analytics/overview');
      pushSmoke('/api/analytics/overview (anon)', r.status === 401, r.status, r.durationMs, 'Только для админов');
      if (r.status === 401) return { ok: true, message: 'Закрыто' };
      return httpFailure(r, `Ожидался 401 для неавторизованного запроса, получен ${r.status}`);
    },
  });

  await runCase({
    id: 'sec_settings_logs_closed',
    name: 'GET /api/settings/logs/admin без сессии → 401/403',
    category: 'Безопасность',
    tier: 'critical',
    fn: async () => {
      const r = await fetchProbe(baseUrl, '/api/settings/logs/admin');
      const ok = r.status === 401 || r.status === 403;
      pushSmoke('/api/settings/logs/admin (anon)', ok, r.status, r.durationMs);
      if (!ok) return httpFailure(r, `Неожиданно открыто: ${r.status}`);
      return { ok: true, message: `HTTP ${r.status}` };
    },
  });

  await runCase({
    id: 'sec_diagnostics_closed',
    name: 'GET /api/diagnostics/health без сессии → 401',
    category: 'Безопасность',
    tier: 'critical',
    fn: async () => {
      const r = await fetchProbe(baseUrl, '/api/diagnostics/health');
      pushSmoke('/api/diagnostics/health (anon)', r.status === 401, r.status, r.durationMs);
      if (r.status === 401) return { ok: true, message: 'Диагностика защищена' };
      return httpFailure(r, `Ожидался 401, получен ${r.status}`);
    },
  });

  await runCase({
    id: 'sec_sms_settings_closed',
    name: 'GET /api/sms/settings без сессии → 401/403',
    category: 'Безопасность',
    tier: 'standard',
    fn: async () => {
      const r = await fetchProbe(baseUrl, '/api/sms/settings');
      const ok = r.status === 401 || r.status === 403;
      pushSmoke('/api/sms/settings (anon)', ok, r.status, r.durationMs);
      if (!ok) return httpFailure(r, `Неожиданный статус ${r.status}`);
      return { ok: true, message: `HTTP ${r.status}` };
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
      pushSmoke('/api/notifications/vapid-public-key', ok, r.status, r.durationMs, '200 или 503 если ключ не задан');
      if (r.status === 200) {
        const json = parseJsonSafe(r.text) as Record<string, unknown> | null;
        const pk = json?.publicKey;
        const valid = typeof pk === 'string' && pk.length > 0;
        if (!valid) {
          return {
            ok: false,
            message: 'Нет или пустой publicKey в JSON',
            httpStatus: r.status,
            responsePreview: clipBody(r.text),
          };
        }
        return { ok: true, message: 'VAPID publicKey ок' };
      }
      return {
        ok: true,
        message: 'VAPID не настроен (503) — допустимо для среды без push',
      };
    },
  });

  // ── База данных (процесс) ─────────────────────────────────
  await runCase({
    id: 'db_ping',
    name: 'PostgreSQL SELECT 1',
    category: 'База данных',
    tier: 'critical',
    hideFromSmoke: true,
    fn: async () => {
      if (!pool) {
        return { ok: true, message: 'pool отсутствует (DATABASE_URL не задан), пропуск' };
      }
      await pool.query('SELECT 1');
      return { ok: true, message: 'Соединение успешно' };
    },
  });

  await runCase({
    id: 'db_members_probe',
    name: 'PostgreSQL: доступ к таблице members',
    category: 'База данных',
    tier: 'standard',
    hideFromSmoke: true,
    fn: async () => {
      if (!pool) {
        return { ok: true, message: 'БД не настроена — пропуск' };
      }
      const res = await pool.query('SELECT COUNT(*)::text AS c FROM members LIMIT 1');
      const row = res.rows[0] as { c?: string } | undefined;
      const c = row?.c ?? '?';
      return { ok: true, message: `members: ${c} строк (оценка)` };
    },
  });

  // ── Контекст администратора (cookie с браузера) ─────────────
  let sessionValid = false;
  let adminSession = false;

  if (hasAuthForward) {
    await runCase({
      id: 'auth_me_session',
      name: 'GET /api/auth/me с переданными учётными данными запроса',
      category: 'Сессия',
      tier: 'standard',
      hideFromSmoke: true,
      fn: async () => {
        const r = await fetchProbe(baseUrl, '/api/auth/me', { headers: authForward });
        sessionValid = r.status === 200;
        if (!sessionValid) {
          return {
            ok: false,
            message: `Сессия не принята (${r.status}). Откройте диагностику из браузера под учётной записью.`,
            httpStatus: r.status,
            responsePreview: clipBody(r.text),
          };
        }
        const json = parseJsonSafe(r.text);
        adminSession = isAdminUser(json);
        return {
          ok: true,
          message: adminSession ? 'Пользователь — admin' : 'Сессия активна (не admin)',
        };
      },
    });

    await runCase({
      id: 'diag_health_authed',
      name: 'GET /api/diagnostics/health с сессией админа',
      category: 'Сессия',
      tier: 'critical',
      fn: async () => {
        if (!sessionValid) {
          return { ok: false, message: 'Пропуск: нет валидной сессии', detail: 'Выполните вход и повторите' };
        }
        if (!adminSession) {
          return {
            ok: false,
            message: 'Пропуск: нужна роль admin',
            detail: 'Диагностика доступна только администраторам',
          };
        }
        const r = await fetchProbe(baseUrl, '/api/diagnostics/health', { headers: authForward });
        pushSmoke('/api/diagnostics/health (auth)', r.status === 200, r.status, r.durationMs);
        if (r.status !== 200) return httpFailure(r, `HTTP ${r.status}`);
        const json = parseJsonSafe(r.text) as Record<string, unknown> | null;
        if (!json?.status || json.status !== 'ok') {
          return {
            ok: false,
            message: 'Неверное тело ответа diagnostics health',
            httpStatus: r.status,
            responsePreview: clipBody(r.text),
          };
        }
        return { ok: true, message: `version: ${String(json.version ?? '—')}` };
      },
    });

    await runCase({
      id: 'analytics_overview_authed',
      name: 'GET /api/analytics/overview для admin',
      category: 'Сессия',
      tier: 'standard',
      fn: async () => {
        if (!sessionValid || !adminSession) {
          return { ok: true, message: 'Пропуск (нет admin-сессии)', detail: 'skipped' };
        }
        const r = await fetchProbe(baseUrl, '/api/analytics/overview', { headers: authForward });
        pushSmoke('/api/analytics/overview (auth)', r.status === 200, r.status, r.durationMs);
        if (r.status === 200) return { ok: true, message: 'Аналитика отвечает' };
        return httpFailure(r, `Ожидался 200, получен ${r.status}`);
      },
    });
  } else {
    results.push({
      id: 'auth_context',
      name: 'Расширенные проверки с сессией',
      category: 'Сессия',
      tier: 'optional',
      status: 'skipped',
      durationMs: 0,
      message:
        'Нет Cookie/Authorization в запросе — проверки админ-API пропущены (запускайте из приложения под админом)',
    });
  }

  // ── Нагрузочный микро-стресс (опционально) ─────────────────
  await runCase({
    id: 'perf_health_burst',
    name: 'Латентность /health (3 запроса)',
    category: 'Производительность',
    tier: 'optional',
    hideFromSmoke: true,
    fn: async () => {
      const samples: number[] = [];
      for (let i = 0; i < 3; i += 1) {
        const r = await fetchProbe(baseUrl, '/health');
        samples.push(r.durationMs);
        await sleep(30);
      }
      const max = Math.max(...samples);
      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      const ok = max < 8000;
      return {
        ok,
        message: `avg ${avg.toFixed(0)} ms, max ${max} ms`,
        detail: ok ? undefined : 'Очень высокая латентность — проверьте БД и сеть',
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
