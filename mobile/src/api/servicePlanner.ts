import { apiClient } from './client';

export type ServicePlanListItem = {
  id: number;
  template_id: number | null;
  service_date: string;
  start_time: string;
  status: 'draft' | 'published';
  is_archived: boolean;
  leader_member_id: number | null;
  preacher_member_id: number | null;
  music_ministry_member_id: number | null;
  total_duration_minutes: number;
  current_block_id: number | null;
  share_token: string;
  edit_token: string;
  blocks_count: number;
  template_name: string | null;
};

export type PublicBroadcastAssignment = {
  role_name: string;
  role_color: string;
  member_name: string;
};

export type PublicServicePlanBlock = {
  id: number;
  order_index: number;
  title: string;
  duration_minutes: number;
  block_type_name: string | null;
  block_type_code: string | null;
  assigned_member_name: string | null;
  song_title: string | null;
  song_key: string | null;
  content_json: Record<string, unknown>;
};

export type PublicServicePlanPayload = {
  plan: {
    id: number;
    service_date: string;
    start_time: string;
    status: 'draft' | 'published';
    total_duration_minutes: number;
    notes: string | null;
    share_token: string;
    template_name: string | null;
    leader_name: string | null;
    preacher_name: string | null;
  };
  broadcast_assignments: PublicBroadcastAssignment[];
  blocks: PublicServicePlanBlock[];
};

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function fetchServicePlans(params?: {
  from?: string;
  to?: string;
  include_archived?: boolean;
}): Promise<ServicePlanListItem[]> {
  const { data } = await apiClient.get<ServicePlanListItem[]>('/api/service-plans', { params });
  return data ?? [];
}

export async function fetchServicePlansRange(from: Date, to: Date): Promise<ServicePlanListItem[]> {
  return fetchServicePlans({
    from: formatYmd(from),
    to: formatYmd(to),
    include_archived: false,
  });
}

export async function fetchPublicServicePlan(token: string): Promise<PublicServicePlanPayload> {
  const { data } = await apiClient.get<PublicServicePlanPayload>(
    `/api/public/service-plans/${encodeURIComponent(token)}`,
  );
  return data;
}
