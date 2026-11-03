import { useEffect } from 'react';

import { emitAppToast } from '../../lib/uiFeedback';

type EffectiveConnection = {
  effectiveType?: string;
  addEventListener?: (t: string, cb: () => void) => void;
  removeEventListener?: (t: string, cb: () => void) => void;
};

const TYPE_RANK: Record<string, number> = { 'slow-2g': 0, '2g': 1, '3g': 2, '4g': 3 };
const TYPE_LABEL: Record<string, string> = { 'slow-2g': '2G', '2g': '2G', '3g': '3G', '4g': '4G' };

function normalizeType(raw: string | null | undefined): string | null {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase();
  return v in TYPE_RANK ? v : null;
}

/** Текст тоста о переключении сети; null — если показывать нечего (тот же тип/нет базовой линии). */
export function networkSwitchToastText(prev: string | null, next: string | null): string | null {
  if (!prev || !next || prev === next) return null;
  const arrow = `${TYPE_LABEL[prev]} → ${TYPE_LABEL[next]}`;
  if (TYPE_RANK[next] < TYPE_RANK[prev]) {
    return `Сеть переключилась: ${arrow} — возможны перебои связи`;
  }
  return `Сеть переключилась: ${arrow}`;
}

const MIN_SWITCH_TOAST_INTERVAL_MS = 10_000;

/**
 * Уведомляет участника звонка о смене сети: пропадание/появление и переключение типа
 * (4G ↔ 3G). NetworkInformation шлёт `change` на любое шевеление RTT — реагируем только
 * на смену effectiveType и не чаще одного тоста за интервал, иначе на «хлопающей» мобильной
 * сети тосты спамили бы весь звонок.
 */
export function useNetworkChangeToast(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const connection = (navigator as Navigator & { connection?: EffectiveConnection }).connection;
    let lastType = normalizeType(connection?.effectiveType);
    let lastToastAt = 0;

    const onConnectionChange = () => {
      const next = normalizeType(connection?.effectiveType);
      if (!next || next === lastType) return;
      const prev = lastType;
      lastType = next;
      const nowTs = Date.now();
      if (nowTs - lastToastAt < MIN_SWITCH_TOAST_INTERVAL_MS) return;
      lastToastAt = nowTs;
      const text = networkSwitchToastText(prev, next);
      if (text) emitAppToast(text, 'info');
    };

    const onOffline = () => emitAppToast('Сеть пропала — переподключаемся…', 'info');
    const onOnline = () => emitAppToast('Сеть появилась — связь восстанавливается', 'success');

    connection?.addEventListener?.('change', onConnectionChange);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      connection?.removeEventListener?.('change', onConnectionChange);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [enabled]);
}
