import { describe, expect, it } from 'vitest';

import { transposeChordSymbol } from '../src/features/songbook/chordUtils';

describe('transposeChordSymbol', () => {
  it('transposes latin chords and slash bass', () => {
    expect(transposeChordSymbol('Bb/F', 2)).toBe('C/G');
    expect(transposeChordSymbol('F#m7/C#', -1)).toBe('Fm7/C');
  });

  it('transposes cyrillic root notation', () => {
    expect(transposeChordSymbol('Ляm', 2)).toBe('Сиm');
    expect(transposeChordSymbol('Фа#', 1)).toBe('Соль');
  });

  it('handles cyrillic lookalike latin letters', () => {
    expect(transposeChordSymbol('С#m', 1)).toBe('Dm');
  });
});
