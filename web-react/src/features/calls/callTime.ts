import { useEffect, useState } from 'react';

export function formatCallDuration(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/** Секунды с начала звонка; общий источник (`startedAt`) для плашки и плавающей панели. */
export function useCallElapsedSeconds(startedAt: number | undefined, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [enabled, startedAt]);
  return startedAt ? Math.max(0, (now - startedAt) / 1000) : 0;
}
