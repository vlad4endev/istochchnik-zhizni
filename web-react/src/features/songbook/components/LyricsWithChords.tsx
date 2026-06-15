import {
  normalizeDetachedChordBeforeCyrillicInText,
  normalizeSplitWordChordsInText,
} from '../addSong/chordProConversion';
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

function stripImportedSongbookHeader(input: string): string {
  const source = typeof input === 'string' ? input : '';
  if (!source.trim()) return source;
  const lines = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const l0 = (lines[0] ?? '').trim();
  const l1 = (lines[1] ?? '').trim();

  const looksLikeTitleLine = l0.length > 0 && (/[🎵♪]/.test(l0) || l0.length <= 80);
  const looksLikeSongbookLine =
    l1.length > 0 &&
    /(сборник\s+песен|источник\s+жизни|«источник\s+жизни»|source\s+of\s+life)/i.test(l1);

  if (!looksLikeTitleLine || !looksLikeSongbookLine) return source;

  let cut = 2;
  // skip additional empty lines after header
  while (cut < lines.length && !lines[cut]?.trim()) cut += 1;
  return lines.slice(cut).join('\n');
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
        normalizeDetachedChordBeforeCyrillicInText(
          normalizeSplitWordChordsInText(
            stripImportedSongbookHeader(
              normalizeChordSlash(stripHiddenChordProDirectives(decodeHtmlEntities(source))),
            ),
          ),
        )
      }
      transposeChordSymbol={transposeChordSymbol}
    />
  );
}
