import { describe, expect, it } from 'vitest';

import { buildInternalBibleUrl, parseBibleRef, verseFromTimings } from './bibleRef';

describe('parseBibleRef', () => {
  it('parses Ин 3:16', () => {
    expect(parseBibleRef('Ин 3:16')).toEqual({
      bookSlug: 'john',
      chapter: 3,
      verseStart: 16,
      verseEnd: null,
    });
  });

  it('builds internal url', () => {
    expect(buildInternalBibleUrl('Ин 3:16')).toBe('/bible/synodal/john/3?v=16');
  });
});

describe('verseFromTimings', () => {
  it('maps currentTime to verse', () => {
    const timings = [
      { v: 1, start: 0, end: 5 },
      { v: 2, start: 5, end: 10 },
    ];
    expect(verseFromTimings(timings, 1)).toBe(1);
    expect(verseFromTimings(timings, 6)).toBe(2);
  });
});
