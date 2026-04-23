import type { ParsedChordLine } from './chordParser';

type SongLineProps = {
  line: ParsedChordLine;
  chordsVisible: boolean;
  chordTone: 'light' | 'dark';
  layoutMode: 'mono' | 'measured';
  className?: string;
};

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

type ChordAnchorForLayout = {
  position: number;
  chord: string;
};

export function resolveOverlaps(chords: ChordAnchorForLayout[]): ChordAnchorForLayout[] {
  if (!Array.isArray(chords) || chords.length === 0) return [];
  const sorted = chords
    .map((item) => ({
      position: Number.isFinite(item.position) ? Math.max(0, Math.floor(item.position)) : 0,
      chord: typeof item.chord === 'string' ? item.chord : '',
    }))
    .filter((item) => item.chord.length > 0)
    .sort((a, b) => a.position - b.position);

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const minPos = prev.position + splitGraphemeClusters(prev.chord).length + 1;
    if (curr.position < minPos) {
      curr.position = minPos;
    }
  }
  return sorted;
}

export function buildChordLine(text: string, chords: ChordAnchorForLayout[]): string | null {
  const normalizedText = typeof text === 'string' ? text : '';
  const normalizedChords = resolveOverlaps(chords);
  if (normalizedChords.length === 0) return null;

  if (splitGraphemeClusters(normalizedText).length === 0) {
    return normalizedChords.map((item) => item.chord).join('  ');
  }

  const chordTail = normalizedChords.reduce((max, item) => {
    return Math.max(max, item.position + splitGraphemeClusters(item.chord).length);
  }, 0);
  const textLength = splitGraphemeClusters(normalizedText).length;
  const lineLength = Math.max(textLength, chordTail) + 10;
  const chars = new Array(lineLength).fill(' ');

  normalizedChords.forEach(({ position, chord }) => {
    const chordParts = splitGraphemeClusters(chord);
    for (let i = 0; i < chordParts.length; i += 1) {
      const idx = position + i;
      if (idx < chars.length) {
        chars[idx] = chordParts[i] ?? ' ';
      }
    }
  });

  return chars.join('').trimEnd();
}

export function SongLine({ line, chordsVisible, chordTone, layoutMode, className = '' }: SongLineProps) {
  const text = typeof line.text === 'string' ? line.text : '';
  const chordLine = buildChordLine(text, line.chords);
  const showChordLine = chordsVisible && chordLine;
  const hasText = splitGraphemeClusters(text).length > 0;
  const chordToneClass = chordTone === 'dark' ? 'text-amber-300' : 'text-[#4A90D9]';
  const rootClassName = ['song-line-wrapper mb-[2px] w-full min-w-0', className].filter(Boolean).join(' ');

  if (!hasText && !showChordLine) {
    return <div className="song-line-gap h-4 w-full" data-layout-mode={layoutMode} />;
  }

  return (
    <div className={rootClassName} data-layout-mode={layoutMode}>
      {showChordLine ? (
        <pre
          className={[
            'chords-line m-0 overflow-visible p-0 text-[1em] font-bold leading-[1.4] whitespace-pre',
            chordToneClass,
          ].join(' ')}
          style={{ fontFamily: '"Courier New", Courier, monospace' }}
        >
          {chordLine}
        </pre>
      ) : null}
      {hasText ? (
        <pre
          className="text-line m-0 overflow-visible p-0 text-[1em] font-normal leading-[1.4] whitespace-pre"
          style={{ fontFamily: '"Courier New", Courier, monospace' }}
        >
          {text}
        </pre>
      ) : null}
    </div>
  );
}
