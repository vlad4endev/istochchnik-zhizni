import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildInternalBibleUrl, parseBibleRef, verseFromTimings } from './bibleRefParser';

describe('parseBibleRef', () => {
  it('parses Ин 3:16', () => {
    const r = parseBibleRef('Ин 3:16');
    assert.ok(r);
    assert.equal(r!.book.slug, 'john');
    assert.equal(r!.chapter, 3);
    assert.equal(r!.verseStart, 16);
  });

  it('parses range 1 Кор 13:4-7', () => {
    const r = parseBibleRef('1 Кор 13:4-7');
    assert.ok(r);
    assert.equal(r!.book.slug, '1-corinthians');
    assert.equal(r!.verseStart, 4);
    assert.equal(r!.verseEnd, 7);
  });

  it('parses chapter only', () => {
    const r = parseBibleRef('Быт. 1');
    assert.ok(r);
    assert.equal(r!.book.slug, 'genesis');
    assert.equal(r!.chapter, 1);
    assert.equal(r!.verseStart, null);
  });
});

describe('buildInternalBibleUrl', () => {
  it('builds deep link', () => {
    assert.equal(buildInternalBibleUrl('Ин 3:16'), '/bible/synodal/john/3?v=16');
  });
});

describe('verseFromTimings', () => {
  const timings = [
    { v: 1, start: 0, end: 4 },
    { v: 2, start: 4, end: 10 },
    { v: 3, start: 10, end: 15 },
  ];

  it('picks verse by currentTime', () => {
    assert.equal(verseFromTimings(timings, 0), 1);
    assert.equal(verseFromTimings(timings, 4.1), 2);
    assert.equal(verseFromTimings(timings, 12), 3);
  });
});
