import { apiClient } from './client';

const BASE = '/api/sermon-notes';

export type SermonNoteBodyFormat = 'plain' | 'html';

export interface SermonNoteListItem {
  id: string;
  member_id: number;
  title: string;
  topic: string;
  scripture: string;
  updated_at: string;
  created_at: string;
  service_plan_id: number | null;
  is_public: boolean;
  body_format: SermonNoteBodyFormat;
}

export interface SermonNote extends SermonNoteListItem {
  body: string;
  share_token: string;
}

export async function fetchSermonNotes(): Promise<SermonNoteListItem[]> {
  const { data } = await apiClient.get<SermonNoteListItem[]>(BASE);
  return Array.isArray(data) ? data : [];
}

export async function fetchSermonNote(id: string): Promise<SermonNote> {
  const { data } = await apiClient.get<SermonNote>(`${BASE}/${id}`);
  return data;
}
