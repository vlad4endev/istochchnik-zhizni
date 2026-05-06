import { describe, expect, it } from 'vitest';

import { smartImportTextToBlocks, smartImportTextToChordPro } from '../src/features/songbook/addSong/smartImportToBlocks';

describe('smartImportTextToBlocks', () => {
  it('splits by explicit section headers (decorated headings)', () => {
    const src = [
      '— Куплет —',
      'Am   C',
      'Текст 1',
      '',
      '--- Припев ---',
      'F   G',
      'Текст 2',
    ].join('\n');

    const blocks = smartImportTextToBlocks(src);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.type).toBe('verse');
    expect((blocks[0]?.sectionHint ?? '').toLowerCase()).toContain('куплет');
    expect(blocks[1]?.type).toBe('chorus');
    expect((blocks[1]?.sectionHint ?? '').toLowerCase()).toContain('припев');
  });

  it('guesses chorus by repeated paragraph when no headers', () => {
    const verse1 = 'Am\nЭто первый куплет который достаточно длинный чтобы считаться текстом песни';
    const chorus = 'F\nЭто припев который повторяется и тоже достаточно длинный чтобы его найти';
    const verse2 = 'C\nЭто второй куплет который тоже длинный и отличается от припева';
    const src = [verse1, chorus, verse2, chorus].join('\n\n');

    const blocks = smartImportTextToBlocks(src);
    expect(blocks.map((b) => b.type)).toEqual(['verse', 'chorus', 'verse', 'chorus']);
    expect(blocks[1]?.sectionHint).toBe('Припев');
    expect(blocks[3]?.sectionHint).toBe('Припев');
    expect(blocks[0]?.sectionHint).toBe('Куплет 1');
    expect(blocks[2]?.sectionHint).toBe('Куплет 2');
  });

  it('smartImportTextToChordPro emits {sec:...} markers', () => {
    const src = ['Куплет', 'Am', 'Текст', '', 'Припев', 'F', 'Текст'].join('\n');
    const out = smartImportTextToChordPro(src);
    expect(out).toMatch(/\{sec:Куплет 1\}/);
    expect(out).toMatch(/\{sec:Припев\}/);
  });
});

