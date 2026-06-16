import { apiClient } from './client';
import type { DayPrayerData, Member, NextWeekMemberDay } from '../types';
import type {
  CuratorDistributionRunResponse,
  CycleCollectionClaimsSnapshot,
  WeekPlanKind,
} from '../types/prayerCycle';

export async function fetchPrayerByDate(date: string): Promise<DayPrayerData> {
  const { data } = await apiClient.get<DayPrayerData>(`/api/calendar/${date}`);
  return data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeMemberRow(raw: unknown): Member | null {
  if (raw == null || !isRecord(raw)) return null;
  const idNum = typeof raw.id === 'number' ? raw.id : Number(raw.id);
  if (!Number.isFinite(idNum) || raw.name == null) return null;
  const pr = raw.prayer_request;
  const fn = raw.first_name;
  const ln = raw.last_name;
  return {
    id: idNum,
    name: String(raw.name),
    first_name: typeof fn === 'string' || fn === null ? fn : undefined,
    last_name: typeof ln === 'string' || ln === null ? ln : undefined,
    prayer_request: typeof pr === 'string' ? pr : pr == null ? null : String(pr),
  };
}

function normalizeNextWeekDay(raw: unknown): NextWeekMemberDay | null {
  if (!isRecord(raw)) return null;
  const date = raw.date;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return { date, member: normalizeMemberRow(raw.member) };
}

export async function fetchWeekPlanMembers(week: WeekPlanKind = 'next'): Promise<NextWeekMemberDay[]> {
  const { data } = await apiClient.get<unknown>('/api/calendar/next-week/members', {
    params: { week },
  });
  if (!isRecord(data) || !Array.isArray(data.days)) {
    throw new Error('Некорректный ответ API: next-week/members');
  }
  const out: NextWeekMemberDay[] = [];
  for (const row of data.days) {
    const day = normalizeNextWeekDay(row);
    if (day) out.push(day);
  }
  return out;
}

/** @deprecated используйте fetchWeekPlanMembers */
export async function fetchNextWeekMembers(): Promise<NextWeekMemberDay[]> {
  return fetchWeekPlanMembers('next');
}

function normalizeClaimRow(raw: unknown) {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === 'number' ? raw.id : Number(raw.id);
  const name = raw.name;
  if (!Number.isFinite(id) || typeof name !== 'string') return null;
  const fn = raw.first_name;
  const ln = raw.last_name;
  let claimed_by: CycleCollectionClaimsSnapshot['members'][0]['claimed_by'] = null;
  if (isRecord(raw.claimed_by) && typeof raw.claimed_by.id === 'number') {
    claimed_by = {
      id: raw.claimed_by.id,
      name: String(raw.claimed_by.name ?? ''),
      first_name:
        typeof raw.claimed_by.first_name === 'string' || raw.claimed_by.first_name === null
          ? raw.claimed_by.first_name
          : undefined,
      last_name:
        typeof raw.claimed_by.last_name === 'string' || raw.claimed_by.last_name === null
          ? raw.claimed_by.last_name
          : undefined,
    };
  }
  return {
    id,
    name,
    first_name: typeof fn === 'string' || fn === null ? fn : undefined,
    last_name: typeof ln === 'string' || ln === null ? ln : undefined,
    claimed_by,
    can_toggle: Boolean(raw.can_toggle),
  };
}

function normalizeCollectionSnapshot(raw: unknown): CycleCollectionClaimsSnapshot {
  if (!isRecord(raw)) {
    throw new Error('Некорректный ответ API: collection-claims');
  }
  const cycle_index = raw.cycle_index;
  const cycle_number = raw.cycle_number;
  const membersRaw = raw.members;
  const coordinatorsRaw = raw.coordinators;
  if (
    typeof cycle_index !== 'number' ||
    typeof cycle_number !== 'number' ||
    !Array.isArray(membersRaw) ||
    !Array.isArray(coordinatorsRaw)
  ) {
    throw new Error('Некорректный ответ API: collection-claims');
  }
  const coordinators = coordinatorsRaw
    .map((row) => {
      if (!isRecord(row)) return null;
      const id = typeof row.id === 'number' ? row.id : Number(row.id);
      if (!Number.isFinite(id) || typeof row.name !== 'string') return null;
      return {
        id,
        name: row.name,
        first_name:
          typeof row.first_name === 'string' || row.first_name === null
            ? row.first_name
            : undefined,
        last_name:
          typeof row.last_name === 'string' || row.last_name === null ? row.last_name : undefined,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  const members = membersRaw.map((m) => {
    const row = normalizeClaimRow(m);
    if (!row) throw new Error('Некорректный ответ API: collection-claims');
    return row;
  });

  return { cycle_index, cycle_number, coordinators, members };
}

export async function fetchCycleCollectionClaims(
  week?: WeekPlanKind,
): Promise<CycleCollectionClaimsSnapshot> {
  const { data } = await apiClient.get<unknown>('/api/calendar/cycle/collection-claims', {
    params: week ? { week } : {},
  });
  return normalizeCollectionSnapshot(data);
}

export async function patchCycleCollectionClaim(
  memberId: number,
  claim: boolean,
  week?: WeekPlanKind,
  assignedCoordinatorId?: number,
): Promise<CycleCollectionClaimsSnapshot> {
  const { data } = await apiClient.patch<unknown>('/api/calendar/cycle/collection-claims', {
    member_id: memberId,
    claim,
    ...(week ? { week } : {}),
    ...(typeof assignedCoordinatorId === 'number'
      ? { assigned_coordinator_id: assignedCoordinatorId }
      : {}),
  });
  return normalizeCollectionSnapshot(data);
}

export async function runCuratorAutoDistribution(
  weekKind: WeekPlanKind,
): Promise<CuratorDistributionRunResponse> {
  const { data } = await apiClient.post<CuratorDistributionRunResponse>(
    '/api/calendar/next-week/curator-distribution',
    { week_kind: weekKind, notify_curators: true },
  );
  return data;
}

export async function patchMemberCyclePrayer(
  memberId: number,
  targetDate: string,
  prayerRequest: string,
): Promise<void> {
  await apiClient.patch('/api/calendar/member-cycle-prayer', {
    member_id: memberId,
    target_date: targetDate,
    prayer_request: prayerRequest,
  });
}
