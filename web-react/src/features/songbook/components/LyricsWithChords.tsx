import { polishSongContent } from '../addSong/polishSongContent';
import { transposeChordSymbol } from '../chordUtils';
import { parseSectionTitle, stripHiddenChordProDirectives } from '../utils/sectionMarkers';
import { SongRenderer } from '../../../components/shared/SongRenderer';

function decodeHtmlEntities(input: string): string {
  const source = typeof input === 'string' ? input : '';
  if (!source) return '';
  try {
    if (typeof document !== 'undefined') {
      const el = document.createElement('textarea');
      el.innerHTML = source;
      return el.value;
    }
  } catch {
    // ignore
  }
  return source
    .replace(/&nbsp;/g, '\u00a0')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#33;/g, '!')
    .replace(/&#092;/g, '/');
}

function normalizeChordSlash(input: string): string {
  // Some imported sources escape slash as backslash in chord baselines, e.g. "H\\D#".
  // Normalize to "H/D#" so chord parser can recognize it.
  return input.replace(/\\+/g, '/');
}

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
  chordLayoutMode = 'measured',
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
      className={['songbook-reader', className].filter(Boolean).join(' ')}
      fontSizePx={fontSizePx}
      chordsVisible={chordsVisible}
      chordTone={chordTone}
      parseSectionTitle={parseSectionTitle}
      preprocessText={(source) =>
        polishSongContent(
          normalizeChordSlash(stripHiddenChordProDirectives(decodeHtmlEntities(source))),
        )
      }
      transposeChordSymbol={transposeChordSymbol}
    />
  );
}
