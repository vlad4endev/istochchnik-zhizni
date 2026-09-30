import { Router, type Request, type Response } from 'express';

import { requireAuthSession } from '../middleware/authSession';
import { internalGet, type InternalResult } from '../lib/internalRequest';

const router = Router();

/** Сколько ближайших планов служений подгружаем сразу (детали + профили проповедника/ведущего). */
const PLAN_DETAILS_LIMIT = 3;

type Part = unknown | null;

function ok(r: InternalResult): Part {
  return r.status >= 200 && r.status < 300 ? r.body : null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function truthy(v: unknown): boolean {
  return v === true || v === 1 || v === 't' || v === 'true' || v === '1';
}

function planOrder(a: Record<string, unknown>, b: Record<string, unknown>): number {
  const ka = `${String(a.service_date ?? '')} ${String(a.start_time ?? '')}`;
  const kb = `${String(b.service_date ?? '')} ${String(b.start_time ?? '')}`;
  return ka.localeCompare(kb);
}

/**
 * GET /api/dashboard/bundle?date=YYYY-MM-DD
 * Данные первого экрана главной одним ответом. Каждая часть — тело ответа соответствующего
 * обычного эндпоинта (тот же формат, те же права) или null, если он вернул ошибку:
 * клиент тогда запросит её отдельно.
 */
router.get('/bundle', requireAuthSession, async (req: Request, res: Response) => {
  const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
    ? req.query.date
    : null;
  if (!date) {
    res.status(400).json({ error: 'Параметр date (YYYY-MM-DD) обязателен' });
    return;
  }
  const get = (path: string) => internalGet(req, path);

  const [me, day, events, broadcast, podcasts, birthdays, notes, rolePermissions, plans] =
    await Promise.all([
      get('/api/auth/me'),
      get(`/api/calendar/${date}`),
      get('/api/calendar/events'),
      get('/api/broadcasts/active'),
      get('/api/resources/podcasts?limit=30'),
      get('/api/calendar/birthdays/week'),
      get(`/api/calendar/dashboard-coordinator-notes?for_date=${date}`),
      get('/api/settings/role-permissions'),
      get(`/api/service-plans?from=${date}`),
    ]);

  const meBody = asRecord(ok(me));
  const isCoordinator =
    req.authUserRole === 'admin' || (meBody != null && truthy(meBody.is_collection_coordinator));
  const isAdmin = req.authUserRole === 'admin';

  const planList = Array.isArray(ok(plans)) ? (ok(plans) as unknown[]) : [];
  const nearestPlanIds = planList
    .map(asRecord)
    .filter((p): p is Record<string, unknown> => p != null && Number.isFinite(Number(p.id)))
    .sort(planOrder)
    .slice(0, PLAN_DETAILS_LIMIT)
    .map((p) => Number(p.id));

  const [planDetailResults, claimsNext, membersNext, claimsCurrent, membersCurrent] =
    await Promise.all([
      Promise.all(nearestPlanIds.map((id) => get(`/api/service-plans/${id}`))),
      isCoordinator ? get('/api/calendar/cycle/collection-claims?week=next') : null,
      isCoordinator ? get('/api/calendar/next-week/members?week=next') : null,
      isAdmin ? get('/api/calendar/cycle/collection-claims?week=current') : null,
      isAdmin ? get('/api/calendar/next-week/members?week=current') : null,
    ]);

  const planDetails: Record<string, Part> = {};
  const memberIds = new Set<number>();
  nearestPlanIds.forEach((id, i) => {
    const body = ok(planDetailResults[i]);
    planDetails[String(id)] = body;
    const d = asRecord(body);
    for (const key of ['preacher_member_id', 'leader_member_id']) {
      const n = Number(d?.[key]);
      if (d?.[key] != null && Number.isFinite(n) && n > 0) memberIds.add(n);
    }
  });

  const profileEntries = await Promise.all(
    [...memberIds].map(async (id) => [String(id), ok(await get(`/api/profile/${id}`))] as const),
  );

  res.json({
    me: ok(me),
    day: ok(day),
    events: ok(events),
    broadcast: ok(broadcast),
    podcasts: ok(podcasts),
    birthdays: ok(birthdays),
    notes: ok(notes),
    rolePermissions: ok(rolePermissions),
    plans: ok(plans),
    planDetails,
    profiles: Object.fromEntries(profileEntries),
    coordinator: {
      claimsNext: claimsNext ? ok(claimsNext) : null,
      membersNext: membersNext ? ok(membersNext) : null,
      claimsCurrent: claimsCurrent ? ok(claimsCurrent) : null,
      membersCurrent: membersCurrent ? ok(membersCurrent) : null,
    },
  });
});

export default router;
