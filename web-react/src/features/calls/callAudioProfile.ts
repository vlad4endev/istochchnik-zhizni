import { AudioPresets, type AudioCaptureOptions, type TrackPublishOptions } from 'livekit-client';

/**
 * Профиль микрофона звонка.
 *
 * «Речь» (по умолчанию): эхо-/шумоподавление и автоусиление браузера + DTX — экономно и чисто
 * для разговора. «Прославление» (пение, инструменты, служение): фильтры выключены — иначе браузер
 * «съедает» пение как шум и срезает динамику; DTX выключен (он глушит тихие ноты и паузы),
 * битрейт выше. Нужны наушники: без эхоподавления собеседники слышат себя.
 */

// Хранение выбора — в callAudioPrefs.ts (без LiveKit), этот модуль грузится только с окном звонка.
export { loadMusicModePref, saveMusicModePref } from './callAudioPrefs';

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
