import { apiClient } from './client';

export type SundayScheduleMember = {
  id: number;
  name: string;
  avatar_url: string | null;
  ministry_direction: string | null;
  ministry_role: string | null;
};

export type SundaySchedulePlan = {
  id: number;
  service_date: string;
  start_time: string;
  status: 'draft' | 'published';
  template_name: string | null;
  leader_member_id: number | null;
  preacher_member_id: number | null;
  blocks_count: number;
  has_program: boolean;
  leader: SundayScheduleMember | null;
  preacher: SundayScheduleMember | null;
};

export async function fetchMySundaySchedule(params: {
  from: string;
  to: string;
}): Promise<SundaySchedulePlan[]> {
  const { data } = await apiClient.get<SundaySchedulePlan[]>('/api/sunday-schedule/my', {
    params,
  });
  return Array.isArray(data) ? data : [];
}

export async function fetchSundaySchedulePlans(params: {
  from: string;
  to: string;
}): Promise<SundaySchedulePlan[]> {
  const { data } = await apiClient.get<SundaySchedulePlan[]>('/api/sunday-schedule/plans', {
    params,
  });
  return Array.isArray(data) ? data : [];
}
