import { lazy, Suspense, useEffect } from 'react';

import { useAuthStore } from '../auth/authStore';

import { useCallStore } from './callStore';
import { restoreActiveCall } from './restoreActiveCall';

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
  const hasSession = useAuthStore((s) => Boolean(s.token?.trim()));
  // Вкладку могла выгрузить ОС, пока пользователь отправлял ссылку-приглашение — возвращаем звонок.
  useEffect(() => {
    if (hasSession) void restoreActiveCall();
  }, [hasSession]);

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
