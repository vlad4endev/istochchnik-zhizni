import { apiClient } from '../../lib/apiClient';

export type ServiceBlockType = {
  id: number;
  code: string;
  name: string;
  kind: 'song' | 'text' | 'speaker' | 'custom';
  icon: string | null;
  default_duration_minutes: number;
};

export type ServiceTemplate = {
  id: number;
  name: string;
  description: string | null;
  recurrence_rule: Record<string, unknown>;
  default_start_time: string;
  is_active: boolean;
};

export type ServiceTemplateBlock = {
  id: number;
  template_id: number;
  block_type_id: number;
  title: string;
  order_index: number;
  duration_minutes: number;
  default_song_id: number | null;
  default_content_json: Record<string, unknown>;
};

export type ServiceTemplateDetails = ServiceTemplate & {
  blocks: ServiceTemplateBlock[];
};

export type ServicePlanListItem = {
  id: number;
  template_id: number | null;
  service_date: string;
  start_time: string;
  status: 'draft' | 'published';
  is_archived: boolean;
  leader_member_id: number | null;
  preacher_member_id: number | null;
  total_duration_minutes: number;
  current_block_id: number | null;
  share_token: string;
  blocks_count: number;
  template_name: string | null;
};

export type ServicePlanBlock = {
  id: number;
  service_plan_id: number;
  block_type_id: number;
  title: string;
  order_index: number;
  duration_minutes: number;
  assigned_member_id: number | null;
  song_id: number | null;
  content_json: Record<string, unknown>;
};

export type ServicePlanDetails = ServicePlanListItem & {
  notes: string | null;
  created_at: string;
  updated_at: string;
  blocks: ServicePlanBlock[];
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
  blocks: Array<{
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
  }>;
};

export async function fetchServiceBlockTypes(): Promise<ServiceBlockType[]> {
  const { data } = await apiClient.get<ServiceBlockType[]>('/api/service-block-types');
  return data;
}

export async function fetchServiceTemplates(): Promise<ServiceTemplate[]> {
  const { data } = await apiClient.get<ServiceTemplate[]>('/api/service-templates');
  return data;
}

export async function createServiceTemplate(body: {
  name: string;
  description?: string | null;
  recurrence_rule?: Record<string, unknown>;
  default_start_time?: string;
  blocks: Array<{
    block_type_id: number;
    title: string;
    order_index: number;
    duration_minutes: number;
    default_song_id?: number | null;
    default_content_json?: Record<string, unknown>;
  }>;
}): Promise<{ id: number }> {
  const { data } = await apiClient.post<{ id: number }>('/api/service-templates', body);
  return data;
}

export async function fetchServiceTemplate(id: number): Promise<ServiceTemplateDetails> {
  const { data } = await apiClient.get<ServiceTemplateDetails>(`/api/service-templates/${id}`);
  return data;
}

export async function patchServiceTemplate(
  id: number,
  body: {
    name: string;
    description?: string | null;
    recurrence_rule?: Record<string, unknown>;
    default_start_time?: string;
    is_active?: boolean;
    blocks: Array<{
      block_type_id: number;
      title: string;
      order_index: number;
      duration_minutes: number;
      default_song_id?: number | null;
      default_content_json?: Record<string, unknown>;
    }>;
  },
): Promise<void> {
  await apiClient.patch(`/api/service-templates/${id}`, body);
}

export async function deleteServiceTemplate(id: number): Promise<void> {
  await apiClient.delete(`/api/service-templates/${id}`);
}

export async function fetchServicePlans(params?: {
  from?: string;
  to?: string;
  include_archived?: boolean;
}): Promise<ServicePlanListItem[]> {
  const { data } = await apiClient.get<ServicePlanListItem[]>('/api/service-plans', { params });
  return data;
}

export async function fetchServicePlan(id: number): Promise<ServicePlanDetails> {
  const { data } = await apiClient.get<ServicePlanDetails>(`/api/service-plans/${id}`);
  return data;
}

export async function createServicePlan(body: {
  template_id: number;
  service_date: string;
  start_time?: string;
  leader_member_id?: number | null;
  preacher_member_id?: number | null;
}): Promise<{ id: number }> {
  const { data } = await apiClient.post<{ id: number }>('/api/service-plans', body);
  return data;
}

export async function patchServicePlan(
  id: number,
  body: Partial<{
    service_date: string;
    start_time: string;
    status: 'draft' | 'published';
    is_archived: boolean;
    leader_member_id: number | null;
    preacher_member_id: number | null;
    current_block_id: number | null;
    notes: string | null;
  }>,
): Promise<void> {
  await apiClient.patch(`/api/service-plans/${id}`, body);
}

export async function reorderServiceBlocks(body: {
  service_plan_id: number;
  ordered_block_ids: number[];
}): Promise<void> {
  await apiClient.patch('/api/service-blocks/reorder', body);
}

export async function patchServiceBlock(
  id: number,
  body: Partial<{
    title: string;
    block_type_id: number;
    duration_minutes: number;
    assigned_member_id: number | null;
    song_id: number | null;
    content_json: Record<string, unknown>;
  }>,
): Promise<void> {
  await apiClient.patch(`/api/service-blocks/${id}`, body);
}

export async function createServiceBlock(body: {
  service_plan_id: number;
  block_type_id: number;
  title?: string;
  duration_minutes?: number;
  assigned_member_id?: number | null;
  song_id?: number | null;
  content_json?: Record<string, unknown>;
}): Promise<{ id: number }> {
  const { data } = await apiClient.post<{ id: number }>('/api/service-blocks', body);
  return data;
}

export async function deleteServiceBlock(id: number): Promise<void> {
  await apiClient.delete(`/api/service-blocks/${id}`);
}

export async function deleteServicePlan(id: number): Promise<void> {
  await apiClient.delete(`/api/service-plans/${id}`);
}

export async function fetchPublicServicePlan(token: string): Promise<PublicServicePlanPayload> {
  const { data } = await apiClient.get<PublicServicePlanPayload>(
    `/api/public/service-plans/${encodeURIComponent(token)}`,
  );
  return data;
}
