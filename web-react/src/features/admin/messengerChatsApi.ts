import { apiClient } from '../../lib/apiClient';

export type AdminChatFilter = 'rooms' | 'group' | 'channel' | 'private' | 'empty' | 'active' | 'all';

export type AdminChatListItem = {
  id: string;
  type: string;
  title: string | null;
  display_title: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  message_count: number;
  active_member_count: number;
  left_member_count: number;
  owner_label: string | null;
  peer_label: string | null;
  kind: string;
  studio_song_id: string;
  is_active: boolean;
  is_system: boolean;
};

export type AdminChatSummary = {
  groups: number;
  channels: number;
  private: number;
  active_rooms: number;
  empty: number;
  assistant: number;
};

export type AdminChatListResponse = {
  items: AdminChatListItem[];
  total: number;
  summary: AdminChatSummary;
};

export async function fetchAdminMessengerChats(params: {
  filter: AdminChatFilter;
  q: string;
  limit: number;
  offset: number;
}): Promise<AdminChatListResponse> {
  const { data } = await apiClient.get<AdminChatListResponse>('/api/admin/messenger/conversations', {
    params: {
      filter: params.filter,
      q: params.q || undefined,
      limit: params.limit,
      offset: params.offset,
    },
  });
  return {
    items: data?.items ?? [],
    total: data?.total ?? 0,
    summary: data?.summary ?? {
      groups: 0,
      channels: 0,
      private: 0,
      active_rooms: 0,
      empty: 0,
      assistant: 0,
    },
  };
}

export async function deleteAdminMessengerChat(id: string): Promise<void> {
  await apiClient.delete(`/api/admin/messenger/conversations/${encodeURIComponent(id)}`);
}

export async function purgeEmptyAdminMessengerChats(): Promise<number> {
  const { data } = await apiClient.post<{ deleted?: number }>('/api/admin/messenger/conversations/purge-empty');
  return Number(data?.deleted) || 0;
}
