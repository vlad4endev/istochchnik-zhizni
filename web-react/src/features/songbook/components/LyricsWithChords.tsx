import {
  normalizeDetachedChordBeforeCyrillicInText,
  normalizeSplitWordChordsInText,
} from '../addSong/chordProConversion';
import { transposeChordSymbol } from '../chordUtils';
import { parseSectionTitle, stripHiddenChordProDirectives } from '../utils/sectionMarkers';
import { SongRenderer } from '../../../components/shared/SongRenderer';

type Props = {
  text: string;
  transposeSemitones: number;
  chordLayoutMode?: 'mono' | 'measured';
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
  chordLayoutMode = 'mono',
  className = '',
  fontSizePx = 18,
  chordsVisible = true,
  chordTone = 'light',
}: Props) {
  return (
    <SongRenderer
      text={text}
      transposeSemitones={transposeSemitones}
      chordLayoutMode={chordLayoutMode}
      className={className}
      fontSizePx={fontSizePx}
      chordsVisible={chordsVisible}
      chordTone={chordTone}
      parseSectionTitle={parseSectionTitle}
      preprocessText={(source) =>
        normalizeDetachedChordBeforeCyrillicInText(
          normalizeSplitWordChordsInText(stripHiddenChordProDirectives(source)),
        )
      }
      transposeChordSymbol={transposeChordSymbol}
    />
  );
}
