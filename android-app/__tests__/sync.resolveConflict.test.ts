import {resolveConflict, pickWinnerRecord} from '../src/sync/resolveConflict';

describe('resolveConflict', () => {
  it('picks remote when remote updated_at is newer', () => {
    const conflict = resolveConflict(
      'songs',
      {title: 'Local', updated_at: 1000},
      {title: 'Remote', updated_at: 2000},
    );
    expect(conflict.winner).toBe('remote');
    expect(pickWinnerRecord(conflict).title).toBe('Remote');
  });

  it('picks local when local updated_at is newer', () => {
    const conflict = resolveConflict(
      'songs',
      {title: 'Local', updated_at: 3000},
      {title: 'Remote', updated_at: 2000},
    );
    expect(conflict.winner).toBe('local');
    expect(pickWinnerRecord(conflict).title).toBe('Local');
  });
});
