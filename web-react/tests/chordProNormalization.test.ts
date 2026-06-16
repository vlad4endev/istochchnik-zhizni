import { describe, expect, it } from 'vitest';

import { convertToChordPro, mergeChordLineWithLyrics, normalizeChordSymbolForCatalog } from '../src/features/songbook/addSong/chordProConversion';

describe('normalizeChordSymbolForCatalog (import quirks)', () => {
  it('normalizes German H and backslash bass', () => {
    // В приложении используем формат Tonal; slash-инверсии Tonal не парсит,
    // поэтому оставляем основной аккорд.
    expect(normalizeChordSymbolForCatalog('H\\D#')).toBe('B');
    expect(normalizeChordSymbolForCatalog('H/D#')).toBe('B');
  });

  it('normalizes Cyrillic-looking chord letters', () => {
    // "С#m" (кириллическая "С") -> "C#m"
    expect(normalizeChordSymbolForCatalog('С#m')).toBe('C#m');
  });
});

describe('mergeChordLineWithLyrics', () => {
  it('aligns four chords across six lyric words', () => {
    const out = mergeChordLineWithLyrics(
      'Dm    Em    C    G',
      'Это мой Бог – великий Творец,',
    );
    expect(out).toContain('[Dm]Это');
    expect(out).toContain('[G]');
    expect(out).not.toContain('GA)Ote');
  });
});

describe('convertToChordPro (stacked chords import)', () => {
  it('keeps slash-bass and H in rendered chords', () => {
    const src = [
      'A         E   H\\D#    C#m',
      'Бога благослови, о, душа моя,',
    ].join('\n');
    const out = convertToChordPro(src);
    // Для отображения важно сохранить запись баса и ноту H (нем.).
    expect(out).toContain('[H/D#]');
  });
});

