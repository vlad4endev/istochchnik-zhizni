import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useEffect } from 'react';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const RINGBACK = require('../../assets/sounds/ringback.wav') as number;

/** Длинные гудки в динамике, пока исходящий звонок ждёт ответа. Выключается сам при смене состояния. */
export function useRingback(active: boolean): void {
  const player = useAudioPlayer(RINGBACK);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    void (async () => {
      try {
        await setAudioModeAsync({ playsInSilentMode: true });
        if (stopped) return;
        player.loop = true;
        player.volume = 0.6;
        await player.seekTo(0);
        player.play();
      } catch {
        /* нет звука — звонок от этого не страдает */
      }
    })();
    return () => {
      stopped = true;
      try {
        player.pause();
      } catch {
        /* плеер уже освобождён */
      }
    };
  }, [active, player]);
}
