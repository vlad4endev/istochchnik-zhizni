import { ChordProFormatter, ChordProParser, ChordSheetSerializer } from 'chordsheetjs';

import { transposeBracketChords } from './chordUtils';

export type ParsedChordPro = {
  song: unknown | null;
  warnings: string[];
  chords: string[];
  sections: string[];
};

export type ChordAnchor = {
  lineIndex: number;
  /** Позиция аккорда в текстовой строке без [] (нулевой индекс). */
  charIndex: number;
  chord: string;
};

function uniqSorted(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, 'ru'),
  );
}

export function parseChordPro(text: string): ParsedChordPro {
  const source = typeof text === 'string' ? text : '';
  try {
    const parser = new ChordProParser();
    const song = parser.parse(source);
    const serializer = new ChordSheetSerializer();
    const serialized = serializer.serialize(song) as unknown as {
      lines?: Array<{ items?: Array<Record<string, unknown>> }>;
    };

    const chords: string[] = [];
    const sections: string[] = [];

    for (const line of serialized.lines ?? []) {
      for (const item of line.items ?? []) {
        if (item.type === 'chordLyricsPair' && typeof item.chords === 'string') {
          const c = item.chords.trim();
          if (c) chords.push(c);
        }
        if (item.type === 'tag' && typeof item.name === 'string') {
          const name = item.name.toLowerCase();
          if ((name === 'sec' || name === 'comment' || name === 'c') && typeof item.value === 'string') {
            sections.push(item.value);
          }
        }
      }
    }

    const warnings = Array.isArray((parser as { warnings?: unknown }).warnings)
      ? ((parser as { warnings: Array<{ message?: string }> }).warnings ?? [])
          .map((w) => String(w?.message ?? '').trim())
          .filter(Boolean)
      : [];

    return {
      song,
      warnings,
      chords: uniqSorted(chords),
      sections: uniqSorted(sections),
    };
  } catch {
    return { song: null, warnings: ['parse_error'], chords: [], sections: [] };
  }
}

export function transposeSong(text: string, semitones: number): string {
  const source = typeof text === 'string' ? text : '';
  if (!Number.isFinite(semitones) || semitones === 0) return source;

  try {
    const parser = new ChordProParser();
    const formatter = new ChordProFormatter();
    const song = parser.parse(source) as { transpose: (delta: number) => unknown };
    return formatter.format(song.transpose(semitones) as never);
  } catch {
    return transposeBracketChords(source, semitones);
  }
}

export function renderWithCapo(text: string, transpose: number, capo: number): {
  playText: string;
  concertText: string;
  playShift: number;
  concertShift: number;
} {
  const normalizedTranspose = Number.isFinite(transpose) ? Math.trunc(transpose) : 0;
  const normalizedCapo = Number.isFinite(capo) ? Math.max(0, Math.trunc(capo)) : 0;

  const concertShift = normalizedTranspose;
  const playShift = normalizedTranspose - normalizedCapo;

  return {
    playText: transposeSong(text, playShift),
    concertText: transposeSong(text, concertShift),
    playShift,
    concertShift,
  };
}

export function extractCommonChords(text: string, limit = 14): string[] {
  const source = typeof text === 'string' ? text : '';
  const matches = Array.from(source.matchAll(/\[([^\]]+)\]/g));
  if (matches.length === 0) return [];
  const freq = new Map<string, number>();
  for (const m of matches) {
    const chord = String(m[1] ?? '').trim();
    if (!chord) continue;
    freq.set(chord, (freq.get(chord) ?? 0) + 1);
  }

  return Array.from(freq.entries())
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], 'ru'))
    .slice(0, limit)
    .map(([name]) => name);
}

export function extractChordAnchors(text: string): ChordAnchor[] {
  const source = typeof text === 'string' ? text : '';
  if (!source) return [];

  const anchors: ChordAnchor[] = [];
  const lines = source.split('\n');

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? '';
    let i = 0;
    let textCursor = 0;

    while (i < line.length) {
      if (line[i] === '[') {
        const close = line.indexOf(']', i + 1);
        if (close === -1) break;

        const chord = line.slice(i + 1, close).trim();
        if (chord) {
          anchors.push({ lineIndex, charIndex: textCursor, chord });
        }

        i = close + 1;
        while (i < line.length && line[i] !== '[') {
          textCursor += 1;
          i += 1;
        }
        continue;
      }

      textCursor += 1;
      i += 1;
    }
  }

  return anchors;
}
