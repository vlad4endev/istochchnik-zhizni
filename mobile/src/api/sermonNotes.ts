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

export type SermonNoteInput = {
  title?: string;
  topic?: string;
  scripture?: string;
  body?: string;
  body_format?: SermonNoteBodyFormat;
  service_plan_id?: number | null;
};

export async function fetchSermonNotes(): Promise<SermonNoteListItem[]> {
  const { data } = await apiClient.get<SermonNoteListItem[]>(BASE);
  return Array.isArray(data) ? data : [];
}

export async function fetchSermonNote(id: string): Promise<SermonNote> {
  const { data } = await apiClient.get<SermonNote>(`${BASE}/${id}`);
  return data;
}

export async function createSermonNote(input?: SermonNoteInput): Promise<SermonNote> {
  const { data } = await apiClient.post<SermonNote>(BASE, {
    body_format: 'plain',
    ...input,
  });
  return data;
}

export async function updateSermonNote(
  id: string,
  patch: SermonNoteInput,
): Promise<SermonNote> {
  const { data } = await apiClient.patch<SermonNote>(`${BASE}/${id}`, patch);
  return data;
}

export async function deleteSermonNote(id: string): Promise<void> {
  await apiClient.delete(`${BASE}/${id}`);
}
