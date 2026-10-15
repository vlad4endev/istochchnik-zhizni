import { apiClient } from '../../lib/apiClient';
import { resolveAxiosBaseURL } from '../../lib/config';

export const MESSENGER_AUDIO_PLAY_EVENT = 'messenger-audio-play';

/** axios иногда отдаёт blob без type — Safari тогда не играет. */
function blobWithMime(data: Blob, contentTypeHeader?: string): Blob {
  const headerType = String(contentTypeHeader ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const existing = String(data.type || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (existing && existing !== 'application/octet-stream') return data;
  if (headerType && headerType !== 'application/octet-stream') {
    return new Blob([data], { type: headerType });
  }
  return data;
}

export type MessengerAudioSnapshot = {
  ownerId: string | null;
  playing: boolean;
  loading: boolean;
  current: number;
  duration: number;
  progress: number;
  rate: number;
  title: string | null;
  variant: 'voice' | 'file' | null;
  conversationId: string | null;
  /** Есть ли следующее аудио в очереди текущего чата. */
  hasNext: boolean;
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
  conversationId?: string;
  variant?: 'voice' | 'file';
  /** Числовой ключ порядка в чате (обычно id сообщения). */
  sortKey?: number;
};

export type MessengerAudioTrackRegistration = {
  ownerId: string;
  src: string;
  title?: string;
  conversationId: string;
  variant?: 'voice' | 'file';
  sortKey: number;
  durationHintSec?: number;
};

type Listener = (snap: MessengerAudioSnapshot) => void;

const listeners = new Set<Listener>();
/** Треки, смонтированные в текущем чате (для автоплея следующего). */
const registeredTracks = new Map<string, MessengerAudioTrackRegistration>();

let audio: HTMLAudioElement | null = null;
let ownedBlobUrl: string | null = null;
let ownedBlobSrcKey: string | null = null;
let activeOwnerId: string | null = null;
let activeSrcKey: string | null = null;
let activeTitle: string | null = null;
let activeVariant: 'voice' | 'file' | null = null;
let activeConversationId: string | null = null;
let activeSortKey: number | null = null;
let loading = false;
let playGeneration = 0;
let mediaSessionBound = false;
let autoplayNextEnabled = true;

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

/** Сортировка очереди аудио в чате (экспорт для тестов). */
export function sortMessengerAudioTracks(
  tracks: MessengerAudioTrackRegistration[],
): MessengerAudioTrackRegistration[] {
  return [...tracks].sort((a, b) => a.sortKey - b.sortKey);
}

/** Следующий трек после ownerId в том же чате (экспорт для тестов / автоплея). */
export function findNextMessengerAudioTrack(
  tracks: MessengerAudioTrackRegistration[],
  ownerId: string | null,
  conversationId: string | null,
): MessengerAudioTrackRegistration | null {
  if (!ownerId || !conversationId) return null;
  const list = sortMessengerAudioTracks(
    tracks.filter((t) => t.conversationId === conversationId),
  );
  const idx = list.findIndex((t) => t.ownerId === ownerId);
  if (idx < 0) return null;
  return list[idx + 1] ?? null;
}

function findNextTrack(ownerId: string | null, conversationId: string | null): MessengerAudioTrackRegistration | null {
  return findNextMessengerAudioTrack(
    Array.from(registeredTracks.values()),
    ownerId,
    conversationId,
  );
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
    const next =
      autoplayNextEnabled && activeVariant === 'voice'
        ? findNextTrack(activeOwnerId, activeConversationId)
        : null;
    if (audio) {
      audio.currentTime = 0;
    }
    syncMediaSession();
    emit();
    if (next) {
      void loadAndPlay({
        ownerId: next.ownerId,
        src: next.src,
        title: next.title,
        conversationId: next.conversationId,
        variant: next.variant ?? 'voice',
        sortKey: next.sortKey,
        durationHintSec: next.durationHintSec,
        rate: audio?.playbackRate && audio.playbackRate > 0 ? audio.playbackRate : 1,
      });
    }
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
  const next = findNextTrack(activeOwnerId, activeConversationId);
  return {
    ownerId: activeOwnerId,
    playing: Boolean(el && !el.paused && !el.ended),
    loading,
    current,
    duration,
    progress: duration > 0 ? current / duration : 0,
    rate: el?.playbackRate && el.playbackRate > 0 ? el.playbackRate : 1,
    title: activeTitle,
    variant: activeVariant,
    conversationId: activeConversationId,
    hasNext: Boolean(next),
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
      ms.setActionHandler('nexttrack', () => {
        playNextMessengerAudio();
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
  const response = await apiClient.get(path, {
    responseType: 'blob',
    baseURL: samePageOriginBaseURL(),
    silentErrorToast: true,
  });
  const headerCt =
    typeof response.headers?.['content-type'] === 'string'
      ? response.headers['content-type']
      : typeof response.headers?.['Content-Type'] === 'string'
        ? response.headers['Content-Type']
        : undefined;
  const blob = blobWithMime(response.data as Blob, headerCt);
  const objectUrl = URL.createObjectURL(blob);
  revokeOwnedBlob();
  ownedBlobUrl = objectUrl;
  ownedBlobSrcKey = src;
  return objectUrl;
}

function withM4aTranscodeQuery(src: string): string | null {
  if (!needsAuthBlobFetch(src)) return null;
  if (/[?&]transcode=/i.test(src)) return null;
  const join = src.includes('?') ? '&' : '?';
  return `${src}${join}transcode=m4a`;
}

async function loadAndPlay(req: MessengerAudioPlayRequest): Promise<void> {
  const el = getAudio();
  const gen = ++playGeneration;
  activeOwnerId = req.ownerId;
  activeTitle = (req.title && req.title.trim()) || (req.variant === 'file' ? 'Аудиофайл' : 'Голосовое сообщение');
  activeVariant = req.variant ?? 'voice';
  activeConversationId = req.conversationId ?? activeConversationId;
  activeSortKey = typeof req.sortKey === 'number' && Number.isFinite(req.sortKey) ? req.sortKey : activeSortKey;
  loading = true;
  emit();

  const tryPlay = async (src: string): Promise<void> => {
    const playable = await resolvePlayableSrc(src);
    if (gen !== playGeneration || activeOwnerId !== req.ownerId) return;

    const sameSrc = activeSrcKey === src && Boolean(el.src);
    if (!sameSrc) {
      activeSrcKey = src;
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

    setMediaMetadata(activeTitle ?? undefined, req.artist);
    loading = false;
    emit();
    await el.play();
    syncMediaSession();
    emit();
  };

  try {
    await tryPlay(req.src);
  } catch {
    const fallback = withM4aTranscodeQuery(req.src);
    if (fallback && gen === playGeneration && activeOwnerId === req.ownerId) {
      try {
        loading = true;
        emit();
        revokeOwnedBlob();
        activeSrcKey = null;
        el.removeAttribute('src');
        el.load();
        await tryPlay(fallback);
        return;
      } catch {
        /* fall through */
      }
    }
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

/** Регистрация аудиосообщения в очереди чата (для автоплея следующего голосового). */
export function registerMessengerAudioTrack(track: MessengerAudioTrackRegistration): () => void {
  registeredTracks.set(track.ownerId, track);
  emit();
  return () => {
    const cur = registeredTracks.get(track.ownerId);
    if (cur && cur.src === track.src) {
      registeredTracks.delete(track.ownerId);
      emit();
    }
  };
}

export function setMessengerAudioAutoplayNext(enabled: boolean): void {
  autoplayNextEnabled = enabled;
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

/** Возобновить текущий трек без повторной загрузки (мини-плеер). */
export function playActiveMessengerAudio(): void {
  const el = audio;
  if (!el || !activeOwnerId || !el.src) return;
  void el.play().catch(() => {
    /* autoplay policy / decode */
  });
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

/** Seek без проверки owner — для мини-плеера. */
export function seekActiveMessengerAudio(timeSec: number): void {
  const el = audio;
  if (!el || !activeOwnerId) return;
  seekMessengerAudio(activeOwnerId, timeSec);
}

export function setMessengerAudioRate(ownerId: string, rate: number): void {
  const el = audio;
  if (!el || activeOwnerId !== ownerId) return;
  if (!(rate > 0)) return;
  el.playbackRate = rate;
  emit();
  syncMediaSession();
}

export function setActiveMessengerAudioRate(rate: number): void {
  if (!activeOwnerId) return;
  setMessengerAudioRate(activeOwnerId, rate);
}

export function playNextMessengerAudio(): boolean {
  const next = findNextTrack(activeOwnerId, activeConversationId);
  if (!next) return false;
  void loadAndPlay({
    ownerId: next.ownerId,
    src: next.src,
    title: next.title,
    conversationId: next.conversationId,
    variant: next.variant ?? 'voice',
    sortKey: next.sortKey,
    durationHintSec: next.durationHintSec,
    rate: audio?.playbackRate && audio.playbackRate > 0 ? audio.playbackRate : 1,
  });
  return true;
}

export function stopMessengerAudio(): void {
  const el = audio;
  if (el) {
    el.pause();
    try {
      el.currentTime = 0;
    } catch {
      /* ignore */
    }
  }
  activeOwnerId = null;
  activeSrcKey = null;
  activeTitle = null;
  activeVariant = null;
  // conversationId оставляем — очередь чата ещё актуальна
  loading = false;
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
