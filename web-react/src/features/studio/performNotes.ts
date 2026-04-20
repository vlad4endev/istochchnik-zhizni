/** Согласовано с сервером `MusicianNotesV1` (setlist_items.musician_notes). */
export type MusicianNotesV1 = {
  v: 1;
  /** Ключ — индекс строки текста песни (0-based), значение — заметка. */
  lineComments?: Record<string, string>;
  /** Диапазон строк (0-based, включительно). */
  blockComments?: Array<{ from: number; to: number; text: string }>;
};

export function emptyMusicianNotes(): MusicianNotesV1 {
  return { v: 1 };
}

export function notesFromItem(raw: MusicianNotesV1 | undefined | null): MusicianNotesV1 {
  if (!raw || raw.v !== 1) return emptyMusicianNotes();
  return {
    v: 1,
    lineComments: raw.lineComments && typeof raw.lineComments === 'object' ? { ...raw.lineComments } : undefined,
    blockComments: Array.isArray(raw.blockComments) ? raw.blockComments.map((b) => ({ ...b })) : undefined,
  };
}
