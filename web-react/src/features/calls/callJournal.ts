import {
  ConnectionState,
  ParticipantEvent,
  RoomEvent,
  type Participant,
  type Room,
} from 'livekit-client';

import { apiClient } from '../../lib/apiClient';
import { isCookieOnlySessionToken } from '../../lib/authSessionConstants';
import { resolveAxiosBaseURL } from '../../lib/config';
import { useAuthStore } from '../auth/authStore';

/**
 * Клиентский журнал звонка: буферизует события LiveKit (подключение, reconnect,
 * качество, ошибки устройств, сэмплы WebRTC-статистики) и периодически отправляет
 * на сервер для админ-аналитики (Настройки → Звонки → Журнал).
 */

export type CallJournalSeverity = 'info' | 'warn' | 'error';

type JournalEvent = {
  kind: string;
  severity?: CallJournalSeverity;
  at: string;
  payload?: Record<string, unknown>;
};

const FLUSH_INTERVAL_MS = 10_000;
const STATS_INTERVAL_MS = 15_000;
const MAX_BUFFERED_EVENTS = 400;
const MAX_BATCH_PER_FLUSH = 100;

const buffers = new Map<string, JournalEvent[]>();
const flushTimers = new Map<string, number>();
let pagehideBound = false;

function bindPagehideFlush(): void {
  if (pagehideBound || typeof window === 'undefined') return;
  pagehideBound = true;
  window.addEventListener('pagehide', () => {
    for (const callId of buffers.keys()) {
      flushCallJournal(callId, { keepalive: true });
    }
  });
}

export function startCallJournal(callId: string): void {
  if (typeof window === 'undefined') return;
  if (!buffers.has(callId)) buffers.set(callId, []);
  if (flushTimers.has(callId)) return;
  bindPagehideFlush();
  const timer = window.setInterval(() => flushCallJournal(callId), FLUSH_INTERVAL_MS);
  flushTimers.set(callId, timer);
}

export function stopCallJournal(callId: string): void {
  const timer = flushTimers.get(callId);
  if (timer != null) {
    window.clearInterval(timer);
    flushTimers.delete(callId);
  }
  flushCallJournal(callId, { keepalive: true });
}

export function logCallEvent(
  callId: string,
  kind: string,
  opts?: { severity?: CallJournalSeverity; payload?: Record<string, unknown> },
): void {
  const buffer = buffers.get(callId);
  if (!buffer) return; // журнал не запущен для этого звонка
  if (buffer.length >= MAX_BUFFERED_EVENTS) buffer.shift();
  buffer.push({
    kind,
    severity: opts?.severity,
    at: new Date().toISOString(),
    payload: opts?.payload,
  });
}

export function flushCallJournal(callId: string, opts?: { keepalive?: boolean }): void {
  const buffer = buffers.get(callId);
  if (!buffer || buffer.length === 0) return;
  const batch = buffer.splice(0, MAX_BATCH_PER_FLUSH);
  if (opts?.keepalive) {
    sendViaKeepalive(callId, batch);
    return;
  }
  void apiClient
    .post(
      `/api/calls/${encodeURIComponent(callId)}/journal`,
      { events: batch },
      { silentErrorToast: true, skipAuthClearOn401: true, timeout: 8000 },
    )
    .catch((err: unknown) => {
      // 4xx/5xx — сервер отклонил: не переочередничаем. Сетевой сбой — вернём в буфер.
      if ((err as { response?: unknown } | null)?.response) return;
      const current = buffers.get(callId);
      if (!current) return;
      buffers.set(callId, [...batch, ...current].slice(-MAX_BUFFERED_EVENTS));
    });
}

/** keepalive-fetch работает при закрытии вкладки и принимает заголовки (в отличие от sendBeacon). */
function sendViaKeepalive(callId: string, events: JournalEvent[]): void {
  try {
    const base = resolveAxiosBaseURL();
    const url = `${base}/api/calls/${encodeURIComponent(callId)}/journal`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = useAuthStore.getState().token;
    if (token && !isCookieOnlySessionToken(token)) {
      headers.Authorization = `Bearer ${token}`;
    }
    void fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ events }),
      credentials: 'include',
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* ignore */
  }
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Сводка RTC-статистики по аудиотрекам (outbound local + inbound remote). */
async function sampleRtcStats(room: Room, callId: string): Promise<void> {
  if (room.state !== ConnectionState.Connected) return;
  const reports: RTCStatsReport[] = [];
  for (const pub of room.localParticipant.audioTrackPublications.values()) {
    const track = pub.track;
    if (!track) continue;
    try {
      const report = await track.getRTCStatsReport();
      if (report) reports.push(report);
    } catch {
      /* ignore */
    }
  }
  for (const participant of room.remoteParticipants.values()) {
    for (const pub of participant.audioTrackPublications.values()) {
      const track = pub.track;
      if (!track) continue;
      try {
        const report = await track.getRTCStatsReport();
        if (report) reports.push(report);
      } catch {
        /* ignore */
      }
    }
  }
  if (reports.length === 0) return;

  let rttMs: number | null = null;
  let jitterMs: number | null = null;
  let packetsLost = 0;
  let packetsReceived = 0;
  let packetsSent = 0;

  for (const report of reports) {
    report.forEach((raw) => {
      const s = raw as unknown as Record<string, unknown>;
      const type = s.type;
      if (type === 'remote-inbound-rtp') {
        const rtt = s.roundTripTime;
        if (typeof rtt === 'number' && Number.isFinite(rtt)) {
          const v = round1(rtt * 1000);
          rttMs = rttMs == null ? v : Math.max(rttMs, v);
        }
        const jitter = s.jitter;
        if (typeof jitter === 'number' && Number.isFinite(jitter)) {
          const v = round1(jitter * 1000);
          jitterMs = jitterMs == null ? v : Math.max(jitterMs, v);
        }
        const lost = s.packetsLost;
        if (typeof lost === 'number' && Number.isFinite(lost)) packetsLost += Math.max(0, lost);
      } else if (type === 'inbound-rtp' && s.kind === 'audio') {
        const jitter = s.jitter;
        if (typeof jitter === 'number' && Number.isFinite(jitter)) {
          const v = round1(jitter * 1000);
          jitterMs = jitterMs == null ? v : Math.max(jitterMs, v);
        }
        const lost = s.packetsLost;
        if (typeof lost === 'number' && Number.isFinite(lost)) packetsLost += Math.max(0, lost);
        const recv = s.packetsReceived;
        if (typeof recv === 'number' && Number.isFinite(recv)) packetsReceived += recv;
      } else if (type === 'outbound-rtp' && s.kind === 'audio') {
        const sent = s.packetsSent;
        if (typeof sent === 'number' && Number.isFinite(sent)) packetsSent += sent;
      } else if (type === 'candidate-pair' && s.nominated === true) {
        const rtt = s.currentRoundTripTime;
        if (typeof rtt === 'number' && Number.isFinite(rtt) && rtt > 0) {
          const v = round1(rtt * 1000);
          rttMs = rttMs == null ? v : Math.min(rttMs, v);
        }
      }
    });
  }

  if (rttMs == null && jitterMs == null && packetsReceived === 0 && packetsSent === 0) return;
  logCallEvent(callId, 'stats_sample', {
    payload: { rttMs, jitterMs, packetsLost, packetsReceived, packetsSent },
  });
}

function participantLabel(p: Participant): string {
  const name = String(p.name || '').trim();
  if (name) return name;
  return String(p.identity || '').replace(/^member:/, '') || 'unknown';
}

type NavigatorWithConnection = Navigator & {
  connection?: { effectiveType?: string; downlink?: number; rtt?: number; addEventListener?: (t: string, cb: () => void) => void; removeEventListener?: (t: string, cb: () => void) => void };
};

/**
 * Подписка на события комнаты. Возвращает detach. Сам журнал (start/stop) управляется снаружи.
 */
export function attachCallJournal(room: Room, callId: string): () => void {
  let lastState: ConnectionState | null = null;

  const onConnectionState = (state: ConnectionState) => {
    const prev = lastState;
    lastState = state;
    if (state === ConnectionState.Connecting) {
      logCallEvent(callId, 'connecting');
    } else if (state === ConnectionState.Connected) {
      logCallEvent(
        callId,
        prev === ConnectionState.Reconnecting || prev === ConnectionState.SignalReconnecting
          ? 'reconnected'
          : 'connected',
      );
    } else if (state === ConnectionState.Reconnecting) {
      logCallEvent(callId, 'reconnecting', { severity: 'warn' });
    } else if (state === ConnectionState.SignalReconnecting) {
      logCallEvent(callId, 'signal_reconnecting', { severity: 'warn' });
    }
    // Disconnected логируется через RoomEvent.Disconnected — там есть reason.
  };

  const onDisconnected = (reason?: unknown) => {
    logCallEvent(callId, 'disconnected', {
      severity: 'warn',
      payload: { reason: reason != null ? String(reason) : null },
    });
  };

  const onMediaDevicesError = (error: Error, kind?: string) => {
    logCallEvent(callId, 'device_error', {
      severity: 'error',
      payload: { message: String(error?.message ?? error), device: kind ?? null },
    });
  };

  const onAudioPlayback = (playing: boolean) => {
    if (!playing) logCallEvent(callId, 'audio_playback_blocked', { severity: 'warn' });
  };

  const onParticipantConnected = (p: Participant) => {
    logCallEvent(callId, 'participant_joined', {
      payload: { identity: String(p.identity ?? ''), name: participantLabel(p) },
    });
  };
  const onParticipantDisconnected = (p: Participant) => {
    logCallEvent(callId, 'participant_left', {
      payload: { identity: String(p.identity ?? ''), name: participantLabel(p) },
    });
  };

  const onLocalQuality = (quality: unknown) => {
    logCallEvent(callId, 'quality_changed', { payload: { quality: String(quality) } });
  };

  const onTrackMuted = (track: unknown) => {
    const source = (track as { source?: unknown })?.source;
    logCallEvent(callId, 'media_toggle', {
      payload: { source: typeof source === 'string' ? source : String(source ?? ''), muted: true },
    });
  };
  const onTrackUnmuted = (track: unknown) => {
    const source = (track as { source?: unknown })?.source;
    logCallEvent(callId, 'media_toggle', {
      payload: { source: typeof source === 'string' ? source : String(source ?? ''), muted: false },
    });
  };

  const onOnline = () => logCallEvent(callId, 'network_changed', { payload: { online: true } });
  const onOffline = () =>
    logCallEvent(callId, 'network_changed', { severity: 'warn', payload: { online: false } });
  const connection = typeof navigator !== 'undefined' ? (navigator as NavigatorWithConnection).connection : undefined;
  const onConnectionChange = () => {
    if (!connection) return;
    logCallEvent(callId, 'network_changed', {
      payload: {
        effectiveType: connection.effectiveType ?? null,
        downlink: connection.downlink ?? null,
        rtt: connection.rtt ?? null,
      },
    });
  };

  room.on(RoomEvent.ConnectionStateChanged, onConnectionState);
  room.on(RoomEvent.Disconnected, onDisconnected);
  room.on(RoomEvent.MediaDevicesError, onMediaDevicesError);
  room.on(RoomEvent.AudioPlaybackStatusChanged, onAudioPlayback);
  room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
  room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
  room.localParticipant.on(ParticipantEvent.ConnectionQualityChanged, onLocalQuality);
  room.localParticipant.on(ParticipantEvent.TrackMuted, onTrackMuted);
  room.localParticipant.on(ParticipantEvent.TrackUnmuted, onTrackUnmuted);
  if (typeof window !== 'undefined') {
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
  }
  connection?.addEventListener?.('change', onConnectionChange);

  const statsTimer =
    typeof window !== 'undefined'
      ? window.setInterval(() => {
          void sampleRtcStats(room, callId);
        }, STATS_INTERVAL_MS)
      : null;

  // Текущее состояние сразу (подписка могла произойти после connect).
  onConnectionState(room.state);

  return () => {
    room.off(RoomEvent.ConnectionStateChanged, onConnectionState);
    room.off(RoomEvent.Disconnected, onDisconnected);
    room.off(RoomEvent.MediaDevicesError, onMediaDevicesError);
    room.off(RoomEvent.AudioPlaybackStatusChanged, onAudioPlayback);
    room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
    room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
    room.localParticipant.off(ParticipantEvent.ConnectionQualityChanged, onLocalQuality);
    room.localParticipant.off(ParticipantEvent.TrackMuted, onTrackMuted);
    room.localParticipant.off(ParticipantEvent.TrackUnmuted, onTrackUnmuted);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    }
    connection?.removeEventListener?.('change', onConnectionChange);
    if (statsTimer != null) window.clearInterval(statsTimer);
  };
}

