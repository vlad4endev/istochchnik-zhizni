/**
 * Точка входа HTTP-сервера. Не называть файл src/index.ts — Vercel тогда
 * подхватывает Express как serverless и ломает деплой статического Flutter web.
 */
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import { pool } from './config/db';
import { initDb } from './config/initDb';
import { resolveAuthSession } from './middleware/authSession';
import { enforceRoleAccess, resolveUserRole } from './middleware/roleAccess';
import routes from './routes';
import authRoutes from './routes/authRoutes';
import calendarRoutes from './routes/calendarRoutes';
import userRoutes from './routes/userRoutes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 40978;
const skipDbInitOnStart = process.env.SKIP_DB_INIT_ON_START === 'true';

// За nginx / reverse proxy: корректные req.ip и X-Forwarded-* (отключить: TRUST_PROXY=false)
if (process.env.TRUST_PROXY !== 'false') {
  app.set('trust proxy', 1);
}

function corsOptions(): Parameters<typeof cors>[0] | undefined {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw) {
    return undefined;
  }
  const origins = raw.split(',').map((s) => s.trim()).filter(Boolean);
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

async function start(): Promise<void> {
  if (process.env.DATABASE_URL) {
    if (skipDbInitOnStart) {
      console.log('Skipping database initialization on startup');
    } else {
      await initDb();
      console.log('Database tables initialized');
    }
  }
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
