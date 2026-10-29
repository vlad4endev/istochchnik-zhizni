import { apiClient } from './client';

export interface BibleBook {
  slug: string;
  name: string;
  short_name: string;
  testament: string;
  chapters_count: number;
}

export interface BibleVerse {
  verse: number;
  text: string;
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
): Promise<{ book: BibleBook; chapter: number; verses: BibleVerse[] }> {
  const { data } = await apiClient.get<{
    book: BibleBook;
    chapter: number;
    verses: BibleVerse[];
  }>(`/api/bible/chapter/${encodeURIComponent(translation)}/${encodeURIComponent(book)}/${chapter}`);
  return data;
}
