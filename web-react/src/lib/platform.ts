import { Capacitor } from '@capacitor/core';

export type AppPlatform = 'web' | 'ios' | 'android';

export function getAppPlatform(): AppPlatform {
  if (!Capacitor.isNativePlatform()) return 'web';
  const p = Capacitor.getPlatform();
  if (p === 'ios') return 'ios';
  if (p === 'android') return 'android';
  return 'web';
}

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export function isIosNative(): boolean {
  return getAppPlatform() === 'ios';
}

export function isAndroidNative(): boolean {
  return getAppPlatform() === 'android';
}

/** Hover-driven UI should be disabled on touch / native shells. */
export function prefersFineHover(): boolean {
  if (typeof window === 'undefined') return true;
  if (isNativePlatform()) return false;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}
