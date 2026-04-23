import { useMemo } from 'react';

import type { ParsedChordLine } from './chordParser';

type UseTransposeArgs = {
  lines: ParsedChordLine[];
  semitones: number;
  transposeChord: (symbol: string, semitones: number) => string;
};

export function useTranspose({ lines, semitones, transposeChord }: UseTransposeArgs): ParsedChordLine[] {
  return useMemo(() => {
    if (!Array.isArray(lines) || lines.length === 0) return [];
    if (!semitones) return lines;
    return lines.map((line) => ({
      text: line.text,
      chords: line.chords.map((item) => ({
        position: item.position,
        chord: transposeChord(item.chord, semitones),
      })),
    }));
  }, [lines, semitones, transposeChord]);
}
