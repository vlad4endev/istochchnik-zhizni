import { AudioPresets } from 'livekit-client';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  loadMusicModePref,
  micCaptureOptions,
  micPublishOptions,
  saveMusicModePref,
} from './callAudioProfile';

// Тесты идут в node без DOM — минимальная заглушка localStorage.
const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

describe('callAudioProfile', () => {
  beforeEach(() => localStorage.clear());

  it('речь: фильтры браузера и DTX включены', () => {
    expect(micCaptureOptions(false)).toEqual({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
    expect(micPublishOptions(false)).toMatchObject({ dtx: true });
  });

  it('музыка: фильтры и DTX выключены, высокий битрейт', () => {
    expect(micCaptureOptions(true)).toEqual({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    });
    expect(micPublishOptions(true)).toEqual({
      dtx: false,
      red: true,
      audioPreset: AudioPresets.musicHighQuality,
    });
  });

  it('выбор запоминается на устройстве', () => {
    expect(loadMusicModePref()).toBe(false);
    saveMusicModePref(true);
    expect(loadMusicModePref()).toBe(true);
    saveMusicModePref(false);
    expect(loadMusicModePref()).toBe(false);
  });
});
