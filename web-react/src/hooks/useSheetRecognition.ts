import { useCallback, useState } from 'react';

import { aiRecognizeSheetMusic } from '../features/songbook/api';
import type { RecognizedSong } from '../features/songbook/studio/sheetMusicTypes';

type Status = 'idle' | 'loading' | 'done' | 'error';

export function useSheetRecognition() {
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<RecognizedSong | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const recognize = useCallback(async (file: File) => {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setStatus('loading');
    setError(null);
    setResult(null);

    try {
      const data = await aiRecognizeSheetMusic(file);
      setResult(data);
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сервера');
      setStatus('error');
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setResult(null);
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
  }, [preview]);

  return { status, result, error, preview, recognize, reset };
}
