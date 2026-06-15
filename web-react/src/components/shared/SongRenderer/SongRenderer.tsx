import { useMemo } from 'react';

import { parseChordLine, type ParsedChordLine, type ChordAnchor } from './chordParser';
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
type RenderRow =
  | { kind: 'section'; key: string; title: string }
  | { kind: 'line'; key: string; line: ParsedChordLine };

const CHORD_TOKEN_RE =
  /^(?:[A-GH](?:#|b)?|До|Ре|Ми|Фа|Соль|Ля|Си(?:#|b)?)(?:maj|min|m|sus|dim|aug|add)?[0-9]*(?:\/(?:[A-GH](?:#|b)?|До|Ре|Ми|Фа|Соль|Ля|Си(?:#|b)?))?(?:[a-z0-9#+/()\-]*)$/i;

function splitGraphemeClusters(input: string, locale = 'ru'): string[] {
  const source = typeof input === 'string' ? input : '';
  if (source.length === 0) return [];
  try {
    const IntlAny = Intl as typeof Intl & {
      Segmenter?: new (loc: string, opts: { granularity: 'grapheme' }) => {
        segment: (s: string) => Iterable<{ segment: string }>;
      };
    };
    const Segmenter = IntlAny.Segmenter;
    if (typeof Segmenter === 'function') {
      const iter = new Segmenter(locale, { granularity: 'grapheme' }).segment(source);
      return Array.from(iter, (s) => s.segment);
    }
  } catch {
    // fallback below
  }
  return Array.from(source);
}

function parsePlainChordOnlyLine(line: string): ChordAnchor[] | null {
  const source = typeof line === 'string' ? line : '';
  if (!source.trim()) return null;
  const matches = Array.from(source.matchAll(/\S+/g));
  if (matches.length === 0) return null;

  const chords = matches
    .map((m) => {
      const rawToken = m[0] ?? '';
      const token = rawToken.replace(/^[|()[\]{}]+|[|()[\]{}]+$/g, '');
      if (!token || !CHORD_TOKEN_RE.test(token)) return null;
      const index = m.index ?? 0;
      return {
        position: splitGraphemeClusters(source.slice(0, index)).length,
        chord: token,
      };
    })
    .filter((v): v is ChordAnchor => v != null);

  if (chords.length === 0 || chords.length !== matches.length) return null;
  return chords;
}

function sectionTypeClass(title: string): string {
  const lower = title.toLowerCase();
  if (/(припев|chorus)/.test(lower)) {
    return 'chorus';
  }
  if (/(бридж|bridge)/.test(lower)) {
    return 'bridge';
  }
  if (/(куплет|verse)/.test(lower)) {
    return 'verse';
  }
  return 'other';
}

export function SongRenderer({
  text,
  transposeSemitones = 0,
  className = '',
  fontSizePx = 18,
  chordsVisible = true,
  chordTone = 'light',
  chordLayoutMode = 'measured',
  parseSectionTitle,
  preprocessText,
  transposeChordSymbol = identityTranspose,
}: SongRendererProps) {
  const normalizedFontSize = Math.max(12, Math.min(32, fontSizePx));
  const normalizedFontSizeRem = normalizedFontSize / 16;
  const lineHeight = Math.max(1.45, Math.min(1.75, 1.62 + (normalizedFontSize - 16) * 0.012));

  const preparedText = useMemo(() => {
    const source = typeof text === 'string' ? text : '';
    return preprocessText ? preprocessText(source) : source;
  }, [text, preprocessText]);

  const rawLines = useMemo(
    () =>
      preparedText
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n'),
    [preparedText],
  );

  const parsedRows = useMemo(() => {
    const rows: RenderRow[] = [];
    let i = 0;
    while (i < rawLines.length) {
      const raw = rawLines[i] ?? '';
      const secTitle = parseSectionTitle ? parseSectionTitle(raw) : null;
      if (secTitle !== null) {
        rows.push({ kind: 'section', key: `sec-${i}`, title: secTitle });
        i += 1;
        continue;
      }

      const bracketParsed = parseChordLine(raw);
      if (bracketParsed.chords.length > 0) {
        rows.push({ kind: 'line', key: `line-${i}`, line: bracketParsed });
        i += 1;
        continue;
      }

      const chordOnlyAnchors = parsePlainChordOnlyLine(raw);
      const nextRaw = rawLines[i + 1] ?? '';
      const nextSectionTitle = parseSectionTitle ? parseSectionTitle(nextRaw) : null;
      const nextBracketParsed = parseChordLine(nextRaw);
      const nextChordOnlyAnchors = parsePlainChordOnlyLine(nextRaw);

      const canAttachToNextLyric =
        chordOnlyAnchors != null &&
        i + 1 < rawLines.length &&
        nextSectionTitle === null &&
        nextBracketParsed.chords.length === 0 &&
        nextChordOnlyAnchors == null;

      if (canAttachToNextLyric) {
        rows.push({
          kind: 'line',
          key: `line-${i}-${i + 1}`,
          line: {
            text: nextRaw || '\u00a0',
            chords: chordOnlyAnchors,
          },
        });
        i += 2;
        continue;
      }

      rows.push({ kind: 'line', key: `line-${i}`, line: bracketParsed });
      i += 1;
    }
    return rows;
  }, [rawLines, parseSectionTitle]);

  const contentLines = useMemo(
    () => parsedRows.filter((row): row is Extract<RenderRow, { kind: 'line' }> => row.kind === 'line').map((row) => row.line),
    [parsedRows],
  );

  const transposedLines = useTranspose({
    lines: contentLines,
    semitones: transposeSemitones,
    transposeChord: transposeChordSymbol,
  });

  const transposedRows = useMemo(() => {
    let lineIdx = 0;
    return parsedRows.map((row) => {
      if (row.kind === 'section') return row;
      const line = transposedLines[lineIdx] ?? row.line;
      lineIdx += 1;
      return { ...row, line } as RenderRow;
    });
  }, [parsedRows, transposedLines]);

  return (
    <div className={className} style={{ fontSize: `${normalizedFontSizeRem}rem`, lineHeight }}>
      {(() => {
        let currentSectionType: ReturnType<typeof sectionTypeClass> = 'other';
        return transposedRows.map((row) => {
        if (row.kind === 'section') {
          const sectionType = sectionTypeClass(row.title);
          currentSectionType = sectionType;
          return (
            <div
              key={row.key}
              className={[
                'section-label mb-3 mt-7 first:mt-0',
                sectionType === 'chorus' ? 'chorus' : '',
                sectionType === 'verse' ? 'verse' : '',
                sectionType === 'bridge' ? 'bridge' : '',
              ].join(' ')}
              role="heading"
              aria-level={3}
            >
              {row.title}
            </div>
          );
        }
        return (
          <SongLine
            key={row.key}
            line={row.line}
            chordsVisible={chordsVisible}
            chordTone={chordTone}
            layoutMode={chordLayoutMode}
            className={currentSectionType === 'chorus' ? 'chorus-block' : ''}
          />
        );
      });
      })()}
    </div>
  );
}
