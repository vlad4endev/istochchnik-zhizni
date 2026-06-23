import { Fragment, useMemo } from 'react';

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

/**
 * Текст песни по строкам с аккордами + заметки для музыкантов (только в закрытом режиме выступления).
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
  const lines = useMemo(() => content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n'), [content]);

  const lineMap = notes?.lineComments ?? {};
  const blocks = notes?.blockComments ?? [];

  const blockAtStart = (i: number) => blocks.find((b) => b.from === i);
  const inBlock = (i: number) => blocks.some((b) => b.from <= i && i <= b.to);

  const blockNoteClass = stageDark
    ? 'mb-2 mt-1 rounded-lg border border-violet-500/40 bg-violet-950/50 px-3 py-2 text-violet-100'
    : 'mb-2 mt-1 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-violet-950 shadow-sm';
  const blockNoteLabelClass = stageDark
    ? 'text-[10px] font-semibold uppercase tracking-wide text-violet-300'
    : 'text-[10px] font-semibold uppercase tracking-wide text-violet-600';
  const blockNoteTextClass = stageDark
    ? 'mt-1 whitespace-pre-wrap text-sm leading-snug text-violet-50'
    : 'mt-1 whitespace-pre-wrap text-sm leading-snug text-violet-900';
  const lineBlockBg = stageDark
    ? 'border-l-2 border-violet-500/50 bg-violet-950/30 pl-2'
    : 'border-l-2 border-violet-200/90 bg-violet-50/35 pl-2';
  const lineNoteClass = stageDark
    ? 'mb-2 ml-1 border-l-2 border-amber-500/60 bg-amber-950/40 pl-2 py-1.5 text-xs leading-snug text-amber-50'
    : 'mb-2 ml-1 border-l-2 border-amber-300 bg-amber-50/90 pl-2 py-1.5 text-xs leading-snug text-amber-950';
  const lineNoteLabelClass = stageDark ? 'font-semibold text-amber-300' : 'font-semibold text-amber-800';

  return (
    <div className={['space-y-0', className].filter(Boolean).join(' ')}>
      {lines.map((line, i) => {
        const bStart = notesVisible ? blockAtStart(i) : undefined;
        const lineNote = notesVisible ? lineMap[String(i)]?.trim() : '';

        return (
          <Fragment key={i}>
            {bStart ? (
              <div className={blockNoteClass}>
                <p className={blockNoteLabelClass}>
                  Блок · строки {bStart.from + 1}–{bStart.to + 1}
                </p>
                <p className={blockNoteTextClass}>{bStart.text}</p>
              </div>
            ) : null}
            <div
              className={['py-0.5', notesVisible && inBlock(i) ? lineBlockBg : ''].filter(Boolean).join(' ')}
            >
              <LyricsWithChords
                text={line}
                transposeSemitones={transposeSemitones}
                chordTone={stageDark ? 'dark' : chordTone}
                className="text-[inherit] leading-relaxed"
                fontSizePx={fontSizePx}
                chordsVisible={chordsVisible}
              />
            </div>
            {lineNote ? (
              <p className={lineNoteClass}>
                <span className={lineNoteLabelClass}>Заметка (стр. {i + 1}): </span>
                {lineNote}
              </p>
            ) : null}
          </Fragment>
        );
      })}
    </div>
  );
}
