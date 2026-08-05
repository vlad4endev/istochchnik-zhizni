import { apiClient } from '../../lib/apiClient';
import { resolveAxiosBaseURL } from '../../lib/config';

export const MESSENGER_AUDIO_PLAY_EVENT = 'messenger-audio-play';

export type MessengerAudioSnapshot = {
  ownerId: string | null;
  playing: boolean;
  loading: boolean;
  current: number;
  duration: number;
  progress: number;
  rate: number;
};

export type MessengerAudioPlayRequest = {
  ownerId: string;
  /** URL вложения (API path / https / blob:). */
  src: string;
  title?: string;
  artist?: string;
  durationHintSec?: number;
  rate?: number;
  /** Продолжить с позиции (после seek до старта). */
  startAtSec?: number;
};

type Listener = (snap: MessengerAudioSnapshot) => void;

const listeners = new Set<Listener>();

let audio: HTMLAudioElement | null = null;
let ownedBlobUrl: string | null = null;
let ownedBlobSrcKey: string | null = null;
let activeOwnerId: string | null = null;
let activeSrcKey: string | null = null;
let loading = false;
let playGeneration = 0;
let mediaSessionBound = false;

function samePageOriginBaseURL(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return resolveAxiosBaseURL();
}

function needsAuthBlobFetch(url: string): boolean {
  return url.includes('/api/messenger/messages/') && url.includes('/attachment-file');
}

function toRequestPath(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const u = new URL(url);
      return `${u.pathname}${u.search}`;
    } catch {
      return url;
    }
  }
  return url;
}

function revokeOwnedBlob(): void {
  if (!ownedBlobUrl) return;
  try {
    URL.revokeObjectURL(ownedBlobUrl);
  } catch {
    /* ignore */
  }
  ownedBlobUrl = null;
  ownedBlobSrcKey = null;
}

function getAudio(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'metadata';
  audio.setAttribute('playsinline', 'true');
  audio.setAttribute('webkit-playsinline', 'true');

  audio.addEventListener('play', () => {
    pauseOtherPageMedia(audio);
    window.dispatchEvent(
      new CustomEvent(MESSENGER_AUDIO_PLAY_EVENT, { detail: { id: activeOwnerId } }),
    );
    syncMediaSession();
    emit();
  });
  audio.addEventListener('pause', () => {
    syncMediaSession();
    emit();
  });
  audio.addEventListener('timeupdate', () => emit());
  audio.addEventListener('durationchange', () => {
    syncMediaSession();
    emit();
  });
  audio.addEventListener('ended', () => {
    if (audio) {
      audio.currentTime = 0;
    }
    syncMediaSession();
    emit();
  });
  audio.addEventListener('error', () => {
    loading = false;
    emit();
  });

  return audio;
}

function pauseOtherPageMedia(except: HTMLAudioElement | null): void {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('audio, video').forEach((node) => {
    if (!(node instanceof HTMLMediaElement) || node === except) return;
    try {
      if (!node.paused) node.pause();
    } catch {
      /* ignore */
    }
  });
}

function snapshot(): MessengerAudioSnapshot {
  const el = audio;
  const duration =
    el && Number.isFinite(el.duration) && el.duration > 0
      ? el.duration
      : 0;
  const current = el ? el.currentTime : 0;
  return {
    ownerId: activeOwnerId,
    playing: Boolean(el && !el.paused && !el.ended),
    loading,
    current,
    duration,
    progress: duration > 0 ? current / duration : 0,
    rate: el?.playbackRate && el.playbackRate > 0 ? el.playbackRate : 1,
  };
}

function emit(): void {
  const snap = snapshot();
  for (const cb of listeners) {
    try {
      cb(snap);
    } catch {
      /* listener must not break others */
    }
  }
}

function syncMediaSession(): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  const el = audio;
  if (!el || !activeOwnerId) {
    try {
      ms.playbackState = 'none';
    } catch {
      /* ignore */
    }
    return;
  }

  if (!mediaSessionBound) {
    mediaSessionBound = true;
    try {
      ms.setActionHandler('play', () => {
        void el.play().catch(() => {});
      });
      ms.setActionHandler('pause', () => {
        el.pause();
      });
      ms.setActionHandler('stop', () => {
        el.pause();
        try {
          el.currentTime = 0;
        } catch {
          /* ignore */
        }
        emit();
      });
      ms.setActionHandler('seekbackward', (details) => {
        const delta = details.seekOffset ?? 10;
        el.currentTime = Math.max(0, el.currentTime - delta);
        emit();
      });
      ms.setActionHandler('seekforward', (details) => {
        const delta = details.seekOffset ?? 10;
        const max = Number.isFinite(el.duration) ? el.duration : el.currentTime + delta;
        el.currentTime = Math.min(max, el.currentTime + delta);
        emit();
      });
      ms.setActionHandler('seekto', (details) => {
        if (details.seekTime == null) return;
        el.currentTime = details.seekTime;
        emit();
      });
    } catch {
      /* some WebViews reject handlers */
    }
  }

  ms.playbackState = el.paused ? 'paused' : 'playing';
  const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
  if (duration > 0) {
    try {
      ms.setPositionState({
        duration,
        playbackRate: el.playbackRate || 1,
        position: Math.min(el.currentTime, duration),
      });
    } catch {
      /* rapid updates / unsupported */
    }
  }
}

function setMediaMetadata(title?: string, artist?: string): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: (title && title.trim()) || 'Голосовое сообщение',
      artist: (artist && artist.trim()) || 'Источник жизни',
      album: 'Мессенджер',
    });
  } catch {
    /* MediaMetadata unavailable */
  }
}

async function resolvePlayableSrc(src: string): Promise<string> {
  if (!needsAuthBlobFetch(src)) return src;
  if (ownedBlobUrl && ownedBlobSrcKey === src) return ownedBlobUrl;

  const path = toRequestPath(src);
  const { data } = await apiClient.get(path, {
    responseType: 'blob',
    baseURL: samePageOriginBaseURL(),
  });
  const objectUrl = URL.createObjectURL(data as Blob);
  revokeOwnedBlob();
  ownedBlobUrl = objectUrl;
  ownedBlobSrcKey = src;
  return objectUrl;
}

async function loadAndPlay(req: MessengerAudioPlayRequest): Promise<void> {
  const el = getAudio();
  const gen = ++playGeneration;
  activeOwnerId = req.ownerId;
  loading = true;
  emit();

  try {
    const playable = await resolvePlayableSrc(req.src);
    if (gen !== playGeneration || activeOwnerId !== req.ownerId) return;

    const sameSrc = activeSrcKey === req.src && Boolean(el.src);
    if (!sameSrc) {
      activeSrcKey = req.src;
      el.src = playable;
      el.load();
    }

    if (typeof req.rate === 'number' && req.rate > 0) {
      el.playbackRate = req.rate;
    }

    if (typeof req.startAtSec === 'number' && req.startAtSec > 0) {
      const applyStart = () => {
        if (gen !== playGeneration) return;
        try {
          const max = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : req.startAtSec!;
          el.currentTime = Math.min(max, req.startAtSec!);
        } catch {
          /* metadata not ready */
        }
      };
      applyStart();
      el.addEventListener('loadedmetadata', applyStart, { once: true });
    }

    setMediaMetadata(req.title, req.artist);
    loading = false;
    emit();
    await el.play();
    syncMediaSession();
    emit();
  } catch {
    if (gen === playGeneration) {
      loading = false;
      emit();
    }
  }
}

/** Подписка на состояние фонового плеера мессенджера. */
export function subscribeMessengerAudio(listener: Listener): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => {
    listeners.delete(listener);
  };
}

export function getMessengerAudioSnapshot(): MessengerAudioSnapshot {
  return snapshot();
}

/** Play/pause для конкретного вложения. Src принадлежит хосту на время воспроизведения. */
export function toggleMessengerAudio(req: MessengerAudioPlayRequest): void {
  const el = getAudio();
  if (activeOwnerId === req.ownerId && activeSrcKey === req.src && el.src) {
    if (!el.paused) {
      el.pause();
      emit();
      return;
    }
    if (typeof req.rate === 'number' && req.rate > 0) {
      el.playbackRate = req.rate;
    }
    void el.play().catch(() => {
      void loadAndPlay(req);
    });
    return;
  }
  void loadAndPlay(req);
}

export function pauseMessengerAudio(): void {
  const el = audio;
  if (el && !el.paused) el.pause();
  emit();
}

export function seekMessengerAudio(ownerId: string, timeSec: number): void {
  const el = audio;
  if (!el || activeOwnerId !== ownerId) return;
  const total = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : Infinity;
  el.currentTime = Math.max(0, Math.min(total, timeSec));
  emit();
  syncMediaSession();
}

export function setMessengerAudioRate(ownerId: string, rate: number): void {
  const el = audio;
  if (!el || activeOwnerId !== ownerId) return;
  if (!(rate > 0)) return;
  el.playbackRate = rate;
  emit();
  syncMediaSession();
}

/** Другой плеер в чате начал играть — остановить хост, если owner другой. */
export function pauseMessengerAudioIfOther(ownerId: string): void {
  if (!activeOwnerId || activeOwnerId === ownerId) return;
  const el = audio;
  if (el && !el.paused) el.pause();
  emit();
}
