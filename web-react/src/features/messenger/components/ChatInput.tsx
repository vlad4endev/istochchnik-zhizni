import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../chatStore';
import { LuPaperclip, LuPlus, LuSmile, LuSend, LuX, LuImage, LuFileText } from 'react-icons/lu';
import * as api from '../api/messengerApi';
import Picker from '@emoji-mart/react';
import emojiData from '@emoji-mart/data';

type PendingAttachment = {
  file: File;
  isImage: boolean;
  previewUrl: string | null;
};

interface ChatInputProps {
  conversationId: string;
  sendTypingStart: (convId: string) => void;
  sendTypingStop: (convId: string) => void;
  canSend: boolean;
}

export function ChatInput({
  conversationId,
  sendTypingStart,
  sendTypingStop,
  canSend,
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
  const [showPreview, setShowPreview] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachMenuPresent, setAttachMenuPresent] = useState(false);
  const [attachMenuExiting, setAttachMenuExiting] = useState(false);
  const [emojiPresent, setEmojiPresent] = useState(false);
  const [emojiExiting, setEmojiExiting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load draft on conversation change
  useEffect(() => {
    const draft = drafts[conversationId] || '';
    setContent(draft);
  }, [conversationId, drafts]);

  // Sync content with editing state
  useEffect(() => {
    if (editing) {
      setContent(editing.content);
      textareaRef.current?.focus();
    }
  }, [editing]);

  useEffect(() => {
    return () => {
      if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl);
    };
  }, [pending?.previewUrl]);

  useEffect(() => {
    if (!attachMenuOpen) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      const el = attachMenuRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
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
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
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
        // Recompute height after insertion (iOS-friendly).
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
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
      setUploadErr(null);
      setUploadPct(0);
      setUploading({ name: pending.file.name, size: pending.file.size });
      try {
        // Compress images before upload (mobile-friendly).
        const fileToUpload = pending.isImage ? await compressImage(pending.file) : pending.file;
        const ctrl = new AbortController();
        uploadAbortRef.current = ctrl;
        const uploaded = await api.uploadFile(fileToUpload, {
          onProgress: (pct) => setUploadPct(pct),
          signal: ctrl.signal,
        });
        const payloadType: api.MessagePayloadType = pending.isImage ? 'image' : 'file';
        const payload = {
          url: uploaded.url,
          name: uploaded.originalName || pending.file.name,
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
        } else {
          setUploadErr('Не удалось загрузить файл');
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

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    sendTypingStop(conversationId);
  };

  const pickFile = (kind: 'image' | 'file') => {
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
    const isImage = (file.type || '').startsWith('image/');
    const previewUrl = isImage ? URL.createObjectURL(file) : null;
    setPending({ file, isImage, previewUrl });
    textareaRef.current?.focus();
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setContent(value);

    // Auto-resize
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;

    // Typing indicator
    sendTypingStart(conversationId);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      sendTypingStop(conversationId);
    }, 3000);

    // Auto-save draft with debounce
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(() => {
      saveDraft(conversationId, value);
    }, 500);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
    if (e.key === 'Escape') {
      if (editing) setEditing(null);
      if (replyTo) setReplyTo(null);
    }
  };

  if (!canSend) {
    return (
      <div className="tg-input-area" style={{ justifyContent: 'center' }}>
        <p className="tg-empty-sub">Вы не можете писать в этот канал</p>
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
        <div className="fixed inset-0 z-[4000] bg-black/70 p-4" onClick={() => setShowPreview(false)}>
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

      <div className="tg-input-area min-w-0 items-center gap-2 sm:gap-2.5">
        <div className="tg-input-container min-w-0 rounded-3xl border border-gray-200 bg-white shadow-sm">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*"
            onChange={(e) => void handleFileSelected(e.target.files?.[0] ?? null)}
          />
          <div ref={attachMenuRef} className="relative">
            <button
              type="button"
              className="tg-input-icon-btn transition-colors duration-200"
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
            {attachMenuPresent ? (
              <div
                role="menu"
                className={[
                  'tg-popover absolute bottom-[46px] left-0 z-[3000] w-56 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-md',
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
                  onClick={() => pickFile('file')}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-gray-900 transition-colors duration-200 hover:bg-gray-50 active:bg-gray-100"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-stone-50 text-stone-700 ring-1 ring-stone-200/70">
                    <LuFileText size={18} />
                  </span>
                  <span className="min-w-0 flex-1">Файл</span>
                </button>
              </div>
            ) : null}
          </div>
          <textarea
            ref={textareaRef}
            className="tg-input-textarea text-gray-900 placeholder:text-gray-400"
            placeholder="Сообщение..."
            rows={1}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
          />
          <div ref={emojiRef} className="relative">
            <button
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
            {emojiPresent ? (
              <div
                className={[
                  'tg-popover tg-emoji-picker-popover absolute bottom-[46px] right-0 z-[3500] overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-md',
                  emojiExiting ? 'tg-popover--out' : '',
                ].join(' ')}
                role="dialog"
                aria-label="Выбор эмодзи"
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
              </div>
            ) : null}
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

async function compressImage(file: File): Promise<File> {
  // Only compress images; keep originals for non-images.
  if (!file.type.startsWith('image/')) return file;
  // Already small enough.
  if (file.size <= 900 * 1024) return file;

  const MAX_DIM = 1600;
  const QUALITY = 0.82;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;

  type ImgLike = { width: number; height: number };

  const draw = async (img: ImageBitmap | HTMLImageElement) => {
    const w0 = (img as unknown as ImgLike).width;
    const h0 = (img as unknown as ImgLike).height;
    const scale = Math.min(1, MAX_DIM / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(img as any, 0, 0, w, h);
  };

  try {
    // Fast path (Chrome/modern Safari)
    const bitmap = await createImageBitmap(file);
    await draw(bitmap);
  } catch {
    // Fallback (older iOS WebViews): load via <img>
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Image decode failed'));
        el.src = url;
      });
      await draw(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', QUALITY),
  );
  if (!blob) return file;

  const name = (file.name || 'photo').replace(/\.\w+$/, '') + '.jpg';
  return new File([blob], name, { type: 'image/jpeg' });
}
