import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { LuCheck, LuCopy, LuLink, LuRefreshCw, LuX } from 'react-icons/lu';

import { emitAppToast } from '@/lib/uiFeedback';

import {
  sermonNoteShareUrl,
  updateSermonNoteShare,
  type SermonNote,
} from '../api';

type Props = {
  note: SermonNote;
  open: boolean;
  onClose: () => void;
  onUpdated: (note: SermonNote) => void;
};

export function ShareSermonNoteModal({ note, open, onClose, onUpdated }: Props) {
  const [copied, setCopied] = useState(false);

  const shareMut = useMutation({
    mutationFn: (input: { is_public: boolean; rotate_token?: boolean }) =>
      updateSermonNoteShare(note.id, input),
    onSuccess: (updated) => {
      onUpdated(updated);
      emitAppToast(
        updated.is_public ? 'Ссылка для просмотра включена' : 'Публичный доступ выключен',
        'success',
      );
    },
    onError: () => emitAppToast('Не удалось изменить доступ', 'error'),
  });

  const url = useMemo(
    () => (note.share_token ? sermonNoteShareUrl(note.share_token) : ''),
    [note.share_token],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Закрыть" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-stone-200 bg-white p-4 shadow-xl sm:p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-stone-900">Поделиться документом</h2>
            <p className="mt-1 text-sm text-stone-500">
              Любой с ссылкой сможет только читать конспект. Редактировать по ссылке нельзя.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"
            aria-label="Закрыть"
          >
            <LuX className="h-4 w-4" />
          </button>
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 px-3 py-3">
          <span className="text-sm font-medium text-stone-800">Доступ по ссылке</span>
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--primary)]"
            checked={note.is_public}
            disabled={shareMut.isPending}
            onChange={(e) => shareMut.mutate({ is_public: e.target.checked })}
          />
        </label>

        {note.is_public && url ? (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2">
              <LuLink className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
              <input
                readOnly
                value={url}
                className="min-w-0 flex-1 truncate bg-transparent text-sm text-stone-700 outline-none"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-white"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(url);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                    emitAppToast('Ссылка скопирована', 'success');
                  } catch {
                    emitAppToast('Не удалось скопировать', 'error');
                  }
                }}
              >
                {copied ? <LuCheck className="h-3.5 w-3.5" /> : <LuCopy className="h-3.5 w-3.5" />}
                {copied ? 'Готово' : 'Копировать'}
              </button>
            </div>
            <button
              type="button"
              disabled={shareMut.isPending}
              onClick={() => shareMut.mutate({ is_public: true, rotate_token: true })}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-800 disabled:opacity-50"
            >
              <LuRefreshCw className="h-3.5 w-3.5" aria-hidden />
              Сбросить ссылку (старая перестанет работать)
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
