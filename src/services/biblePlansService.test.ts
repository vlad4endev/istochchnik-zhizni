import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { validateAiPlanPayload } from './biblePlansService';

describe('validateAiPlanPayload', () => {
  it('accepts valid plan JSON', () => {
    const validated = validateAiPlanPayload({
      title: 'Евангелия',
      days: [
        {
          day: 1,
          label: 'Иоанн 1',
          refs: [{ book_slug: 'john', chapter: 1 }],
        },
        {
          day: 2,
          refs: [{ book: 'matthew', chapter: 5, verse_start: 1, verse_end: 12 }],
        },
      ],
    });
    assert.ok(validated);
    assert.equal(validated!.title, 'Евангелия');
    assert.equal(validated!.days.length, 2);
    assert.equal(validated!.days[1]!.refs[0]!.book_slug, 'matthew');
  });

  it('rejects invalid book or chapter', () => {
    const validated = validateAiPlanPayload({
      title: 'Bad',
      days: [{ day: 1, refs: [{ book_slug: 'not-a-book', chapter: 1 }] }],
    });
    assert.equal(validated, null);
  });
});
