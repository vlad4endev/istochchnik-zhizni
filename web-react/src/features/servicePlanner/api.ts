import { apiClient } from '../../lib/apiClient';
import type { AppUser } from '../admin/types';

import { asPlainContentJson, normalizeEditableServicePlanMeta, normalizeEditableServicePlanPayload, normalizePublicServicePlanPayload } from './planPayloadNormalize';

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
  /** Ответственный за музыкальное служение (блоки «Песня»). */
  music_ministry_member_id: number | null;
  /** Ответственный за стихи (кто заполняет блоки «Стих», не чтец). */
  poem_ministry_member_id: number | null;
  total_duration_minutes: number;
  current_block_id: number | null;
  share_token: string;
  edit_token: string;
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

export type LinkedSermonNoteSummary = {
  id: string;
  title: string;
  topic: string;
  scripture: string;
  member_id: number;
  author_name: string | null;
  is_public: boolean;
  share_token: string | null;
  updated_at: string;
};

export type ServicePlanDetails = ServicePlanListItem & {
  notes: string | null;
  created_at: string;
  updated_at: string;
  last_edited_by_member_id: number | null;
  last_edited_at: string | null;
  last_edited_by_name: string | null;
  blocks: ServicePlanBlock[];
  linked_sermon_note: LinkedSermonNoteSummary | null;
};

export type PublicBroadcastAssignment = {
  role_name: string;
  role_color: string;
  member_name: string;
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
  linked_sermon_note: LinkedSermonNoteSummary | null;
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

export type EditableServicePlanPayload = {
  plan: {
    id: number;
    service_date: string;
    start_time: string;
    status: 'draft' | 'published';
    total_duration_minutes: number;
    notes: string | null;
    edit_token: string;
    template_name: string | null;
    leader_name: string | null;
    preacher_member_id: number | null;
    preacher_name: string | null;
    music_ministry_member_id: number | null;
    music_ministry_name: string | null;
    poem_ministry_member_id: number | null;
    poem_ministry_name: string | null;
  };
  broadcast_assignments: PublicBroadcastAssignment[];
  linked_sermon_note: LinkedSermonNoteSummary | null;
  blocks: Array<{
    id: number;
    block_type_id: number;
    order_index: number;
    title: string;
    duration_minutes: number;
    assigned_member_id: number | null;
    song_id: number | null;
    block_type_name: string | null;
    block_type_code: string | null;
    assigned_member_name: string | null;
    song_title: string | null;
    song_key: string | null;
    content_json: Record<string, unknown>;
  }>;
};

export type EditableServicePlanMetaPayload = {
  block_types: Array<{
    id: number;
    code: string;
    name: string;
    kind: ServiceBlockType['kind'];
  }>;
  members: Array<{
    id: number;
    first_name: string | null;
    last_name: string | null;
    name: string;
    ministry_role: string | null;
    ministry_direction: string | null;
    app_role: string;
  }>;
  songs: Array<{
    id: number;
    title: string;
    default_key: string | null;
  }>;
};

export async function fetchServiceBlockTypes(): Promise<ServiceBlockType[]> {
  const { data } = await apiClient.get<ServiceBlockType[]>('/api/service-block-types');
  return data;
}

export async function fetchServicePlannerMembers(): Promise<AppUser[]> {
  const { data } = await apiClient.get<AppUser[]>('/api/service-planner-members');
  return Array.isArray(data) ? data : [];
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
    music_ministry_member_id: number | null;
    poem_ministry_member_id: number | null;
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
  return normalizePublicServicePlanPayload(data);
}

export async function fetchEditableServicePlan(token: string): Promise<EditableServicePlanPayload> {
  const { data } = await apiClient.get<EditableServicePlanPayload>(
    `/api/public/service-plans-edit/${encodeURIComponent(token)}`,
  );
  return normalizeEditableServicePlanPayload(data);
}

export async function fetchEditableServicePlanMeta(token: string): Promise<EditableServicePlanMetaPayload> {
  const { data } = await apiClient.get<EditableServicePlanMetaPayload>(
    `/api/public/service-plans-edit/${encodeURIComponent(token)}/meta`,
  );
  return normalizeEditableServicePlanMeta(data);
}

export async function patchEditableServicePlanBlockByToken(
  token: string,
  blockId: number,
  body: Partial<{
    title: string;
    duration_minutes: number;
    block_type_id: number;
    assigned_member_id: number | null;
    song_id: number | null;
    content_json: Record<string, unknown>;
  }>,
): Promise<void> {
  const payload = { ...body };
  if (payload.content_json !== undefined) {
    payload.content_json = asPlainContentJson(payload.content_json);
  }
  await apiClient.patch(
    `/api/public/service-plans-edit/${encodeURIComponent(token)}/blocks/${blockId}`,
    payload,
  );
}

export type SermonAttachmentDto = {
  id: string;
  url: string;
  name: string;
  size: number;
  mime: string;
  uploaded_at?: string;
};

export async function uploadServicePlanSermonAttachment(file: File): Promise<SermonAttachmentDto> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await apiClient.post<{ attachment: SermonAttachmentDto }>(
    '/api/service-plans/sermon-attachment',
    form,
  );
  if (!data?.attachment?.url) {
    throw new Error('Сервер не вернул ссылку на файл');
  }
  return data.attachment;
}

export async function uploadEditableServicePlanSermonAttachment(
  token: string,
  file: File,
): Promise<SermonAttachmentDto> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await apiClient.post<{ attachment: SermonAttachmentDto }>(
    `/api/public/service-plans-edit/${encodeURIComponent(token)}/sermon-attachment`,
    form,
  );
  if (!data?.attachment?.url) {
    throw new Error('Сервер не вернул ссылку на файл');
  }
  return data.attachment;
}
