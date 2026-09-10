import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PRAYER_NEED_SUBMISSION_MAX_LENGTH,
  PRAYER_NEED_SUBMISSION_MIN_LENGTH,
  buildPrayerNeedChatMessage,
  normalizePrayerNeedText,
} from './prayerNeedSubmissionService';

describe('prayerNeedSubmissionService', () => {
  it('builds a chat message with need and sender', () => {
    const text = buildPrayerNeedChatMessage({
      memberName: 'Иванов Иван',
      text: 'Прошу молиться о здоровье',
      submittedAt: new Date('2026-09-10T12:00:00.000Z'),
    });
    assert.match(text, /Молитвенная нужда/);
    assert.match(text, /От кого: Иванов Иван/);
    assert.match(text, /Прошу молиться о здоровье/);
  });

  it('normalizes whitespace and length bounds', () => {
    assert.equal(normalizePrayerNeedText('  a\r\nb\r\n\r\n\r\nc  '), 'a\nb\n\nc');
    assert.ok(PRAYER_NEED_SUBMISSION_MIN_LENGTH >= 3);
    assert.ok(PRAYER_NEED_SUBMISSION_MAX_LENGTH <= 4000);
  });
});
