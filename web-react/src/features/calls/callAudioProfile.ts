import { AudioPresets, type AudioCaptureOptions, type TrackPublishOptions } from 'livekit-client';

/**
 * Профиль микрофона звонка.
 *
 * «Речь» (по умолчанию): эхо-/шумоподавление и автоусиление браузера + DTX — экономно и чисто
 * для разговора. «Музыка» (пение, инструменты, служение): фильтры выключены — иначе браузер
 * «съедает» пение как шум и срезает динамику; DTX выключен (он глушит тихие ноты и паузы),
 * битрейт выше. Нужны наушники: без эхоподавления собеседники слышат себя.
 */

const MUSIC_MODE_STORAGE_KEY = 'call_music_mode';

export function loadMusicModePref(): boolean {
  try {
    return localStorage.getItem(MUSIC_MODE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveMusicModePref(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(MUSIC_MODE_STORAGE_KEY, '1');
    else localStorage.removeItem(MUSIC_MODE_STORAGE_KEY);
  } catch {
    /* приватный режим Safari — просто не запоминаем */
  }
}

export function micCaptureOptions(musicMode: boolean): AudioCaptureOptions {
  return {
    echoCancellation: !musicMode,
    noiseSuppression: !musicMode,
    autoGainControl: !musicMode,
  };
}

export function micPublishOptions(musicMode: boolean): TrackPublishOptions {
  return musicMode
    ? { dtx: false, red: true, audioPreset: AudioPresets.musicHighQuality }
    : { dtx: true, red: true };
}
