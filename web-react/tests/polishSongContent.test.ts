import { describe, expect, it } from 'vitest';

import { polishSongContent, stripNonLyricLines } from '../src/features/songbook/addSong/polishSongContent';

describe('polishSongContent', () => {
  it('removes songbook metadata and merges stacked chords', () => {
    const src = [
      'Простую песню о любви',
      'Сборник песен церкви «Источник жизни»',
      'G                   D',
      'Простую песню о любви Иисусу я пою,',
    ].join('\n');

    const out = polishSongContent(src);
    expect(out).not.toMatch(/сборник\s+песен/i);
    expect(out).toContain('[G]');
    expect(out).toContain('[D]');
    expect(out).not.toMatch(/^\s*G\s+D\s*$/m);
  });

  it('drops duplicate chord row above ChordPro line', () => {
    const src = [
      'C    G    Em    D',
      '[C]Держи меня не отпускай из рук Твоей любви,',
    ].join('\n');

    const out = polishSongContent(src);
    expect(out.split('\n').filter((l) => /^[A-G]/.test(l.trim()) && !l.includes('[')).length).toBe(0);
    expect(out).toContain('[C]Держи');
  });

  it('strips repeat markers like (2р)', () => {
    const src = 'Строка текста (2р)';
    expect(polishSongContent(src)).toBe('Строка текста');
  });
});

describe('stripNonLyricLines', () => {
  it('removes source lines', () => {
    const out = stripNonLyricLines('Куплет\nСборник песен церкви «Источник жизни»\nТекст');
    expect(out).toBe('Куплет\nТекст');
  });
});
