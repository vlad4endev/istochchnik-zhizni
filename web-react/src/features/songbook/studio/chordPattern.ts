import { parseChordLine, type ChordAnchor } from '../utils/chordSegments';
import { type SongBlock } from './songBlocks';

export type RelativeChord = {
  chord: string;
  relativePos: number;
};

export type ChordPatternLine = {
  chords: RelativeChord[];
};

export type ChordPattern = ChordPatternLine[];

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

function normalizeRelativePos(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function splitLines(source: string): string[] {
  return (typeof source === 'string' ? source : '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

function insertChordsIntoText(text: string, chords: ChordAnchor[]): string {
  const graphemes = splitGraphemeClusters(text);
  const buckets = new Map<number, string[]>();

  chords.forEach((chord) => {
    const pos = Math.max(0, Math.min(graphemes.length, Math.round(chord.position)));
    const existing = buckets.get(pos) ?? [];
    existing.push(chord.chord);
    buckets.set(pos, existing);
  });

  const out: string[] = [];
  for (let i = 0; i <= graphemes.length; i += 1) {
    const atPos = buckets.get(i);
    if (atPos && atPos.length > 0) {
      atPos.forEach((ch) => out.push(`[${ch}]`));
    }
    if (i < graphemes.length) {
      out.push(graphemes[i] ?? '');
    }
  }
  return out.join('');
}

export function hasAnyChordsInBlock(block: SongBlock): boolean {
  return splitLines(block.content).some((line) => parseChordLine(line).chords.length > 0);
}

export function extractChordPattern(block: SongBlock): ChordPattern {
  return splitLines(block.content).map((line) => {
    const parsed = parseChordLine(line);
    const textLength = splitGraphemeClusters(parsed.text).length;
    return {
      chords: parsed.chords.map((chord) => ({
        chord: chord.chord,
        relativePos: textLength > 0 ? normalizeRelativePos(chord.position / textLength) : 0,
      })),
    };
  });
}

export function applyChordPattern(targetBlock: SongBlock, pattern: ChordPattern): SongBlock {
  if (!pattern.length) return targetBlock;

  const lines = splitLines(targetBlock.content);
  const nextLines = lines.map((line, lineIndex) => {
    const parsed = parseChordLine(line);
    const textLength = splitGraphemeClusters(parsed.text).length;
    const patternLine = pattern[lineIndex % pattern.length] ?? { chords: [] };
    const chords: ChordAnchor[] = patternLine.chords.map(({ chord, relativePos }) => ({
      chord,
      position: Math.round(normalizeRelativePos(relativePos) * textLength),
    }));
    return insertChordsIntoText(parsed.text, chords);
  });

  return {
    ...targetBlock,
    content: nextLines.join('\n'),
  };
}

export function getSameTypeBlocks(blocks: SongBlock[], donorBlock: SongBlock): SongBlock[] {
  return blocks.filter((block) => block.id !== donorBlock.id && block.type === donorBlock.type);
}

export function autoDistributeChords(blocks: SongBlock[], donorId: string, targetIds: string[]): SongBlock[] {
  const donor = blocks.find((block) => block.id === donorId);
  if (!donor) return blocks;
  const targetSet = new Set(targetIds);
  const pattern = extractChordPattern(donor);

  return blocks.map((block) => {
    if (!targetSet.has(block.id)) return block;
    return applyChordPattern(block, pattern);
  });
}
