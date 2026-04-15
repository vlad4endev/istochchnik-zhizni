import type { Request, Response } from 'express';
import { listAppLogs, type AppLogLevel } from '../services/appLogService';

type AuthReq = Request & { authUserRole?: string };

function ensureAdmin(req: Request, res: Response): boolean {
  if ((req as AuthReq).authUserRole !== 'admin') {
    res.status(403).json({ error: 'Недостаточно прав' });
    return false;
  }
  return true;
}

function parseLevel(raw: unknown): AppLogLevel | undefined {
  if (raw === 'info' || raw === 'warn' || raw === 'error') return raw;
  return undefined;
}

export async function getAppLogsAdmin(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  try {
    const logs = await listAppLogs({
      limit: req.query.limit,
      offset: req.query.offset,
      level: parseLevel(req.query.level),
      search: typeof req.query.search === 'string' ? req.query.search : '',
    });
    res.json({ items: logs });
  } catch (err) {
    console.error('[app-log] GET admin failed', err);
    res.status(500).json({ error: 'Не удалось загрузить журнал' });
  }
}
