import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuCheckCheck, LuLoaderCircle, LuX } from 'react-icons/lu';
import { AppAvatar } from '../../../components/AppAvatar';
import { fetchMessageReaders, type MessageReader } from '../api/messengerApi';

type MessageReadersSheetProps = {
  open: boolean;
  onClose: () => void;
  messageId: string;
};

function formatReaderTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return time;
  const date = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  return `${date}, ${time}`;
}

function formatReadersSubtitle(readCount: number, otherCount: number): string {
  if (readCount <= 0) return 'Пока никто не прочитал';
  if (otherCount > 0 && readCount >= otherCount) return `Прочитали все · ${readCount}`;
  if (otherCount > 0) return `Прочитали ${readCount} из ${otherCount}`;
  return `Прочитали: ${readCount}`;
}

export function MessageReadersSheet({ open, onClose, messageId }: MessageReadersSheetProps) {
  const [readers, setReaders] = useState<MessageReader[] | null>(null);
  const [otherCount, setOtherCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setReaders(null);
      setOtherCount(0);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setReaders(null);
    void fetchMessageReaders(messageId)
      .then((res) => {
        if (cancelled) return;
        setReaders(res.readers ?? []);
        setOtherCount(Number(res.other_member_count) || 0);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const fromApi =
          e && typeof e === 'object' && 'response' in e
            ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
            : undefined;
        setError(
          typeof fromApi === 'string' && fromApi.trim()
            ? fromApi
            : 'Не удалось загрузить список',
        );
        setReaders([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, messageId]);

  if (!open || typeof document === 'undefined') return null;

  const readCount = readers?.length ?? 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[120001] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="msg-readers-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex max-h-[min(88dvh,560px)] w-full max-w-md flex-col overflow-hidden rounded-t-[18px] bg-white shadow-2xl sm:rounded-[14px]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-black/[0.06] px-3 py-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sky-50 text-sky-600">
            <LuCheckCheck size={18} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="msg-readers-title" className="truncate text-[15px] font-semibold text-stone-900">
              Прочитали
            </h2>
            <p className="text-[13px] text-stone-500">
              {loading ? 'Загрузка…' : formatReadersSubtitle(readCount, otherCount)}
            </p>
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
          ) : readers && readers.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-stone-500">
              Пока никто не прочитал это сообщение
            </p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {(readers ?? []).map((r) => {
                const when = formatReaderTime(r.read_at);
                return (
                  <li key={r.member_id} className="flex items-center gap-3 px-4 py-2.5">
                    <AppAvatar
                      className="h-10 w-10 shrink-0 overflow-hidden rounded-full"
                      src={r.avatar_url}
                      alt=""
                      initialsFallbackText={r.display_name}
                      initialsColorSeed={String(r.member_id)}
                      priority
                      fallback={
                        <div className="grid h-full w-full place-items-center text-sm font-semibold text-stone-500">
                          ?
                        </div>
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[16px] text-stone-900">{r.display_name}</div>
                      {when ? (
                        <div className="text-[12px] tabular-nums text-stone-500">{when}</div>
                      ) : null}
                    </div>
                    <LuCheckCheck className="h-4 w-4 shrink-0 text-sky-500" aria-hidden />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
