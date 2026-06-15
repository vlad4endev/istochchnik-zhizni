import type { Request, Response } from 'express';
import type { AppRole } from '../types/appRole';
import {
  exitImpersonationByToken,
  getImpersonationStatus,
  startImpersonation,
} from '../services/impersonationService';
import { writeAppLog } from '../services/appLogService';

type AuthRequest = Request & {
  authUserId?: number;
  authToken?: string;
  isImpersonating?: boolean;
  realAdminId?: number;
};

function parseMemberId(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export async function startImpersonationHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const adminId = authReq.authUserId;
  const token = authReq.authToken;
  if (!adminId || !token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const targetMemberId = parseMemberId(String(req.params.targetMemberId ?? ''));
  if (!targetMemberId) {
    res.status(400).json({ error: 'Invalid target member id' });
    return;
  }

  try {
    const { targetMember } = await startImpersonation({
      adminId,
      targetMemberId,
      accessToken: token,
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });

    void writeAppLog({
      level: 'info',
      scope: 'auth',
      event: 'impersonation.start',
      message: `Администратор #${adminId} вошёл в аккаунт #${targetMember.id}`,
      user_id: targetMember.id,
      ip: req.ip ?? undefined,
      user_agent: req.get('user-agent') ?? undefined,
      context: {
        performedBy: adminId,
        isImpersonated: true,
        targetMemberId: targetMember.id,
      },
    });

    res.json({
      success: true,
      targetMember: {
        id: targetMember.id,
        name: targetMember.name,
        email: targetMember.email,
        role: targetMember.role as AppRole,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    if (message === 'impersonation_rate_limited') {
      res.status(429).json({ error: 'Слишком много входов в аккаунт. Попробуйте позже.' });
      return;
    }
    if (message === 'impersonation_already_active') {
      res.status(409).json({ error: 'Уже активен режим просмотра аккаунта' });
      return;
    }
    if (message === 'target_not_found') {
      res.status(404).json({ error: 'Участник не найден' });
      return;
    }
    if (message === 'target_is_admin') {
      res.status(403).json({ error: 'Нельзя войти в аккаунт администратора' });
      return;
    }
    if (message === 'cannot_impersonate_self') {
      res.status(400).json({ error: 'Нельзя войти в свой аккаунт' });
      return;
    }
    if (message === 'impersonation_not_configured') {
      res.status(503).json({
        error: 'Функция просмотра аккаунта ещё не настроена на сервере (нет таблиц БД). Примените миграцию или перезапустите API с initDb.',
      });
      return;
    }
    console.error('[impersonation] start failed:', error);
    res.status(500).json({ error: 'Не удалось начать просмотр аккаунта' });
  }
}

export async function impersonationStatusHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const token = authReq.authToken;
  if (!authReq.authUserId || !token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const status = await getImpersonationStatus(token);
    res.json(status);
  } catch (error) {
    console.error('[impersonation] status failed:', error);
    res.status(500).json({ error: 'Не удалось получить статус' });
  }
}

export async function exitImpersonationHandler(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const token = authReq.authToken;
  if (!authReq.authUserId || !token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const wasActive = await exitImpersonationByToken(token);
    if (!wasActive) {
      res.status(404).json({ error: 'Режим просмотра не активен' });
      return;
    }

    const performedBy = authReq.isImpersonating ? authReq.realAdminId : authReq.authUserId;
    void writeAppLog({
      level: 'info',
      scope: 'auth',
      event: 'impersonation.exit',
      message: 'Выход из режима просмотра аккаунта',
      user_id: authReq.authUserId,
      ip: req.ip ?? undefined,
      user_agent: req.get('user-agent') ?? undefined,
      context: {
        performedBy: performedBy ?? null,
        isImpersonated: Boolean(authReq.isImpersonating),
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[impersonation] exit failed:', error);
    res.status(500).json({ error: 'Не удалось выйти из режима просмотра' });
  }
}
