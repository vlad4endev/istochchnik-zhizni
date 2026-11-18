/**
 * Выбор профиля микрофона на этом устройстве (без зависимостей от LiveKit:
 * модуль подключается в основной бандл — store, настройки).
 *
 * «Прославление»: пение и инструменты без эхо-/шумоподавления и автоусиления.
 */
const WORSHIP_AUDIO_STORAGE_KEY = 'call_music_mode';

export function loadMusicModePref(): boolean {
  try {
    return localStorage.getItem(WORSHIP_AUDIO_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveMusicModePref(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(WORSHIP_AUDIO_STORAGE_KEY, '1');
    else localStorage.removeItem(WORSHIP_AUDIO_STORAGE_KEY);
  } catch {
    /* приватный режим Safari — просто не запоминаем */
  }
}
