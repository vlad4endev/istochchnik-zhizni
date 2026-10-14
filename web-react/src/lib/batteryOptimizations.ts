import { Capacitor } from '@capacitor/core';

/**
 * Android: best-effort prompt to open app settings so the user can disable
 * battery optimizations (needed for reliable data-only FCM call wakes).
 */
export async function requestIgnoreBatteryOptimizations(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  try {
    // App.openUrl is not in all Cap versions; use window.open as fallback.
    if (typeof window !== 'undefined') {
      window.open('package:com.istochnikzhizni.molitva', '_system');
    }
  } catch {
    /* user can enable manually in Settings */
  }
}
