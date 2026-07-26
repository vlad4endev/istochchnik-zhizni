import { apiClient } from '../../lib/apiClient';

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
  plan_service_date: string | null;
  plan_start_time: string | null;
  plan_template_name: string | null;
}

export interface SermonNote extends SermonNoteListItem {
  body: string;
  share_token: string;
  share_token_issued_at: string;
}

export interface PublicSermonNote {
  id: string;
  title: string;
  topic: string;
  scripture: string;
  body: string;
  body_format: SermonNoteBodyFormat;
  updated_at: string;
  author_name: string | null;
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
  body_format?: SermonNoteBodyFormat;
  service_plan_id?: number | null;
}): Promise<SermonNote> {
  const { data } = await apiClient.post<SermonNote>(BASE, {
    body_format: 'html',
    ...input,
  });
  return data;
}

export async function updateSermonNote(
  id: string | number,
  patch: {
    title?: string;
    topic?: string;
    scripture?: string;
    body?: string;
    body_format?: SermonNoteBodyFormat;
    service_plan_id?: number | null;
  },
): Promise<SermonNote> {
  const { data } = await apiClient.patch<SermonNote>(`${BASE}/${id}`, patch);
  return data;
}

export async function updateSermonNoteShare(
  id: string | number,
  input: { is_public: boolean; rotate_token?: boolean },
): Promise<SermonNote> {
  const { data } = await apiClient.patch<SermonNote>(`${BASE}/${id}/share`, input);
  return data;
}

export async function deleteSermonNote(id: string | number): Promise<void> {
  await apiClient.delete(`${BASE}/${id}`);
}

export async function fetchPublicSermonNote(token: string): Promise<PublicSermonNote> {
  const { data } = await apiClient.get<PublicSermonNote>(`/api/public/sermon-notes/${token}`);
  return data;
}

export function sermonNoteSharePath(token: string): string {
  return `/sermon-notes/share/${token}`;
}

export function sermonNoteShareUrl(token: string): string {
  if (typeof window === 'undefined') return sermonNoteSharePath(token);
  return `${window.location.origin}${sermonNoteSharePath(token)}`;
}

export function formatPlanServiceDate(isoDate: string | null | undefined): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return '';
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}
