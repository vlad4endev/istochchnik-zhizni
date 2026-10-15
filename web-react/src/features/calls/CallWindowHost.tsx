import { lazy, Suspense } from 'react';

import { useCallStore } from './callStore';

/**
 * LiveKit + CallWindow тяжёлые (~сотни KB). Раньше тянулись в entry через Layout
 * и на старых iPhone (iOS 15–17, мало RAM) парсинг главного бандла мог не успеть
 * до watchdog → PWA «не открывается» (белый экран после сплэша).
 *
 * Чанк грузим только когда есть активный/исходящий звонок; входящий оверлей
 * остаётся eager (без LiveKit).
 */
const CallWindow = lazy(async () => {
  const m = await import('./CallWindow');
  return { default: m.CallWindow };
});

export function CallWindowHost() {
  /**
   * `ringing_in` тоже триггерит preload: к моменту Accept чанк LiveKit уже в полёте.
   * Сам CallWindow при ringing_in возвращает null (UI — IncomingCallOverlay).
   */
  const needsCallWindow = useCallStore((s) => {
    const st = s.activeCall?.status;
    return st === 'calling' || st === 'ringing_in' || st === 'active';
  });

  if (!needsCallWindow) return null;

  return (
    <Suspense fallback={null}>
      <CallWindow />
    </Suspense>
  );
}
