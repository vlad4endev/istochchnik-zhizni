import { apiClient } from '@/lib/apiClient';

export interface BibleTranslation {
  id: number;
  code: string;
  title: string;
  short_title: string;
  description: string;
  year: string | null;
  language: string;
  scope: 'full' | 'nt' | 'partial';
  availability: 'available' | 'license_required';
  license_note: string;
  sort_order: number;
  verse_count?: number;
}

export interface BibleBook {
  id: number;
  translation_id: number;
  ord: number;
  testament: string;
  slug: string;
  name: string;
  short_name: string;
  chapters_count: number;
}

export interface BibleVerse {
  verse: number;
  text: string;
}

export interface BibleChapterPayload {
  translation: BibleTranslation;
  book: BibleBook;
  chapter: number;
  verses: BibleVerse[];
}

export interface BibleSearchHit {
  book_slug: string;
  book_name: string;
  short_name: string;
  chapter: number;
  verse: number;
  text: string;
}

export interface BibleProgress {
  book_slug: string;
  book_name: string;
  short_name: string;
  chapter: number;
  verse: number;
  updated_at: string;
}

export interface BibleNote {
  id: number;
  translation_code: string;
  book_slug: string;
  book_name: string;
  short_name: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface BiblePlanRef {
  book_slug: string;
  chapter: number;
  verse_start?: number;
  verse_end?: number;
}

export interface BiblePlanDay {
  id: number;
  day_index: number;
  day_date: string | null;
  label: string;
  refs_json: BiblePlanRef[];
  completed_at: string | null;
}

export interface BiblePlan {
  id: number;
  title: string;
  goal: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  days?: BiblePlanDay[];
}

export interface BibleCommentary {
  id: number;
  source: 'lopukhin' | 'church';
  book_slug: string;
  book_name: string;
  chapter: number;
  verse_start: number | null;
  verse_end: number | null;
  title: string;
  body: string;
}

export interface BibleAudio {
  id: number;
  audio_url: string;
  timings: Array<{ v: number; start: number; end: number }>;
  voice_id: string;
  duration_sec: number;
}

export async function fetchBibleTranslations(): Promise<BibleTranslation[]> {
  const { data } = await apiClient.get<{ translations: BibleTranslation[] }>('/api/bible/translations');
  return data.translations ?? [];
}

export async function fetchBibleBooks(translation = 'synodal'): Promise<BibleBook[]> {
  const { data } = await apiClient.get<{ books: BibleBook[] }>('/api/bible/books', {
    params: { translation },
  });
  return data.books ?? [];
}

export async function fetchBibleChapter(
  translation: string,
  book: string,
  chapter: number,
): Promise<BibleChapterPayload> {
  const { data } = await apiClient.get<BibleChapterPayload>(
    `/api/bible/chapter/${encodeURIComponent(translation)}/${encodeURIComponent(book)}/${chapter}`,
  );
  return data;
}

export async function searchBible(q: string, translation = 'synodal'): Promise<BibleSearchHit[]> {
  const { data } = await apiClient.get<{ results: BibleSearchHit[] }>('/api/bible/search', {
    params: { q, translation },
  });
  return data.results ?? [];
}

export async function fetchBibleProgress(translation = 'synodal'): Promise<BibleProgress | null> {
  const { data } = await apiClient.get<{ progress: BibleProgress | null }>('/api/bible/progress', {
    params: { translation },
  });
  return data.progress ?? null;
}

export async function saveBibleProgress(body: {
  translation?: string;
  book_slug: string;
  chapter: number;
  verse: number;
}): Promise<void> {
  await apiClient.put('/api/bible/progress', body);
}

export async function fetchBibleNotes(params?: {
  translation?: string;
  book?: string;
  chapter?: number;
}): Promise<BibleNote[]> {
  const { data } = await apiClient.get<{ notes: BibleNote[] }>('/api/bible/notes', { params });
  return data.notes ?? [];
}

export async function createBibleNote(body: {
  translation?: string;
  book_slug: string;
  chapter: number;
  verse_start: number;
  verse_end?: number;
  body: string;
}): Promise<BibleNote> {
  const { data } = await apiClient.post<BibleNote>('/api/bible/notes', body);
  return data;
}

export async function updateBibleNote(id: number, body: { body: string }): Promise<BibleNote> {
  const { data } = await apiClient.patch<BibleNote>(`/api/bible/notes/${id}`, body);
  return data;
}

export async function deleteBibleNote(id: number): Promise<void> {
  await apiClient.delete(`/api/bible/notes/${id}`);
}

export async function fetchBiblePlans(): Promise<BiblePlan[]> {
  const { data } = await apiClient.get<{ plans: BiblePlan[] }>('/api/bible/plans');
  return data.plans ?? [];
}

export async function fetchBiblePlan(id: number): Promise<BiblePlan> {
  const { data } = await apiClient.get<BiblePlan>(`/api/bible/plans/${id}`);
  return data;
}

export async function generateBiblePlan(body: {
  goal: string;
  days: number;
  start_date?: string;
}): Promise<BiblePlan> {
  const { data } = await apiClient.post<BiblePlan>('/api/bible/plans/generate', body);
  return data;
}

export async function completeBiblePlanDay(
  planId: number,
  dayIndex: number,
  completed: boolean,
): Promise<BiblePlanDay> {
  const { data } = await apiClient.patch<BiblePlanDay>(
    `/api/bible/plans/${planId}/days/${dayIndex}`,
    { completed },
  );
  return data;
}

export async function deleteBiblePlan(id: number): Promise<void> {
  await apiClient.delete(`/api/bible/plans/${id}`);
}

export async function fetchBibleCommentaries(
  translation: string,
  book: string,
  chapter: number,
): Promise<BibleCommentary[]> {
  const { data } = await apiClient.get<{ commentaries: BibleCommentary[] }>('/api/bible/commentaries', {
    params: { translation, book, chapter },
  });
  return data.commentaries ?? [];
}

export async function createChurchCommentary(body: {
  translation?: string;
  book_slug: string;
  chapter: number;
  verse_start?: number;
  verse_end?: number;
  title?: string;
  body: string;
}): Promise<BibleCommentary> {
  const { data } = await apiClient.post<BibleCommentary>('/api/bible/commentaries', body);
  return data;
}

export async function fetchBibleAudio(
  translation: string,
  book: string,
  chapter: number,
): Promise<BibleAudio | null> {
  try {
    const { data } = await apiClient.get<BibleAudio>(
      `/api/bible/audio/${encodeURIComponent(translation)}/${encodeURIComponent(book)}/${chapter}`,
      { silentErrorToast: true },
    );
    return data;
  } catch {
    return null;
  }
}
