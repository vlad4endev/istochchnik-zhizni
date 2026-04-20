import { Fragment, useMemo } from 'react';

import { LyricsWithChords } from '../../songbook/components/LyricsWithChords';
import type { MusicianNotesV1 } from '../performNotes';

type Props = {
  content: string;
  notes: MusicianNotesV1 | null | undefined;
  transposeSemitones: number;
  chordTone?: 'light' | 'dark';
  className?: string;
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
}: Props) {
  const lines = useMemo(() => content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n'), [content]);

  const lineMap = notes?.lineComments ?? {};
  const blocks = notes?.blockComments ?? [];

  const blockAtStart = (i: number) => blocks.find((b) => b.from === i);
  const inBlock = (i: number) => blocks.some((b) => b.from <= i && i <= b.to);

  return (
    <div className={['space-y-0', className].filter(Boolean).join(' ')}>
      {lines.map((line, i) => {
        const bStart = blockAtStart(i);
        const blockBg = inBlock(i) ? 'border-l-2 border-violet-200/90 bg-violet-50/35 pl-2' : '';
        const lineNote = lineMap[String(i)]?.trim();

        return (
          <Fragment key={i}>
            {bStart ? (
              <div className="mb-2 mt-1 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-violet-950 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-600">
                  Блок · строки {bStart.from + 1}–{bStart.to + 1}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-snug text-violet-900">{bStart.text}</p>
              </div>
            ) : null}
            <div className={['py-0.5', blockBg].filter(Boolean).join(' ')}>
              <LyricsWithChords
                text={line}
                transposeSemitones={transposeSemitones}
                chordTone={chordTone}
                className="text-[inherit] leading-relaxed"
              />
            </div>
            {lineNote ? (
              <p className="mb-2 ml-1 border-l-2 border-amber-300 bg-amber-50/90 pl-2 py-1.5 text-xs leading-snug text-amber-950">
                <span className="font-semibold text-amber-800">Заметка (стр. {i + 1}): </span>
                {lineNote}
              </p>
            ) : null}
          </Fragment>
        );
      })}
    </div>
  );
}
