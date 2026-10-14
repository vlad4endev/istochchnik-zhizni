import axios from 'axios';

import { apiClient } from '../../lib/apiClient';
import { resolveAxiosBaseURL } from '../../lib/config';
import { fetchMessageAttachmentUrl } from './api/messengerApi';
import { browserCanPlayWebmAudio } from './chatAudio';

export const MESSENGER_AUDIO_PLAY_EVENT = 'messenger-audio-play';

export type MessengerAudioSnapshot = {
  ownerId: string | null;
  playing: boolean;
  loading: boolean;
  error: string | null;
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
let lastError: string | null = null;
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

function extractMessageIdFromAttachmentUrl(url: string): string | null {
  const m = String(url).match(/\/api\/messenger\/messages\/(\d+)\/attachment-file/i);
  return m?.[1] ?? null;
}

function withQueryParam(url: string, key: string, value: string): string {
  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const u = new URL(url);
      u.searchParams.set(key, value);
      return u.toString();
    }
  } catch {
    /* relative */
  }
  const [path, qs = ''] = url.split('?');
  const params = new URLSearchParams(qs);
  params.set(key, value);
  const next = params.toString();
  return next ? `${path}?${next}` : path;
}

function attachmentUrlHasTranscode(url: string): boolean {
  return /[?&]transcode=/i.test(url);
}

function guessAudioMimeFromSrc(src: string, headerType?: string): string {
  const header = String(headerType || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (header.startsWith('audio/')) return header;
  if (header === 'video/webm' || /(?:^|[?&])transcode=m4a(?:&|$)/i.test(src)) {
    if (/(?:^|[?&])transcode=m4a(?:&|$)/i.test(src)) return 'audio/mp4';
  }
  const path = src.split(/[?#]/)[0].toLowerCase();
  if (path.endsWith('.m4a') || path.endsWith('.mp4')) return 'audio/mp4';
  if (path.endsWith('.mp3')) return 'audio/mpeg';
  if (path.endsWith('.ogg') || path.endsWith('.oga') || path.endsWith('.opus')) return 'audio/ogg';
  if (path.endsWith('.wav')) return 'audio/wav';
  if (path.endsWith('.aac')) return 'audio/aac';
  if (path.endsWith('.webm') || header === 'video/webm') return 'audio/webm';
  return header || 'audio/webm';
}

function asPlayableAudioBlob(data: Blob, src: string, headerType?: string): Blob {
  const type = String(data.type || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (type.startsWith('application/json') || type.startsWith('text/')) {
    throw new Error('attachment_not_binary');
  }
  const wanted = guessAudioMimeFromSrc(src, headerType || type);
  if (type.startsWith('audio/') && type !== 'audio/webm') return data;
  // video/webm / octet-stream / empty — пересобираем с audio MIME для HTMLAudioElement.
  if (!type || type === 'application/octet-stream' || type.startsWith('video/') || type !== wanted) {
    return new Blob([data], { type: wanted });
  }
  return data;
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
  audio.controls = false;

  audio.addEventListener('play', () => {
    pauseOtherPageMedia(audio);
    lastError = null;
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
    const code = audio?.error?.code;
    lastError =
      code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
        ? 'Формат не поддерживается'
        : 'Не удалось воспроизвести';
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
    error: lastError,
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

async function fetchAttachmentBlob(fetchSrc: string, cacheKey: string): Promise<string> {
  const path = toRequestPath(fetchSrc);
  const { data, headers, status } = await apiClient.get(path, {
    responseType: 'blob',
    baseURL: samePageOriginBaseURL(),
    timeout: 120_000,
    headers: { Accept: '*/*' },
    silentErrorToast: true,
  });
  if (status >= 400) {
    throw new Error(`attachment_http_${status}`);
  }
  const headerType =
    typeof headers['content-type'] === 'string'
      ? headers['content-type']
      : Array.isArray(headers['content-type'])
        ? headers['content-type'][0]
        : undefined;
  const blob = asPlayableAudioBlob(data as Blob, fetchSrc, headerType);
  const objectUrl = URL.createObjectURL(blob);
  revokeOwnedBlob();
  ownedBlobUrl = objectUrl;
  ownedBlobSrcKey = cacheKey;
  return objectUrl;
}

async function resolvePlayableSrc(src: string): Promise<string> {
  if (!needsAuthBlobFetch(src)) return src;
  if (ownedBlobUrl && ownedBlobSrcKey === src) return ownedBlobUrl;

  let fetchSrc = src;
  if (!browserCanPlayWebmAudio() && !attachmentUrlHasTranscode(src)) {
    fetchSrc = withQueryParam(src, 'transcode', 'm4a');
  }

  try {
    return await fetchAttachmentBlob(fetchSrc, src);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    // Крупные файлы (> proxy limit) — стримим через signed/public URL.
    if (status === 413) {
      const messageId = extractMessageIdFromAttachmentUrl(src);
      if (messageId) {
        const { url } = await fetchMessageAttachmentUrl(messageId);
        if (url) return url;
      }
    }
    // Если без транскода не вышло — пробуем m4a (Safari / старый Chrome).
    if (!attachmentUrlHasTranscode(fetchSrc)) {
      try {
        return await fetchAttachmentBlob(withQueryParam(src, 'transcode', 'm4a'), src);
      } catch {
        /* fall through */
      }
    }
    throw err;
  }
}

function waitForCanPlay(el: HTMLAudioElement, gen: number): Promise<void> {
  if (el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error('audio_load_failed'));
    };
    const timer = window.setTimeout(() => {
      cleanup();
      // metadata может не прийти для части стримов — всё равно пробуем play()
      resolve();
    }, 12_000);
    const cleanup = () => {
      window.clearTimeout(timer);
      el.removeEventListener('canplay', onReady);
      el.removeEventListener('loadeddata', onReady);
      el.removeEventListener('error', onErr);
    };
    el.addEventListener('canplay', onReady, { once: true });
    el.addEventListener('loadeddata', onReady, { once: true });
    el.addEventListener('error', onErr, { once: true });
    if (gen !== playGeneration) {
      cleanup();
      resolve();
    }
  });
}

async function loadAndPlay(req: MessengerAudioPlayRequest): Promise<void> {
  const el = getAudio();
  const gen = ++playGeneration;
  activeOwnerId = req.ownerId;
  loading = true;
  lastError = null;
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
    await waitForCanPlay(el, gen);
    if (gen !== playGeneration || activeOwnerId !== req.ownerId) return;

    loading = false;
    emit();
    await el.play();
    lastError = null;
    syncMediaSession();
    emit();
  } catch (err) {
    if (gen !== playGeneration) return;
    loading = false;
    lastError =
      axios.isAxiosError(err) && err.response?.status === 413
        ? 'Файл слишком большой для воспроизведения'
        : 'Не удалось загрузить аудио';
    emit();
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
    lastError = null;
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
