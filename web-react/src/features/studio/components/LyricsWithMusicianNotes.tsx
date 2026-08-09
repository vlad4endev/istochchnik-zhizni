import { useMemo } from 'react';

import { LyricsWithChords } from '../../songbook/components/LyricsWithChords';
import type { MusicianNotesV1 } from '../performNotes';

type Props = {
  content: string;
  notes: MusicianNotesV1 | null | undefined;
  transposeSemitones: number;
  chordTone?: 'light' | 'dark';
  className?: string;
  fontSizePx?: number;
  chordsVisible?: boolean;
  /** Заметки для музыкантов (сетлист). По умолчанию показываются. */
  notesVisible?: boolean;
  stageDark?: boolean;
};

type NoteEntry =
  | { kind: 'line'; line: number; text: string }
  | { kind: 'block'; from: number; to: number; text: string };

/**
 * Текст песни с аккордами + заметки для музыкантов.
 * Песня рендерится целиком (чтобы пары «строка аккордов + текст» не ломались);
 * заметки — отдельным блоком над текстом.
 */
export function LyricsWithMusicianNotes({
  content,
  notes,
  transposeSemitones,
  chordTone = 'light',
  className = '',
  fontSizePx = 18,
  chordsVisible = true,
  notesVisible = true,
  stageDark = false,
}: Props) {
  const noteEntries = useMemo((): NoteEntry[] => {
    if (!notesVisible || !notes) return [];
    const entries: NoteEntry[] = [];
    for (const block of notes.blockComments ?? []) {
      const text = block.text?.trim();
      if (!text) continue;
      entries.push({ kind: 'block', from: block.from, to: block.to, text });
    }
    const lineMap = notes.lineComments ?? {};
    for (const [key, raw] of Object.entries(lineMap)) {
      const text = raw?.trim();
      if (!text) continue;
      const line = Number(key);
      if (!Number.isInteger(line) || line < 0) continue;
      entries.push({ kind: 'line', line, text });
    }
    entries.sort((a, b) => {
      const aPos = a.kind === 'block' ? a.from : a.line;
      const bPos = b.kind === 'block' ? b.from : b.line;
      return aPos - bPos;
    });
    return entries;
  }, [notes, notesVisible]);

  const panelClass = stageDark
    ? 'mb-5 rounded-xl border border-violet-500/35 bg-violet-950/45 px-3 py-3 text-violet-50'
    : 'mb-5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-3 text-violet-950 shadow-sm';
  const panelTitleClass = stageDark
    ? 'mb-2 text-[11px] font-semibold uppercase tracking-wide text-violet-300'
    : 'mb-2 text-[11px] font-semibold uppercase tracking-wide text-violet-700';
  const itemClass = stageDark
    ? 'border-t border-violet-500/25 py-2 first:border-t-0 first:pt-0'
    : 'border-t border-violet-200/80 py-2 first:border-t-0 first:pt-0';
  const itemMetaClass = stageDark
    ? 'text-[10px] font-semibold uppercase tracking-wide text-violet-300/90'
    : 'text-[10px] font-semibold uppercase tracking-wide text-violet-600';
  const itemTextClass = stageDark
    ? 'mt-0.5 whitespace-pre-wrap text-sm leading-snug text-violet-50'
    : 'mt-0.5 whitespace-pre-wrap text-sm leading-snug text-violet-950';

  return (
    <div className={['min-w-0', className].filter(Boolean).join(' ')}>
      {noteEntries.length > 0 ? (
        <aside className={panelClass} aria-label="Заметки для музыкантов">
          <p className={panelTitleClass}>Заметки к песне</p>
          <ul className="m-0 list-none p-0">
            {noteEntries.map((entry, idx) => (
              <li key={`${entry.kind}-${idx}`} className={itemClass}>
                <p className={itemMetaClass}>
                  {entry.kind === 'block'
                    ? `Блок · строки ${entry.from + 1}–${entry.to + 1}`
                    : `Строка ${entry.line + 1}`}
                </p>
                <p className={itemTextClass}>{entry.text}</p>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}

      <LyricsWithChords
        text={content}
        transposeSemitones={transposeSemitones}
        chordTone={stageDark ? 'dark' : chordTone}
        className="songbook-reader--perform min-w-0 text-[inherit] leading-relaxed"
        fontSizePx={fontSizePx}
        chordsVisible={chordsVisible}
      />
    </div>
  );
}
