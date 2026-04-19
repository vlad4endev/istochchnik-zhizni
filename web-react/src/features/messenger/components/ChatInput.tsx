import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useChatStore, isDraftPrivateConversationId } from '../chatStore';
import { LuPaperclip, LuPlus, LuSmile, LuSend, LuX, LuImage, LuFileText, LuChartColumn } from 'react-icons/lu';
import * as api from '../api/messengerApi';
import Picker from '@emoji-mart/react';
import emojiData from '@emoji-mart/data';
import { PollCreateModal } from './PollCreateModal';
import { buildMentionToken, denormalizeMentionsForEditor } from '../mentionUtils';
import { compressImageForMessengerUpload } from '../compressImageForUpload';

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
  /** Участники для @-упоминаний (группы/каналы). */
  mentionParticipants?: { id: number; label: string }[];
  /** Имена по id — чтобы при редактировании показывать @Имя, а не @[цифры]. */
  participantLabelById?: Record<number, string>;
}

/** Высоту textarea считаем в следующем кадре после `height: auto`, чтобы реже ловить forced reflow. */
function scheduleTextareaAutosize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  requestAnimationFrame(() => {
    el.style.height = `${el.scrollHeight}px`;
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
  const drafts = useChatStore((s) => s.drafts);
  const clearDraft = useChatStore((s) => s.clearDraft);

  const [content, setContent] = useState('');
  const [pending, setPending] = useState<PendingAttachment | null>(null);
  const [uploading, setUploading] = useState<{ name: string; size: number } | null>(null);
  const [uploadPct, setUploadPct] = useState<number>(0);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [uploadsHealthy, setUploadsHealthy] = useState(true);
  const [uploadsHealthChecking, setUploadsHealthChecking] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
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
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingStartDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionStart, setMentionStart] = useState(0);
  const [mentionFiltered, setMentionFiltered] = useState<{ id: number; label: string }[]>([]);
  const [mentionHighlight, setMentionHighlight] = useState(0);
  const lastOpenedEditIdRef = useRef<string | null>(null);
  const uploadsHealthTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load draft on conversation change
  useEffect(() => {
    const draft = drafts[conversationId] || '';
    setContent(draft);
  }, [conversationId, drafts]);

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
    };
  }, [pending?.previewUrl]);

  useEffect(() => {
    if (!showPreview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowPreview(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showPreview]);

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
    haptic(10);
    const text = content.trim();
    if (pending) {
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
        await sendMessage(conversationId, text, replyingTo?.id || null, payloadType, payload);
        setReplyingTo(null);
        setReplyTo(null);
        setContent('');
        clearDraft(conversationId);
        if (pending.previewUrl) URL.revokeObjectURL(pending.previewUrl);
        setPending(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.toLowerCase().includes('canceled') || msg.toLowerCase().includes('abort')) {
          setUploadErr('Загрузка отменена');
        } else if (pending.uploaded) {
          setUploadErr('Файл загружен, но сообщение не отправилось. Нажмите отправить снова.');
        } else {
          setUploadErr('Не удалось загрузить или отправить файл');
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
    setContent('');
    clearDraft(conversationId);

    if (editing) {
      const msgId = editing.id;
      setEditing(null);
      await editMessage(msgId, text);
    } else {
      const replyId = replyingTo?.id || null;
      setReplyingTo(null);
      setReplyTo(null);
      await sendMessage(conversationId, text, replyId);
    }

    scheduleTextareaAutosize(textareaRef.current);
    if (!isDraftPrivateConversationId(conversationId)) {
      sendTypingStop(conversationId);
    }
  };

  const pickFile = (kind: 'image' | 'file') => {
    if (!uploadsHealthy) {
      setUploadErr('Хранилище файлов недоступно. Вложения временно отключены.');
      return;
    }
    setUploadErr(null);
    setAttachMenuOpen(false);
    haptic(12);
    const input = fileInputRef.current;
    if (!input) return;
    input.accept =
      kind === 'image'
        ? 'image/*'
        : 'application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt';
    input.click();
  };

  const handleFileSelected = async (file: File | null) => {
    if (!file) return;
    setUploadErr(null);
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
    const isImage =
      (file.type || '').startsWith('image/') ||
      IMAGE_NAME_EXT_RE.test(String(file.name || '').trim());
    const previewUrl = isImage ? URL.createObjectURL(file) : null;
    setPending({ file, isImage, previewUrl, uploaded: null });
    textareaRef.current?.focus();
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
      e.preventDefault();
      void handleSend();
    }
    if (e.key === 'Escape') {
      if (mentionOpen) setMentionOpen(false);
      if (editing) setEditing(null);
      if (replyTo) setReplyTo(null);
    }
  };

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
          <div className="tg-input-banner-icon">
            {replyTo ? '↩️' : '✏️'}
          </div>
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
        <div className="mb-2 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-start gap-3 p-3">
            <div className="w-1 self-stretch rounded-full bg-blue-500" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-gray-900">
                {replyingTo.sender_name || 'Сообщение'}
              </p>
              <p className="mt-0.5 truncate text-sm text-gray-500">
                {String(replyingTo.content || '').trim() || '—'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors duration-200 hover:bg-gray-100"
              aria-label="Отменить ответ"
              title="Отменить"
            >
              <LuX />
            </button>
          </div>
        </div>
      ) : null}

      {pending ? (
        <div className="mb-2 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-start gap-3 p-3">
            {pending.isImage && pending.previewUrl ? (
              <div className="h-14 w-14 overflow-hidden rounded-xl bg-gray-100 ring-1 ring-gray-200/70">
                <button
                  type="button"
                  onClick={() => setShowPreview(true)}
                  className="h-full w-full"
                  aria-label="Открыть превью"
                >
                  <img src={pending.previewUrl} alt="" className="h-full w-full object-cover" />
                </button>
              </div>
            ) : (
              <div className="grid h-14 w-14 place-items-center rounded-xl bg-gray-100 text-gray-600 ring-1 ring-gray-200/70">
                <LuPaperclip />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900">{pending.file.name}</p>
              <p className="mt-0.5 text-xs text-gray-500">
                {pending.isImage ? 'Фото' : 'Файл'} · {formatBytes(pending.file.size)}
              </p>
              <p className="mt-1 text-[11px] text-gray-400">
                Можно добавить подпись и нажать «Отправить»
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                if (pending.previewUrl) URL.revokeObjectURL(pending.previewUrl);
                setPending(null);
                setShowPreview(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors duration-200 hover:bg-gray-100"
              aria-label="Убрать вложение"
              title="Убрать вложение"
            >
              <LuX />
            </button>
          </div>
        </div>
      ) : null}

      {showPreview && pending?.isImage && pending.previewUrl ? (
        <div
          className="fixed inset-0 z-[4000] bg-black/70 p-4"
          onClick={() => setShowPreview(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Превью перед отправкой"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowPreview(false);
            }}
            className="absolute right-4 top-4 z-[4001] flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition hover:bg-white/25"
            aria-label="Закрыть превью"
          >
            <LuX className="h-6 w-6" strokeWidth={2} aria-hidden />
          </button>
          <div className="mx-auto flex h-full max-w-xl items-center justify-center">
            <img
              src={pending.previewUrl}
              alt=""
              className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      ) : null}

      {uploading ? (
        <div className="mb-2 flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">Загрузка файла…</p>
            <p className="mt-0.5 truncate text-xs text-gray-500">
              {uploading.name}{uploadPct ? ` · ${uploadPct}%` : ''}
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
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
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors duration-200 hover:bg-gray-100"
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

      <div className="tg-input-area min-w-0 items-center gap-2 sm:gap-2.5">
        {mentionOpen && mentionFiltered.length > 0 ? (
          <div
            className="mb-1 max-h-40 w-full overflow-y-auto rounded-2xl border border-gray-200 bg-white py-1 shadow-md"
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
                  'flex w-full px-3 py-2 text-left text-sm font-semibold',
                  idx === mentionHighlight ? 'bg-primary/10 text-primary' : 'text-gray-900 hover:bg-gray-50',
                ].join(' ')}
              >
                @{p.label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="tg-input-container relative min-w-0 rounded-3xl border border-gray-200 bg-white shadow-sm">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*"
            onChange={(e) => void handleFileSelected(e.target.files?.[0] ?? null)}
          />
          <div ref={attachMenuRef} className="relative z-[5000]">
            <button
              ref={attachBtnRef}
              type="button"
              className="tg-input-icon-btn transition-colors duration-200"
              disabled={!uploadsHealthy}
              onClick={() => {
                haptic(8);
                setAttachMenuOpen((v) => !v);
              }}
              aria-label="Вложения"
              aria-expanded={attachMenuOpen}
              aria-haspopup="menu"
              title="Вложения"
            >
              <LuPlus size={22} />
            </button>
          </div>
          {/*
           * A11y: VoiceOver/NVDA озвучивают `placeholder` только у пустого поля и не во всех
           * браузерах. Явный `aria-label` гарантирует, что при любом состоянии (пусто / черновик /
           * режим редактирования через `editingMessageId`) фокус на textarea читается как
           * «Сообщение, текстовое поле». Подсказка про @-упоминания вынесена в sr-only узел
           * и привязана через `aria-describedby` — только когда участников для упоминания >1,
           * иначе SR не зачитывает бессмысленное описание в личном чате.
           */}
          {mentionParticipants.length > 0 ? (
            <span id="chat-input-mention-hint" className="sr-only">
              Наберите символ собака, чтобы упомянуть участника
            </span>
          ) : null}
          <textarea
            ref={textareaRef}
            className="tg-input-textarea text-gray-900 placeholder:text-gray-400"
            placeholder={
              mentionParticipants.length > 0 ? 'Сообщение… (наберите @ — позвать человека)' : 'Сообщение…'
            }
            aria-label="Сообщение"
            aria-describedby={mentionParticipants.length > 0 ? 'chat-input-mention-hint' : undefined}
            aria-multiline="true"
            rows={1}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
          />
          <div ref={emojiRef} className="relative z-[5000]">
            <button
              ref={emojiBtnRef}
              type="button"
              className="tg-input-icon-btn transition-colors duration-200"
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

        <button
          type="button"
          className="tg-send-btn transition-colors duration-200"
          onClick={() => void handleSend()}
          disabled={(!content.trim() && !pending) || uploading != null}
          style={{ opacity: (content.trim() || pending) && !uploading ? 1 : 0.5 }}
        >
          <LuSend size={18} style={{ marginLeft: '1px' }} />
        </button>
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
                'tg-popover w-56 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-md',
                attachMenuExiting ? 'tg-popover--out' : '',
              ].join(' ')}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => pickFile('image')}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-gray-900 transition-colors duration-200 hover:bg-gray-50 active:bg-gray-100"
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
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-gray-900 transition-colors duration-200 hover:bg-gray-50 active:bg-gray-100"
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
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-gray-900 transition-colors duration-200 hover:bg-gray-50 active:bg-gray-100"
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
                'tg-popover tg-emoji-picker-popover overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-md',
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

