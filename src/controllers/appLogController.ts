import type { Request, Response } from 'express';
import { listAppLogs, type AppLogLevel } from '../services/appLogService';
import { listTelegramSendLogBatches } from '../services/telegramSendLogService';

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

export async function getTelegramSendLogsAdmin(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  try {
    const batches = await listTelegramSendLogBatches({
      limit: req.query.limit,
      offset: req.query.offset,
      channel: typeof req.query.channel === 'string' ? req.query.channel : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : '',
    });
    res.json({ items: batches });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[telegram-send-log] GET admin failed', err);
    res.status(500).json({
      error: 'Не удалось загрузить журнал авторассылки Telegram',
      detail: detail.slice(0, 400),
    });
  }
}
