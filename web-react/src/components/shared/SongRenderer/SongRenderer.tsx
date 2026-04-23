import { useMemo } from 'react';

import { parseChordLine, type ParsedChordLine } from './chordParser';
import { SongLine } from './SongLine';
import { useTranspose } from './useTranspose';

type SongRendererProps = {
  text: string;
  transposeSemitones?: number;
  className?: string;
  fontSizePx?: number;
  chordsVisible?: boolean;
  chordTone?: 'light' | 'dark';
  chordLayoutMode?: 'mono' | 'measured';
  parseSectionTitle?: (line: string) => string | null;
  preprocessText?: (text: string) => string;
  transposeChordSymbol?: (symbol: string, semitones: number) => string;
};

const identityTranspose = (symbol: string) => symbol;

function sectionToneClass(title: string, tone: 'light' | 'dark'): string {
  const lower = title.toLowerCase();
  if (/(припев|chorus)/.test(lower)) {
    return tone === 'dark' ? 'border-sky-300/80 bg-sky-950/30 text-sky-100' : 'border-sky-600/70 bg-sky-50 text-sky-900';
  }
  if (/(бридж|bridge)/.test(lower)) {
    return tone === 'dark'
      ? 'border-amber-300/80 bg-amber-950/30 text-amber-100'
      : 'border-amber-600/70 bg-amber-50 text-amber-900';
  }
  if (/(куплет|verse)/.test(lower)) {
    return tone === 'dark'
      ? 'border-emerald-300/80 bg-emerald-950/20 text-emerald-100'
      : 'border-emerald-600/70 bg-emerald-50 text-emerald-900';
  }
  return tone === 'dark'
    ? 'border-violet-300/80 bg-violet-950/25 text-violet-100'
    : 'border-violet-600/70 bg-violet-50 text-violet-900';
}

export function SongRenderer({
  text,
  transposeSemitones = 0,
  className = '',
  fontSizePx = 18,
  chordsVisible = true,
  chordTone = 'light',
  chordLayoutMode = 'mono',
  parseSectionTitle,
  preprocessText,
  transposeChordSymbol = identityTranspose,
}: SongRendererProps) {
  const normalizedFontSize = Math.max(12, Math.min(32, fontSizePx));
  const lineHeight = Math.max(1.45, Math.min(1.75, 1.62 + (normalizedFontSize - 16) * 0.012));

  const preparedText = useMemo(() => {
    const source = typeof text === 'string' ? text : '';
    return preprocessText ? preprocessText(source) : source;
  }, [text, preprocessText]);

  const lineRows = useMemo(
    () =>
      preparedText
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .map((raw) => {
          const secTitle = parseSectionTitle ? parseSectionTitle(raw) : null;
          return { raw, sectionTitle: secTitle };
        }),
    [preparedText, parseSectionTitle],
  );

  const parsedLines = useMemo(
    () =>
      lineRows.map((row) => {
        if (row.sectionTitle !== null) return { text: '', chords: [] } as ParsedChordLine;
        return parseChordLine(row.raw);
      }),
    [lineRows],
  );

  const transposedLines = useTranspose({
    lines: parsedLines,
    semitones: transposeSemitones,
    transposeChord: transposeChordSymbol,
  });

  return (
    <div className={className} style={{ fontSize: `${normalizedFontSize}px`, lineHeight }}>
      {lineRows.map((row, idx) => {
        if (row.sectionTitle !== null) {
          const bar = sectionToneClass(row.sectionTitle, chordTone);
          return (
            <div
              key={`sec-${idx}`}
              className={[
                'my-3 rounded-r-lg border-l-[4px] px-3 py-1.5 text-sm font-bold uppercase tracking-wide first:mt-0',
                bar,
              ].join(' ')}
              role="heading"
              aria-level={3}
            >
              {row.sectionTitle}
            </div>
          );
        }
        return (
          <SongLine
            key={`line-${idx}`}
            line={transposedLines[idx] ?? { text: '', chords: [] }}
            chordsVisible={chordsVisible}
            chordTone={chordTone}
            layoutMode={chordLayoutMode}
          />
        );
      })}
    </div>
  );
}
