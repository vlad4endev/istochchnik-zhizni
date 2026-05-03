import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useChatStore, isDraftPrivateConversationId } from '../chatStore';
import { LuPaperclip, LuSmile, LuSend, LuX, LuImage, LuFileText, LuChartColumn, LuMic } from 'react-icons/lu';
import * as api from '../api/messengerApi';
import Picker from '@emoji-mart/react';
import emojiData from '@emoji-mart/data';
import { PollCreateModal } from './PollCreateModal';
import { buildMentionToken, denormalizeMentionsForEditor } from '../mentionUtils';
import { compressImageForMessengerUpload } from '../compressImageForUpload';
import axios from 'axios';
import { emitAppToast } from '../../../lib/uiFeedback';

function toastMessengerUploadError(e: unknown): void {
  const err = e as Error & { code?: string };
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as { error?: string; code?: string } | undefined;
    if (data?.code === 'supabase_not_configured') {
      emitAppToast('Загрузка файлов временно недоступна', 'error');
      return;
    }
    if (typeof data?.error === 'string' && data.error.trim()) {
      emitAppToast(data.error.trim(), 'error');
      return;
    }
  }
  if (typeof err?.code === 'string' && err.code === 'supabase_not_configured') {
    emitAppToast('Загрузка файлов временно недоступна', 'error');
    return;
  }
  emitAppToast('Не удалось загрузить файл', 'error');
}

type PendingAttachment = {
  file: File;
  isImage: boolean;
  previewUrl: string | null;
  uploaded?: api.UploadedFile | null;
};

const IMAGE_NAME_EXT_RE = /\.(jpe?g|png|webp|gif|heic|heif)$/i;

type PopoverPos =
  | { bottomPx: number; leftPx?: number; rightPx?: number }
  | null;

interface ChatInputProps {
  conversationId: string;
  sendTypingStart: (convId: string) => void;
  sendTypingStop: (convId: string) => void;
  canSend: boolean;
  /** Медиа/файлы (отдельное право в группах/каналах). По умолчанию совпадает с возможностью писать текст. */
  canSendAttachments?: boolean;
  /** Участники для @-упоминаний (группы/каналы). */
  mentionParticipants?: { id: number; label: string }[];
  /** Имена по id — чтобы при редактировании показывать @Имя, а не @[цифры]. */
  participantLabelById?: Record<number, string>;
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
      el.style.height = `${singleLineTextareaHeightPx(el)}px`;
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

/** Правый край у кнопки, вся панель в пределах экрана (не уезжает влево). */
function computeEmojiPopoverPos(rect: DOMRect): PopoverPos {
  const pad = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(EMOJI_PICKER_MAX_WIDTH_PX, vw - 2 * pad);
  const bottomPx = Math.max(pad, Math.round(vh - rect.top + 8));
  const anchorRight = Math.min(rect.right, vw - pad);
  let leftPx = Math.round(anchorRight - w);
  leftPx = Math.max(pad, Math.min(leftPx, vw - pad - w));
  return { bottomPx, leftPx };
}

export function ChatInput({
  conversationId,
  sendTypingStart,
  sendTypingStop,
  canSend,
  canSendAttachments = true,
  mentionParticipants = [],
  participantLabelById = {},
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
  /** Только черновик текущего чата — не перезагружаем поле при сохранении черновиков других диалогов. */
  const draftForConversation = useChatStore((s) => s.drafts[conversationId] ?? '');

  const [content, setContent] = useState('');
  const [pending, setPending] = useState<PendingAttachment | null>(null);
  const [pendingImages, setPendingImages] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState<{ name: string; size: number } | null>(null);
  const [uploadPct, setUploadPct] = useState<number>(0);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [uploadsHealthy, setUploadsHealthy] = useState(true);
  const [uploadsHealthChecking, setUploadsHealthChecking] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachMenuPresent, setAttachMenuPresent] = useState(false);
  const [attachMenuExiting, setAttachMenuExiting] = useState(false);
  const [emojiPresent, setEmojiPresent] = useState(false);
  const [emojiExiting, setEmojiExiting] = useState(false);
  const [pollModalOpen, setPollModalOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const attachBtnRef = useRef<HTMLButtonElement>(null);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);
  const attachPopoverRef = useRef<HTMLDivElement>(null);
  const emojiPopoverRef = useRef<HTMLDivElement>(null);
  const [attachPos, setAttachPos] = useState<PopoverPos>(null);
  const [emojiPos, setEmojiPos] = useState<PopoverPos>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const filePickerModeRef = useRef<'image' | 'file'>('image');
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

  const focusComposer = useCallback(() => {
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, []);

  // Подставляем черновик при смене чата или когда с сервера/другой вкладки обновился именно этот ключ.
  useEffect(() => {
    setContent(draftForConversation);
    requestAnimationFrame(() => scheduleTextareaAutosize(textareaRef.current));
  }, [conversationId, draftForConversation]);

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
        if (!cancelled) setUploadsHealthy(false);
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
      textareaRef.current?.focus();
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
      if (e.key === 'Escape') setPreviewSrc(null);
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
      const el = attachMenuRef.current;
      const pop = attachPopoverRef.current;
      if (e.target instanceof Node) {
        if (el && el.contains(e.target)) return;
        if (pop && pop.contains(e.target)) return;
      }
      setAttachMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc, { passive: true });
    document.addEventListener('touchstart', onDoc, { passive: true });
    return () => {
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
      const el = emojiRef.current;
      const pop = emojiPopoverRef.current;
      if (e.target instanceof Node) {
        if (el && el.contains(e.target)) return;
        if (pop && pop.contains(e.target)) return;
      }
      setEmojiOpen(false);
    };
    document.addEventListener('mousedown', onDoc, { passive: true });
    document.addEventListener('touchstart', onDoc, { passive: true });
    return () => {
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
      setEmojiPos(computeEmojiPopoverPos(emojiBtnRef.current.getBoundingClientRect()));
    }
  }, [attachMenuOpen, emojiOpen]);

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
    const apply = () => setEmojiPos(computeEmojiPopoverPos(btn.getBoundingClientRect()));
    apply();
    const id = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(id);
  }, [emojiOpen]);

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
        el.focus();
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
      if (!uploadsHealthy) {
        setUploadErr('Хранилище файлов сейчас недоступно. Повторите отправку позже.');
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
            setUploading({ name: item.file.name, size: item.file.size });
            const ctrl = new AbortController();
            uploadAbortRef.current = ctrl;
            const fileToUpload = await compressImageForMessengerUpload(item.file, ctrl.signal);
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
        focusComposer();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.toLowerCase().includes('canceled') || msg.toLowerCase().includes('abort')) {
          setUploadErr('Загрузка отменена');
        } else {
          setUploadErr('Не удалось загрузить или отправить фотографии');
          toastMessengerUploadError(e);
        }
      } finally {
        setUploading(null);
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
      if (!uploadsHealthy) {
        setUploadErr('Хранилище файлов сейчас недоступно. Повторите отправку позже.');
        return;
      }
      setUploadErr(null);
      setUploadPct(0);
      try {
        let uploaded = pending.uploaded ?? null;
        if (!uploaded) {
          setUploading({ name: pending.file.name, size: pending.file.size });
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
        const payloadType: api.MessagePayloadType = pending.isImage ? 'image' : 'file';
        const payload = {
          url: uploaded.url,
          name: uploaded.name || pending.file.name,
          objectPath: uploaded.objectPath,
          mimeType: uploaded.mimeType || pending.file.type || '',
          size: uploaded.size || pending.file.size || 0,
        };
        const sent = await sendMessage(conversationId, text, numericReplyId, payloadType, payload);
        if (!sent) return;
        setReplyingTo(null);
        setReplyTo(null);
        setContent('');
        clearDraft(conversationId);
        if (pending.previewUrl) URL.revokeObjectURL(pending.previewUrl);
        setPending(null);
        setPreviewSrc(null);
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
        setUploading(null);
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

  const pickFile = (kind: 'image' | 'file') => {
    if (!canSendAttachments) {
      setUploadErr('В этом чате для вас отключена отправка фото и файлов.');
      return;
    }
    if (!uploadsHealthy) {
      setUploadErr('Хранилище файлов недоступно. Вложения временно отключены.');
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
        ? 'image/*'
        : 'application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt';
    input.click();
  };

  const handleFileSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadErr(null);
    const selected = Array.from(files);
    const pickerMode = filePickerModeRef.current;
    if (pickerMode === 'image' && selected.length > 1) {
      const maxBytes = 20 * 1024 * 1024;
      const tooBig = selected.find((f) => f.size > maxBytes);
      if (tooBig) {
        setUploadErr('Одна из фотографий больше 20MB');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      const bad = selected.find((f) => {
        const isImage =
          (f.type || '').startsWith('image/') ||
          IMAGE_NAME_EXT_RE.test(String(f.name || '').trim());
        return !isImage;
      });
      if (bad) {
        setUploadErr('Можно выбрать несколько файлов только в режиме фото');
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
          isImage: true,
          previewUrl: URL.createObjectURL(file),
          uploaded: null,
        })),
      );
      textareaRef.current?.focus();
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
    // Allow common images and office/docs (same as accept), plus any type that browser provides.
    const allowedByAccept =
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
      (file.type || '').startsWith('image/') ||
      IMAGE_NAME_EXT_RE.test(String(file.name || '').trim());
    const previewUrl = isImage ? URL.createObjectURL(file) : null;
    setPending({ file, isImage, previewUrl, uploaded: null });
    textareaRef.current?.focus();
  };

  /** Вставка из буфера / drag-and-drop — та же ветка, что и выбор файла из меню. */
  const ingestExternalFiles = (files: File[]) => {
    if (!canSendAttachments || !uploadsHealthy || files.length === 0) return;
    const allImage = files.every(
      (f) =>
        (f.type || '').startsWith('image/') ||
        IMAGE_NAME_EXT_RE.test(String(f.name || '').trim()),
    );
    filePickerModeRef.current = allImage ? 'image' : 'file';
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
        el.focus();
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
        } else if (/^\[[^\]]*\]\(/.test(frag)) {
          // Уже внутри или после `@[Имя](` — не показываем меню
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
            query = frag.trim();
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

  const handleMic = () => {
    haptic(8);
    textareaRef.current?.focus();
  };
  const hasSendAction = Boolean(content.trim() || pending || pendingImages.length > 0);

  if (!canSend) {
    return (
      <div className="tg-input-area" style={{ justifyContent: 'center' }}>
        <p className="tg-empty-sub px-2 text-center">В этом чате для вас отключена отправка сообщений</p>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0">
      {/* Reply/Edit Banners */}
      {(replyTo || editing) && (
        <div className="tg-input-banner">
          <div className="tg-input-banner-bar" aria-hidden />
          <div className="tg-input-banner-content">
            <div className="tg-input-banner-title">
              {replyTo ? `Ответ ${replyTo.sender_name}` : 'Редактирование'}
            </div>
            <div className="tg-input-banner-text">
              {replyTo ? replyTo.content : editing?.content}
            </div>
          </div>
          <button 
            type="button" 
            className="tg-input-banner-close"
            onClick={() => { setReplyTo(null); setEditing(null); }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Swipe-to-reply preview */}
      {replyingTo ? (
        <div className="mb-2 overflow-hidden rounded-2xl border border-gray-100 bg-[var(--surface-elevated)] shadow-sm">
          <div className="flex items-start gap-3 p-3">
            <div className="w-1 self-stretch rounded-full bg-blue-500" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-[var(--text)]">
                {replyingTo.sender_name || 'Сообщение'}
              </p>
              <p className="mt-0.5 truncate text-sm text-[var(--text-secondary)]">
                {String(replyingTo.content || '').trim() || '—'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors duration-200 hover:bg-[var(--surface)]"
              aria-label="Отменить ответ"
              title="Отменить"
            >
              <LuX />
            </button>
          </div>
        </div>
      ) : null}

      {pendingImages.length > 0 ? (
        <div className="mb-2 overflow-hidden rounded-2xl border border-gray-100 bg-[var(--surface-elevated)] shadow-sm">
          <div className="flex items-start gap-3 p-3">
            <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
              {pendingImages.slice(0, 6).map((item, idx) => (
                <button
                  key={`${item.file.name}-${idx}`}
                  type="button"
                  onClick={() => item.previewUrl && setPreviewSrc(item.previewUrl)}
                  className="aspect-square overflow-hidden rounded-xl bg-[var(--surface)] ring-1 ring-gray-200/70"
                  aria-label={`Открыть фото ${idx + 1}`}
                >
                  {item.previewUrl ? (
                    <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
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
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors duration-200 hover:bg-[var(--surface)]"
              aria-label="Убрать фотографии"
              title="Убрать фотографии"
            >
              <LuX />
            </button>
          </div>
          <div className="px-3 pb-3 text-xs text-[var(--text-secondary)]">
            Выбрано фото: {pendingImages.length}. Можно добавить подпись и отправить одним сообщением.
          </div>
        </div>
      ) : pending ? (
        <div className="mb-2 overflow-hidden rounded-2xl border border-gray-100 bg-[var(--surface-elevated)] shadow-sm">
          <div className="flex items-start gap-3 p-3">
            {pending.isImage && pending.previewUrl ? (
              <div className="h-14 w-14 overflow-hidden rounded-xl bg-[var(--surface)] ring-1 ring-gray-200/70">
                <button
                  type="button"
                  onClick={() => setPreviewSrc(pending.previewUrl)}
                  className="h-full w-full"
                  aria-label="Открыть превью"
                >
                  <img src={pending.previewUrl} alt="" className="h-full w-full object-cover" />
                </button>
              </div>
            ) : (
              <div className="grid h-14 w-14 place-items-center rounded-xl bg-[var(--surface)] text-[var(--text-secondary)] ring-1 ring-gray-200/70">
                <LuPaperclip />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--text)]">{pending.file.name}</p>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                {pending.isImage ? 'Фото' : 'Файл'} · {formatBytes(pending.file.size)}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Можно добавить подпись и нажать «Отправить»
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                if (pending.previewUrl) URL.revokeObjectURL(pending.previewUrl);
                setPending(null);
                setPreviewSrc(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors duration-200 hover:bg-[var(--surface)]"
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
          onClick={() => setPreviewSrc(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Превью перед отправкой"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setPreviewSrc(null);
            }}
            className="absolute right-4 top-4 z-[4001] flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition hover:bg-white/25"
            aria-label="Закрыть превью"
          >
            <LuX className="h-6 w-6" strokeWidth={2} aria-hidden />
          </button>
          <div className="mx-auto flex h-full max-w-xl items-center justify-center">
            <img
              src={previewSrc}
              alt=""
              className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      ) : null}

      {uploading ? (
        <div className="mb-2 flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-[var(--surface-elevated)] px-4 py-3 shadow-sm">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--text)]">Загрузка файла…</p>
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
          <button
            type="button"
            onClick={() => {
              uploadAbortRef.current?.abort();
              setUploading(null);
              setUploadPct(0);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors duration-200 hover:bg-[var(--surface)]"
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
      {!uploadsHealthy ? (
        <p className="mb-2 text-sm font-semibold text-amber-700">
          Хранилище вложений недоступно. Отправка фото и файлов временно отключена.
          {uploadsHealthChecking ? ' Проверяем восстановление…' : ''}
        </p>
      ) : null}
      {canSend && !canSendAttachments ? (
        <p className="mb-2 text-sm font-semibold text-amber-800">
          В этом чате для вас отключены фото и файлы (настройки группы).
        </p>
      ) : null}

      <div className="relative w-full min-w-0">
        <div
          className="tg-input-area w-full min-w-0 items-end gap-2 py-2"
          onDragOver={(e) => {
            if (!uploadsHealthy || !canSendAttachments) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={(e) => {
            if (!uploadsHealthy || !canSendAttachments) return;
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

          <div
            className={[
              'tg-input-container relative min-h-0 min-w-0 flex-1 !gap-1 overflow-hidden !rounded-3xl !border !border-gray-200 !bg-[var(--surface-elevated)] !p-0 !shadow-sm',
              'transition-[box-shadow,border-color] focus-within:!border-[color:var(--tg-primary)]/45',
              'focus-within:shadow-[0_0_0_1px_rgba(125,54,64,0.14)]',
            ].join(' ')}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*"
              onChange={(e) => void handleFileSelected(e.target.files)}
            />
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

            <div ref={attachMenuRef} className="relative z-[5000] shrink-0 self-end">
              <button
                ref={attachBtnRef}
                type="button"
                className="tg-input-icon-btn transition-colors duration-200"
                disabled={!uploadsHealthy || !canSendAttachments}
                onClick={() => {
                  haptic(8);
                  setAttachMenuOpen((v) => !v);
                }}
                aria-label="Вложения"
                aria-expanded={attachMenuOpen}
                aria-haspopup="menu"
                title="Вложения"
              >
                <LuPaperclip size={19} />
              </button>
            </div>

            <textarea
              ref={textareaRef}
              className={[
                'tg-input-textarea min-h-0 min-w-0 flex-1 !max-h-[140px] resize-none !bg-transparent',
                '!px-1 !py-[10px] text-[16px] !leading-5 text-[var(--text)] placeholder:text-[var(--text-muted)]',
                'self-end outline-none transition-[height] duration-150 ease-out',
              ].join(' ')}
              placeholder="Сообщение"
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

            <div ref={emojiRef} className="relative z-[5000] shrink-0 self-end">
              <button
                ref={emojiBtnRef}
                type="button"
                className="tg-input-icon-btn tg-emoji-btn transition-colors duration-200"
                onClick={() => {
                  haptic(8);
                  setEmojiOpen((v) => !v);
                }}
                aria-label="Эмодзи"
                aria-expanded={emojiOpen}
                aria-haspopup="dialog"
                title="Эмодзи"
              >
                <LuSmile size={22} />
              </button>
            </div>
          </div>

          <div className="shrink-0 self-end">
            <button
              type="button"
              className="tg-send-btn transition-colors duration-200"
              onClick={() => {
                if (hasSendAction) {
                  void handleSend();
                } else {
                  handleMic();
                }
              }}
              disabled={uploading != null}
              aria-label={hasSendAction ? 'Отправить' : 'Голосовые сообщения пока недоступны'}
              title={hasSendAction ? 'Отправить' : 'Голосовые сообщения скоро'}
              style={{
                background: hasSendAction ? 'var(--tg-primary)' : 'transparent',
                color: hasSendAction ? '#fff' : '#888',
                boxShadow: hasSendAction ? '0 2px 8px rgba(125,54,64,0.35)' : 'none',
              }}
            >
              <span
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  position: 'absolute',
                  transition: 'transform 0.2s ease, opacity 0.2s ease',
                  transform: hasSendAction ? 'scale(1) rotate(0deg)' : 'scale(0.7) rotate(-30deg)',
                  opacity: hasSendAction ? 1 : 0,
                }}
              >
                <LuSend size={20} />
              </span>
              <span
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  position: 'absolute',
                  transition: 'transform 0.2s ease, opacity 0.2s ease',
                  transform: hasSendAction ? 'scale(0.7) rotate(30deg)' : 'scale(1) rotate(0deg)',
                  opacity: hasSendAction ? 0 : 1,
                }}
              >
                <LuMic size={20} />
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
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                  <LuImage size={18} />
                </span>
                <span className="min-w-0 flex-1">Изображение</span>
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
                'tg-popover tg-emoji-picker-popover overflow-hidden rounded-2xl border border-gray-100 bg-[var(--surface-elevated)] shadow-md',
                emojiExiting ? 'tg-popover--out' : '',
              ].join(' ')}
              role="dialog"
              aria-label="Выбор эмодзи"
              style={{
                position: 'fixed',
                bottom: `${emojiPos.bottomPx}px`,
                left: emojiPos.leftPx != null ? `${emojiPos.leftPx}px` : undefined,
                right: emojiPos.rightPx != null ? `${emojiPos.rightPx}px` : undefined,
                zIndex: 100000,
              }}
            >
              <Picker
                data={emojiData as any}
                onEmojiSelect={(e: any) => insertEmoji(String(e?.native ?? ''))}
                theme="light"
                searchPosition="sticky"
                previewPosition="none"
                navPosition="bottom"
                dynamicWidth={true}
                perLine={8}
                maxFrequentRows={2}
                locale="ru"
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

