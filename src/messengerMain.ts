/**
 * Отдельный HTTP-сервер мессенджера (поддомен chat.*): REST /api/messenger, WebSocket /api/realtime, статика SPA.
 */
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';

import { pool } from './config/db';
import { initDb } from './config/initDb';
import { ensurePrayerCycleAnchor } from './config/prayerCycleAnchor';
import { resolveAuthSession } from './middleware/authSession';
import { enforceRoleAccess, resolveUserRole } from './middleware/roleAccess';
import authRoutes from './routes/authRoutes';
import messengerRoutes from './routes/messengerRoutes';
import { attachRealtimeWebSocket, initRealtimeRedis } from './realtime/wsHub';
import { ensureUploadsDirs, getUploadsRoot } from './config/uploadsRoot';
import { ensureAccessRequestsMessengerChannel } from './services/messengerService';

dotenv.config();

const app = express();
const PORT = Number(process.env.MESSENGER_PORT || process.env.PORT || 3002);
const skipDbInitOnStart = process.env.SKIP_DB_INIT_ON_START === 'true';

if (process.env.TRUST_PROXY !== 'false') {
  app.set('trust proxy', 1);
}

function normalizeOrigin(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function resolveAllowedOrigins(): string[] {
  const raw = (process.env.MESSENGER_CORS_ORIGINS ?? process.env.CORS_ALLOWED_ORIGINS ?? process.env.CORS_ORIGIN ?? '').trim();
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
      /* fall through */
    }
  }
  return raw.split(',').map((s) => normalizeOrigin(s)).filter((s) => s.length > 0);
}

function corsOptions(): Parameters<typeof cors>[0] | undefined {
  const origins = resolveAllowedOrigins();
  if (origins.length === 0) {
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

ensureUploadsDirs();
const uploadsAbs = getUploadsRoot();
console.log(`[messenger] uploads: ${uploadsAbs}`);
app.use('/uploads', express.static(uploadsAbs, { fallthrough: true }));
app.use('/uploads', (_req, res) => {
  res.status(404).type('text/plain').send('Not found');
});

app.use('/api/auth', authRoutes);

app.use(resolveUserRole);
app.use(enforceRoleAccess);

app.get('/health', async (_req, res) => {
  if (!pool) {
    res.status(200).json({ status: 'ok', database: 'not_configured' });
    return;
  }
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok', database: 'up' });
  } catch (err) {
    console.error('[messenger][health] database ping failed:', err);
    res.status(503).json({ status: 'error', database: 'down' });
  }
});

app.use('/api/messenger', messengerRoutes);

const messengerWebDist = path.join(process.cwd(), 'messenger-web', 'dist');
app.use(express.static(messengerWebDist, { fallthrough: true }));
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(messengerWebDist, 'index.html'));
});

async function start(): Promise<void> {
  if (process.env.DATABASE_URL) {
    if (skipDbInitOnStart) {
      console.log('[messenger] SKIP_DB_INIT_ON_START');
      if (pool) {
        try {
          await ensurePrayerCycleAnchor(pool);
        } catch (e) {
          console.warn('[messenger][cycle]', e);
        }
      }
    } else {
      await initDb();
      if (!pool) {
        throw new Error('Internal: pool is null after initDb');
      }
      await ensurePrayerCycleAnchor(pool);
      void ensureAccessRequestsMessengerChannel().catch((e) =>
        console.warn('[messenger] ensureAccessRequestsMessengerChannel:', e),
      );
    }
  }

  const server = http.createServer(app);
  await initRealtimeRedis();
  attachRealtimeWebSocket(server);

  server.listen(PORT, () => {
    console.log(`[messenger] listening on http://localhost:${PORT}`);
    console.log('[messenger] WebSocket /api/realtime');
  });
}

start().catch((err) => {
  console.error('[messenger] failed to start:', err);
  process.exit(1);
});
