import { useMemo } from 'react';

import {
  normalizeDetachedChordBeforeCyrillicInText,
  normalizeSplitWordChordsInText,
} from '../addSong/chordProConversion';
import { transposeBracketChords } from '../chordUtils';
import { splitChordSegments } from '../utils/chordSegments';
import { parseSectionTitle } from '../utils/sectionMarkers';
import { ChordLine } from './ChordLine';

type Props = {
  text: string;
  transposeSemitones: number;
  className?: string;
  fontSizePx?: number;
  /** Показывать слой аккордов; если false — только текст без скобок. */
  chordsVisible?: boolean;
  /** Аккорды: контраст на светлом или тёмном фоне текста. */
  chordTone?: 'light' | 'dark';
};

export function LyricsWithChords({
  text,
  transposeSemitones,
  className = '',
  fontSizePx = 18,
  chordsVisible = true,
  chordTone = 'light',
}: Props) {
  const tText = useMemo(() => {
    const fixed = normalizeDetachedChordBeforeCyrillicInText(normalizeSplitWordChordsInText(text));
    return transposeBracketChords(fixed, transposeSemitones);
  }, [text, transposeSemitones]);

  const lines = useMemo(() => tText.split('\n'), [tText]);

  const lyricsOnlyBody = useMemo(() => {
    return lines
      .map((line) => {
        const sec = parseSectionTitle(line);
        if (sec !== null) return sec;
        return splitChordSegments(line)
          .map((s) => s.text)
          .join('');
      })
      .join('\n');
  }, [lines]);

  const normalizedFontSize = Math.max(12, Math.min(32, fontSizePx));
  const lineHeight = Math.max(1.45, Math.min(1.75, 1.62 + (normalizedFontSize - 16) * 0.012));

  if (!chordsVisible) {
    return (
      <div
        className={['whitespace-pre-wrap leading-relaxed', className].filter(Boolean).join(' ')}
        style={{ fontSize: `${normalizedFontSize}px`, lineHeight }}
      >
        {lyricsOnlyBody}
      </div>
    );
  }

  return (
    <>
      <div
        className={className}
        style={{ fontSize: `${normalizedFontSize}px`, lineHeight }}
      >
        {lines.map((line, lineIdx) => {
          const secTitle = parseSectionTitle(line);
          if (secTitle !== null) {
            const bar =
              chordTone === 'dark'
                ? 'border-amber-400/80 text-amber-200/95'
                : 'border-sky-600/70 text-sky-900';
            return (
              <div
                key={lineIdx}
                className={[
                  'my-3 border-l-[3px] pl-3 text-sm font-bold uppercase tracking-wide first:mt-0',
                  bar,
                ].join(' ')}
                role="heading"
                aria-level={3}
              >
                {secTitle}
              </div>
            );
          }
          const segments = splitChordSegments(line);
          return (
            <div key={lineIdx} className="block w-full">
              <ChordLine segments={segments} chordsVisible chordTone={chordTone} />
            </div>
          );
        })}
      </div>
    </>
  );
}
