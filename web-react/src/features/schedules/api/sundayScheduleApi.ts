import { apiClient } from '../../../lib/apiClient';

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

export async function fetchSundaySchedulePlans(params: {
  from: string;
  to: string;
}): Promise<SundaySchedulePlan[]> {
  const { data } = await apiClient.get<SundaySchedulePlan[]>('/api/sunday-schedule/plans', { params });
  return data;
}

export async function fetchMySundaySchedule(params: {
  from: string;
  to: string;
}): Promise<SundaySchedulePlan[]> {
  const { data } = await apiClient.get<SundaySchedulePlan[]>('/api/sunday-schedule/my', { params });
  return data;
}

export async function fetchSundayScheduleMembers(): Promise<SundayScheduleMember[]> {
  const { data } = await apiClient.get<SundayScheduleMember[]>('/api/sunday-schedule/members');
  return data;
}

export async function patchSundaySchedulePlan(
  planId: number,
  body: {
    leader_member_id?: number | null;
    preacher_member_id?: number | null;
  },
): Promise<void> {
  await apiClient.patch(`/api/sunday-schedule/plans/${planId}`, body);
}

export async function patchSundayScheduleDate(
  serviceDate: string,
  body: {
    leader_member_id?: number | null;
    preacher_member_id?: number | null;
  },
): Promise<void> {
  await apiClient.patch(`/api/sunday-schedule/dates/${serviceDate}`, body);
}

export async function saveSundayScheduleAssignments(
  plan: Pick<SundaySchedulePlan, 'id' | 'service_date'>,
  body: {
    leader_member_id?: number | null;
    preacher_member_id?: number | null;
  },
): Promise<void> {
  if (plan.id > 0) {
    await patchSundaySchedulePlan(plan.id, body);
    return;
  }
  await patchSundayScheduleDate(plan.service_date, body);
}
