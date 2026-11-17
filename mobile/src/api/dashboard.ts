import { apiClient } from './client';
import type { ServicePlanListItem } from './servicePlanner';

export type BirthdayWeekItem = {
  id: number;
  name: string;
  birth_date: string;
  week_date: string;
};

export type CoordinatorNote = {
  text: string;
  start_date: string;
  end_date: string;
};

export type BroadcastPlatform = 'youtube' | 'rutube' | 'vk' | 'other';
export type BroadcastStatus = 'scheduled' | 'live' | 'finished';

export type BroadcastData = {
  id: number;
  title: string | null;
  description: string | null;
  starts_at: string | null;
  platform: BroadcastPlatform;
  stream_url: string | null;
  status: BroadcastStatus;
};

export type PlanBlockLite = {
  content_json: Record<string, unknown> | null;
};

export type ServicePlanDetailsLite = ServicePlanListItem & {
  blocks: PlanBlockLite[];
};

export type MemberProfileLite = {
  member_id: number;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type DashboardBundle = {
  birthdays: BirthdayWeekItem[];
  announcement: CoordinatorNote | null;
  broadcast: BroadcastData | null;
  plans: ServicePlanListItem[];
  planDetails: Record<number, ServicePlanDetailsLite>;
  profiles: Record<number, MemberProfileLite>;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function parseBirthdays(raw: unknown): BirthdayWeekItem[] {
  if (!isRecord(raw) || !Array.isArray(raw.items)) return [];
  const out: BirthdayWeekItem[] = [];
  for (const row of raw.items) {
    if (!isRecord(row)) continue;
    const id = Number(row.id);
    const name = str(row.name);
    const weekDate = str(row.week_date);
    if (!Number.isFinite(id) || !name || !weekDate || !/^\d{4}-\d{2}-\d{2}$/.test(weekDate)) {
      continue;
    }
    out.push({ id, name, birth_date: str(row.birth_date) ?? '', week_date: weekDate });
  }
  return out;
}

export function parseAnnouncement(raw: unknown): CoordinatorNote | null {
  if (!isRecord(raw) || !isRecord(raw.announcement)) return null;
  const n = raw.announcement;
  const text = str(n.text);
  const start = str(n.start_date);
  const end = str(n.end_date);
  if (!text || !start || !end) return null;
  return { text, start_date: start, end_date: end };
}

export function parseBroadcast(raw: unknown): BroadcastData | null {
  if (!isRecord(raw) || !isRecord(raw.broadcast)) return null;
  const b = raw.broadcast;
  const id = Number(b.id);
  if (!Number.isFinite(id)) return null;
  const status = b.status === 'live' || b.status === 'finished' ? b.status : 'scheduled';
  const platform: BroadcastPlatform =
    b.platform === 'youtube' || b.platform === 'rutube' || b.platform === 'vk'
      ? b.platform
      : 'other';
  return {
    id,
    title: str(b.title),
    description: str(b.description),
    starts_at: str(b.starts_at),
    platform,
    stream_url: str(b.stream_url),
    status,
  };
}

function parsePlans(raw: unknown): ServicePlanListItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (p): p is ServicePlanListItem => isRecord(p) && Number.isFinite(Number(p.id)),
  );
}

function parsePlanDetails(raw: unknown): ServicePlanDetailsLite | null {
  if (!isRecord(raw) || !Number.isFinite(Number(raw.id))) return null;
  const blocks = Array.isArray(raw.blocks)
    ? raw.blocks.filter(isRecord).map((b) => ({
        content_json: isRecord(b.content_json) ? b.content_json : null,
      }))
    : [];
  return { ...(raw as unknown as ServicePlanListItem), blocks };
}

function parseProfile(raw: unknown): MemberProfileLite | null {
  if (!isRecord(raw) || !isRecord(raw.profile)) return null;
  const p = raw.profile;
  const memberId = Number(p.member_id);
  if (!Number.isFinite(memberId)) return null;
  return {
    member_id: memberId,
    first_name: str(p.first_name),
    last_name: str(p.last_name),
    display_name: str(p.display_name),
    avatar_url: str(p.avatar_url),
  };
}

/**
 * Один запрос на данные главной (`GET /api/dashboard/bundle`) — тот же, что использует веб.
 * Части, которые сервер не смог собрать, приходят как null и превращаются в пустые значения.
 */
export async function fetchDashboardBundle(date: string): Promise<DashboardBundle> {
  const { data } = await apiClient.get<Record<string, unknown>>('/api/dashboard/bundle', {
    params: { date },
  });
  const body = isRecord(data) ? data : {};

  const planDetails: Record<number, ServicePlanDetailsLite> = {};
  if (isRecord(body.planDetails)) {
    for (const [id, raw] of Object.entries(body.planDetails)) {
      const parsed = parsePlanDetails(raw);
      if (parsed) planDetails[Number(id)] = parsed;
    }
  }

  const profiles: Record<number, MemberProfileLite> = {};
  if (isRecord(body.profiles)) {
    for (const [id, raw] of Object.entries(body.profiles)) {
      const parsed = parseProfile(raw);
      if (parsed) profiles[Number(id)] = parsed;
    }
  }

  return {
    birthdays: parseBirthdays(body.birthdays),
    announcement: parseAnnouncement(body.notes),
    broadcast: parseBroadcast(body.broadcast),
    plans: parsePlans(body.plans),
    planDetails,
    profiles,
  };
}
