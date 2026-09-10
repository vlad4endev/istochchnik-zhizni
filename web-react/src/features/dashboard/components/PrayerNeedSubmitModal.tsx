import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuHandHeart, LuX } from 'react-icons/lu';

import {
  PRAYER_NEED_SUBMIT_MAX_LENGTH,
  PRAYER_NEED_SUBMIT_MIN_LENGTH,
  submitPrayerNeedToChat,
} from '../../calendar/api';
import { useMe } from '@/hooks/useMe';
import { memberRosterName } from '../../../lib/memberRosterName';
import { emitAppToast } from '../../../lib/uiFeedback';

function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data;
    if (body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') {
      return (body as { error: string }).error;
    }
  }
  return 'Не удалось отправить нужду. Попробуйте ещё раз.';
}

/**
 * Форма «Отправить нужду» с главной: текст участника уходит сообщением
 * в молитвенный чат («Молитвенный календарь ИЖ») вместе с именем отправителя.
 */
export function PrayerNeedSubmitModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const meQ = useMe(open);
  const me = meQ.data ?? null;
  const senderName = me ? memberRosterName(me) : '';

  const [text, setText] = useState('');
  const titleId = useId();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const sendMut = useMutation({
    mutationFn: (value: string) => submitPrayerNeedToChat(value),
    onSuccess: () => {
      emitAppToast({ message: 'Нужда отправлена в молитвенный чат', kind: 'success' });
      setText('');
      onClose();
    },
  });

  useEffect(() => {
    if (!open) return;
    setText('');
    sendMut.reset();
    const t = setTimeout(() => textareaRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [open]); // reset form when opened; ignore sendMut identity

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sendMut.isPending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, sendMut.isPending, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const trimmed = text.trim();
  const tooShort = trimmed.length < PRAYER_NEED_SUBMIT_MIN_LENGTH;
  const canSend = !tooShort && trimmed.length <= PRAYER_NEED_SUBMIT_MAX_LENGTH && !sendMut.isPending;

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center overflow-y-auto bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={() => !sendMut.isPending && onClose()}
    >
      <div
        className="max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-stone-200/80 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] shadow-[0_24px_70px_rgba(0,0,0,0.2)] sm:rounded-3xl sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#F6EBED] text-[#7d3640]">
              <LuHandHeart className="h-5 w-5" strokeWidth={2.25} aria-hidden />
            </span>
            <div className="min-w-0">
              <p id={titleId} className="text-lg font-extrabold tracking-tight text-stone-900">
                Отправить нужду
              </p>
              <p className="mt-1 text-xs font-medium text-stone-500">
                Сообщение придёт участникам в чат «Молитвенный календарь ИЖ» вместе с вашим именем.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-xl p-2 text-stone-500 hover:bg-stone-100"
            aria-label="Закрыть"
            disabled={sendMut.isPending}
            onClick={onClose}
          >
            <LuX className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
        </div>

        {senderName ? (
          <p className="mt-4 rounded-2xl bg-stone-50 px-3 py-2 text-sm font-semibold text-stone-700">
            От кого: <span className="font-extrabold text-stone-900">{senderName}</span>
          </p>
        ) : null}

        <label className="mt-4 block">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-stone-500">
            Ваша нужда
          </span>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            maxLength={PRAYER_NEED_SUBMIT_MAX_LENGTH}
            className="mt-2 w-full rounded-2xl border border-stone-200 bg-stone-50/80 px-3 py-2.5 text-[15px] text-stone-900 outline-none ring-primary/15 focus:border-primary focus:ring-2 focus:ring-primary/25"
            placeholder="Напишите, о чём помолиться…"
          />
        </label>
        <div className="mt-1.5 flex items-center justify-between gap-2 text-xs font-semibold text-stone-500">
          <span>Минимум {PRAYER_NEED_SUBMIT_MIN_LENGTH} символов</span>
          <span className="tabular-nums">
            {trimmed.length} / {PRAYER_NEED_SUBMIT_MAX_LENGTH}
          </span>
        </div>

        {sendMut.isError ? (
          <p className="mt-3 text-sm font-semibold text-red-600">{errorMessage(sendMut.error)}</p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-stone-200 bg-white px-4 text-sm font-extrabold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            disabled={sendMut.isPending}
            onClick={onClose}
          >
            Отмена
          </button>
          <button
            type="button"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-4 text-sm font-extrabold text-white shadow-sm hover:bg-primary/90 disabled:opacity-60"
            disabled={!canSend}
            onClick={() => sendMut.mutate(trimmed)}
          >
            {sendMut.isPending ? 'Отправка…' : 'Отправить'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
