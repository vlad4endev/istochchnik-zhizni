/**
 * Точка входа HTTP-сервера. Не называть файл src/index.ts — Vercel тогда
 * подхватывает Express как serverless и ломает деплой статического фронта (web-react).
 */
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';

import { pool } from './config/db';
import { initDb } from './config/initDb';
import { MEMBER_SEED_SQL } from './config/memberSeedSql';
import { ensurePrayerCycleAnchor } from './config/prayerCycleAnchor';
import { resolveAuthSession } from './middleware/authSession';
import { enforceRoleAccess, resolveUserRole } from './middleware/roleAccess';
import routes from './routes';
import authRoutes from './routes/authRoutes';
import calendarRoutes from './routes/calendarRoutes';
import userRoutes from './routes/userRoutes';
import pushRoutes from './routes/pushRoutes';
import messengerRoutes from './routes/messengerRoutes';
import notificationsRoutes from './routes/notificationsRoutes';
import { attachRealtimeWebSocket } from './realtime/wsHub';
import { initPushCronJobs } from './cron/pushJobs';

dotenv.config();

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
        '[cors] CORS_ALLOWED_ORIGINS / CORS_ORIGIN не заданы — разрешены запросы с любых Origin. ' +
          'Для публичного API укажите домены фронтенда через запятую.',
      );
    }
    return undefined;
  }
  return {
    origin: origins.length === 1 ? origins[0] : origins,
    credentials: true,
  };
}

app.use(cors(corsOptions()));
app.use(express.json());
app.use(resolveAuthSession);

// User-uploaded files (avatars, etc.)
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), { fallthrough: false }));

app.use('/api/auth', authRoutes);

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

app.use('/api', routes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/users', userRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/messenger', messengerRoutes);

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
app.use(express.static(webDist, { fallthrough: true }));
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(webDist, 'index.html'));
});

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
      const cnt = await pool.query('SELECT COUNT(*)::int AS c FROM members');
      const n = Number(cnt.rows[0]?.c ?? 0);
      if (n === 0) {
        await pool.query(MEMBER_SEED_SQL);
        console.log(
          '[db] Таблица members была пуста — применён базовый список участников (54 записи).',
        );
        await ensurePrayerCycleAnchor(pool);
      }
    }
  }
  const server = http.createServer(app);
  attachRealtimeWebSocket(server);
  
  initPushCronJobs();
  
  server.listen(Number(PORT), () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log('[realtime] WebSocket: /api/realtime');
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
