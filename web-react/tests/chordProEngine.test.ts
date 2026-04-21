import { describe, expect, it } from 'vitest';

import {
  extractCommonChords,
  parseChordPro,
  renderWithCapo,
  transposeSong,
} from '../src/features/songbook/chordProEngine';

describe('chordProEngine', () => {
  it('transposeSong transposes bracket chords', () => {
    const src = '[C]Hello [Am]world';
    const out = transposeSong(src, 2);

    expect(out).not.toBe(src);
    expect(out).toMatch(/\[[^\]]+\]Hello/);
    expect(out).toMatch(/\[[^\]]+\]world/);
  });

  it('renderWithCapo computes play and concert shifts', () => {
    const r = renderWithCapo('[C]Line', 3, 2);

    expect(r.concertShift).toBe(3);
    expect(r.playShift).toBe(1);
    expect(r.playText).toContain('[');
    expect(r.concertText).toContain('[');
  });

  it('extractCommonChords sorts by frequency', () => {
    const src = '[G]one [C]two [G]three [D]four [G]five';
    const common = extractCommonChords(src, 2);

    expect(common.length).toBe(2);
    expect(common[0]).toBe('G');
  });

  it('parseChordPro extracts section markers', () => {
    const src = '{sec:Куплет 1}\n[C]Текст';
    const parsed = parseChordPro(src);

    expect(parsed.warnings).toBeDefined();
    expect(parsed.sections).toContain('Куплет 1');
    expect(parsed.chords.length).toBeGreaterThan(0);
  });
});
