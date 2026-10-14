import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {isSyncTable} from './syncService';

describe('syncService tables', () => {
  it('allows non-chat offline tables', () => {
    assert.equal(isSyncTable('songs'), true);
    assert.equal(isSyncTable('members'), true);
    assert.equal(isSyncTable('church_events'), true);
    assert.equal(isSyncTable('sermon_notes'), true);
  });

  it('rejects messenger tables', () => {
    assert.equal(isSyncTable('messages'), false);
    assert.equal(isSyncTable('conversations'), false);
  });
});
