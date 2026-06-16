import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ChordLine } from '../src/features/songbook/components/ChordLine';
import { parseChordLine } from '../src/features/songbook/utils/chordSegments';
import { buildChordLine, resolveOverlaps } from '../src/components/shared/SongRenderer/SongLine';

describe('ChordLine render regression', () => {
  it('renders measured chord row above proportional lyric line', () => {
    const line = parseChordLine('[Am]Когда [C]качаются');
    const html = renderToStaticMarkup(
      <ChordLine line={line} chordsVisible layoutMode="measured" chordTone="light" />,
    );

    expect(html).toContain('chord-line');
    expect(html).toContain('lyric-line');
    expect(html).not.toContain('lyric-chord-line');
    expect(html).not.toContain('chord-slot');
    expect(html).toContain('Am');
    expect(html).toContain('C');
    expect(html).toContain('Когда качаются');
  });

  it('keeps slash-bass chords in measured mode', () => {
    const line = parseChordLine('[G/B]утешен [Dm]Как');
    const html = renderToStaticMarkup(
      <ChordLine line={line} chordsVisible layoutMode="measured" chordTone="light" />,
    );

    expect(html).toContain('G/B');
    expect(html).toContain('Dm');
    expect(html).toContain('утешен');
    expect(html).not.toContain('lyric-chord-line');
  });

  it('renders monospaced chord row and lyric row in mono mode', () => {
    const line = parseChordLine('[Am]Когда [C]качаются');
    const html = renderToStaticMarkup(
      <ChordLine line={line} chordsVisible layoutMode="mono" chordTone="light" />,
    );

    expect(html).toContain('<pre class="chord-line');
    expect(html).toContain('lyric-line--mono');
    expect(html).toContain('Am');
    expect(html).toContain('C');
    expect(html).toContain('Когда качаются');
  });

  it('hides chord layer when chords are disabled', () => {
    const line = parseChordLine('[Am]Когда [C]качаются');
    const html = renderToStaticMarkup(
      <ChordLine line={line} chordsVisible={false} layoutMode="measured" chordTone="light" />,
    );

    expect(html).not.toContain('chord-line');
    expect(html).toContain('Когда качаются');
  });

  it('renders empty-text chord lines as a chord row', () => {
    const line = parseChordLine('[Em][C][D]');
    const html = renderToStaticMarkup(
      <ChordLine line={line} chordsVisible layoutMode="measured" chordTone="light" />,
    );

    expect(html).toContain('chord-line-only');
    expect(html).toContain('Em');
    expect(html).toContain('C');
    expect(html).toContain('D');
    expect(html).not.toContain('lyric-grapheme');
  });
});

describe('chord line helpers', () => {
  it('resolves overlapping chord anchors', () => {
    const result = resolveOverlaps([
      { position: 0, chord: 'Em' },
      { position: 1, chord: 'C' },
      { position: 2, chord: 'D' },
    ]);

    expect(result).toEqual([
      { position: 0, chord: 'Em' },
      { position: 3, chord: 'C' },
      { position: 5, chord: 'D' },
    ]);
  });

  it('builds fixed-grid chord line for lyric text', () => {
    const chordLine = buildChordLine('Все от Него и Им сотворено.', [
      { position: 0, chord: 'Em' },
      { position: 7, chord: 'C' },
      { position: 15, chord: 'D' },
      { position: 18, chord: 'Em' },
    ]);

    expect(chordLine).toBe('Em     C       D  Em');
  });
});
