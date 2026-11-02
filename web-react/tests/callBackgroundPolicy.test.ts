import { describe, expect, it } from 'vitest';

import {
  shouldBeaconEndOnPageHide,
  shouldHoldNativeOngoing,
} from '../src/features/calls/callBackgroundPolicy';

describe('shouldBeaconEndOnPageHide', () => {
  it('never beacons on Capacitor (lock / app switch fires pagehide)', () => {
    expect(
      shouldBeaconEndOnPageHide({
        isNativeApp: true,
        callKind: 'direct',
        status: 'calling',
      }),
    ).toBe(false);
    expect(
      shouldBeaconEndOnPageHide({
        isNativeApp: true,
        callKind: 'direct',
        status: 'active',
      }),
    ).toBe(false);
  });

  it('never beacons for active LiveKit (personal or group)', () => {
    expect(
      shouldBeaconEndOnPageHide({
        isNativeApp: false,
        callKind: 'direct',
        status: 'active',
      }),
    ).toBe(false);
    expect(
      shouldBeaconEndOnPageHide({
        isNativeApp: false,
        callKind: 'group',
        status: 'active',
      }),
    ).toBe(false);
  });

  it('allows beacon only for web 1:1 outgoing ring', () => {
    expect(
      shouldBeaconEndOnPageHide({
        isNativeApp: false,
        callKind: 'direct',
        status: 'calling',
      }),
    ).toBe(true);
    expect(
      shouldBeaconEndOnPageHide({
        isNativeApp: false,
        callKind: 'group',
        status: 'calling',
      }),
    ).toBe(false);
  });

  it('skips bfcache pagehide', () => {
    expect(
      shouldBeaconEndOnPageHide({
        isNativeApp: false,
        callKind: 'direct',
        status: 'calling',
        persisted: true,
      }),
    ).toBe(false);
  });
});

describe('shouldHoldNativeOngoing', () => {
  it('holds only while LiveKit is active', () => {
    expect(shouldHoldNativeOngoing('active')).toBe(true);
    expect(shouldHoldNativeOngoing('calling')).toBe(false);
    expect(shouldHoldNativeOngoing('ringing_in')).toBe(false);
    expect(shouldHoldNativeOngoing(null)).toBe(false);
  });
});
