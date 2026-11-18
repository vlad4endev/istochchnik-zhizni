import { NativeModules, Platform } from 'react-native';

/**
 * Встроенные звонки работают только в собранном приложении (dev build / релиз): им нужен нативный
 * WebRTC. В Expo Go его нет, поэтому LiveKit подключаем лениво и проверяем заранее, чтобы
 * остальное приложение не падало при запуске.
 */
export type LiveKitModule = typeof import('@livekit/react-native');
export type LiveKitClientModule = typeof import('livekit-client');

export type LiveKitLoad =
  | { ok: true; rn: LiveKitModule; client: LiveKitClientModule }
  | { ok: false; reason: 'unsupported' | 'error'; message: string };

let cached: LiveKitLoad | null = null;
let registered = false;

/** Есть ли в сборке нативный модуль WebRTC. */
export function hasNativeWebRtc(): boolean {
  if (Platform.OS === 'web') return false;
  return Boolean((NativeModules as Record<string, unknown>).WebRTCModule);
}

export function loadLiveKit(): LiveKitLoad {
  if (cached?.ok) return cached;
  if (!hasNativeWebRtc()) {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'Встроенные звонки доступны в установленном приложении. В Expo Go звонок откроется в браузере.',
    };
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rn = require('@livekit/react-native') as LiveKitModule;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const client = require('livekit-client') as LiveKitClientModule;
    if (!registered) {
      rn.registerGlobals();
      registered = true;
    }
    cached = { ok: true, rn, client };
    return cached;
  } catch (e) {
    return {
      ok: false,
      reason: 'error',
      message: `Не удалось подготовить звонки: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
