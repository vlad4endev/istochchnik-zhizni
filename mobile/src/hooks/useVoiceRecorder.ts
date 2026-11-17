import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { AttachmentDraft } from '../lib/attachments';

export const MIN_VOICE_SEC = 1;
export const MAX_VOICE_SEC = 15 * 60;

export type VoiceResult = { file: AttachmentDraft; durationSec: number };

/** Запись голосового сообщения: старт, отмена, остановка с готовым файлом (.m4a). */
export function useVoiceRecorder(onLimitReached?: () => void) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const startedAt = useRef(0);
  const limitRef = useRef(onLimitReached);
  limitRef.current = onLimitReached;

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt.current) / 1000);
      setSeconds(s);
      if (s >= MAX_VOICE_SEC) limitRef.current?.();
    }, 250);
    return () => clearInterval(id);
  }, [recording]);

  const restoreAudioMode = useCallback(async () => {
    // Возвращаем режим воспроизведения (плеер проповедей и голосовых), иначе звук тише.
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'duckOthers',
    }).catch(() => undefined);
  }, []);

  /** Возвращает текст ошибки или null, если запись началась. */
  const start = useCallback(async (): Promise<string | null> => {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      return 'Нет доступа к микрофону. Разрешите его в настройках телефона.';
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAt.current = Date.now();
      setSeconds(0);
      setRecording(true);
      return null;
    } catch {
      await restoreAudioMode();
      return 'Не удалось начать запись. Попробуйте ещё раз.';
    }
  }, [recorder, restoreAudioMode]);

  const cancel = useCallback(async () => {
    if (!recording) return;
    setRecording(false);
    try {
      await recorder.stop();
    } catch {
      /* запись могла уже остановиться */
    }
    await restoreAudioMode();
  }, [recorder, recording, restoreAudioMode]);

  /** Останавливает запись. null — слишком короткая или ошибка. */
  const finish = useCallback(async (): Promise<VoiceResult | null> => {
    if (!recording) return null;
    const durationSec = Math.round((Date.now() - startedAt.current) / 1000);
    setRecording(false);
    try {
      await recorder.stop();
    } catch {
      await restoreAudioMode();
      return null;
    }
    await restoreAudioMode();
    const uri = recorder.uri;
    if (!uri || durationSec < MIN_VOICE_SEC) return null;
    return {
      durationSec,
      file: {
        uri,
        name: `voice-${Date.now()}.m4a`,
        mimeType: 'audio/mp4',
        size: 0,
        kind: 'audio',
        durationSec,
      },
    };
  }, [recorder, recording, restoreAudioMode]);

  return { recording, seconds, start, cancel, finish };
}
