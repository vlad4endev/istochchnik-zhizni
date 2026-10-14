import {needsBootstrap} from '../src/sync/bootstrap';

jest.mock('../src/sync/syncQueue', () => ({
  getLastSyncedAt: jest.fn(),
  setLastSyncedAt: jest.fn(),
}));

jest.mock('../src/shared/apiClient', () => ({
  apiClient: {get: jest.fn()},
}));

import {getLastSyncedAt} from '../src/sync/syncQueue';

const mockedGetLast = getLastSyncedAt as jest.MockedFunction<typeof getLastSyncedAt>;

describe('needsBootstrap', () => {
  it('returns true when songs were never synced', async () => {
    mockedGetLast.mockResolvedValueOnce(0);
    await expect(needsBootstrap()).resolves.toBe(true);
  });

  it('returns false after a successful sync timestamp', async () => {
    mockedGetLast.mockResolvedValueOnce(Date.now());
    await expect(needsBootstrap()).resolves.toBe(false);
  });
});
