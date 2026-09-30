import type { QueryClient } from '@tanstack/react-query';

import { apiClient } from '../../lib/apiClient';
import { keys } from '../../lib/queryKeys';
import {
  parseCalendarDay,
  parseCycleCollectionSnapshot,
  parseDashboardCoordinatorNotes,
  parseWeekBirthdays,
  parseWeekPlanMembers,
} from '../calendar/api';

/** Ответ `GET /api/dashboard/bundle`: тела обычных эндпоинтов или null, если часть не получена. */
type DashboardBundle = {
  me: unknown;
  day: unknown;
  events: unknown;
  broadcast: unknown;
  podcasts: unknown;
  birthdays: unknown;
  notes: unknown;
  rolePermissions: unknown;
  plans: unknown;
  planDetails: Record<string, unknown>;
  profiles: Record<string, unknown>;
  coordinator: {
    claimsNext: unknown;
    membersNext: unknown;
    claimsCurrent: unknown;
    membersCurrent: unknown;
  };
};

export const dashboardBundleKey = (dateKey: string, weekStartKey: string) =>
  ['dashboard', 'bundle', dateKey, weekStartKey] as const;

/**
 * Одним запросом получает данные первого экрана и кладёт их в кэш react-query под теми же
 * ключами, что у отдельных запросов страницы. Части, которых нет в ответе, страница
 * запрашивает сама, как раньше.
 */
export async function loadDashboardBundle(
  qc: QueryClient,
  dateKey: string,
  weekStartKey: string,
): Promise<true> {
  const { data } = await apiClient.get<DashboardBundle>('/api/dashboard/bundle', {
    params: { date: dateKey },
  });

  const seed = (key: readonly unknown[], raw: unknown, parse: (v: unknown) => unknown = (v) => v) => {
    if (raw == null) return;
    try {
      qc.setQueryData(key, parse(raw));
    } catch {
      /* часть не разобралась — запросится отдельно */
    }
  };

  seed(keys.me, data.me);
  seed(keys.calendarDay(dateKey), data.day, parseCalendarDay);
  seed(keys.events, data.events, (v) => (Array.isArray(v) ? v : []));
  seed(keys.broadcast, data.broadcast);
  seed(['resources', 'podcasts', 'dashboard'], data.podcasts);
  seed(['calendar', 'birthdays', 'week', weekStartKey, dateKey], data.birthdays, parseWeekBirthdays);
  seed(keys.dashboardNotes(dateKey), data.notes, parseDashboardCoordinatorNotes);
  seed(keys.rolePermissionsPublic, data.rolePermissions);
  seed(['service-plans', 'dashboard-nearest', dateKey], data.plans);

  for (const [id, plan] of Object.entries(data.planDetails ?? {})) {
    seed(['service-plan', 'dashboard-nearest', Number(id)], plan);
  }
  for (const [id, profile] of Object.entries(data.profiles ?? {})) {
    seed(['profile', 'dashboard-preacher', Number(id)], profile);
    seed(['profile', 'dashboard-host', Number(id)], profile);
  }

  const c = data.coordinator;
  if (c) {
    seed(['calendar', 'cycle', 'collection-claims', 'next', 'dashboard'], c.claimsNext, parseCycleCollectionSnapshot);
    seed(['calendar', 'week-members', 'next', 'dashboard'], c.membersNext, parseWeekPlanMembers);
    seed(['calendar', 'cycle', 'collection-claims', 'current', 'dashboard'], c.claimsCurrent, parseCycleCollectionSnapshot);
    seed(['calendar', 'week-members', 'current', 'dashboard'], c.membersCurrent, parseWeekPlanMembers);
  }
  return true;
}
