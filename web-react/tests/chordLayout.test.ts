import { describe, expect, it } from 'vitest';

import { transposeBracketChords } from '../src/features/songbook/chordUtils';
import { parseChordLine } from '../src/features/songbook/utils/chordSegments';

describe('chord layout parsing', () => {
  it('splits line into plain text and chord anchors', () => {
    const parsed = parseChordLine('[Am]Когда [C]качаются [G]фонарики');

    expect(parsed.text).toBe('Когда качаются фонарики');
    expect(parsed.chords).toEqual([
      { position: 0, chord: 'Am' },
      { position: 6, chord: 'C' },
      { position: 15, chord: 'G' },
    ]);
  });

  it('keeps same positions after transposition', () => {
    const src = '[Am]Когда [C]качаются [G]фонарики';
    const parsedBefore = parseChordLine(src);
    const parsedAfter = parseChordLine(transposeBracketChords(src, 2));

    expect(parsedAfter.text).toBe(parsedBefore.text);
    expect(parsedAfter.chords.map((x) => x.position)).toEqual(parsedBefore.chords.map((x) => x.position));
  });

  it('supports consecutive chords on same text position', () => {
    const parsed = parseChordLine('[Am][C]Слово');
    expect(parsed.text).toBe('Слово');
    expect(parsed.chords).toEqual([
      { position: 0, chord: 'Am' },
      { position: 0, chord: 'C' },
    ]);
  });
});
