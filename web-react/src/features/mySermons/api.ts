import { apiClient } from '../../lib/apiClient';

const BASE = '/api/sermon-notes';

export interface SermonNoteListItem {
  id: string;
  member_id: number;
  title: string;
  topic: string;
  scripture: string;
  updated_at: string;
  created_at: string;
  service_plan_id: number | null;
}

export interface SermonNote extends SermonNoteListItem {
  body: string;
}

export async function fetchSermonNotes(): Promise<SermonNoteListItem[]> {
  const { data } = await apiClient.get<SermonNoteListItem[]>(BASE);
  return Array.isArray(data) ? data : [];
}

export async function fetchSermonNote(id: string | number): Promise<SermonNote> {
  const { data } = await apiClient.get<SermonNote>(`${BASE}/${id}`);
  return data;
}

export async function createSermonNote(input?: {
  title?: string;
  topic?: string;
  scripture?: string;
  body?: string;
}): Promise<SermonNote> {
  const { data } = await apiClient.post<SermonNote>(BASE, input ?? {});
  return data;
}

export async function updateSermonNote(
  id: string | number,
  patch: { title?: string; topic?: string; scripture?: string; body?: string },
): Promise<SermonNote> {
  const { data } = await apiClient.patch<SermonNote>(`${BASE}/${id}`, patch);
  return data;
}

export async function deleteSermonNote(id: string | number): Promise<void> {
  await apiClient.delete(`${BASE}/${id}`);
}
