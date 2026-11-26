import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CALL_PERSIST_KEY,
  CALL_PERSIST_TTL_MS,
  clearPersistedCall,
  loadPersistedCall,
  persistCall,
} from './callPersistence';
import type { ActiveCallState } from './callStore';

const base: ActiveCallState = {
  callId: 'c1',
  conversationId: '',
  peerId: 0,
  peerName: 'Молитва',
  peerAvatar: '',
  callType: 'video',
  isInitiator: true,
  status: 'active',
  callKind: 'group',
  inviteUrl: '/call/join/abc',
  livekitToken: 'secret-jwt',
  livekitUrl: 'wss://lk',
};

function installLocalStorageStub(): void {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  });
}

describe('callPersistence', () => {
  beforeEach(() => installLocalStorageStub());

  it('round-trips an active call without the LiveKit token', () => {
    persistCall(base, 1_000);
    expect(localStorage.getItem(CALL_PERSIST_KEY)).not.toContain('secret-jwt');
    const got = loadPersistedCall(2_000);
    expect(got?.callId).toBe('c1');
    expect(got?.peerName).toBe('Молитва');
    expect(got?.inviteUrl).toBe('/call/join/abc');
  });

  it('does not persist ringing/ended states', () => {
    persistCall({ ...base, status: 'ringing_in' }, 1_000);
    expect(loadPersistedCall(1_001)).toBeNull();
    persistCall({ ...base, status: 'ended' }, 1_000);
    expect(loadPersistedCall(1_001)).toBeNull();
  });

  it('expires after the TTL', () => {
    persistCall(base, 1_000);
    expect(loadPersistedCall(1_000 + CALL_PERSIST_TTL_MS + 1)).toBeNull();
    expect(localStorage.getItem(CALL_PERSIST_KEY)).toBeNull();
  });

  it('survives garbage in storage', () => {
    localStorage.setItem(CALL_PERSIST_KEY, '{not json');
    expect(loadPersistedCall()).toBeNull();
    localStorage.setItem(CALL_PERSIST_KEY, JSON.stringify({ callId: 5 }));
    expect(loadPersistedCall()).toBeNull();
  });

  it('clears', () => {
    persistCall(base, 1_000);
    clearPersistedCall();
    expect(loadPersistedCall(1_001)).toBeNull();
  });
});
