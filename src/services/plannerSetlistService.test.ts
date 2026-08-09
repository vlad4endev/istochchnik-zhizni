import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { groupSongsByResponsibleMusician } from './plannerSetlistService';

describe('groupSongsByResponsibleMusician', () => {
  it('groups by assigned_member_id on blocks', () => {
    const groups = groupSongsByResponsibleMusician(
      [
        { song_id: 1, assigned_member_id: 10 },
        { song_id: 2, assigned_member_id: 10 },
        { song_id: 3, assigned_member_id: 20 },
      ],
      null,
    );
    assert.deepEqual([...groups.entries()], [
      [10, [1, 2]],
      [20, [3]],
    ]);
  });

  it('falls back to plan music ministry when block assignee is missing', () => {
    const groups = groupSongsByResponsibleMusician(
      [
        { song_id: 1, assigned_member_id: null },
        { song_id: 2, assigned_member_id: null },
      ],
      42,
    );
    assert.deepEqual([...groups.entries()], [[42, [1, 2]]]);
  });

  it('returns empty when no musician can be resolved', () => {
    const groups = groupSongsByResponsibleMusician(
      [
        { song_id: 1, assigned_member_id: null },
        { song_id: 2, assigned_member_id: null },
      ],
      null,
    );
    assert.equal(groups.size, 0);
  });

  it('dedupes the same song for one musician', () => {
    const groups = groupSongsByResponsibleMusician(
      [
        { song_id: 7, assigned_member_id: 5 },
        { song_id: 7, assigned_member_id: 5 },
      ],
      null,
    );
    assert.deepEqual(groups.get(5), [7]);
  });
});
