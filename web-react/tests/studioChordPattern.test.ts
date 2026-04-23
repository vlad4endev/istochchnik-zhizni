import { describe, expect, it } from 'vitest';

import {
  applyChordPattern,
  autoDistributeChords,
  extractChordPattern,
  getSameTypeBlocks,
} from '../src/features/songbook/studio/chordPattern';
import { createSongBlock, type SongBlock } from '../src/features/songbook/studio/songBlocks';

describe('studio chord pattern helpers', () => {
  it('extracts relative chord positions from donor block', () => {
    const donor = createSongBlock('verse', '[Em]Все от [C]Него и [D]Им [Em]сотворено.');
    const pattern = extractChordPattern(donor);
    expect(pattern).toHaveLength(1);
    expect(pattern[0]?.chords.map((ch) => ch.chord)).toEqual(['Em', 'C', 'D', 'Em']);
    expect(pattern[0]?.chords.map((ch) => Number(ch.relativePos.toFixed(3)))).toEqual([0, 0.259, 0.519, 0.63]);
  });

  it('applies donor pattern to target lines by relative width', () => {
    const donor = createSongBlock('verse', '[Am]Когда [C]качаются [G]фонарики');
    const pattern = extractChordPattern(donor);
    const target = createSongBlock('verse', 'Господь достоин славы');
    const next = applyChordPattern(target, pattern);

    expect(next.content).toContain('[Am]Госпо');
    expect(next.content).toContain('[C]');
    expect(next.content).toContain('[G]');
  });

  it('finds same-type target blocks and applies only selected ids', () => {
    const donor = createSongBlock('verse', '[Am]Текст');
    const verse2 = createSongBlock('verse', 'Второй');
    const chorus = createSongBlock('chorus', 'Припев');
    const blocks: SongBlock[] = [donor, verse2, chorus];

    expect(getSameTypeBlocks(blocks, donor).map((b) => b.id)).toEqual([verse2.id]);

    const next = autoDistributeChords(blocks, donor.id, [verse2.id]);
    expect(next[1]?.content).toContain('[Am]');
    expect(next[2]?.content).toBe('Припев');
  });
});
