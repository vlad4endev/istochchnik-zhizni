/**
 * Точка входа HTTP-сервера. Не называть файл src/index.ts — Vercel тогда
 * подхватывает Express как serverless и ломает деплой статического фронта (web-react).
 */
import http from 'node:http';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import type { Request as ExpressRequest } from 'express';

import { pool } from './config/db';
import { initDb } from './config/initDb';
import { ensurePrayerCycleAnchor } from './config/prayerCycleAnchor';
import { resolveAuthSession } from './middleware/authSession';
import { enforceRoleAccess, resolveUserRole } from './middleware/roleAccess';
import routes from './routes';
import authRoutes from './routes/authRoutes';
import calendarRoutes from './routes/calendarRoutes';
import userRoutes from './routes/userRoutes';
import pushRoutes from './routes/pushRoutes';
import notificationsRoutes from './routes/notificationsRoutes';
import telegramRoutes from './routes/telegramRoutes';
import smsRoutes from './routes/smsRoutes';
import publicRoutes from './routes/publicRoutes';
import songRoutes from './routes/songRoutes';
import studioRoutes from './routes/studioRoutes';
import settingsRoutes from './routes/settingsRoutes';
import messengerRoutes from './routes/messengerRoutes';
import servicePlannerRoutes from './routes/servicePlannerRoutes';
import analyticsRoutes from './routes/analyticsRoutes';
import { analyticsMiddleware } from './middleware/analyticsMiddleware';
import { diagnosticsRouter } from './diagnostics/routes/diagnostics.router';
import {
  attachRealtimeWebSocket,
  initMessengerFanoutPublisherOnly,
  initRealtimeRedis,
} from './realtime/wsHub';
import { initPushCronJobs } from './cron/pushJobs';
import { ensureUploadsDirs, getUploadsRoot } from './config/uploadsRoot';
import { ensureAccessRequestsMessengerChannel } from './services/messengerService';
import { writeAppLog } from './services/appLogService';
import { getEditablePlanByToken, getPublicPlanByToken } from './services/servicePlannerService';
import { startAnalyticsMaintenance } from './services/analyticsService';
import { shouldWarnMissingSupabaseStoragePublicUrl } from './lib/supabaseStorage';

dotenv.config();

type RequestWithAuthUser = ExpressRequest & { authUserId?: number };

const app = express();
const PORT = process.env.PORT || 40978;
const skipDbInitOnStart = process.env.SKIP_DB_INIT_ON_START === 'true';

// За nginx / reverse proxy: корректные req.ip и X-Forwarded-* (отключить: TRUST_PROXY=false)
if (process.env.TRUST_PROXY !== 'false') {
  app.set('trust proxy', 1);
}

function normalizeOrigin(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function httpStatusText(status: number): string {
  if (status >= 500) return 'Ошибка сервера';
  if (status >= 400) return 'Проблема в запросе';
  if (status >= 300) return 'Перенаправление';
  return 'Запрос выполнен';
}

type SeoMeta = {
  title: string;
  description: string;
  robots?: string;
};

const DEFAULT_SPA_TITLE = 'Моя церковь - цифровая платформа';
const DEFAULT_SPA_DESCRIPTION = 'Планирование служений, расписание и командная работа в одном приложении.';

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateRuForSeo(dateIso: string): string {
  const dt = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return dateIso;
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(dt);
}

function buildSeoHead(meta: SeoMeta, absoluteUrl: string): string {
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const url = escapeHtml(absoluteUrl);
  const robots = escapeHtml(meta.robots ?? 'index,follow');
  const image = escapeHtml(
    absoluteUrl.replace(/\/service-plan\/(share|edit)\/[^/]+$/i, '/assets/apple-touch-icon-180x180.png'),
  );
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta name="robots" content="${robots}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:locale" content="ru_RU" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`,
  ].join('\n    ');
}

let cachedSpaIndexHtml: string | null = null;
function readSpaIndexHtml(webDist: string): string {
  if (cachedSpaIndexHtml) return cachedSpaIndexHtml;
  const html = fs.readFileSync(path.join(webDist, 'index.html'), 'utf8');
  cachedSpaIndexHtml = html;
  return html;
}

function renderSpaWithMeta(webDist: string, meta: SeoMeta, absoluteUrl: string): string {
  const baseHtml = readSpaIndexHtml(webDist);
  const seoHead = buildSeoHead(meta, absoluteUrl);
  return baseHtml.replace(/<title>[\s\S]*?<\/title>/i, `${seoHead}`);
}

/**
 * Разрешённые Origin для CORS (браузерные запросы с другого домена, чем API).
 * Задаётся в .env одним из способов:
 * - CORS_ALLOWED_ORIGINS=https://app.example.com,https://www.example.com
 * - CORS_ORIGIN=… (алиас, то же правило)
 * - JSON-массив: CORS_ALLOWED_ORIGINS=["https://a.com","https://b.com"]
 *
 * Пусто: пакет `cors` отражает любой Origin (удобно за nginx на одном хосте; в production лучше задать явно).
 */
function resolveAllowedOrigins(): string[] {
  const raw = (process.env.CORS_ALLOWED_ORIGINS ?? process.env.CORS_ORIGIN ?? '').trim();
  if (!raw) {
    return [];
  }
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((v) => normalizeOrigin(String(v)))
          .filter((s) => s.length > 0);
      }
    } catch {
      /* fall through: не JSON — разбираем как строку с запятыми */
    }
  }
  return raw.split(',').map((s) => normalizeOrigin(s)).filter((s) => s.length > 0);
}

function corsOptions(): Parameters<typeof cors>[0] | undefined {
  const origins = resolveAllowedOrigins();
  if (origins.length === 0) {
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[cors] CORS_ALLOWED_ORIGINS / CORS_ORIGIN не заданы — cross-origin browser запросы будут отклонены.',
      );
      return {
        // SECURITY FIX: в production без явного allowlist блокируем cross-origin вместо permissive fallback.
        origin: (origin, cb) => cb(origin ? new Error('Origin is not allowed by CORS policy') : null, !origin),
        credentials: true,
      };
    }
    return { origin: true, credentials: true };
  }
  return {
    origin: origins.length === 1 ? origins[0] : origins,
    credentials: true,
  };
}

app.use(cors(corsOptions()));
app.use((req, res, next) => {
  // SECURITY FIX: базовые security headers для снижения XSS/clickjacking/MIME sniffing рисков.
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; " +
      "img-src 'self' data: blob: https:; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
      "connect-src 'self' https: wss: ws:; frame-src 'self' https://rutube.ru https://www.youtube.com https://vk.com; form-action 'self'",
  );
  next();
});
app.use(express.json());
app.use(resolveAuthSession);
app.use(analyticsMiddleware);

// Журналируем API-запросы (длительность, статус, пользователь) для админки "Журнал".
app.use((req, res, next) => {
  const startedAt = Date.now();
  const targetPath = (req.originalUrl || req.url || req.path || '').split('?')[0] || '';
  const shouldLog = targetPath.startsWith('/api/') || targetPath === '/health';
  if (!shouldLog) {
    next();
    return;
  }
  res.on('finish', () => {
    const status = res.statusCode;
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    void writeAppLog({
      level,
      scope: 'http',
      event: 'http.request',
      message: `${httpStatusText(status)}: ${req.method} ${targetPath} (статус ${status})`,
      context: {
        query: req.query,
      },
      request_method: req.method,
      request_path: targetPath,
      status_code: status,
      duration_ms: Date.now() - startedAt,
      user_id: (req as RequestWithAuthUser).authUserId,
      ip: req.ip,
      user_agent: req.get('user-agent') ?? '',
    });
  });
  next();
});

// Устаревшие локальные файлы: только чтение, если каталог не пуст (новые загрузки — Supabase Storage).
ensureUploadsDirs();
const uploadsAbs = getUploadsRoot();
console.log(`[uploads] serving static files from: ${uploadsAbs}`);
// fallthrough: иначе при отсутствии файла send может отдать ENOENT в error handler → шум в логах.
// Явный 404 после static: не отдаём SPA index.html на несуществующие /uploads/*.
app.use('/uploads', express.static(uploadsAbs, {
  fallthrough: true,
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  },
}));
app.use('/uploads', (_req, res) => {
  res.status(404).type('text/plain').send('Not found');
});
// Alias for reverse proxies that only route `/api/*`.
app.use('/api/uploads', express.static(uploadsAbs, {
  fallthrough: true,
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  },
}));
app.use('/api/uploads', (_req, res) => {
  res.status(404).type('text/plain').send('Not found');
});

app.use('/api/auth', authRoutes);
app.use('/api/diagnostics', diagnosticsRouter);
const diagnosticsClientDist = path.join(__dirname, 'diagnostics', 'client');
const diagnosticsClientSrc = path.join(process.cwd(), 'src', 'diagnostics', 'client');
const diagnosticsClientPath = fs.existsSync(diagnosticsClientDist) ? diagnosticsClientDist : diagnosticsClientSrc;
app.use('/diagnostics', express.static(diagnosticsClientPath));

app.use(resolveUserRole);
app.use(enforceRoleAccess);

app.get('/', (req, res) => {
  res.json({ message: 'Server is running' });
});

app.get('/health', async (_req, res) => {
  if (!pool) {
    res.status(200).json({ status: 'ok', database: 'not_configured' });
    return;
  }
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok', database: 'up' });
  } catch (err) {
    console.error('[health] database ping failed:', err);
    res.status(503).json({ status: 'error', database: 'down' });
  }
});

// /api/users — раньше общего /api, чтобы спец-маршруты (merge-duplicates, swap-all-…) не пересекались с будущими catch-all.
app.use('/api/users', userRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/songs', songRoutes);
app.use('/api/studio', studioRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/messenger', messengerRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api', servicePlannerRoutes);
app.use('/api', routes);
app.use('/api/push', pushRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/sms', smsRoutes);

// Debug/version endpoint (helps verify that deploy updated)
app.get('/api/version', (_req, res) => {
  res.json({
    api_build_stamp: process.env.BUILD_STAMP ?? null,
    api_commit: process.env.GIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    node_env: process.env.NODE_ENV ?? null,
    server_time: new Date().toISOString(),
  });
});

// ─── Static web (Vite dist) ──────────────────────────────────
// В production раздаём собранный фронтенд как SPA:
// - /assets/*, /manifest.webmanifest, /sw.js, etc.
// - любые не-/api пути → index.html (React Router)
const webDist = path.join(process.cwd(), 'web-react', 'dist');
const spaIndexPath = path.join(webDist, 'index.html');
const hasSpaIndex = fs.existsSync(spaIndexPath);
if (!hasSpaIndex) {
  // В docker-compose статика обычно отдаётся контейнером `web` (nginx), образ API без dist — норма.
  console.info(
    `[web] В образе API нет SPA (${spaIndexPath}) — маршруты приложения с этого процесса не раздаются. Открывайте сайт через контейнер web (порт WEB_PORT) или встройте dist в образ API.`,
  );
}

app.get('/service-plan/share/:token', async (req, res, next) => {
  try {
    if (!hasSpaIndex) {
      res.status(503).type('text/plain').send('Web client is not available in this API deployment');
      return;
    }
    const token = String(req.params.token ?? '').trim();
    const payload = await getPublicPlanByToken(token);
    const dateText = payload ? formatDateRuForSeo(payload.plan.service_date) : '';
    const leader = payload?.plan.leader_name ?? 'не назначен';
    const preacher = payload?.plan.preacher_name ?? 'не назначен';
    const title = payload
      ? `Финальная программа служения — ${dateText}`
      : DEFAULT_SPA_TITLE;
    const description = payload
      ? `Финальная версия программы на ${dateText}. Ведущий: ${leader}. Проповедник: ${preacher}.`
      : DEFAULT_SPA_DESCRIPTION;
    const absoluteUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    res.type('html').send(renderSpaWithMeta(webDist, { title, description, robots: 'index,follow' }, absoluteUrl));
  } catch (e) {
    next(e);
  }
});

app.get('/service-plan/edit/:token', async (req, res, next) => {
  try {
    if (!hasSpaIndex) {
      res.status(503).type('text/plain').send('Web client is not available in this API deployment');
      return;
    }
    const token = String(req.params.token ?? '').trim();
    const payload = await getEditablePlanByToken(token);
    const dateText = payload ? formatDateRuForSeo(payload.plan.service_date) : '';
    const leader = payload?.plan.leader_name ?? 'не назначен';
    const preacher = payload?.plan.preacher_name ?? 'не назначен';
    const title = payload
      ? `Черновик программы служения — ${dateText}`
      : DEFAULT_SPA_TITLE;
    const description = payload
      ? `Редактирование программы на ${dateText}. Ответственным за служение нужно заполнить и проверить блоки. Ведущий: ${leader}. Проповедник: ${preacher}.`
      : DEFAULT_SPA_DESCRIPTION;
    const absoluteUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    res.type('html').send(renderSpaWithMeta(webDist, { title, description, robots: 'noindex,nofollow' }, absoluteUrl));
  } catch (e) {
    next(e);
  }
});

if (hasSpaIndex) {
  app.use(express.static(webDist, { fallthrough: true }));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(spaIndexPath);
  });
}

async function start(): Promise<void> {
  if (process.env.DATABASE_URL) {
    if (skipDbInitOnStart) {
      console.log('Skipping database initialization on startup');
      if (pool) {
        try {
          await ensurePrayerCycleAnchor(pool);
        } catch (e) {
          console.warn('[cycle] ensurePrayerCycleAnchor (SKIP_DB_INIT_ON_START):', e);
        }
      }
    } else {
      await initDb();
      console.log('Database tables initialized');
      if (!pool) {
        throw new Error('Internal: pool is null after initDb');
      }
      await ensurePrayerCycleAnchor(pool);
      void ensureAccessRequestsMessengerChannel().catch((e) =>
        console.warn('[messenger] ensureAccessRequestsMessengerChannel on boot:', e),
      );
    }
  }

  if (!process.env.SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    console.warn(
      '[WARN] Supabase Storage не настроен (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) — загрузка файлов в мессенджере не будет работать.',
    );
  }
  if (shouldWarnMissingSupabaseStoragePublicUrl()) {
    console.warn(
      '[WARN] SUPABASE_STORAGE_PUBLIC_URL не задан, а SUPABASE_URL по HTTP — в браузере возможен mixed content. Задайте публичный HTTPS-ориджин Storage (обычно https://<ref>.supabase.co), см. .env.example.',
    );
  }

  const server = http.createServer(app);
  await initMessengerFanoutPublisherOnly();
  await initRealtimeRedis();
  attachRealtimeWebSocket(server);
  
  initPushCronJobs();
  startAnalyticsMaintenance();
  
  server.listen(Number(PORT), () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log('[realtime] Notify WebSocket: /api/realtime (мессенджер — отдельный сервис)');
    void writeAppLog({
      level: 'info',
      scope: 'boot',
      event: 'boot.ready',
      message: `Сервер запущен на порту ${PORT}`,
      context: { port: Number(PORT) },
    });
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  void writeAppLog({
    level: 'error',
    scope: 'boot',
    event: 'boot.failed',
    message: 'Не удалось запустить сервер',
    context: { error: err instanceof Error ? err.message : String(err) },
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error('[runtime] Unhandled rejection:', reason);
  void writeAppLog({
    level: 'error',
    scope: 'runtime',
    event: 'runtime.unhandled_rejection',
    message: 'Необработанная ошибка в фоновом процессе',
    context: { reason: msg },
  });
});

process.on('uncaughtException', (error) => {
  console.error('[runtime] Uncaught exception:', error);
  void writeAppLog({
    level: 'error',
    scope: 'runtime',
    event: 'runtime.uncaught_exception',
    message: 'Критическая ошибка процесса',
    context: { stack: error.stack ?? null },
  });
});
