import { describe, expect, it } from 'vitest';

import {
  blocksToChordPro,
  chordProToBlocks,
  createSongBlock,
  splitPasteByDoubleNewlines,
} from '../src/features/songbook/studio/songBlocks';

describe('songBlocks', () => {
  it('round-trips section directives and body newlines', () => {
    const blocks = [
      createSongBlock('verse', 'line1\nline2', undefined, 'v1'),
      createSongBlock('chorus', '[G]Припев', undefined, 'c1'),
    ];
    const text = blocksToChordPro(blocks);
    const back = chordProToBlocks(text);
    expect(back).toHaveLength(2);
    expect(back[0]?.type).toBe('verse');
    expect(back[0]?.content).toBe('line1\nline2');
    expect(back[1]?.type).toBe('chorus');
    expect(back[1]?.content).toBe('[G]Припев');
  });

  it('uses {sec:…} when sectionHint is set', () => {
    const text = blocksToChordPro([createSongBlock('verse', 'A', 'Куплет 2')]);
    expect(text).toMatch(/^\{sec:Куплет 2\}\nA$/);
    const back = chordProToBlocks(text);
    expect(back[0]?.sectionHint).toBe('Куплет 2');
    expect(back[0]?.content).toBe('A');
  });

  it('splitPasteByDoubleNewlines splits paragraphs', () => {
    expect(splitPasteByDoubleNewlines('a\n\nb\n  \nc')).toEqual(['a', 'b', 'c']);
  });
});
