import type { BroadcastData } from '../api/broadcast';
import { parseBroadcastStartsAt } from './broadcastStartsAt';

/** Длительность слота эфира от времени начала (настройки): ровно 2 часа. */
export const BROADCAST_SLOT_MS = 2 * 60 * 60 * 1000;

export function broadcastHasStreamUrl(b: BroadcastData | null | undefined): boolean {
  return Boolean(String(b?.stream_url ?? '').trim());
}

export type BroadcastUiMode = 'hidden' | 'pre' | 'onair' | 'post';

/**
 * Режим отображения: до начала, в эфире (по статусу или по времени + ссылке), слот закончился.
 */
export function getBroadcastUiMode(nowMs: number, b: BroadcastData | null): BroadcastUiMode {
  if (!b || b.status === 'finished') return 'hidden';

  const startsAtMs = parseBroadcastStartsAt(b.starts_at)?.getTime() ?? NaN;
  const hasStart = Number.isFinite(startsAtMs);
  const hasStream = broadcastHasStreamUrl(b);
  const endMs = hasStart ? startsAtMs + BROADCAST_SLOT_MS : Number.POSITIVE_INFINITY;

  if (b.status === 'live') {
    if (!hasStart) return 'onair';
    return nowMs >= endMs ? 'post' : 'onair';
  }

  if (!hasStart) return 'hidden';

  if (nowMs >= endMs) return 'post';

  if (nowMs >= startsAtMs) {
    return hasStream ? 'onair' : 'pre';
  }

  return 'pre';
}

export function shouldShowBroadcastWidget(nowMs: number, b: BroadcastData | null): boolean {
  const mode = getBroadcastUiMode(nowMs, b);
  if (mode === 'onair') return true;
  if (mode !== 'pre') return false;
  if (!b?.starts_at) return false;
  const startsAtMs = parseBroadcastStartsAt(b.starts_at)?.getTime() ?? NaN;
  if (!Number.isFinite(startsAtMs)) return false;
  return nowMs >= startsAtMs - BROADCAST_SLOT_MS;
}

export function formatBroadcastMainTimer(nowMs: number, b: BroadcastData | null): string {
  if (!b?.starts_at || b.status === 'finished') return '—';
  const startsAtMs = parseBroadcastStartsAt(b.starts_at)?.getTime() ?? NaN;
  if (!Number.isFinite(startsAtMs)) return '—';

  const mode = getBroadcastUiMode(nowMs, b);
  if (mode === 'post' || mode === 'hidden') return '—';

  const isOnAir = mode === 'onair';
  const diff = isOnAir
    ? Math.max(0, nowMs - startsAtMs)
    : Math.max(0, startsAtMs - nowMs);

  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1_000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatBroadcastCountdownPhrase(nowMs: number, startsAt: string | null): string | null {
  if (!startsAt) return null;
  const startsAtMs = parseBroadcastStartsAt(startsAt)?.getTime() ?? NaN;
  if (!Number.isFinite(startsAtMs)) return null;
  const diffMs = startsAtMs - nowMs;
  if (diffMs <= 0) return null;
  const totalMinutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `До начала: ${hours} ч ${minutes} мин`;
}
