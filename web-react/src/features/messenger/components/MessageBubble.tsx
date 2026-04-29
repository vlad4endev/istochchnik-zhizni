import { memo, useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useChatStore } from '../chatStore';
import { fetchMessageAttachmentUrl, type MessageWithSender } from '../api/messengerApi';
import { apiErrorMessage, approveAccessRequest, rejectAccessRequest } from '../../admin/api';
import { IoCheckmark, IoCheckmarkDone } from 'react-icons/io5';
import { LuDownload, LuFileText, LuLoader, LuRefreshCw, LuX } from 'react-icons/lu';
import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { emitAppToast } from '../../../lib/uiFeedback';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import type { PanInfo } from 'framer-motion';
import { LuReply } from 'react-icons/lu';

function MentionRichText({
  text,
  namesById,
  isMine,
}: {
  text: string;
  namesById?: Record<number, string>;
  isMine: boolean;
}) {
  const parts = text.split(/(@\[[^\]]+\]\(\d+\)|@\[\d+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const mFriendly = part.match(/^@\[([^\]]+)\]\((\d+)\)$/);
        if (mFriendly) {
          const id = Number(mFriendly[2]);
          const embedded = String(mFriendly[1] || '').trim();
          const name = embedded || namesById?.[id] || `участник ${id}`;
          return (
            <span
              key={i}
              className={['font-semibold', isMine ? 'text-sky-100 underline decoration-white/40' : 'text-primary'].join(
                ' ',
              )}
            >
              @{name}
            </span>
          );
        }
        const m = part.match(/^@\[(\d+)\]$/);
        if (!m) {
          return <span key={i}>{part}</span>;
        }
        const id = Number(m[1]);
        const name = namesById?.[id] ?? `участник ${id}`;
        return (
          <span
            key={i}
            className={['font-semibold', isMine ? 'text-sky-100 underline decoration-white/40' : 'text-primary'].join(' ')}
          >
            @{name}
          </span>
        );
      })}
    </>
  );
}

function MessengerPollCard({
  message,
  isMine,
  isOptimistic,
}: {
  message: MessageWithSender;
  isMine: boolean;
  isOptimistic: boolean;
}) {
  const votePoll = useChatStore((s) => s.votePoll);
  const payload = (message.payload ?? {}) as Record<string, unknown>;
  const options = Array.isArray(payload.options) ? payload.options.map((x) => String(x ?? '')) : [];
  const allowsMultiple = Boolean(payload.allows_multiple);
  const tallies =
    message.poll_tallies?.length === options.length ? message.poll_tallies! : options.map(() => 0);
  const myVotes = message.poll_my_options ?? [];
  const mySet = new Set(myVotes);
  const total = tallies.reduce((a, b) => a + b, 0);
  const hasMyVote = mySet.size > 0;
  const [multiEdit, setMultiEdit] = useState(false);
  const [multiPick, setMultiPick] = useState<Set<number>>(() => new Set());

  const toggleMulti = (i: number) => {
    setMultiPick((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const startMultiEdit = () => {
    setMultiPick(new Set(myVotes));
    setMultiEdit(true);
  };

  const submitMulti = () => {
    void votePoll(message.id, [...multiPick].sort((a, b) => a - b));
    setMultiEdit(false);
  };

  const muted = isMine ? 'text-white/80' : 'text-gray-500';
  const qCls = isMine ? 'text-white' : 'text-gray-900';
  const barBg = isMine ? 'bg-white/20' : 'bg-gray-200';
  const barFill = isMine ? 'bg-white' : 'bg-primary';

  if (!options.length) {
    return <span className={qCls}>Опрос недоступен</span>;
  }

  if (isOptimistic) {
    return (
      <div className="w-full max-w-[20rem] space-y-2">
        <div className={['text-[12px] font-extrabold tracking-wide', muted].join(' ')}>Опрос</div>
        <p className={['text-[15px] font-semibold leading-snug', qCls].join(' ')}>{message.content || '—'}</p>
        <ul className="space-y-1.5">
          {options.map((label, i) => (
            <li
              key={i}
              className={[
                'rounded-xl px-3 py-2 text-[14px] font-medium',
                isMine ? 'bg-white/10 text-white/95' : 'bg-gray-100 text-gray-800',
              ].join(' ')}
            >
              {label || `Вариант ${i + 1}`}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const showMultiPicker = allowsMultiple && (!hasMyVote || multiEdit);
  const showSinglePicker = !allowsMultiple && !hasMyVote;

  return (
    <div className="w-full max-w-[20rem] space-y-2">
      <div className={['text-[12px] font-extrabold tracking-wide', muted].join(' ')}>Опрос</div>
      <p className={['text-[15px] font-semibold leading-snug', qCls].join(' ')}>{message.content || '—'}</p>

      <ul className="space-y-2">
        {options.map((label, i) => {
          const count = tallies[i] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const picked = mySet.has(i);

          if (showSinglePicker) {
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => void votePoll(message.id, [i])}
                  className={[
                    'w-full rounded-xl px-3 py-2.5 text-left text-[14px] font-semibold transition-colors active:scale-[0.99]',
                    isMine
                      ? 'bg-white/12 text-white hover:bg-white/18'
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200/90',
                  ].join(' ')}
                >
                  {label}
                </button>
              </li>
            );
          }

          if (allowsMultiple && showMultiPicker) {
            const checked = multiPick.has(i);
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => toggleMulti(i)}
                  className={[
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] font-semibold transition-colors',
                    isMine
                      ? checked
                        ? 'bg-white/20 text-white ring-1 ring-white/35'
                        : 'bg-white/10 text-white/95 hover:bg-white/14'
                      : checked
                        ? 'bg-primary/12 text-primary ring-1 ring-primary/25'
                        : 'bg-gray-100 text-gray-900 hover:bg-gray-200/90',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'grid h-5 w-5 shrink-0 place-items-center rounded border-2 text-[11px]',
                      isMine ? 'border-white/50' : 'border-gray-300',
                      checked ? (isMine ? 'bg-white text-primary' : 'bg-primary text-white') : '',
                    ].join(' ')}
                    aria-hidden
                  >
                    {checked ? '✓' : ''}
                  </span>
                  <span className="min-w-0 flex-1">{label}</span>
                </button>
              </li>
            );
          }

          return (
            <li key={i}>
              <button
                type="button"
                disabled={allowsMultiple}
                onClick={() => {
                  if (!allowsMultiple) void votePoll(message.id, [i]);
                }}
                className={[
                  'w-full rounded-xl px-3 py-2 text-left',
                  allowsMultiple ? 'cursor-default' : 'transition-colors active:scale-[0.99]',
                  isMine ? 'bg-white/10 hover:bg-white/14' : 'bg-gray-50 hover:bg-gray-100',
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-2 text-[13px] font-semibold">
                  <span className={['min-w-0 flex-1', qCls].join(' ')}>{label}</span>
                  <span className={muted}>{pct}%</span>
                </div>
                <div className={['mt-1.5 h-2 overflow-hidden rounded-full', barBg].join(' ')}>
                  <div
                    className={['h-full rounded-full transition-[width] duration-300', barFill].join(' ')}
                    style={{ width: `${pct}%`, opacity: picked ? 1 : 0.85 }}
                  />
                </div>
                <div className={['mt-0.5 text-[11px] font-bold', muted].join(' ')}>{count} голосов</div>
              </button>
            </li>
          );
        })}
      </ul>

      {allowsMultiple && showMultiPicker ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {hasMyVote && multiEdit ? (
            <button
              type="button"
              onClick={() => setMultiEdit(false)}
              className={[
                'rounded-full px-3 py-1.5 text-xs font-bold',
                isMine ? 'bg-white/15 text-white' : 'bg-gray-200 text-gray-800',
              ].join(' ')}
            >
              Отмена
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void submitMulti()}
            disabled={multiPick.size === 0}
            className={[
              'rounded-full px-4 py-2 text-xs font-extrabold disabled:opacity-40',
              isMine ? 'bg-white text-primary' : 'bg-primary text-white',
            ].join(' ')}
          >
            {hasMyVote ? 'Сохранить' : 'Голосовать'}
          </button>
        </div>
      ) : null}

      {allowsMultiple && hasMyVote && !multiEdit ? (
        <button
          type="button"
          onClick={startMultiEdit}
          className={['text-xs font-bold underline-offset-2 hover:underline', muted].join(' ')}
        >
          Изменить голос
        </button>
      ) : null}

      {!allowsMultiple && hasMyVote ? (
        <p className={['text-[11px] font-semibold', muted].join(' ')}>Нажмите другой вариант, чтобы изменить голос</p>
      ) : null}
    </div>
  );
}

function AccessRequestMessengerCard({
  message,
  isMine,
  isOptimistic,
}: {
  message: MessageWithSender;
  isMine: boolean;
  isOptimistic: boolean;
}) {
  const qc = useQueryClient();
  const payload = (message.payload ?? {}) as Record<string, unknown>;
  const requestId = Number(payload.access_request_id);
  const kind = String(payload.kind ?? '');
  const resolution = String(payload.resolution ?? '').trim();
  const fn = String(payload.first_name ?? '').trim();
  const ln = String(payload.last_name ?? '').trim();
  const nameFromParts = `${fn} ${ln}`.trim();
  const full = String(payload.full_name ?? '').trim() || nameFromParts || '—';
  const phone = String(payload.phone_number ?? '').trim() || '—';
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isRegistration = kind === 'registration';
  const isPending = resolution !== 'approved' && resolution !== 'rejected';

  const run = async (action: 'approve' | 'reject') => {
    if (!Number.isFinite(requestId)) return;
    setBusy(true);
    setErr(null);
    try {
      if (action === 'approve') await approveAccessRequest(requestId);
      else await rejectAccessRequest(requestId);
      void qc.invalidateQueries({ queryKey: ['admin', 'access-requests'] });
    } catch (e) {
      setErr(
        apiErrorMessage(e, action === 'approve' ? 'Не удалось принять' : 'Не удалось отклонить'),
      );
    } finally {
      setBusy(false);
    }
  };

  const muted = isMine ? 'text-white/80' : 'text-gray-500';
  const qCls = isMine ? 'text-white' : 'text-gray-900';

  if (isOptimistic) {
    return <span className={qCls}>Заявка…</span>;
  }

  return (
    <div className="w-full max-w-[22rem] space-y-3">
      <div className={['text-[12px] font-extrabold tracking-wide', muted].join(' ')}>Новый пользователь</div>
      <div
        className={[
          'space-y-2 rounded-2xl border p-3 text-[14px] leading-snug shadow-sm',
          isMine ? 'border-white/10 bg-white/10 backdrop-blur-sm' : 'border-gray-100 bg-gray-50',
        ].join(' ')}
      >
        <div className={['font-semibold', qCls].join(' ')}>{full}</div>
        <div className={muted}>
          <span className={['font-bold', isMine ? 'text-white/90' : 'text-gray-600'].join(' ')}>
            Телефон:
          </span>{' '}
          {phone}
        </div>
        {isRegistration ? (
          <div className={['text-[12px]', muted].join(' ')}>Регистрация в приложении</div>
        ) : null}
      </div>

      {isPending ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !Number.isFinite(requestId)}
            onClick={() => void run('approve')}
            className={[
              'rounded-full px-4 py-2 text-[13px] font-extrabold transition-colors disabled:opacity-40',
              isMine ? 'bg-white text-primary' : 'bg-emerald-600 text-white hover:bg-emerald-700',
            ].join(' ')}
          >
            Принять
          </button>
          <button
            type="button"
            disabled={busy || !Number.isFinite(requestId)}
            onClick={() => void run('reject')}
            className={[
              'rounded-full px-4 py-2 text-[13px] font-extrabold transition-colors disabled:opacity-40',
              isMine ? 'bg-white/20 text-white hover:bg-white/28' : 'bg-stone-200 text-stone-800 hover:bg-stone-300',
            ].join(' ')}
          >
            Отклонить
          </button>
        </div>
      ) : (
        <p
          className={[
            'text-[13px] font-bold',
            resolution === 'approved' ? 'text-emerald-600' : 'text-red-600',
          ].join(' ')}
        >
          {resolution === 'approved' ? 'Заявка принята' : 'Заявка отклонена'}
        </p>
      )}
      {err ? <p className="text-[12px] font-semibold text-red-600">{err}</p> : null}
    </div>
  );
}

/** Первый ряд — как в Telegram: быстрый выбор при long-press. */
const QUICK_REACTION_STRIP = ['❤️', '👍', '😂', '😮', '😢', '🙏', '🔥'];

const QUICK_REACTIONS = [
  '❤️',
  '👍',
  '😂',
  '😮',
  '😢',
  '🙏',
  '😡',
  '😍',
  '🔥',
  '💯',
  '✨',
  '👏',
];

interface MessageBubbleProps {
  message: MessageWithSender;
  isGroupedPrev: boolean;
  isGroupedNext: boolean;
  onJumpToMessage?: (messageId: string) => void;
  /** Подписи для отображения `@[id]` как @Имя. */
  participantLabelById?: Record<number, string>;
  canPinMessages?: boolean;
  onPinToggle?: (messageId: string, nextPinned: boolean) => void | Promise<void>;
}

function MessageBubbleInner({
  message,
  isGroupedPrev,
  isGroupedNext,
  onJumpToMessage,
  participantLabelById,
  canPinMessages = false,
  onPinToggle,
}: MessageBubbleProps) {
  const currentMemberId = useChatStore((s) => s.currentMemberId);
  const readCursorsByConv = useChatStore((s) => s.readCursorsByConv);
  const addReaction = useChatStore((s) => s.addReaction);
  const removeReaction = useChatStore((s) => s.removeReaction);
  const setReplyTo = useChatStore((s) => s.setReplyTo);
  const setReplyingTo = useChatStore((s) => s.setReplyingTo);
  const setEditing = useChatStore((s) => s.setEditing);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const retrySendMessage = useChatStore((s) => s.retrySendMessage);
  const [showActions, setShowActions] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  /** Плашка реакций над пузырьком (long-press), как в Telegram */
  const [showReactionBar, setShowReactionBar] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const longPressOrigin = useRef<{ x: number; y: number } | null>(null);
  const lastTapUpRef = useRef<{ t: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!lightboxSrc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxSrc(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxSrc]);

  const isOptimistic = message.id.startsWith('temp-');
  const isMine = isOptimistic || (currentMemberId != null && message.sender_id === currentMemberId);

  const x = useMotionValue(0);
  const replyOpacity = useTransform(x, (v: number) => {
    const t = isMine ? Math.max(0, -v) : Math.max(0, v);
    if (t < 8) return 0;
    return Math.min(1, 0.12 + ((t - 8) / 82) * 0.88);
  });
  const replyScale = useTransform(x, (v: number) => {
    const t = isMine ? Math.max(0, -v) : Math.max(0, v);
    if (t < 8) return 0.92;
    return Math.min(1, 0.92 + ((t - 8) / 82) * 0.08);
  });
  const isDeleted = message.is_deleted;
  const status = message.status ?? (isOptimistic ? 'sending' : 'sent');
  const convReadCursors = readCursorsByConv[String(message.conversation_id)] || {};

  const maxOtherReadId = useMemo(() => {
    const ids = Object.values(convReadCursors);
    let max: bigint = 0n;
    for (const v of ids) {
      if (typeof v !== 'string' || !/^\d+$/.test(v)) continue;
      const b = BigInt(v);
      if (b > max) max = b;
    }
    return max;
  }, [convReadCursors]);

  const isReadByOther = useMemo(() => {
    if (!isMine || isOptimistic) return false;
    if (!/^\d+$/.test(message.id)) return false;
    return BigInt(message.id) <= maxOtherReadId;
  }, [isMine, isOptimistic, message.id, maxOtherReadId]);

  const formattedTime = useMemo(() => {
    const d = new Date(message.created_at);
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }, [message.created_at]);

  const payloadType = useMemo(() => {
    if (message.payload_type) return message.payload_type;
    const p = (message.payload ?? {}) as Record<string, unknown>;
    const rawUrl = String(p.url ?? '').trim();
    const mime = String(p.mimeType ?? p.mimetype ?? '').trim().toLowerCase();
    const images = Array.isArray(p.images) ? p.images : [];
    if (images.length > 0) return 'image';
    if (mime.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(rawUrl)) return 'image';
    if (rawUrl) return 'file';
    return 'text';
  }, [message.payload, message.payload_type]);
  const payload = (message.payload ?? {}) as Record<string, unknown>;
  const albumImages = Array.isArray(payload.images)
    ? payload.images
        .map((x) => (typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : null))
        .filter((x): x is Record<string, unknown> => Boolean(x))
    : [];
  const firstAlbumImage = albumImages[0] ?? null;
  const attachmentRawUrl = String(payload.url ?? firstAlbumImage?.url ?? '').trim();
  const attachmentObjectPath = String(
    payload.objectPath ?? payload.object_path ?? firstAlbumImage?.objectPath ?? firstAlbumImage?.object_path ?? '',
  ).trim();
  const [resolvedAttachmentUrl, setResolvedAttachmentUrl] = useState<string | null>(null);

  useEffect(() => {
    const fallback = attachmentRawUrl ? (resolvePublicUrl(attachmentRawUrl) ?? attachmentRawUrl) : null;
    setResolvedAttachmentUrl(fallback);
    if (
      (payloadType !== 'image' && payloadType !== 'file') ||
      (payloadType === 'image' && albumImages.length > 0) ||
      !attachmentObjectPath ||
      !/^\d+$/.test(String(message.id))
    ) {
      return;
    }
    let cancelled = false;
    void fetchMessageAttachmentUrl(String(message.id))
      .then(({ url }) => {
        if (cancelled || !url) return;
        const resolved = resolvePublicUrl(url) ?? url;
        if (resolved) setResolvedAttachmentUrl(resolved);
      })
      .catch(() => {
        // keep fallback URL to avoid breaking current rendering flow
      });
    return () => {
      cancelled = true;
    };
  }, [attachmentRawUrl, attachmentObjectPath, message.id, payloadType, albumImages.length]);

  /** Время и галочки в одной строке с текстом (как в Telegram), если нет цитаты и не «особый» контент. */
  const useInlineTextMeta =
    !isDeleted &&
    !message.reply_preview &&
    payloadType === 'text' &&
    !message.is_pinned;

  const handlePrayClick = () => {
    // Этап 2: заглушка для интерактивной карточки
    // В Этапе 3/следующих этапах подключим API + WS синк.
    // eslint-disable-next-line no-console
    console.log('[messenger] pray click', { messageId: message.id });
  };

  const renderContent = () => {
    if (payloadType === 'poll') {
      return <MessengerPollCard message={message} isMine={isMine} isOptimistic={isOptimistic} />;
    }

    if (payloadType === 'access_request') {
      return <AccessRequestMessengerCard message={message} isMine={isMine} isOptimistic={isOptimistic} />;
    }

    if (payloadType === 'prayer_request') {
      const text = String(
        payload.text ?? payload.request ?? payload.content ?? message.content ?? '',
      ).trim();
      const count = Number(message.interaction_count ?? payload.count ?? 0);

      return (
        <div className="w-full max-w-[22rem]">
          <div
            className={[
              'rounded-2xl border p-3 shadow-sm',
              isMine ? 'border-white/10 bg-white/10 backdrop-blur-sm' : 'border-gray-100 bg-gray-50',
            ].join(' ')}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className={['text-[12px] font-extrabold tracking-wide', isMine ? 'text-white/75' : 'text-gray-500'].join(' ')}>
                  Молитвенная нужда
                </div>
                <div className={['mt-1 whitespace-pre-wrap break-words text-[14px] leading-5', isMine ? 'text-white/95' : 'text-gray-900'].join(' ')}>
                  {text || '—'}
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handlePrayClick}
                className={[
                  'inline-flex items-center gap-2 rounded-full px-3 py-2 text-[13px] font-semibold transition-colors duration-200 active:scale-[0.99]',
                  isMine
                    ? 'bg-white/10 text-white/95 hover:bg-white/15'
                    : 'bg-primary/10 text-primary hover:bg-primary/15',
                ].join(' ')}
              >
                <span aria-hidden>🙏</span>
                <span>Я молюсь</span>
                <span className={['rounded-full px-2 py-0.5 text-[12px] font-bold', isMine ? 'bg-white/15' : 'bg-primary/15'].join(' ')}>
                  {Number.isFinite(count) ? count : 0}
                </span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (payloadType === 'image') {
      if (albumImages.length > 0) {
        const caption = String(message.content ?? '').trim();
        const colsClass = albumImages.length === 1 ? 'grid-cols-1' : albumImages.length === 2 ? 'grid-cols-2' : 'grid-cols-3';
        return (
          <div className="w-full max-w-[min(78vw,22rem)] overflow-hidden rounded-2xl">
            <div className={['grid gap-1.5', colsClass].join(' ')}>
              {albumImages.map((img, idx) => {
                const rawUrl = String(img.url ?? '').trim();
                const src = resolvePublicUrl(rawUrl) ?? rawUrl;
                const mime = String(img.mimeType ?? img.mimetype ?? '').trim().toLowerCase();
                const name = String(img.name ?? img.filename ?? '').trim().toLowerCase();
                const urlPath = rawUrl.split('?')[0].toLowerCase();
                const isHeicLike =
                  mime === 'image/heic' ||
                  mime === 'image/heif' ||
                  urlPath.endsWith('.heic') ||
                  urlPath.endsWith('.heif') ||
                  name.endsWith('.heic') ||
                  name.endsWith('.heif');
                if (!src) return null;
                if (isHeicLike) {
                  return (
                    <a
                      key={`${src}-${idx}`}
                      href={src}
                      target="_blank"
                      rel="noreferrer"
                      className={[
                        'grid min-h-[84px] place-items-center rounded-xl text-[11px] font-semibold',
                        isMine ? 'bg-white/10 text-white/90' : 'bg-gray-100 text-gray-700',
                      ].join(' ')}
                    >
                      HEIC
                    </a>
                  );
                }
                return (
                  <button
                    key={`${src}-${idx}`}
                    type="button"
                    onClick={() => setLightboxSrc(src)}
                    className={['overflow-hidden rounded-xl', isMine ? 'bg-white/10' : 'bg-black/[0.04]'].join(' ')}
                    aria-label={`Открыть изображение ${idx + 1}`}
                  >
                    <img
                      src={src}
                      alt=""
                      className="max-h-[220px] w-full object-cover"
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                    />
                  </button>
                );
              })}
            </div>
            {caption ? (
              <div className={['px-3 py-2 text-[14px] leading-relaxed', isMine ? 'text-white/95' : 'text-gray-900'].join(' ')}>
                <MentionRichText text={caption} namesById={participantLabelById} isMine={isMine} />
              </div>
            ) : null}
          </div>
        );
      }

      const rawUrl = attachmentRawUrl;
      const src = resolvedAttachmentUrl ?? (resolvePublicUrl(rawUrl) ?? rawUrl);
      const caption = String(message.content ?? '').trim();
      const attachmentMime = String(payload.mimeType ?? payload.mimetype ?? '').trim().toLowerCase();
      const attachmentName = String(payload.name ?? payload.filename ?? '').trim().toLowerCase();
      const urlPath = rawUrl.split('?')[0].toLowerCase();
      const isHeicLike =
        attachmentMime === 'image/heic' ||
        attachmentMime === 'image/heif' ||
        urlPath.endsWith('.heic') ||
        urlPath.endsWith('.heif') ||
        attachmentName.endsWith('.heic') ||
        attachmentName.endsWith('.heif');
      if (isHeicLike) {
        return (
          <a
            href={src || undefined}
            target="_blank"
            rel="noreferrer"
            className={[
              'flex max-w-[20rem] items-center justify-between gap-3 rounded-2xl px-3 py-2 ring-1 transition-colors duration-200',
              isMine
                ? 'bg-white/10 ring-white/10 hover:bg-white/15'
                : 'bg-gray-50 ring-gray-100 hover:bg-gray-100',
            ].join(' ')}
          >
            <span className="min-w-0">
              <span className={['block truncate text-[14px] font-semibold', isMine ? 'text-white/95' : 'text-gray-900'].join(' ')}>
                HEIC/HEIF изображение
              </span>
              <span className={['mt-0.5 block text-[11px] font-semibold', isMine ? 'text-white/70' : 'text-gray-500'].join(' ')}>
                Просмотр в браузере ограничен, откройте или скачайте файл
              </span>
            </span>
            <span className={['inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-[11px] font-extrabold', isMine ? 'bg-white/12 text-white/90' : 'bg-primary/10 text-primary'].join(' ')}>
              <LuDownload size={14} />
              Открыть
            </span>
          </a>
        );
      }
      return src ? (
        <div className="w-full max-w-[min(78vw,22rem)] overflow-hidden rounded-2xl">
          <button
            type="button"
            onClick={() => setLightboxSrc(src)}
            className={[
              'block w-full overflow-hidden',
              isMine ? 'bg-white/10' : 'bg-black/[0.04]',
            ].join(' ')}
            aria-label="Открыть изображение"
          >
            <img
              src={src}
              alt=""
              className="max-h-[420px] w-full object-cover"
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
            />
          </button>
          {caption ? (
            <div className={['px-3 py-2 text-[14px] leading-relaxed', isMine ? 'text-white/95' : 'text-gray-900'].join(' ')}>
              <MentionRichText text={caption} namesById={participantLabelById} isMine={isMine} />
            </div>
          ) : null}
        </div>
      ) : (
        <span>Изображение недоступно</span>
      );
    }

    if (payloadType === 'file') {
      const rawUrl = attachmentRawUrl;
      const href = resolvedAttachmentUrl ?? (resolvePublicUrl(rawUrl) ?? rawUrl);
      const name = String(payload.name ?? payload.filename ?? message.content ?? 'Файл').trim() || 'Файл';
      const sizeRaw = Number(payload.size ?? 0);
      const sizeLabel = Number.isFinite(sizeRaw) && sizeRaw > 0 ? formatBytes(sizeRaw) : null;
      return (
        <a
          href={href || undefined}
          target="_blank"
          rel="noreferrer"
          className={[
            'flex max-w-[20rem] items-center justify-between gap-3 rounded-2xl px-3 py-2 ring-1 transition-colors duration-200',
            isMine
              ? 'bg-white/10 ring-white/10 hover:bg-white/15'
              : 'bg-gray-50 ring-gray-100 hover:bg-gray-100',
          ].join(' ')}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className={['grid h-10 w-10 place-items-center rounded-xl', isMine ? 'bg-white/12 text-white' : 'bg-white text-gray-600 ring-1 ring-gray-100'].join(' ')}>
              <LuFileText size={18} />
            </span>
            <span className="min-w-0">
              <span className={['block truncate text-[14px] font-semibold', isMine ? 'text-white/95' : 'text-gray-900'].join(' ')}>{name}</span>
              <span className={['mt-0.5 block text-[11px] font-semibold', isMine ? 'text-white/70' : 'text-gray-500'].join(' ')}>
                {sizeLabel ?? 'Файл'}
              </span>
            </span>
          </span>
          <span className={['inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-[11px] font-extrabold', isMine ? 'bg-white/12 text-white/90' : 'bg-primary/10 text-primary'].join(' ')}>
            <LuDownload size={14} />
            Скачать
          </span>
        </a>
      );
    }

    // text (default)
    return (
      <MentionRichText text={message.content} namesById={participantLabelById} isMine={isMine} />
    );
  };

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

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isDeleted && !isOptimistic) {
      setShowActions(!showActions);
    }
  };

  const clearLongPressTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressOrigin.current = null;
  };

  const handlePointerDownCapture = (e: React.PointerEvent) => {
    if (e.button !== 0 || isDeleted || isOptimistic) return;
    longPressOrigin.current = { x: e.clientX, y: e.clientY };
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null;
      longPressOrigin.current = null;
      setShowReactionBar(true);
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(12);
      }
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }, 420);
  };

  const handlePointerMoveCapture = (e: React.PointerEvent) => {
    if (longPressOrigin.current == null || longPressTimer.current == null) return;
    const o = longPressOrigin.current;
    if (Math.hypot(e.clientX - o.x, e.clientY - o.y) > 14) clearLongPressTimer();
  };

  useEffect(() => {
    if (!showActions && !showReactionBar) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowActions(false);
        setShowReactions(false);
        setShowReactionBar(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showActions, showReactionBar]);

  const toggleReaction = (emoji: string, reactedByMe: boolean) => {
    if (reactedByMe) {
      void removeReaction(message.id, emoji);
    } else {
      void addReaction(message.id, emoji);
    }
  };

  const applyQuickReaction = useCallback(
    (emoji: string) => {
      const row = message.reactions.find((x) => x.emoji === emoji);
      if (row?.reacted_by_me) void removeReaction(message.id, emoji);
      else void addReaction(message.id, emoji);
      setShowReactionBar(false);
    },
    [message.reactions, message.id, addReaction, removeReaction],
  );

  const handleBubblePointerUp = (e: React.PointerEvent) => {
    if (e.button !== 0 || isOptimistic) return;
    if (showReactionBar || showActions) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, a, [role="button"]')) return;
    if (target.closest('.msg-reaction-chip')) return;
    const now = Date.now();
    const prev = lastTapUpRef.current;
    if (
      prev &&
      now - prev.t <= 450 &&
      Math.hypot(e.clientX - prev.x, e.clientY - prev.y) <= 32
    ) {
      lastTapUpRef.current = null;
      const heart = '❤️';
      const row = message.reactions.find((x) => x.emoji === heart);
      if (row?.reacted_by_me) void removeReaction(message.id, heart);
      else void addReaction(message.id, heart);
      e.preventDefault();
      return;
    }
    lastTapUpRef.current = { t: now, x: e.clientX, y: e.clientY };
  };

  if (isDeleted) {
    return (
      <div
        className={[
          'flex w-fit max-w-[min(88%,20.5rem)] flex-col sm:max-w-[min(84%,24rem)]',
          isMine ? 'ml-auto items-end' : 'mr-auto items-start',
        ].join(' ')}
      >
        <div
          className={[
            'msg-bubble--deleted rounded-2xl px-4 py-2 text-sm',
            isMine ? 'rounded-br-sm bg-primary/20 text-white/80' : 'rounded-bl-sm bg-gray-100 text-gray-500',
          ].join(' ')}
        >
          <span className="msg-deleted-text">Сообщение удалено</span>
        </div>
      </div>
    );
  }

  const bubbleShapeClass = isMine
    ? !isGroupedPrev && !isGroupedNext
      ? 'rounded-[18px]'
      : !isGroupedPrev && isGroupedNext
        ? 'rounded-t-[18px] rounded-bl-[18px] rounded-br-[4px]'
        : isGroupedPrev && isGroupedNext
          ? 'rounded-tl-[18px] rounded-tr-[4px] rounded-bl-[18px] rounded-br-[4px]'
          : 'rounded-tl-[18px] rounded-tr-[4px] rounded-bl-[18px] rounded-br-[18px]'
    : !isGroupedPrev && !isGroupedNext
      ? 'rounded-[18px]'
      : !isGroupedPrev && isGroupedNext
        ? 'rounded-t-[18px] rounded-bl-[4px] rounded-br-[18px]'
        : isGroupedPrev && isGroupedNext
          ? 'rounded-tl-[4px] rounded-tr-[18px] rounded-bl-[4px] rounded-br-[18px]'
          : 'rounded-tl-[4px] rounded-tr-[18px] rounded-bl-[18px] rounded-br-[18px]';

  const bubbleClasses = [
    'relative px-3 py-2 sm:px-3.5 sm:py-2',
    bubbleShapeClass,
    isMine ? 'bg-primary text-white' : 'bg-white text-gray-900 shadow-[0_1px_0.5px_rgba(0,0,0,0.06)]',
  ]
    .filter(Boolean)
    .join(' ');

  const metaRowClass = [
    'inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-[11px] leading-none',
    isMine ? 'text-white/70' : 'text-gray-400',
  ].join(' ');

  /*
   * A11y статуса доставки (WCAG 2.1, SC 1.1.1 «Non-text Content» + SC 4.1.2 «Name, Role, Value»).
   *
   * Раньше статус дублировался двумя способами:
   *   1) сама иконка (`LuLoader` / `IoCheckmark` / `IoCheckmarkDone`) была `aria-hidden`;
   *   2) рядом с ней рендерился скрытый `aria-live="polite"` span с полным текстом.
   *
   * Проблема: на ленте из N своих сообщений это N живых регионов.
   * Некоторые screen-reader'ы (Orca, TalkBack) озвучивают все aria-live узлы при
   * первичном монтировании — пользователь получал «сообщение доставлено × 50» при
   * открытии чата. Это противоречит WCAG 2.1 Technique G192 (не злоупотреблять live).
   *
   * Решение:
   *   - Иконка получает `role="img" aria-label="..."` с текущим состоянием.
   *     SR читает её при фокусной навигации к метаданным сообщения, без спама.
   *   - Глобальные объявления «новое сообщение / typing / presence» делаются
   *     отдельными live-регионами уровня `ChatWindow` (см. `ChatWindow.tsx`),
   *     не per-message.
   *   - Retry-кнопка сама по себе интерактивна и имеет расширенный `aria-label`
   *     с полной фразой ошибки + действием.
   */
  const statusIconLabel = !isMine || isDeleted
    ? null
    : status === 'sending'
      ? 'Отправляется'
      : status === 'error'
        ? null // у «error» интерактивный элемент — label живёт на <button>
        : isReadByOther
          ? 'Прочитано'
          : status === 'delivered'
            ? 'Доставлено'
            : 'Отправлено';

  const bubbleMeta = (
    <div className={metaRowClass}>
      {message.is_edited ? <span className="msg-edited">ред.</span> : null}
      <span className="tabular-nums">{formattedTime}</span>
      {isMine ? (
        <>
          {status === 'sending' ? (
            <LuLoader
              className="h-3.5 w-3.5 shrink-0 animate-spin text-white/85"
              role="img"
              aria-label={statusIconLabel ?? undefined}
              focusable={false}
            />
          ) : status === 'error' ? (
            <button
              type="button"
              className="inline-flex shrink-0 rounded p-0.5 text-white/90 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              aria-label="Сообщение не доставлено. Нажмите, чтобы повторить отправку."
              onClick={() => {
                void retrySendMessage(String(message.conversation_id), String(message.id));
              }}
            >
              <LuRefreshCw className="h-3.5 w-3.5" aria-hidden focusable={false} />
            </button>
          ) : isReadByOther ? (
            <IoCheckmarkDone
              className="h-3.5 w-3.5 shrink-0 text-sky-200"
              role="img"
              aria-label={statusIconLabel ?? undefined}
              focusable={false}
            />
          ) : status === 'delivered' ? (
            <IoCheckmarkDone
              className="h-3.5 w-3.5 shrink-0 text-white/70"
              role="img"
              aria-label={statusIconLabel ?? undefined}
              focusable={false}
            />
          ) : (
            <IoCheckmark
              className="h-3.5 w-3.5 shrink-0 text-white/70"
              role="img"
              aria-label={statusIconLabel ?? undefined}
              focusable={false}
            />
          )}
        </>
      ) : null}
    </div>
  );

  return (
    <>
    <div
      className={[
        'msg-bubble-shell relative flex w-fit max-w-[min(88%,20.5rem)] flex-col sm:max-w-[min(84%,24rem)]',
        isMine ? 'ml-auto items-end' : 'mr-auto items-start',
      ].join(' ')}
      onContextMenu={handleContextMenu}
      onPointerDownCapture={handlePointerDownCapture}
      onPointerMoveCapture={handlePointerMoveCapture}
      onPointerUpCapture={() => clearLongPressTimer()}
      onPointerCancelCapture={() => clearLongPressTimer()}
      style={{ 
        marginTop: isGroupedPrev ? '2px' : '8px',
        marginBottom: isGroupedNext ? '0' : '4px'
      }}
    >
      <div className="relative">
        {showReactionBar ? (
          <>
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              className="msg-reaction-bar-overlay"
              onClick={() => setShowReactionBar(false)}
            />
            <div
              role="toolbar"
              aria-label="Быстрые реакции"
              className={['msg-reaction-floating', isMine ? 'msg-reaction-floating--mine' : ''].join(' ')}
              onClick={(ev) => ev.stopPropagation()}
            >
              {QUICK_REACTION_STRIP.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="msg-reaction-floating__emoji"
                  title={emoji}
                  onClick={() => applyQuickReaction(emoji)}
                >
                  {emoji}
                </button>
              ))}
              <button
                type="button"
                className="msg-reaction-floating__more"
                title="Ещё действия"
                aria-label="Ещё действия"
                onClick={() => {
                  setShowReactionBar(false);
                  setShowActions(true);
                }}
              >
                ⋯
              </button>
            </div>
          </>
        ) : null}
        <motion.div
          className={['absolute top-1/2 z-0 -translate-y-1/2', isMine ? 'right-2' : 'left-2'].join(' ')}
          style={{ opacity: replyOpacity, scale: replyScale }}
          aria-hidden
        >
          <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
            <LuReply size={18} />
          </div>
        </motion.div>

        <motion.div
          className={bubbleClasses}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          style={{ x }}
          onPointerUp={handleBubblePointerUp}
          onDragStart={() => clearLongPressTimer()}
          onDragEnd={(_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
            const dx = info.offset.x;
            const towardCenter = isMine ? dx < -52 : dx > 52;
            if (towardCenter) {
              setReplyingTo(message);
              if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
                navigator.vibrate(45);
              }
            }
            clearLongPressTimer();
            animate(x, 0, { type: 'spring', stiffness: 420, damping: 32 });
          }}
        >
        {/* Sender name (only if first message in group and not mine) */}
        {!isMine && !isGroupedPrev && message.sender_name && (
          <div className="mb-1.5 px-1 text-xs font-semibold text-gray-500">{message.sender_name}</div>
        )}

        {/* Reply preview (tap to jump) */}
        {message.reply_preview && (
          <button
            type="button"
            className={`msg-reply-preview ${isMine ? 'msg-reply-preview--out' : 'msg-reply-preview--in'}`}
            onClick={(e) => {
              e.stopPropagation();
              const id = String(message.reply_preview?.id ?? '').trim();
              if (id && /^\d+$/.test(id)) onJumpToMessage?.(id);
            }}
            aria-label="Перейти к сообщению"
            title="Перейти к сообщению"
          >
            <div className="msg-reply-author">
              {message.reply_preview.sender_name || 'Удалённый пользователь'}
            </div>
            <div className="msg-reply-text">
              {message.reply_preview.is_deleted ? 'Сообщение удалено' : message.reply_preview.content}
            </div>
          </button>
        )}

        {useInlineTextMeta ? (
          <div className="flex min-w-0 flex-row flex-wrap items-end gap-x-2 gap-y-0.5">
            <div className="msg-content min-w-0 flex-1 whitespace-pre-wrap break-words text-[14px] leading-relaxed sm:text-[15px]">
              {renderContent()}
            </div>
            <div className="ml-auto">{bubbleMeta}</div>
          </div>
        ) : (
          <>
            <div className="msg-content whitespace-pre-wrap break-words text-[14px] leading-relaxed sm:text-[15px]">{renderContent()}</div>
            {message.is_pinned ? (
              <div
                className={['mt-1 text-[10px] font-bold uppercase tracking-wide', isMine ? 'text-white/60' : 'text-amber-600'].join(' ')}
              >
                📌 Закреплено
              </div>
            ) : null}
            <div className="mt-1 flex w-full items-center justify-end">{bubbleMeta}</div>
          </>
        )}
        </motion.div>
      </div>

      {/* Reactions Display */}
      {message.reactions.length > 0 && (
        <div className={`msg-reactions ${isMine ? 'msg-reactions--mine' : 'msg-reactions--in'}`}>
          {message.reactions.map((r) => (
            <button
              key={r.emoji}
              type="button"
              className={`msg-reaction-chip ${r.reacted_by_me ? 'msg-reaction-chip--active' : ''}`}
              onClick={() => toggleReaction(r.emoji, r.reacted_by_me)}
            >
              <span>{r.emoji}</span>
              <span className="msg-reaction-count">{r.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Actions Popup (Context Menu) */}
      {showActions && (
        <>
          <div
            className="msg-actions-overlay"
            onClick={() => {
              setShowActions(false);
              setShowReactionBar(false);
            }}
          />
          <div className={`msg-actions ${isMine ? 'msg-actions--mine' : ''}`}>
            <button type="button" onClick={() => { setReplyTo(message); setShowActions(false); }}>
              <span>↩️</span> Ответить
            </button>
            {payloadType === 'text' && String(message.content ?? '').trim() ? (
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(String(message.content ?? ''))
                    .then(() => emitAppToast('Текст скопирован', 'success'))
                    .catch(() => emitAppToast('Не удалось скопировать', 'error'));
                  setShowActions(false);
                }}
              >
                <span>📋</span> Копировать
              </button>
            ) : null}
            {canPinMessages && !isOptimistic && /^\d+$/.test(String(message.id)) ? (
              <button
                type="button"
                onClick={() => {
                  void onPinToggle?.(String(message.id), !message.is_pinned);
                  setShowActions(false);
                }}
              >
                <span>{message.is_pinned ? '📍' : '📌'}</span> {message.is_pinned ? 'Открепить' : 'Закрепить'}
              </button>
            ) : null}
            {isMine && payloadType !== 'poll' && (
              <button type="button" onClick={() => { setEditing(message); setShowActions(false); }}>
                <span>✏️</span> Редактировать
              </button>
            )}
            {isMine && (
              <button type="button" className="msg-actions__danger" onClick={() => { void deleteMessage(message.id); setShowActions(false); }}>
                <span>🗑</span> Удалить
              </button>
            )}
            <button type="button" onClick={() => { setShowReactions(!showReactions); }}>
              <span>😀</span> Реакция
            </button>
            {showReactions && (
              <div className="msg-quick-reactions">
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="msg-quick-reaction"
                    onClick={() => {
                      const row = message.reactions.find((x) => x.emoji === emoji);
                      if (row?.reacted_by_me) {
                        void removeReaction(message.id, emoji);
                      } else {
                        void addReaction(message.id, emoji);
                      }
                      setShowActions(false);
                      setShowReactions(false);
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>

    {lightboxSrc ? (
      <div
        className="fixed inset-0 z-[5000] bg-black/80 p-4"
        onClick={() => setLightboxSrc(null)}
        role="dialog"
        aria-modal="true"
        aria-label="Просмотр изображения"
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setLightboxSrc(null);
          }}
          className="absolute right-4 top-4 z-[5001] flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20"
          aria-label="Закрыть"
        >
          <LuX className="h-6 w-6" strokeWidth={2} aria-hidden />
        </button>
        <div className="mx-auto flex h-full max-w-2xl items-center justify-center">
          <img
            src={lightboxSrc}
            alt=""
            className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
            referrerPolicy="no-referrer"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>
    ) : null}
    </>
  );
}

export const MessageBubble = memo(MessageBubbleInner);
