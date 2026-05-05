import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuLoaderCircle, LuUsers, LuX } from 'react-icons/lu';
import { AppAvatar } from '../../../components/AppAvatar';
import { fetchPollVoters, type PollVoter } from '../api/messengerApi';

type PollVotersSheetProps = {
  open: boolean;
  onClose: () => void;
  messageId: string;
  optionIndex: number;
  optionLabel: string;
};

export function PollVotersSheet({
  open,
  onClose,
  messageId,
  optionIndex,
  optionLabel,
}: PollVotersSheetProps) {
  const [voters, setVoters] = useState<PollVoter[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [anonymousPoll, setAnonymousPoll] = useState(false);

  useEffect(() => {
    if (!open) {
      setVoters(null);
      setError(null);
      setLoading(false);
      setAnonymousPoll(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setVoters(null);
    setAnonymousPoll(false);
    void fetchPollVoters(messageId)
      .then((res) => {
        if (cancelled) return;
        if (res.anonymous) {
          setAnonymousPoll(true);
          setVoters([]);
          return;
        }
        const bucket = res.options.find((o) => o.index === optionIndex);
        setVoters(bucket?.voters ?? []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const fromApi =
          e && typeof e === 'object' && 'response' in e
            ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
            : undefined;
        setError(typeof fromApi === 'string' && fromApi.trim() ? fromApi : 'Не удалось загрузить список');
        setVoters([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, messageId, optionIndex]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120001] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="poll-voters-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex max-h-[min(88vh,560px)] w-full max-w-md flex-col overflow-hidden rounded-t-[14px] bg-white shadow-2xl sm:rounded-[14px]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-black/[0.06] px-3 py-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-500">
            <LuUsers size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="poll-voters-title" className="truncate text-[15px] font-semibold text-stone-900">
              {optionLabel || `Вариант ${optionIndex + 1}`}
            </h2>
            <p className="text-[13px] text-stone-500">Кто проголосовал</p>
          </div>
          <button
            type="button"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-stone-100"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <LuX size={22} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center gap-2 py-16 text-stone-400">
              <LuLoaderCircle className="h-8 w-8 animate-spin" aria-hidden />
              <span className="text-sm">Загрузка…</span>
            </div>
          ) : error ? (
            <p className="px-4 py-10 text-center text-sm text-red-600">{error}</p>
          ) : anonymousPoll ? (
            <p className="px-4 py-10 text-center text-sm leading-relaxed text-stone-600">
              Это анонимный опрос. Список проголосовавших недоступен — видны только итоги голосования.
            </p>
          ) : voters && voters.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-stone-500">Пока никто не выбрал этот вариант</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {(voters ?? []).map((v) => (
                <li key={v.member_id} className="flex items-center gap-3 px-4 py-2.5">
                  <AppAvatar
                    className="h-10 w-10 shrink-0 overflow-hidden rounded-full"
                    src={v.avatar_url}
                    alt=""
                    initialsFallbackText={v.display_name}
                    initialsColorSeed={String(v.member_id)}
                    priority
                    fallback={
                      <div className="grid h-full w-full place-items-center text-sm font-semibold text-stone-500">?</div>
                    }
                  />
                  <span className="min-w-0 flex-1 truncate text-[16px] text-stone-900">{v.display_name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
