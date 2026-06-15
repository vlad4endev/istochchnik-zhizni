export type ChordAnchor = {
  position: number;
  chord: string;
};

export type ParsedChordLine = {
  text: string;
  chords: ChordAnchor[];
};

export function splitGraphemeClusters(input: string, locale = 'ru'): string[] {
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

export function parseChordLine(line: string): ParsedChordLine {
  const source = typeof line === 'string' ? line : '';
  const textParts: string[] = [];
  const chords: ChordAnchor[] = [];
  let cursor = 0;
  let textPosition = 0;

  while (cursor < source.length) {
    if (source[cursor] === '[') {
      const close = source.indexOf(']', cursor + 1);
      if (close === -1) {
        const tail = source.slice(cursor);
        textParts.push(tail);
        textPosition += splitGraphemeClusters(tail).length;
        break;
      }
      const chord = source.slice(cursor + 1, close).trim();
      if (chord) {
        chords.push({ position: textPosition, chord });
      }
      cursor = close + 1;
      continue;
    }

    const nextBracket = source.indexOf('[', cursor);
    const end = nextBracket === -1 ? source.length : nextBracket;
    const textChunk = source.slice(cursor, end);
    textParts.push(textChunk);
    textPosition += splitGraphemeClusters(textChunk).length;
    cursor = end;
  }

  return {
    text: textParts.join(''),
    chords,
  };
}

export function parseChordLines(text: string): ParsedChordLine[] {
  const source = typeof text === 'string' ? text : '';
  return source
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => parseChordLine(line));
}
