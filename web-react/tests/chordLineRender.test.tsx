import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ChordLine } from '../src/features/songbook/components/ChordLine';
import { parseChordLine } from '../src/features/songbook/utils/chordSegments';

describe('ChordLine render regression', () => {
  it('keeps two-layer structure with stable anchors', () => {
    const line = parseChordLine('[Am]Когда [C]качаются');
    const html = renderToStaticMarkup(
      <ChordLine line={line} chordsVisible layoutMode="mono" chordTone="light" />,
    );

    expect(html).toContain('style="left:0ch"');
    expect(html).toContain('style="left:6ch"');
    expect(html).toContain('Когда качаются');
  });

  it('hides only chord layer when chords are disabled', () => {
    const line = parseChordLine('[Am]Когда [C]качаются');
    const html = renderToStaticMarkup(
      <ChordLine line={line} chordsVisible={false} layoutMode="mono" chordTone="light" />,
    );

    expect(html).toContain('invisible');
    expect(html).toContain('Когда качаются');
  });
});
