import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import type { MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import { useChatStore, isDraftPrivateConversationId } from '../chatStore';
import {
  LuPaperclip,
  LuSmile,
  LuX,
  LuImage,
  LuVideo,
  LuFileText,
  LuChartColumn,
  LuMic,
  LuMusic,
} from 'react-icons/lu';
import * as api from '../api/messengerApi';
import Picker from '@emoji-mart/react';
import emojiData from '@emoji-mart/data';
import { PollCreateModal } from './PollCreateModal';
import {
  buildMentionToken,
  denormalizeMentionsForEditor,
  isCompletedVisualMentionFragment,
  MENTION_ID_WRAP,
  normalizeMentionsToCanonical,
} from '../mentionUtils';
import { compressImageForMessengerUpload } from '../compressImageForUpload';
import { MessengerPlainText } from '../messengerPlainText';
import axios from 'axios';
import { emitAppToast } from '../../../lib/uiFeedback';
import {
  audioDisplayTitle,
  CHAT_AUDIO_ACCEPT,
  isChatAudioFile,
  readAudioFileDurationSec,
} from '../chatAudio';
import {
  voiceBlobFileName,
  voiceRecorderOptions,
  videoNoteBlobFileName,
  videoNoteRecorderOptions,
} from '../voiceRecording';
import { VoiceMessageAttachment } from './VoiceMessageAttachment';

function toastMessengerUploadError(e: unknown): void {
  const err = e as Error & { code?: string };
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as { error?: string; code?: string } | undefined;
    if (data?.code === 'supabase_not_configured') {
      emitAppToast({
        message: 'Загрузка файлов временно недоступна (хранилище не настроено).',
        kind: 'error',
        adminOnly: true,
      });
      return;
    }
    if (typeof data?.error === 'string' && data.error.trim()) {
      emitAppToast(data.error.trim(), 'error');
      return;
    }
  }
  if (typeof err?.code === 'string' && err.code === 'supabase_not_configured') {
    emitAppToast({
      message: 'Загрузка файлов временно недоступна (хранилище не настроено).',
      kind: 'error',
      adminOnly: true,
    });
    return;
  }
  emitAppToast('Не удалось загрузить файл', 'error');
}

type PendingAttachment = {
  file: File;
  isImage: boolean;
  isAudio?: boolean;
  previewUrl: string | null;
  uploaded?: api.UploadedFile | null;
  durationSec?: number;
};

type UploadingState = {
  name: string;
  size: number;
  kind: 'file' | 'audio' | 'video_note';
  previewUrl?: string | null;
};

const IMAGE_NAME_EXT_RE = /\.(jpe?g|png|webp|gif|heic|heif)$/i;
const VIDEO_NAME_EXT_RE = /\.(mp4|m4v|mov|webm|mkv|avi|mpeg|mpg|3gp|ogv)$/i;
const MAX_CHAT_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_CHAT_VIDEO_BYTES = 1024 * 1024 * 1024;

function isChatVideoFile(f: File): boolean {
  return (f.type || '').startsWith('video/') || VIDEO_NAME_EXT_RE.test(String(f.name || '').trim());
}
function isChatImageFile(f: File): boolean {
  return (f.type || '').startsWith('image/') || IMAGE_NAME_EXT_RE.test(String(f.name || '').trim());
}
function isChatPhotoOrVideoFile(f: File): boolean {
  return isChatImageFile(f) || isChatVideoFile(f);
}

/** iOS PWA: обычный focus() скроллит предков с overflow — ломает fixed-окно чата; preventScroll оставляет скролл только в ленте. */
function focusMessengerField(el: HTMLElement | null): void {
  if (!el) return;
  try {
    el.focus({ preventScroll: true });
  } catch {
    try {
      el.focus();
    } catch {
      /* ignore */
    }
  }
}

type PopoverPos =
  | {
      bottomPx: number;
      leftPx?: number;
      rightPx?: number;
      /** Панель на всю ширину (как Telegram на телефоне). */
      layout?: 'anchored' | 'sheet';
      maxHeightPx?: number;
    }
  | null;

function useMatchMedia(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Клик внутри popover / shadow DOM (emoji-mart): обычный Node.contains() не видит узлы в shadow root. */
function isDomEventInside(event: Event, ...roots: Array<HTMLElement | null>): boolean {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  const target = event.target;
  for (const root of roots) {
    if (!root) continue;
    if (target instanceof Node && root.contains(target)) return true;
    if (path.length > 0 && path.includes(root)) return true;
  }
  return false;
}

/** Только `NNpx` из :root (PWA: nativeShellViewport перезаписывает --viewport-height). `100dvh` не парсим. */
function readRootViewportHeightPx(): number | null {
  if (typeof document === 'undefined') return null;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--viewport-height').trim();
  const m = /^([\d.]+)px$/i.exec(raw);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 120 ? n : null;
}

/** Высота окна для fixed-поповера: совпадает с оболочкой PWA, иначе visualViewport / innerHeight. */
function messengerLayoutViewportHeight(): number {
  const fromShell = readRootViewportHeightPx();
  if (fromShell != null) return Math.round(fromShell);
  const vv = typeof window !== 'undefined' ? window.visualViewport : undefined;
  if (vv && vv.height >= 120) return Math.round(vv.height);
  return Math.round(typeof window !== 'undefined' ? window.innerHeight : 0);
}

interface ChatInputProps {
  conversationId: string;
  sendTypingStart: (convId: string) => void;
  sendTypingStop: (convId: string) => void;
  canSend: boolean;
  /** Медиа/файлы (отдельное право в группах/каналах). По умолчанию совпадает с возможностью писать текст. */
  canSendAttachments?: boolean;
  /**
   * Только текст: скрыть скрепку, микрофон и предупреждение про отключённые вложения.
   * Для чата «ИИ помощник».
   */
  textOnly?: boolean;
  /** Участники для @-упоминаний (группы/каналы). */
  mentionParticipants?: { id: number; label: string }[];
  /** Имена по id — чтобы при редактировании показывать @Имя, а не @[цифры]. */
  participantLabelById?: Record<number, string>;
  /** Текст плейсхолдера поля ввода. */
  placeholder?: string;
}

/** Одна визуальная строка без учёта переноса placeholder (иначе на iPhone поле раздувается на весь scrollHeight). */
function singleLineTextareaHeightPx(el: HTMLTextAreaElement): number {
  const cs = getComputedStyle(el);
  const fontSize = parseFloat(cs.fontSize) || 16;
  const lhRaw = cs.lineHeight;
  const line =
    lhRaw === 'normal' ? Math.round(fontSize * 1.5) : parseFloat(lhRaw) || Math.round(fontSize * 1.5);
  const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
  return Math.ceil(line + padY);
}

/** Только высота: ширина — на всю полосу пузыря (как в Telegram), иначе узкий width ломает плейсхолдер и baseline иконок. */
function scheduleTextareaAutosize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.width = '';
  el.style.maxWidth = '';
  el.style.height = 'auto';
  requestAnimationFrame(() => {
    const valueEmpty = !String(el.value ?? '').trim();
    if (valueEmpty) {
      el.style.height = `${Math.max(44, singleLineTextareaHeightPx(el))}px`;
      return;
    }
    const maxParsed = parseFloat(getComputedStyle(el).maxHeight);
    const cap = Number.isFinite(maxParsed) && maxParsed > 0 ? maxParsed : 240;
    el.style.height = `${Math.min(el.scrollHeight, cap)}px`;
  });
}

/** Ширина меню вложений ≈ Tailwind `w-56` (14rem). */
const ATTACH_MENU_WIDTH_PX = 224;
/** Совпадает с max-шириной `.tg-emoji-picker-popover` в messenger.css. */
const EMOJI_PICKER_MAX_WIDTH_PX = 360;

function computeAttachPopoverPos(rect: DOMRect): PopoverPos {
  const pad = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(ATTACH_MENU_WIDTH_PX, vw - 2 * pad);
  const bottomPx = Math.max(pad, Math.round(vh - rect.top + 8));
  const leftRaw = Math.round(rect.left);
  const leftPx = Math.max(pad, Math.min(leftRaw, vw - pad - w));
  return { bottomPx, leftPx };
}

/** Правый край у кнопки на десктопе; на телефоне — шит на всю ширину над полем ввода. */
function computeEmojiPopoverPos(rect: DOMRect, useSheetLayout: boolean): PopoverPos {
  const pad = 12;
  const vw = window.innerWidth;
  const layoutH = messengerLayoutViewportHeight();
  const bottomPx = Math.max(pad, Math.round(layoutH - rect.top + 8));

  if (useSheetLayout) {
    const maxHeightPx = Math.max(
      220,
      Math.min(Math.round(layoutH * 0.55), Math.max(pad * 2, Math.round(rect.top - pad))),
    );
    return { bottomPx, layout: 'sheet', leftPx: 0, rightPx: 0, maxHeightPx };
  }

  const w = Math.min(EMOJI_PICKER_MAX_WIDTH_PX, vw - 2 * pad);
  const anchorRight = Math.min(rect.right, vw - pad);
  let leftPx = Math.round(anchorRight - w);
  leftPx = Math.max(pad, Math.min(leftPx, vw - pad - w));
  return { bottomPx, leftPx, layout: 'anchored' };
}

export function ChatInput({
  conversationId,
  sendTypingStart,
  sendTypingStop,
  canSend,
  canSendAttachments = true,
  textOnly = false,
  mentionParticipants = [],
  participantLabelById = {},
  placeholder = 'Сообщение',
}: ChatInputProps) {
  const sendMessage = useChatStore((s) => s.sendMessage);
  const editMessage = useChatStore((s) => s.editMessage);
  const replyTo = useChatStore((s) => s.replyToMessage);
  const editing = useChatStore((s) => s.editingMessage);
  const setReplyTo = useChatStore((s) => s.setReplyTo);
  const setEditing = useChatStore((s) => s.setEditing);
  const replyingTo = useChatStore((s) => s.replyingTo);
  const setReplyingTo = useChatStore((s) => s.setReplyingTo);
  const saveDraft = useChatStore((s) => s.saveDraft);
  const clearDraft = useChatStore((s) => s.clearDraft);

  const [content, setContent] = useState('');
  const [pending, setPending] = useState<PendingAttachment | null>(null);
  const [pendingImages, setPendingImages] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState<UploadingState | null>(null);
  const [uploadPct, setUploadPct] = useState<number>(0);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [uploadsHealthy, setUploadsHealthy] = useState(true);
  const [uploadsHealthChecking, setUploadsHealthChecking] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [previewMediaKind, setPreviewMediaKind] = useState<'image' | 'video'>('image');
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachMenuPresent, setAttachMenuPresent] = useState(false);
  const [attachMenuExiting, setAttachMenuExiting] = useState(false);
  const [emojiPresent, setEmojiPresent] = useState(false);
  const [emojiExiting, setEmojiExiting] = useState(false);
  const [pollModalOpen, setPollModalOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /**
   * iOS Safari: скрытый `<input type="file">` рядом с textarea попадает в «цепочку полей» над клавиатурой
   * (стрелки + Done). Держим file input disabled и включаем только на один тик вокруг `.click()` —
   * тогда WebKit обычно не считает его вторым полем при фокусе в поле сообщения.
   */
  useLayoutEffect(() => {
    const el = fileInputRef.current;
    if (el) el.disabled = true;
  }, []);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const attachBtnRef = useRef<HTMLButtonElement>(null);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);
  const attachPopoverRef = useRef<HTMLDivElement>(null);
  const emojiPopoverRef = useRef<HTMLDivElement>(null);
  /** Игнорировать один кадр outside-click после открытия (ghost click / тот же жест на touch). */
  const emojiOutsideGraceRef = useRef(false);
  const [attachPos, setAttachPos] = useState<PopoverPos>(null);
  const [emojiPos, setEmojiPos] = useState<PopoverPos>(null);
  /** ≤768px: панель эмодзи на всю ширину, крупные ячейки (как Telegram на телефоне). */
  const narrowEmojiSheet = useMatchMedia('(max-width: 768px)');
  const uploadAbortRef = useRef<AbortController | null>(null);
  const filePickerModeRef = useRef<'image' | 'file' | 'audio'>('image');
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingStartDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionStart, setMentionStart] = useState(0);
  const [mentionFiltered, setMentionFiltered] = useState<{ id: number; label: string }[]>([]);
  const [mentionHighlight, setMentionHighlight] = useState(0);
  const lastOpenedEditIdRef = useRef<string | null>(null);
  const uploadsHealthTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** IME (иероглифы и т.п.): не отправлять по Enter в середине композиции — как в Telegram. */
  const composingRef = useRef(false);
  /** Защита от двойного Enter / двойного тапа «Отправить». */
  const sendInFlightRef = useRef(false);

  const VOICE_MAX_MS = 10 * 60 * 1000;
  const VIDEO_NOTE_MAX_MS = 60 * 1000;
  const VOICE_MIN_MS = 450;
  /** После появления текста кнопка — «Отправить»; удержание ~420ms запускает запись с подписью. */
  const VOICE_ARM_MS = 420;
  /** Порог свайпа (px): чуть ниже, чем было 44 — удобнее большим пальцем, без ложных срабатываний. */
  const SWIPE_SWITCH_PX = 38;

  type CaptureKind = 'audio' | 'video_note';
  type MediaCaptureState = {
    kind: CaptureKind;
    connecting: boolean;
    wallStartedAt: number;
    segmentStartedAt: number;
  };
  const [mediaCapture, setMediaCapture] = useState<MediaCaptureState | null>(null);
  const [videoPreviewNonce, setVideoPreviewNonce] = useState(0);
  const captureKindRef = useRef<CaptureKind>('audio');
  const activeSegmentKindRef = useRef<CaptureKind>('audio');
  const recordSwipeOriginXRef = useRef(0);
  const voiceSwipeActiveRef = useRef(false);
  const wallClockStartRef = useRef(0);
  const wallInitRef = useRef(false);
  const segmentClockStartRef = useRef(0);
  const swapInFlightRef = useRef(false);
  const swipeMoveHandlerRef: MutableRefObject<((ev: PointerEvent) => void) | null> = useRef(null);
  const capturePreviewVideoRef = useRef<HTMLVideoElement | null>(null);

  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<BlobPart[]>([]);
  const voiceMimeRef = useRef('');
  const voicePointerDownRef = useRef(false);
  const voiceSessionGenRef = useRef(0);
  const voiceMaxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceArmTimerRef = useRef<number | null>(null);
  const voiceHoldPointerIdRef = useRef(-1);
  const contentForVoiceRef = useRef('');
  const sendOrMicBtnRef = useRef<HTMLButtonElement | null>(null);
  const suppressVoiceSendClickRef = useRef(false);

  const setUploadingState = useCallback((next: UploadingState | null) => {
    setUploading((prev) => {
      if (prev?.previewUrl && prev.previewUrl !== next?.previewUrl) {
        URL.revokeObjectURL(prev.previewUrl);
      }
      return next;
    });
  }, []);

  const focusComposer = useCallback(() => {
    requestAnimationFrame(() => {
      focusMessengerField(textareaRef.current);
    });
  }, []);

  // Подставляем черновик только при смене диалога. Синк на каждый debounced saveDraft в store
  // давал лишние перерисовки и мерцание textarea (autosize + controlled value).
  useEffect(() => {
    const fromStore = useChatStore.getState().drafts[conversationId] ?? '';
    setContent(fromStore);
    requestAnimationFrame(() => scheduleTextareaAutosize(textareaRef.current));
  }, [conversationId]);

  useEffect(() => {
    contentForVoiceRef.current = content;
  }, [content]);

  useEffect(() => {
    return () => {
      if (typingStartDebounceRef.current) {
        clearTimeout(typingStartDebounceRef.current);
        typingStartDebounceRef.current = null;
      }
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      if (voiceMaxTimerRef.current) {
        clearTimeout(voiceMaxTimerRef.current);
        voiceMaxTimerRef.current = null;
      }
      if (voiceArmTimerRef.current) {
        clearTimeout(voiceArmTimerRef.current);
        voiceArmTimerRef.current = null;
      }
      if (swipeMoveHandlerRef.current) {
        window.removeEventListener('pointermove', swipeMoveHandlerRef.current);
        swipeMoveHandlerRef.current = null;
      }
      voiceStreamRef.current?.getTracks().forEach((t) => t.stop());
      voiceStreamRef.current = null;
      try {
        voiceRecorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      voiceRecorderRef.current = null;
      if (!isDraftPrivateConversationId(conversationId)) {
        sendTypingStop(conversationId);
      }
    };
  }, [conversationId, sendTypingStop]);

  useEffect(() => {
    let cancelled = false;
    const checkUploadsHealth = async () => {
      setUploadsHealthChecking(true);
      try {
        const status = await api.fetchUploadsHealth();
        if (!cancelled) setUploadsHealthy(status.ok === true);
      } catch {
        // Не блокируем отправку на временной сетевой ошибке health-check:
        // реальная загрузка может быть доступна.
      } finally {
        if (!cancelled) setUploadsHealthChecking(false);
      }
    };

    void checkUploadsHealth();
    if (uploadsHealthTimerRef.current) clearInterval(uploadsHealthTimerRef.current);
    uploadsHealthTimerRef.current = setInterval(() => {
      void checkUploadsHealth();
    }, 30000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkUploadsHealth();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (uploadsHealthTimerRef.current) {
        clearInterval(uploadsHealthTimerRef.current);
        uploadsHealthTimerRef.current = null;
      }
    };
  }, []);

  // Sync content with editing state (читаемые @Имя вместо @[id])
  useEffect(() => {
    if (!editing) {
      lastOpenedEditIdRef.current = null;
      return;
    }
    if (lastOpenedEditIdRef.current !== editing.id) {
      lastOpenedEditIdRef.current = editing.id;
      setContent(denormalizeMentionsForEditor(editing.content, participantLabelById));
      focusMessengerField(textareaRef.current);
    }
  }, [editing, participantLabelById]);

  useEffect(() => {
    return () => {
      if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl);
      for (const img of pendingImages) {
        if (img.previewUrl) URL.revokeObjectURL(img.previewUrl);
      }
    };
  }, [pending?.previewUrl, pendingImages]);

  useEffect(() => {
    if (!previewSrc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewSrc(null);
        setPreviewMediaKind('image');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewSrc]);

  /** Escape закрывает вложения/эмодзи, даже если фокус ушёл в портал (emoji-mart). */
  useEffect(() => {
    if (!emojiOpen && !attachMenuOpen) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      setEmojiOpen(false);
      setAttachMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [emojiOpen, attachMenuOpen]);

  useEffect(() => {
    if (!attachMenuOpen) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (isDomEventInside(e, attachMenuRef.current, attachPopoverRef.current)) return;
      setAttachMenuOpen(false);
    };
    const id = window.setTimeout(() => {
      document.addEventListener('mousedown', onDoc, { passive: true });
      document.addEventListener('touchstart', onDoc, { passive: true });
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    };
  }, [attachMenuOpen]);

  useEffect(() => {
    if (attachMenuOpen) {
      setAttachMenuPresent(true);
      setAttachMenuExiting(false);
      return;
    }
    if (!attachMenuPresent) return;
    setAttachMenuExiting(true);
    const t = window.setTimeout(() => {
      setAttachMenuPresent(false);
      setAttachMenuExiting(false);
    }, 170);
    return () => window.clearTimeout(t);
  }, [attachMenuOpen, attachMenuPresent]);

  useEffect(() => {
    if (!emojiOpen) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (emojiOutsideGraceRef.current) return;
      if (isDomEventInside(e, emojiRef.current, emojiBtnRef.current, emojiPopoverRef.current)) return;
      setEmojiOpen(false);
    };
    const id = window.setTimeout(() => {
      document.addEventListener('mousedown', onDoc, { passive: true });
      document.addEventListener('touchstart', onDoc, { passive: true });
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    };
  }, [emojiOpen]);

  useEffect(() => {
    if (emojiOpen) {
      setEmojiPresent(true);
      setEmojiExiting(false);
      return;
    }
    if (!emojiPresent) return;
    setEmojiExiting(true);
    const t = window.setTimeout(() => {
      setEmojiPresent(false);
      setEmojiExiting(false);
    }, 170);
    return () => window.clearTimeout(t);
  }, [emojiOpen, emojiPresent]);

  const repositionPopovers = useCallback(() => {
    if (attachMenuOpen && attachBtnRef.current) {
      setAttachPos(computeAttachPopoverPos(attachBtnRef.current.getBoundingClientRect()));
    }
    if (emojiOpen && emojiBtnRef.current) {
      setEmojiPos(computeEmojiPopoverPos(emojiBtnRef.current.getBoundingClientRect(), narrowEmojiSheet));
    }
  }, [attachMenuOpen, emojiOpen, narrowEmojiSheet]);

  useEffect(() => {
    if (!attachMenuOpen) return;
    const btn = attachBtnRef.current;
    if (!btn) return;
    const apply = () => setAttachPos(computeAttachPopoverPos(btn.getBoundingClientRect()));
    apply();
    const id = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(id);
  }, [attachMenuOpen]);

  useEffect(() => {
    if (!emojiOpen) return;
    const btn = emojiBtnRef.current;
    if (!btn) return;
    const apply = () =>
      setEmojiPos(computeEmojiPopoverPos(btn.getBoundingClientRect(), narrowEmojiSheet));
    apply();
    const id = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(id);
  }, [emojiOpen, narrowEmojiSheet]);

  useEffect(() => {
    if (!attachMenuOpen && !emojiOpen) return;
    const vv = window.visualViewport;
    const onResize = () => repositionPopovers();
    window.addEventListener('resize', onResize);
    vv?.addEventListener('resize', onResize);
    vv?.addEventListener('scroll', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      vv?.removeEventListener('resize', onResize);
      vv?.removeEventListener('scroll', onResize);
    };
  }, [attachMenuOpen, emojiOpen, repositionPopovers]);

  useEffect(() => {
    const onResize = () => scheduleTextareaAutosize(textareaRef.current);
    window.addEventListener('resize', onResize);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      vv?.removeEventListener('resize', onResize);
    };
  }, []);

  const haptic = (ms = 12) => {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(ms);
      }
    } catch {
      /* ignore */
    }
  };

  const insertEmoji = (native: string) => {
    const el = textareaRef.current;
    if (!el) {
      setContent((v) => v + native);
      return;
    }
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    const next = content.slice(0, start) + native + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      try {
        focusMessengerField(el);
        const caret = start + native.length;
        el.setSelectionRange(caret, caret);
        scheduleTextareaAutosize(el);
      } catch {
        /* ignore */
      }
    });
    // Persist draft quickly after emoji insertion.
    try {
      saveDraft(conversationId, next);
    } catch {
      /* ignore */
    }
  };

  const handleSend = async () => {
    if (uploading != null || sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    try {
    haptic(10);
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    const text = content.trim();
    const replyTarget = replyingTo ?? replyTo;
    const numericReplyId =
      replyTarget?.id != null && /^\d+$/.test(String(replyTarget.id).trim())
        ? String(replyTarget.id).trim()
        : null;

    if (pendingImages.length > 0) {
      if (!canSendAttachments) {
        setUploadErr('В этом чате для вас отключена отправка фото и файлов.');
        return;
      }
      setUploadErr(null);
      setUploadPct(0);
      try {
        const uploadedImages: api.UploadedFile[] = [];
        for (let i = 0; i < pendingImages.length; i += 1) {
          const item = pendingImages[i];
          let uploaded = item.uploaded ?? null;
          if (!uploaded) {
            setUploadingState({ name: item.file.name, size: item.file.size, kind: 'file' });
            const ctrl = new AbortController();
            uploadAbortRef.current = ctrl;
            const fileToUpload = item.isImage
              ? await compressImageForMessengerUpload(item.file, ctrl.signal)
              : item.file;
            uploaded = await api.uploadFile(fileToUpload, {
              onProgress: (pct) => setUploadPct(pct),
              signal: ctrl.signal,
              conversationId,
            });
            const up = uploaded;
            setPendingImages((prev) =>
              prev.map((x, idx) => (idx === i ? { ...x, uploaded: up } : x)),
            );
          }
          uploadedImages.push(uploaded);
          setUploadPct(0);
        }
        const first = uploadedImages[0];
        const sent = await sendMessage(conversationId, text, numericReplyId, 'image', {
          // Backward compatibility with old single-image rendering fields.
          url: first?.url ?? '',
          name: first?.name ?? '',
          objectPath: first?.objectPath,
          mimeType: first?.mimeType ?? '',
          size: first?.size ?? 0,
          is_album: true,
          images: uploadedImages.map((u) => ({
            url: u.url,
            name: u.name,
            objectPath: u.objectPath,
            mimeType: u.mimeType,
            size: u.size,
          })),
        });
        if (!sent) return;
        setReplyingTo(null);
        setReplyTo(null);
        setContent('');
        clearDraft(conversationId);
        for (const item of pendingImages) {
          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        }
        setPendingImages([]);
        setPreviewSrc(null);
        setPreviewMediaKind('image');
        focusComposer();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.toLowerCase().includes('canceled') || msg.toLowerCase().includes('abort')) {
          setUploadErr('Загрузка отменена');
        } else {
          setUploadErr('Не удалось загрузить или отправить медиа');
          toastMessengerUploadError(e);
        }
      } finally {
        setUploadingState(null);
        setUploadPct(0);
        uploadAbortRef.current = null;
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
      return;
    }

    if (pending) {
      if (!canSendAttachments) {
        setUploadErr('В этом чате для вас отключена отправка фото и файлов.');
        return;
      }
      setUploadErr(null);
      setUploadPct(0);
      try {
        let uploaded = pending.uploaded ?? null;
        if (!uploaded) {
          setUploadingState({
            name: pending.file.name,
            size: pending.file.size,
            kind: pending.isAudio ? 'audio' : 'file',
          });
          const ctrl = new AbortController();
          uploadAbortRef.current = ctrl;
          const fileToUpload = pending.isImage
            ? await compressImageForMessengerUpload(pending.file, ctrl.signal)
            : pending.file;
          uploaded = await api.uploadFile(fileToUpload, {
            onProgress: (pct) => setUploadPct(pct),
            signal: ctrl.signal,
            conversationId,
          });
          setPending((prev) => (prev ? { ...prev, uploaded } : prev));
        }
        const payloadType: api.MessagePayloadType = pending.isImage
          ? 'image'
          : pending.isAudio
            ? 'audio'
            : 'file';
        const fileName = uploaded.name || pending.file.name;
        const payload: Record<string, unknown> = {
          url: uploaded.url,
          name: fileName,
          objectPath: uploaded.objectPath,
          mimeType: uploaded.mimeType || pending.file.type || '',
          size: uploaded.size || pending.file.size || 0,
        };
        if (pending.isAudio) {
          payload.kind = 'file';
          payload.title = audioDisplayTitle(fileName);
          let durationSec = pending.durationSec;
          if (!(typeof durationSec === 'number' && durationSec > 0)) {
            durationSec = await readAudioFileDurationSec(pending.file);
          }
          if (typeof durationSec === 'number' && durationSec > 0) {
            payload.durationSec = durationSec;
          }
        }
        const sent = await sendMessage(conversationId, text, numericReplyId, payloadType, payload);
        if (!sent) return;
        setReplyingTo(null);
        setReplyTo(null);
        setContent('');
        clearDraft(conversationId);
        if (pending.previewUrl) URL.revokeObjectURL(pending.previewUrl);
        setPending(null);
        setPreviewSrc(null);
        setPreviewMediaKind('image');
        focusComposer();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.toLowerCase().includes('canceled') || msg.toLowerCase().includes('abort')) {
          setUploadErr('Загрузка отменена');
        } else if (pending.uploaded) {
          setUploadErr('Файл загружен, но сообщение не отправилось. Нажмите отправить снова.');
          emitAppToast('Сообщение не отправилось. Нажмите отправить снова.', 'error');
        } else {
          setUploadErr('Не удалось загрузить или отправить файл');
          toastMessengerUploadError(e);
        }
      } finally {
        setUploadingState(null);
        setUploadPct(0);
        uploadAbortRef.current = null;
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
      return;
    }

    if (!text) return;

    if (editing) {
      const msgId = editing.id;
      const ok = await editMessage(msgId, text);
      scheduleTextareaAutosize(textareaRef.current);
      if (!isDraftPrivateConversationId(conversationId)) {
        sendTypingStop(conversationId);
      }
      if (ok) {
        setContent('');
        clearDraft(conversationId);
        focusComposer();
      }
      return;
    }

    const ok = await sendMessage(conversationId, text, numericReplyId);
    scheduleTextareaAutosize(textareaRef.current);
    if (!isDraftPrivateConversationId(conversationId)) {
      sendTypingStop(conversationId);
    }
    if (ok) {
      setContent('');
      clearDraft(conversationId);
      setReplyingTo(null);
      setReplyTo(null);
      focusComposer();
    }
    } finally {
      sendInFlightRef.current = false;
    }
  };

  const pickFile = (kind: 'image' | 'file' | 'audio') => {
    if (!canSendAttachments) {
      setUploadErr('В этом чате для вас отключена отправка фото и файлов.');
      return;
    }
    setUploadErr(null);
    setAttachMenuOpen(false);
    haptic(12);
    const input = fileInputRef.current;
    if (!input) return;
    filePickerModeRef.current = kind;
    input.multiple = kind === 'image';
    input.accept =
      kind === 'image'
        ? 'image/*,video/*'
        : kind === 'audio'
          ? CHAT_AUDIO_ACCEPT
          : 'application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt';
    try {
      input.disabled = false;
      input.click();
    } finally {
      window.setTimeout(() => {
        input.disabled = true;
      }, 64);
    }
  };

  const handleFileSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadErr(null);
    const selected = Array.from(files);
    const pickerMode = filePickerModeRef.current;

    if (pickerMode === 'image') {
      const badType = selected.find((f) => !isChatPhotoOrVideoFile(f));
      if (badType) {
        setUploadErr('Выберите только фото или видео');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      const tooBig = selected.find((f) => {
        if (isChatVideoFile(f)) return f.size > MAX_CHAT_VIDEO_BYTES;
        return f.size > MAX_CHAT_IMAGE_BYTES;
      });
      if (tooBig) {
        setUploadErr(
          selected.length > 1
            ? 'Каждое фото не больше 20MB, каждое видео не больше 1GB'
            : isChatVideoFile(tooBig)
              ? 'Видео не больше 1GB'
              : 'Фото не больше 20MB',
        );
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl);
      for (const item of pendingImages) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
      setPending(null);
      setPendingImages(
        selected.map((file) => ({
          file,
          isImage: isChatImageFile(file),
          previewUrl: URL.createObjectURL(file),
          uploaded: null,
        })),
      );
      focusMessengerField(textareaRef.current);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (pickerMode === 'audio') {
      const file = selected[0];
      if (!isChatAudioFile(file)) {
        setUploadErr('Выберите аудиофайл (mp3, m4a, ogg, wav…)');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      const maxBytes = 20 * 1024 * 1024;
      if (file.size > maxBytes) {
        setUploadErr('Аудиофайл слишком большой (максимум 20MB)');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl);
      for (const item of pendingImages) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
      setPendingImages([]);
      const previewUrl = URL.createObjectURL(file);
      setPending({ file, isImage: false, isAudio: true, previewUrl, uploaded: null });
      void readAudioFileDurationSec(file).then((durationSec) => {
        if (typeof durationSec === 'number' && durationSec > 0) {
          setPending((prev) =>
            prev && prev.file === file ? { ...prev, durationSec } : prev,
          );
        }
      });
      focusMessengerField(textareaRef.current);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const file = selected[0];
    // Validate before preview/upload
    const maxBytes = 20 * 1024 * 1024;
    if (file.size > maxBytes) {
      setUploadErr('Файл слишком большой (максимум 20MB)');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    const asAudio = isChatAudioFile(file);
    // Allow common images, audio and office/docs (same as accept), plus any type that browser provides.
    const allowedByAccept =
      asAudio ||
      file.type.startsWith('image/') ||
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.doc') ||
      file.name.toLowerCase().endsWith('.docx') ||
      file.name.toLowerCase().endsWith('.xls') ||
      file.name.toLowerCase().endsWith('.xlsx') ||
      file.name.toLowerCase().endsWith('.ppt') ||
      file.name.toLowerCase().endsWith('.pptx') ||
      file.name.toLowerCase().endsWith('.txt') ||
      file.type === '';
    if (!allowedByAccept) {
      setUploadErr('Неподдерживаемый тип файла');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl);
    for (const item of pendingImages) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
    setPendingImages([]);
    const isImage =
      !asAudio &&
      ((file.type || '').startsWith('image/') ||
        IMAGE_NAME_EXT_RE.test(String(file.name || '').trim()));
    const previewUrl = isImage || asAudio ? URL.createObjectURL(file) : null;
    setPending({ file, isImage, isAudio: asAudio, previewUrl, uploaded: null });
    if (asAudio) {
      void readAudioFileDurationSec(file).then((durationSec) => {
        if (typeof durationSec === 'number' && durationSec > 0) {
          setPending((prev) =>
            prev && prev.file === file ? { ...prev, durationSec } : prev,
          );
        }
      });
    }
    focusMessengerField(textareaRef.current);
  };

  /** Вставка из буфера / drag-and-drop — та же ветка, что и выбор файла из меню. */
  const ingestExternalFiles = (files: File[]) => {
    if (!canSendAttachments || files.length === 0) return;
    const allMedia = files.every((f) => isChatPhotoOrVideoFile(f));
    const allAudio = files.every((f) => isChatAudioFile(f));
    filePickerModeRef.current = allMedia ? 'image' : allAudio ? 'audio' : 'file';
    const dt = new DataTransfer();
    for (const f of files) {
      dt.items.add(f);
    }
    void handleFileSelected(dt.files);
  };

  const pickMention = (memberId: number) => {
    const el = textareaRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? content.length;
    const before = content.slice(0, mentionStart);
    const after = content.slice(caret);
    const label = mentionParticipants.find((p) => p.id === memberId)?.label ?? `участник ${memberId}`;
    const insert = buildMentionToken(label, memberId);
    const spacer = after.startsWith(' ') || after === '' ? '' : ' ';
    const next = before + insert + spacer + after;
    const pos = before.length + insert.length + (spacer ? 1 : 0);
    setContent(next);
    setMentionOpen(false);
    requestAnimationFrame(() => {
      try {
        focusMessengerField(el);
        el.setSelectionRange(pos, pos);
        scheduleTextareaAutosize(el);
      } catch {
        /* ignore */
      }
    });
    try {
      saveDraft(conversationId, next);
    } catch {
      /* ignore */
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setContent(value);

    scheduleTextareaAutosize(e.target);

    if (mentionParticipants.length > 0) {
      const caret = e.target.selectionStart ?? value.length;
      const before = value.slice(0, caret);
      const at = before.lastIndexOf('@');
      if (at < 0) {
        setMentionOpen(false);
      } else {
        const frag = before.slice(at + 1);
        if (frag.includes('\n')) {
          setMentionOpen(false);
        } else if (isCompletedVisualMentionFragment(frag)) {
          setMentionOpen(false);
        } else if (/^\[[^\]]*\]\(/.test(frag)) {
          // Старый черновик с `@[Имя](` — не показываем меню
          setMentionOpen(false);
        } else {
          let query = '';
          let badBracket = false;
          if (frag.startsWith('[')) {
            const closeIdx = frag.indexOf(']');
            if (closeIdx === -1) {
              query = frag.slice(1);
            } else {
              badBracket = true;
            }
          } else {
            const beforeWJ = frag.split(MENTION_ID_WRAP)[0];
            query = beforeWJ.trim();
          }
          if (badBracket) {
            setMentionOpen(false);
          } else if (query || frag.startsWith('[')) {
            const q = query.toLowerCase();
            const list = mentionParticipants.filter((p) =>
              q ? p.label.toLowerCase().includes(q) : true,
            );
            setMentionStart(at);
            setMentionFiltered(list.slice(0, 10));
            setMentionHighlight(0);
            setMentionOpen(list.length > 0);
          } else {
            const list = mentionParticipants.slice(0, 10);
            setMentionStart(at);
            setMentionFiltered(list);
            setMentionHighlight(0);
            setMentionOpen(list.length > 0);
          }
        }
      }
    }

    // Typing indicator: debounce start (~450ms), не спамим WS на каждый символ.
    if (!isDraftPrivateConversationId(conversationId)) {
      if (typingStartDebounceRef.current) {
        clearTimeout(typingStartDebounceRef.current);
        typingStartDebounceRef.current = null;
      }
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      if (value.trim()) {
        typingStartDebounceRef.current = setTimeout(() => {
          typingStartDebounceRef.current = null;
          sendTypingStart(conversationId);
        }, 450);
        typingTimerRef.current = setTimeout(() => {
          sendTypingStop(conversationId);
          typingTimerRef.current = null;
        }, 3000);
      } else {
        sendTypingStop(conversationId);
      }
    }

    // Auto-save draft with debounce
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(() => {
      saveDraft(conversationId, value);
    }, 500);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mentionOpen && mentionFiltered.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionHighlight((h) => Math.min(mentionFiltered.length - 1, h + 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionHighlight((h) => Math.max(0, h - 1));
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const sel = mentionFiltered[mentionHighlight];
        if (sel) pickMention(sel.id);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionOpen(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      const ne = e.nativeEvent as KeyboardEvent;
      if (composingRef.current || ne.isComposing || ne.keyCode === 229) {
        return;
      }
      e.preventDefault();
      void handleSend();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (emojiOpen) {
        setEmojiOpen(false);
        return;
      }
      if (attachMenuOpen) {
        setAttachMenuOpen(false);
        return;
      }
      if (previewSrc) {
        setPreviewSrc(null);
        setPreviewMediaKind('image');
        return;
      }
      if (mentionOpen) {
        setMentionOpen(false);
        return;
      }
      if (replyingTo) {
        setReplyingTo(null);
        return;
      }
      if (editing) setEditing(null);
      if (replyTo) setReplyTo(null);
    }
  };

  const unbindSwipeListeners = () => {
    if (swipeMoveHandlerRef.current) {
      window.removeEventListener('pointermove', swipeMoveHandlerRef.current);
      swipeMoveHandlerRef.current = null;
    }
  };

  const stopVoiceArmTimerOnly = () => {
    if (voiceArmTimerRef.current) {
      clearTimeout(voiceArmTimerRef.current);
      voiceArmTimerRef.current = null;
    }
  };

  const endVoiceGestureTracking = () => {
    stopVoiceArmTimerOnly();
    voiceSwipeActiveRef.current = false;
    unbindSwipeListeners();
  };

  const scheduleSegmentMaxTimer = (kind: CaptureKind) => {
    if (voiceMaxTimerRef.current) {
      clearTimeout(voiceMaxTimerRef.current);
      voiceMaxTimerRef.current = null;
    }
    const cap = kind === 'video_note' ? VIDEO_NOTE_MAX_MS : VOICE_MAX_MS;
    voiceMaxTimerRef.current = setTimeout(() => {
      try {
        voiceRecorderRef.current?.stop();
      } catch {
        /* ignore */
      }
    }, cap);
  };

  const buildConstraints = (kind: CaptureKind): MediaStreamConstraints => {
    const audio = { echoCancellation: true, noiseSuppression: true } as const;
    if (kind === 'audio') {
      return { audio };
    }
    return {
      audio: { ...audio },
      video: {
        facingMode: 'user',
        width: { ideal: 480, max: 720 },
        height: { ideal: 480, max: 720 },
        aspectRatio: { ideal: 1 },
      },
    };
  };

  const stopCurrentRecorderSegment = async () => {
    const rec = voiceRecorderRef.current;
    await new Promise<void>((resolve) => {
      if (!rec || rec.state === 'inactive') {
        resolve();
        return;
      }
      rec.onstop = () => resolve();
      try {
        rec.stop();
      } catch {
        resolve();
      }
    });
    voiceStreamRef.current?.getTracks().forEach((t) => t.stop());
    voiceStreamRef.current = null;
    voiceRecorderRef.current = null;
    voiceChunksRef.current = [];
  };

  const acquireStreamMatchingKind = async (myGen: number): Promise<MediaStream> => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const kind = captureKindRef.current;
      const stream = await navigator.mediaDevices.getUserMedia(buildConstraints(kind));
      if (myGen !== voiceSessionGenRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error('stale_gen');
      }
      const wantsVideo = kind === 'video_note';
      const hasVideo = stream.getVideoTracks().length > 0;
      if (wantsVideo === hasVideo) return stream;
      stream.getTracks().forEach((t) => t.stop());
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('acquire_failed');
  };

  const startRecorderFromStream = (stream: MediaStream, kind: CaptureKind, myGen: number) => {
    const opts = kind === 'audio' ? voiceRecorderOptions() : videoNoteRecorderOptions();
    if (kind === 'video_note' && !opts) {
      stream.getTracks().forEach((t) => t.stop());
      if (myGen === voiceSessionGenRef.current) {
        emitAppToast('Видеокружок не поддерживается в этом браузере', 'error');
        voicePointerDownRef.current = false;
        voiceSwipeActiveRef.current = false;
        endVoiceGestureTracking();
        wallInitRef.current = false;
        setMediaCapture(null);
      }
      return;
    }
    voiceStreamRef.current = stream;
    voiceChunksRef.current = [];
    const rec = opts ? new MediaRecorder(stream, opts) : new MediaRecorder(stream);
    const mimeRaw = (
      (opts as MediaRecorderOptions | undefined)?.mimeType ||
      rec.mimeType ||
      (kind === 'video_note' ? 'video/webm' : 'audio/webm')
    )
      .split(';')[0]
      .trim();
    voiceMimeRef.current = mimeRaw;
    rec.ondataavailable = (ev) => {
      if (ev.data.size > 0) voiceChunksRef.current.push(ev.data);
    };
    rec.start(200);
    voiceRecorderRef.current = rec;
    activeSegmentKindRef.current = kind;
    const segT = Date.now();
    segmentClockStartRef.current = segT;
    if (!wallInitRef.current) {
      wallInitRef.current = true;
      wallClockStartRef.current = segT;
    }
    scheduleSegmentMaxTimer(kind);
    captureKindRef.current = kind;
    setMediaCapture((prev) =>
      prev
        ? {
            ...prev,
            kind,
            connecting: false,
            segmentStartedAt: segmentClockStartRef.current,
          }
        : {
            kind,
            connecting: false,
            wallStartedAt: wallClockStartRef.current,
            segmentStartedAt: segmentClockStartRef.current,
          },
    );
    if (kind === 'video_note') setVideoPreviewNonce((n) => n + 1);
  };

  const beginCaptureAfterPermission = async (myGen: number) => {
    voicePointerDownRef.current = true;
    let stream: MediaStream | null = null;
    try {
      stream = await acquireStreamMatchingKind(myGen);
    } catch (e) {
      if (myGen !== voiceSessionGenRef.current) return;
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'stale_gen') return;
      voicePointerDownRef.current = false;
      voiceSwipeActiveRef.current = false;
      endVoiceGestureTracking();
      setMediaCapture(null);
      emitAppToast(
        captureKindRef.current === 'video_note'
          ? 'Не удалось получить доступ к камере'
          : 'Не удалось получить доступ к микрофону',
        'error',
      );
      return;
    }
    if (!stream || myGen !== voiceSessionGenRef.current) return;
    if (!voiceSwipeActiveRef.current && !voicePointerDownRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      setMediaCapture(null);
      return;
    }
    startRecorderFromStream(stream, captureKindRef.current, myGen);
  };

  const swapCaptureKindIfRecording = async (next: CaptureKind) => {
    if (swapInFlightRef.current) return;
    if (!voiceRecorderRef.current || voiceRecorderRef.current.state !== 'recording') return;
    if (activeSegmentKindRef.current === next) return;
    swapInFlightRef.current = true;
    const myGen = voiceSessionGenRef.current;
    try {
      await stopCurrentRecorderSegment();
      if (myGen !== voiceSessionGenRef.current) return;
      const stream = await acquireStreamMatchingKind(myGen);
      if (myGen !== voiceSessionGenRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      if (!voiceSwipeActiveRef.current && !voicePointerDownRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      startRecorderFromStream(stream, next, myGen);
    } catch {
      if (myGen === voiceSessionGenRef.current) {
        emitAppToast('Не удалось переключить режим записи', 'error');
      }
      try {
        await stopCurrentRecorderSegment();
      } catch {
        /* ignore */
      }
      setMediaCapture(null);
    } finally {
      swapInFlightRef.current = false;
    }
  };

  const bindSwipeListeners = (originX: number) => {
    unbindSwipeListeners();
    recordSwipeOriginXRef.current = originX;
    const onMove = (moveEv: PointerEvent) => {
      if (!voiceSwipeActiveRef.current) return;
      const dx = moveEv.clientX - recordSwipeOriginXRef.current;
      let next = captureKindRef.current;
      if (dx <= -SWIPE_SWITCH_PX) next = 'video_note';
      else if (dx >= SWIPE_SWITCH_PX) next = 'audio';
      else return;
      if (next === captureKindRef.current) return;
      captureKindRef.current = next;
      setMediaCapture((s) => (s ? { ...s, kind: next } : s));
      void swapCaptureKindIfRecording(next);
    };
    swipeMoveHandlerRef.current = onMove;
    window.addEventListener('pointermove', onMove, { passive: true });
  };

  const processRecordedBlob = async (
    payloadType: 'audio' | 'video_note',
    blob: Blob,
    segmentDurationMs: number,
    captionRaw?: string,
  ) => {
    if (!canSendAttachments) {
      setUploadErr('В этом чате для вас отключена отправка фото и файлов.');
      return;
    }
    if (blob.size < 32) {
      emitAppToast('Запись слишком короткая', 'error');
      return;
    }
    const fallbackMime = payloadType === 'video_note' ? 'video/webm' : 'audio/webm';
    const mimeMain = (voiceMimeRef.current || blob.type || fallbackMime).split(';')[0].trim();
    const file = new File(
      [blob],
      payloadType === 'video_note' ? videoNoteBlobFileName(mimeMain) : voiceBlobFileName(mimeMain),
      { type: mimeMain },
    );
    const caption = normalizeMentionsToCanonical(String(captionRaw ?? '').trim());

    setUploadErr(null);
    setUploadPct(0);
    try {
      const uploadPreviewUrl = payloadType === 'video_note' ? URL.createObjectURL(blob) : null;
      setUploadingState({
        name: file.name,
        size: file.size,
        kind: payloadType,
        previewUrl: uploadPreviewUrl,
      });
      const ctrl = new AbortController();
      uploadAbortRef.current = ctrl;
      const uploaded = await api.uploadFile(file, {
        onProgress: (pct) => setUploadPct(pct),
        signal: ctrl.signal,
        conversationId,
      });
      const durationSec = Math.max(1, Math.round(segmentDurationMs / 1000));
      const sent = await sendMessage(conversationId, caption, null, payloadType, {
        url: uploaded.url,
        name: uploaded.name || file.name,
        objectPath: uploaded.objectPath,
        mimeType: uploaded.mimeType || mimeMain,
        size: uploaded.size || file.size || 0,
        durationSec,
        ...(payloadType === 'audio' ? { kind: 'voice' } : {}),
      });
      if (sent) {
        setReplyingTo(null);
        setReplyTo(null);
        setContent('');
        clearDraft(conversationId);
        focusComposer();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes('canceled') || msg.toLowerCase().includes('abort')) {
        setUploadErr('Загрузка отменена');
      } else {
        setUploadErr(
          payloadType === 'video_note'
            ? 'Не удалось отправить видеосообщение'
            : 'Не удалось отправить голосовое сообщение',
        );
        toastMessengerUploadError(e);
      }
    } finally {
      setUploadingState(null);
      setUploadPct(0);
      uploadAbortRef.current = null;
    }
  };

  const onSendOrMicPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      emitAppToast('Запись голоса не поддерживается в этом браузере', 'error');
      return;
    }

    const hasAttachmentDraft = Boolean(pending || pendingImages.length > 0);
    const hasReply = Boolean(replyTo || replyingTo);
    const canVoice =
      !editing &&
      !hasReply &&
      !hasAttachmentDraft &&
      canSendAttachments &&
      uploadsHealthy &&
      uploading == null &&
      !sendInFlightRef.current;

    if (!canVoice) {
      if (hasReply && !hasAttachmentDraft && !content.trim()) {
        emitAppToast('Чтобы записать голосовое, отмените ответ', 'info');
      }
      return;
    }

    e.preventDefault();
    const onlyText = Boolean(content.trim());
    const emptyComposer = !content.trim();

    if (onlyText) {
      wallInitRef.current = false;
      voiceSwipeActiveRef.current = true;
      bindSwipeListeners(e.clientX);
      captureKindRef.current = 'audio';
      voiceHoldPointerIdRef.current = e.pointerId;
      stopVoiceArmTimerOnly();
      voiceArmTimerRef.current = window.setTimeout(() => {
        voiceArmTimerRef.current = null;
        const btn = sendOrMicBtnRef.current;
        if (!btn) return;
        haptic(12);
        const myGen = (voiceSessionGenRef.current += 1);
        try {
          void btn.setPointerCapture(voiceHoldPointerIdRef.current);
        } catch {
          /* ignore */
        }
        const t0 = Date.now();
        setMediaCapture({
          kind: captureKindRef.current,
          connecting: true,
          wallStartedAt: t0,
          segmentStartedAt: t0,
        });
        void beginCaptureAfterPermission(myGen);
      }, VOICE_ARM_MS) as unknown as number;
      return;
    }

    if (emptyComposer) {
      wallInitRef.current = false;
      haptic(12);
      const myGen = (voiceSessionGenRef.current += 1);
      void e.currentTarget.setPointerCapture(e.pointerId);
      voiceSwipeActiveRef.current = true;
      bindSwipeListeners(e.clientX);
      captureKindRef.current = 'audio';
      voicePointerDownRef.current = true;
      const t0 = Date.now();
      setMediaCapture({
        kind: 'audio',
        connecting: true,
        wallStartedAt: t0,
        segmentStartedAt: t0,
      });
      void beginCaptureAfterPermission(myGen);
    }
  };

  const onSendOrMicPointerEnd = (e: React.PointerEvent<HTMLButtonElement>, shouldSend: boolean) => {
    if (editing) return;
    if (pending || pendingImages.length > 0) return;

    endVoiceGestureTracking();

    if (
      !voiceRecorderRef.current &&
      !voicePointerDownRef.current &&
      !mediaCapture?.connecting
    ) {
      return;
    }

    suppressVoiceSendClickRef.current = true;
    window.setTimeout(() => {
      suppressVoiceSendClickRef.current = false;
    }, 420);

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    voicePointerDownRef.current = false;
    voiceSessionGenRef.current += 1;

    if (voiceMaxTimerRef.current) {
      clearTimeout(voiceMaxTimerRef.current);
      voiceMaxTimerRef.current = null;
    }

    const rec = voiceRecorderRef.current;

    if (!rec || rec.state === 'inactive') {
      voiceStreamRef.current?.getTracks().forEach((t) => t.stop());
      voiceStreamRef.current = null;
      voiceRecorderRef.current = null;
      wallInitRef.current = false;
      setMediaCapture(null);
      return;
    }

    void new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      try {
        rec.stop();
      } catch {
        resolve();
      }
    }).then(async () => {
      voiceStreamRef.current?.getTracks().forEach((t) => t.stop());
      voiceStreamRef.current = null;
      voiceRecorderRef.current = null;
      setMediaCapture(null);
      const segmentDurationMs = Date.now() - segmentClockStartRef.current;
      const wallDurationMs = wallInitRef.current ? Date.now() - wallClockStartRef.current : 0;
      const chunks = voiceChunksRef.current;
      voiceChunksRef.current = [];

      if (!shouldSend) {
        return;
      }
      if (!wallInitRef.current || wallDurationMs < VOICE_MIN_MS) {
        emitAppToast('Удерживайте кнопку, чтобы записать', 'error');
        return;
      }
      const mime =
        voiceMimeRef.current ||
        (captureKindRef.current === 'video_note' ? 'video/webm' : 'audio/webm');
      const blob = new Blob(chunks, { type: mime });
      const captionSnap = normalizeMentionsToCanonical(contentForVoiceRef.current.trim());
      const sendPt: 'audio' | 'video_note' =
        captureKindRef.current === 'video_note' ? 'video_note' : 'audio';
      await processRecordedBlob(sendPt, blob, segmentDurationMs, captionSnap);
    })
      .finally(() => {
        wallInitRef.current = false;
      });
  };

  const [voiceTick, setVoiceTick] = useState(0);
  useEffect(() => {
    if (!mediaCapture) return;
    const id = window.setInterval(() => setVoiceTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [mediaCapture]);

  useEffect(() => {
    const el = capturePreviewVideoRef.current;
    if (!el) return;
    const s = voiceStreamRef.current;
    if (mediaCapture?.kind === 'video_note' && !mediaCapture.connecting && s?.getVideoTracks()[0]) {
      el.srcObject = s;
      void el.play().catch(() => {
        /* autoplay policies */
      });
    } else {
      el.srcObject = null;
    }
  }, [mediaCapture, videoPreviewNonce]);

  const hasSendAction = Boolean(content.trim() || pending || pendingImages.length > 0);
  type IconMode = 'send' | 'mic' | 'video';
  const isRecording = Boolean(mediaCapture && !mediaCapture.connecting);
  const captureKind = mediaCapture?.kind === 'video_note' ? 'video_note' : 'audio';
  /** В textOnly (ИИ помощник) всегда кнопка «отправить», без микрофона. */
  const iconMode: IconMode = textOnly
    ? 'send'
    : isRecording
      ? (captureKind === 'video_note' ? 'video' : 'mic')
      : (hasSendAction ? 'send' : 'mic');
  const attachmentsUiEnabled = canSendAttachments && !textOnly;
  const replyBanner = replyingTo ?? replyTo;
  const composerBannerTitle = editing
    ? 'Редактирование'
    : replyBanner
      ? `Ответ ${replyBanner.sender_name || ''}`.trim()
      : '';
  const composerBannerBody = editing
    ? String(editing.content || '')
    : replyBanner
      ? String(replyBanner.content || '').trim() || '—'
      : '';

  if (!canSend) {
    return (
      <div className="tg-input-area" style={{ justifyContent: 'center' }}>
        <p className="tg-empty-sub px-2 text-center">В этом чате для вас отключена отправка сообщений</p>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0">
      {/* Reply/Edit Banner — один баннер (swipe и context menu не дублируются) */}
      {replyBanner || editing ? (
        <div className="tg-input-banner">
          <div className="tg-input-banner-bar" aria-hidden />
          <div className="tg-input-banner-content">
            <MessengerPlainText
              className="tg-input-banner-title messenger-bidi-text"
              text={composerBannerTitle}
              keyPrefix="composer-banner-title"
            />
            <MessengerPlainText
              className="tg-input-banner-text messenger-bidi-text"
              text={composerBannerBody}
              keyPrefix="composer-banner-body"
            />
          </div>
          <button
            type="button"
            className="tg-input-banner-close"
            onClick={() => {
              setReplyingTo(null);
              setReplyTo(null);
              setEditing(null);
            }}
            aria-label={editing ? 'Отменить редактирование' : 'Отменить ответ'}
            title="Отменить"
          >
            ✕
          </button>
        </div>
      ) : null}

      {pendingImages.length > 0 ? (
        <div className="mb-1.5 border-b border-stone-200/45 pb-2 dark:border-white/12">
          <div className="flex items-start gap-2">
            <div className="grid min-w-0 flex-1 grid-cols-3 gap-1.5 sm:grid-cols-4">
              {pendingImages.slice(0, 6).map((item, idx) => (
                <button
                  key={`${item.file.name}-${idx}`}
                  type="button"
                  onClick={() => {
                    if (!item.previewUrl) return;
                    setPreviewSrc(item.previewUrl);
                    setPreviewMediaKind(item.isImage ? 'image' : 'video');
                  }}
                  className="aspect-square overflow-hidden rounded-lg bg-black/5 dark:bg-white/10"
                  aria-label={item.isImage ? `Открыть фото ${idx + 1}` : `Открыть видео ${idx + 1}`}
                >
                  {item.previewUrl ? (
                    item.isImage ? (
                      <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <video
                        src={item.previewUrl}
                        muted
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-cover"
                      />
                    )
                  ) : null}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                for (const item of pendingImages) {
                  if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
                }
                setPendingImages([]);
                setPreviewSrc(null);
                setPreviewMediaKind('image');
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors duration-200 hover:bg-black/5 dark:hover:bg-white/10"
              aria-label="Убрать вложения"
              title="Убрать вложения"
            >
              <LuX />
            </button>
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-[var(--text-secondary)]">
            Выбрано: {pendingImages.length}. Подпись и отправка — ниже.
          </p>
        </div>
      ) : pending?.isAudio ? (
        <div className="tg-audio-draft">
          <div className="tg-audio-draft__player">
            <VoiceMessageAttachment
              audioSrc={pending.previewUrl}
              isMine={false}
              variant="file"
              title={audioDisplayTitle(pending.file.name)}
              durationHintSec={pending.durationSec}
              waveSeed={`draft-${pending.file.name}-${pending.file.size}`}
            />
            <p className="tg-audio-draft__hint">
              {formatBytes(pending.file.size)}
              {pending.durationSec
                ? ` · ${Math.floor(pending.durationSec / 60)}:${String(pending.durationSec % 60).padStart(2, '0')}`
                : ''}
              {' · '}
              Добавьте описание ниже и нажмите отправить
            </p>
          </div>
          <button
            type="button"
            className="tg-audio-draft__close"
            onClick={() => {
              if (pending.previewUrl) URL.revokeObjectURL(pending.previewUrl);
              setPending(null);
              setPreviewSrc(null);
              setPreviewMediaKind('image');
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
            aria-label="Убрать аудио"
            title="Убрать аудио"
          >
            <LuX />
          </button>
        </div>
      ) : pending ? (
        <div className="mb-1.5 border-b border-stone-200/45 pb-2 dark:border-white/12">
          <div className="flex items-start gap-2">
            {pending.isImage && pending.previewUrl ? (
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-black/5 dark:bg-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setPreviewSrc(pending.previewUrl);
                    setPreviewMediaKind('image');
                  }}
                  className="h-full w-full"
                  aria-label="Открыть превью"
                >
                  <img src={pending.previewUrl} alt="" className="h-full w-full object-cover" />
                </button>
              </div>
            ) : (
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-black/5 text-[var(--text-secondary)] dark:bg-white/10">
                <LuPaperclip />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--text)]">{pending.file.name}</p>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                {pending.isImage ? 'Фото' : 'Файл'} · {formatBytes(pending.file.size)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                if (pending.previewUrl) URL.revokeObjectURL(pending.previewUrl);
                setPending(null);
                setPreviewSrc(null);
                setPreviewMediaKind('image');
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors duration-200 hover:bg-black/5 dark:hover:bg-white/10"
              aria-label="Убрать вложение"
              title="Убрать вложение"
            >
              <LuX />
            </button>
          </div>
        </div>
      ) : null}

      {previewSrc ? (
        <div
          className="fixed inset-0 z-[4000] bg-black/70 p-4"
          onClick={() => {
            setPreviewSrc(null);
            setPreviewMediaKind('image');
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Превью перед отправкой"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setPreviewSrc(null);
              setPreviewMediaKind('image');
            }}
            className="absolute right-4 top-4 z-[4001] flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition hover:bg-white/25"
            aria-label="Закрыть превью"
          >
            <LuX className="h-6 w-6" strokeWidth={2} aria-hidden />
          </button>
          <div className="mx-auto flex h-full max-w-xl items-center justify-center">
            {previewMediaKind === 'video' ? (
              <video
                src={previewSrc}
                controls
                playsInline
                className="max-h-full max-w-full rounded-2xl shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <img
                src={previewSrc}
                alt=""
                className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
            )}
          </div>
        </div>
      ) : null}

      {uploading ? (
        <div className="mb-1.5 flex items-center justify-between gap-3 border-b border-stone-200/45 pb-2 dark:border-white/12">
          <div className="min-w-0 flex flex-1 items-center gap-3">
            {uploading.kind === 'video_note' ? (
              <span
                className="tg-videonote-upload-ring"
                style={{
                  background: `conic-gradient(var(--tg-primary, #7d3640) ${Math.max(2, uploadPct)}%, rgba(125, 54, 64, 0.18) ${Math.max(2, uploadPct)}% 100%)`,
                }}
                aria-hidden
              >
                <span className="tg-videonote-upload-ring__inner">
                  {uploading.previewUrl ? (
                    <video
                      src={uploading.previewUrl}
                      className="tg-videonote-upload-ring__video"
                      playsInline
                      autoPlay
                      muted
                    />
                  ) : (
                    <LuVideo className="h-5 w-5 text-white/85" />
                  )}
                </span>
              </span>
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--text)]">
                {uploading.kind === 'video_note'
                  ? 'Отправка видеосообщения…'
                  : uploading.kind === 'audio'
                    ? pending?.isAudio
                      ? 'Отправка аудио…'
                      : 'Отправка голосового…'
                    : 'Загрузка файла…'}
              </p>
              <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                {uploading.name}{uploadPct ? ` · ${uploadPct}%` : ''}
              </p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface)]">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200"
                  style={{ width: `${Math.max(2, uploadPct)}%` }}
                />
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              uploadAbortRef.current?.abort();
              setUploadingState(null);
              setUploadPct(0);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors duration-200 hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Отменить"
            title="Отменить"
          >
            <LuX />
          </button>
        </div>
      ) : null}

      {uploadErr ? (
        <p className="mb-2 text-sm font-semibold text-red-600">{uploadErr}</p>
      ) : null}
      {!uploadsHealthy && !textOnly ? (
        <p className="mb-2 text-sm font-semibold text-amber-700">
          Хранилище вложений недоступно. Отправка фото и файлов временно отключена.
          {uploadsHealthChecking ? ' Проверяем восстановление…' : ''}
        </p>
      ) : null}
      {canSend && !canSendAttachments && !textOnly ? (
        <p className="mb-2 text-sm font-semibold text-amber-800">
          В этом чате для вас отключены фото, файлы, голосовые и видеосообщения (настройки группы).
        </p>
      ) : null}

      {mediaCapture ? (
        <div className="tg-videonote-capture mb-2" aria-live="polite">
          <div className="tg-videonote-capture__stage">
            {mediaCapture.kind === 'video_note' && !mediaCapture.connecting ? (
              <div className="tg-capture-hud-videonote-ring">
                <video
                  ref={capturePreviewVideoRef}
                  className="tg-capture-hud-videonote"
                  muted
                  playsInline
                  autoPlay
                  aria-hidden
                />
              </div>
            ) : (
              <div className="tg-videonote-capture__audio-visual">
                <LuMic className="h-12 w-12" strokeWidth={1.75} aria-hidden />
                <div className="tg-videonote-capture__waves" aria-hidden>
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
          </div>
          <div className="tg-videonote-capture__rail">
            <span
              className={[
                'tg-videonote-capture__mode',
                mediaCapture.kind === 'audio' ? 'tg-videonote-capture__mode--on' : '',
              ].join(' ')}
              aria-hidden
            >
              <LuMic className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <div className="tg-videonote-capture__timer">
              {mediaCapture.connecting
                ? '…'
                : formatVoiceElapsed(mediaCapture.segmentStartedAt, voiceTick)}
            </div>
            <span
              className={[
                'tg-videonote-capture__mode',
                mediaCapture.kind === 'video_note' ? 'tg-videonote-capture__mode--on' : '',
              ].join(' ')}
              aria-hidden
            >
              <LuVideo className="h-5 w-5" strokeWidth={2.25} />
            </span>
          </div>
          {isRecording ? (
            <div className="swipeHint" aria-hidden>
              <span className={captureKind === 'video_note' ? 'hintActive' : ''}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <rect x="2" y="6" width="13" height="12" rx="2.5" fill="currentColor" />
                  <path d="M15 10l5-3v10l-5-3V10z" fill="currentColor" />
                </svg>
              </span>
              <span>← свайп →</span>
              <span className={captureKind === 'audio' ? 'hintActive' : ''}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
                  <path d="M5 10a7 7 0 0014 0M12 19v3M9 22h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </span>
            </div>
          ) : null}
          <p className="tg-videonote-capture__hint">
            {mediaCapture.connecting
              ? 'Разрешите доступ к микрофону или камере'
              : 'Свайп влево — видеокружок (до 1 мин), вправо — голос. Отпустите — отправить.'}
          </p>
        </div>
      ) : null}

      <div className="relative w-full min-w-0">
        <div
          className="tg-input-area tg-composer-pill-layout flex w-full min-w-0 gap-1.5 py-1 sm:gap-2 sm:py-1.5"
          onDragOver={(e) => {
            if (!canSendAttachments) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={(e) => {
            if (!canSendAttachments) return;
            e.preventDefault();
            const fl = e.dataTransfer?.files;
            if (!fl?.length) return;
            ingestExternalFiles(Array.from(fl));
          }}
        >
          {mentionOpen && mentionFiltered.length > 0 ? (
            <div
              className="absolute bottom-full left-0 right-0 z-[60] mb-2 max-h-40 overflow-y-auto rounded-2xl border border-gray-200 bg-[var(--surface-elevated)] py-1 shadow-md"
              role="listbox"
              aria-label="Упоминание участника"
            >
              {mentionFiltered.map((p, idx) => (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={idx === mentionHighlight}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => pickMention(p.id)}
                  className={[
                    'flex w-full px-4 py-2 text-left text-sm font-semibold',
                    idx === mentionHighlight ? 'bg-primary/10 text-primary' : 'text-[var(--text)] hover:bg-[var(--surface)]',
                  ].join(' ')}
                >
                  @{p.label}
                </button>
              ))}
            </div>
          ) : null}

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            tabIndex={-1}
            aria-hidden={true}
            autoComplete="off"
            accept="image/*,video/*"
            onChange={(e) => void handleFileSelected(e.target.files)}
          />

          {attachmentsUiEnabled ? (
            <div ref={attachMenuRef} className="relative z-[5000] shrink-0">
              <button
                ref={attachBtnRef}
                type="button"
                disabled={!canSendAttachments}
                onClick={() => {
                  haptic(8);
                  setAttachMenuOpen((v) => !v);
                }}
                aria-label="Вложения"
                aria-expanded={attachMenuOpen}
                aria-haspopup="menu"
                title="Вложения"
                className={[
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors',
                  'text-stone-600 hover:bg-black/[0.06] active:scale-[0.98]',
                  'disabled:pointer-events-none disabled:opacity-45',
                  'dark:text-stone-200 dark:hover:bg-white/10',
                ].join(' ')}
              >
                <LuPaperclip size={20} strokeWidth={2} aria-hidden />
              </button>
            </div>
          ) : null}

          <div
            className={[
              'tg-input-container tg-composer-pill-layout tg-composer-pill-bubble relative flex min-h-[44px] min-w-0 flex-1 overflow-hidden !gap-0 !rounded-2xl !border-0 !p-0 !shadow-none sm:!rounded-[22px]',
              'bg-black/[0.04] backdrop-blur-[2px]',
              'transition-[background-color,min-height] duration-200 ease-out',
              'focus-within:bg-black/[0.07]',
              'dark:bg-white/[0.06] dark:focus-within:bg-white/[0.09]',
            ].join(' ')}
          >
            {/*
             * A11y: см. aria-describedby у textarea ниже.
             */}
            {mentionParticipants.length > 0 ? (
              <span id="chat-input-mention-hint" className="sr-only">
                Наберите символ собака, чтобы упомянуть участника
              </span>
            ) : null}
            {pending || pendingImages.length > 0 ? (
              <span id="chat-input-attachment-hint" className="sr-only">
                {pendingImages.length > 0
                  ? `К сообщению прикреплено фотографий: ${pendingImages.length}. Будут отправлены одним сообщением.`
                  : `К сообщению прикреплено вложение: ${pending?.file.name}. Будет отправлено вместе с текстом.`}
              </span>
            ) : null}
            {uploading ? (
              <span id="chat-input-uploading-hint" className="sr-only" aria-live="polite">
                Загружается файл {uploading.name}. Подождите завершения загрузки.
              </span>
            ) : null}

            <textarea
              ref={textareaRef}
              className={[
                'tg-input-textarea tg-composer-textarea !min-h-[44px] min-w-0 flex-1 resize-none !self-stretch !bg-transparent',
                '!max-h-[min(40dvh,200px)] py-2.5 pl-3 text-[16px] !leading-[1.45] text-[var(--text)] placeholder:text-stone-400/90',
                '!pb-2.5 outline-none transition-[height] duration-200 ease-out dark:placeholder:text-stone-500',
              ].join(' ')}
              placeholder={
                pending?.isAudio
                  ? 'Добавить описание…'
                  : pendingImages.length > 0 || pending
                    ? 'Добавить подпись…'
                    : placeholder
              }
              enterKeyHint="send"
              inputMode="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="sentences"
              spellCheck="true"
              title={
                mentionParticipants.length > 0
                  ? 'Enter — отправить · Shift+Enter — новая строка · @ — упоминание'
                  : 'Enter — отправить · Shift+Enter — новая строка'
              }
              aria-label="Текст сообщения"
              aria-describedby={
                [
                  mentionParticipants.length > 0 ? 'chat-input-mention-hint' : null,
                  pending || pendingImages.length > 0 ? 'chat-input-attachment-hint' : null,
                  uploading ? 'chat-input-uploading-hint' : null,
                ]
                  .filter((id): id is string => Boolean(id))
                  .join(' ') || undefined
              }
              aria-multiline="true"
              rows={1}
              value={content}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => {
                composingRef.current = true;
              }}
              onCompositionEnd={() => {
                composingRef.current = false;
              }}
              onPaste={(e) => {
                const fl = e.clipboardData?.files;
                if (!fl || fl.length === 0) return;
                e.preventDefault();
                ingestExternalFiles(Array.from(fl));
              }}
            />

            <div
              ref={emojiRef}
              className="pointer-events-none absolute bottom-1.5 right-2 z-[5000] flex items-end"
            >
              <button
                ref={emojiBtnRef}
                type="button"
                className={[
                  'pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors',
                  'border-transparent text-stone-500 hover:border-white/35 hover:bg-white/35 hover:text-stone-800',
                  'dark:text-stone-300 dark:hover:bg-white/10 dark:hover:text-white',
                ].join(' ')}
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onClick={() => {
                  haptic(8);
                  setAttachMenuOpen(false);
                  emojiOutsideGraceRef.current = true;
                  setEmojiOpen((v) => !v);
                  window.requestAnimationFrame(() => {
                    window.requestAnimationFrame(() => {
                      emojiOutsideGraceRef.current = false;
                    });
                  });
                }}
                aria-label="Эмодзи"
                aria-expanded={emojiOpen}
                aria-haspopup="dialog"
                title="Эмодзи"
              >
                <LuSmile size={21} strokeWidth={2} aria-hidden />
              </button>
            </div>
          </div>

          <div className="shrink-0">
            <button
              ref={sendOrMicBtnRef}
              type="button"
              className={[
                'tg-send-btn sendBtn relative !flex !h-11 !w-11 !min-h-[44px] !min-w-[44px] shrink-0 touch-none select-none items-center justify-center !rounded-full',
                isRecording ? 'recording' : '',
                isRecording && captureKind === 'video_note' ? 'videoMode' : '',
                textOnly && !hasSendAction ? 'opacity-45' : '',
              ].join(' ')}
              onPointerDown={!editing && !textOnly ? onSendOrMicPointerDown : undefined}
              onPointerUp={!editing && !textOnly ? (ev) => onSendOrMicPointerEnd(ev, true) : undefined}
              onPointerCancel={!editing && !textOnly ? (ev) => onSendOrMicPointerEnd(ev, false) : undefined}
              onClick={() => {
                if (suppressVoiceSendClickRef.current) {
                  suppressVoiceSendClickRef.current = false;
                  return;
                }
                if (hasSendAction) {
                  void handleSend();
                } else {
                  focusMessengerField(textareaRef.current);
                }
              }}
              disabled={
                uploading != null ||
                (textOnly
                  ? !hasSendAction
                  : !hasSendAction && (!canSendAttachments || !uploadsHealthy))
              }
              aria-label={(() => {
                if (textOnly) return hasSendAction ? 'Отправить' : 'Введите вопрос';
                if (!canSendAttachments || !uploadsHealthy) {
                  return hasSendAction ? 'Отправить' : 'Голосовые сообщения недоступны';
                }
                if (hasSendAction) {
                  const canVoiceHint =
                    !replyTo &&
                    !replyingTo &&
                    !pending &&
                    pendingImages.length === 0 &&
                    Boolean(content.trim());
                  return canVoiceHint
                    ? 'Отправить. Удерживайте — голос или кружок; текст пойдёт подписью'
                    : 'Отправить';
                }
                return 'Удерживайте: запись. Влево — видеокружок до 1 мин, вправо — голос';
              })()}
              title={(() => {
                if (textOnly) return hasSendAction ? 'Отправить' : 'Введите вопрос';
                if (!canSendAttachments || !uploadsHealthy) {
                  return hasSendAction ? 'Отправить' : 'Голосовые сообщения недоступны';
                }
                if (hasSendAction) {
                  const canVoiceHint =
                    !replyTo &&
                    !replyingTo &&
                    !pending &&
                    pendingImages.length === 0 &&
                    Boolean(content.trim());
                  return canVoiceHint
                    ? 'Отправить · удерживайте — голос или кружок с подписью'
                    : 'Отправить';
                }
                return 'Удерживайте: влево — кружок, вправо — голос';
              })()}
            >
              <span
                className={['iconWrapper sendEnter', iconMode === 'send' ? 'visible' : 'hidden'].join(' ')}
                aria-hidden
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 20V4M12 4L5 11M12 4L19 11"
                    stroke="white"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span
                className={['iconWrapper', iconMode === 'mic' ? 'visible' : 'hidden'].join(' ')}
                aria-hidden
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <rect x="9" y="2" width="6" height="12" rx="3" fill="white" />
                  <path
                    d="M5 10a7 7 0 0014 0M12 19v3M9 22h6"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <span
                className={['iconWrapper', iconMode === 'video' ? 'visible' : 'hidden'].join(' ')}
                aria-hidden
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <rect x="2" y="6" width="13" height="12" rx="2.5" fill="white" />
                  <path d="M15 10l5-3v10l-5-3V10z" fill="white" />
                </svg>
              </span>
            </button>
          </div>
        </div>
      </div>

      {typeof document !== 'undefined' && attachMenuPresent && attachPos
        ? createPortal(
            <div
              ref={attachPopoverRef}
              role="menu"
              style={{
                position: 'fixed',
                bottom: `${attachPos.bottomPx}px`,
                left: attachPos.leftPx != null ? `${attachPos.leftPx}px` : undefined,
                right: attachPos.rightPx != null ? `${attachPos.rightPx}px` : undefined,
                zIndex: 100000,
              }}
              className={[
                'tg-popover w-56 overflow-hidden rounded-2xl border border-gray-100 bg-[var(--surface-elevated)] shadow-md',
                attachMenuExiting ? 'tg-popover--out' : '',
              ].join(' ')}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => pickFile('image')}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-[var(--text)] transition-colors duration-200 hover:bg-[var(--surface)] active:bg-stone-100"
              >
                <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                  <LuImage className="absolute left-1.5 top-1.5" size={14} aria-hidden />
                  <LuVideo className="absolute bottom-1 right-1" size={14} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">Фото или видео</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  haptic(12);
                  setAttachMenuOpen(false);
                  setPollModalOpen(true);
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-[var(--text)] transition-colors duration-200 hover:bg-[var(--surface)] active:bg-stone-100"
              >
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-50 text-violet-600 ring-1 ring-violet-100">
                  <LuChartColumn size={18} />
                </span>
                <span className="min-w-0 flex-1">Опрос</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => pickFile('audio')}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-[var(--text)] transition-colors duration-200 hover:bg-[var(--surface)] active:bg-stone-100"
              >
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/25">
                  <LuMusic size={18} />
                </span>
                <span className="min-w-0 flex-1">Аудиофайл</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => pickFile('file')}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-[var(--text)] transition-colors duration-200 hover:bg-[var(--surface)] active:bg-stone-100"
              >
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-stone-50 text-stone-700 ring-1 ring-stone-200/70">
                  <LuFileText size={18} />
                </span>
                <span className="min-w-0 flex-1">Файл</span>
              </button>
            </div>,
            document.body,
          )
        : null}

      {typeof document !== 'undefined' && emojiPresent && emojiPos
        ? createPortal(
            <div
              ref={emojiPopoverRef}
              className={[
                'tg-popover tg-emoji-picker-popover overflow-hidden border border-gray-100 bg-[var(--surface-elevated)] shadow-md',
                emojiPos.layout === 'sheet' ? 'tg-emoji-picker-popover--sheet' : 'rounded-2xl',
                emojiExiting ? 'tg-popover--out' : '',
              ].join(' ')}
              role="dialog"
              aria-label="Выбор эмодзи"
              style={{
                position: 'fixed',
                bottom: `${emojiPos.bottomPx}px`,
                left:
                  emojiPos.layout === 'sheet'
                    ? 0
                    : emojiPos.leftPx != null
                      ? `${emojiPos.leftPx}px`
                      : undefined,
                right: emojiPos.layout === 'sheet' ? 0 : emojiPos.rightPx != null ? `${emojiPos.rightPx}px` : undefined,
                width: emojiPos.layout === 'sheet' ? '100%' : undefined,
                maxWidth: emojiPos.layout === 'sheet' ? '100%' : undefined,
                maxHeight: emojiPos.maxHeightPx != null ? `${emojiPos.maxHeightPx}px` : undefined,
                zIndex: 100000,
                boxSizing: 'border-box',
              }}
            >
              <Picker
                key={narrowEmojiSheet ? 'emoji-sheet' : 'emoji-floating'}
                data={emojiData as any}
                onEmojiSelect={(e: any) => insertEmoji(String(e?.native ?? ''))}
                theme="auto"
                locale="ru"
                set="native"
                searchPosition="sticky"
                previewPosition="none"
                skinTonePosition="search"
                navPosition="bottom"
                dynamicWidth={true}
                autoFocus={false}
                emojiButtonSize={narrowEmojiSheet ? 46 : 38}
                emojiSize={narrowEmojiSheet ? 32 : 25}
                emojiButtonRadius={narrowEmojiSheet ? '14px' : '100%'}
                perLine={narrowEmojiSheet ? 7 : 8}
                maxFrequentRows={narrowEmojiSheet ? 3 : 2}
              />
            </div>,
            document.body,
          )
        : null}

      <PollCreateModal
        open={pollModalOpen}
        onClose={() => setPollModalOpen(false)}
        conversationId={conversationId}
      />
    </div>
  );
}

function formatVoiceElapsed(startedAt: number, tick: number): string {
  void tick;
  const sec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const fixed = i === 0 ? String(Math.round(v)) : v.toFixed(v >= 10 ? 0 : 1);
  return `${fixed} ${units[i]}`;
}

