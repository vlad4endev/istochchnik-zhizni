import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

// Pure helpers duplicated for unit coverage of DND window logic
function inDndWindow(minute: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return minute >= start && minute < end;
  return minute >= start || minute < end;
}

describe('memberPushPrefs DND window', () => {
  it('handles same-day window', () => {
    assert.equal(inDndWindow(10 * 60, 9 * 60, 11 * 60), true);
    assert.equal(inDndWindow(8 * 60, 9 * 60, 11 * 60), false);
  });

  it('handles overnight window', () => {
    assert.equal(inDndWindow(23 * 60, 22 * 60, 8 * 60), true);
    assert.equal(inDndWindow(7 * 60, 22 * 60, 8 * 60), true);
    assert.equal(inDndWindow(12 * 60, 22 * 60, 8 * 60), false);
  });
});
