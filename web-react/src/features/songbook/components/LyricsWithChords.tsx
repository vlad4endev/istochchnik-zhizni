import { useMemo, useState } from 'react';

import { normalizeSplitWordChordsInText } from '../addSong/chordProConversion';
import { transposeBracketChords } from '../chordUtils';
import { splitChordSegments } from '../utils/chordSegments';
import { ChordLine } from './ChordLine';
import { ChordPopover } from './ChordPopover';

type Props = {
  text: string;
  transposeSemitones: number;
  className?: string;
  /** Показывать слой аккордов; если false — только текст без скобок. */
  chordsVisible?: boolean;
  /** Аккорды: контраст на светлом или тёмном фоне текста. */
  chordTone?: 'light' | 'dark';
};

export function LyricsWithChords({
  text,
  transposeSemitones,
  className = '',
  chordsVisible = true,
  chordTone = 'light',
}: Props) {
  const [openSymbol, setOpenSymbol] = useState<string | null>(null);

  const tText = useMemo(() => {
    const fixed = normalizeSplitWordChordsInText(text);
    return transposeBracketChords(fixed, transposeSemitones);
  }, [text, transposeSemitones]);

  const lines = useMemo(() => tText.split('\n'), [tText]);

  const lyricsOnlyBody = useMemo(() => {
    return lines
      .map((line) => splitChordSegments(line).map((s) => s.text).join(''))
      .join('\n');
  }, [lines]);

  if (!chordsVisible) {
    return (
      <div className={['whitespace-pre-wrap leading-relaxed', className].filter(Boolean).join(' ')}>
        {lyricsOnlyBody}
      </div>
    );
  }

  return (
    <>
      <div className={['leading-[2.35rem]', className].filter(Boolean).join(' ')}>
        {lines.map((line, lineIdx) => {
          const segments = splitChordSegments(line);
          return (
            <div key={lineIdx} className="block w-full">
              <ChordLine
                segments={segments}
                chordsVisible
                chordTone={chordTone}
                onChordClick={(sym) => setOpenSymbol(sym)}
              />
            </div>
          );
        })}
      </div>
      {openSymbol ? (
        <ChordPopover symbol={openSymbol} onClose={() => setOpenSymbol(null)} />
      ) : null}
    </>
  );
}
