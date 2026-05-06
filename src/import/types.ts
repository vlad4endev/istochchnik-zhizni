export type ParsedXlsxSong = {
  /** external id from source (ignored by import) */
  external_id?: string;
  song_number: number;
  title: string;
  table_of_contents: string;
  /** optional */
  url_lyrics: string;
  /** optional */
  url_chords: string;
  url_youtube: string | null;
};

export type ImportedSong = ParsedXlsxSong & {
  lyrics_text: string | null;
  chords_text: string | null;
  needs_retry: boolean;
};

export type ValidationError = {
  row: number; // 1-based in Excel UI (including header row)
  field: keyof ParsedXlsxSong | 'row';
  message: string;
  value?: string;
};

export type XlsxParseResult = {
  songs: ParsedXlsxSong[];
  errors: ValidationError[];
  /** First N rows (already validated enough to show) */
  preview: ParsedXlsxSong[];
  totalRows: number;
};

export type ImportProgressStatus = 'fetching' | 'saving' | 'done' | 'error';

export type ImportProgress = {
  current: number;
  total: number;
  song_title: string;
  status: ImportProgressStatus;
  message?: string;
};

export type ImportResult = {
  success: number;
  failed: number;
  skipped: number;
  /** saved as unpublished placeholders (tag: нет_текста) */
  placeholders: number;
  errors: Array<{ song_number: number; title: string; error: string }>;
};

