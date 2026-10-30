/**
 * Rules for keeping LiveKit calls alive when the OS backgrounds the app
 * or locks the screen. Shared by CallWindow + unit tests.
 */

export type CallBackgroundKind = 'direct' | 'group';
export type CallBackgroundStatus = 'calling' | 'ringing_in' | 'active' | 'ended';

/**
 * Whether pagehide/sendBeacon may end the call.
 * Must be false for Capacitor and for any active LiveKit session — mobile OS
 * fires pagehide on lock / app switch, which previously killed personal calls.
 */
export function shouldBeaconEndOnPageHide(input: {
  isNativeApp: boolean;
  callKind: CallBackgroundKind;
  status: CallBackgroundStatus;
  persisted?: boolean;
}): boolean {
  if (input.isNativeApp) return false;
  if (input.persisted) return false;
  if (input.status === 'active' || input.status === 'ended' || input.status === 'ringing_in') {
    return false;
  }
  // Outgoing ring only (web tab close while still ringing).
  if (input.status === 'calling') {
    // Group ring: don't cancel the room if host backgrounds the browser.
    if (input.callKind === 'group') return false;
    return true;
  }
  return false;
}

/** Native shell should start FGS / CallKit while LiveKit is connected. */
export function shouldHoldNativeOngoing(status: CallBackgroundStatus | undefined | null): boolean {
  return status === 'active';
}
