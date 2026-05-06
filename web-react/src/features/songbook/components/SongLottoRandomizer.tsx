import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuDice5, LuX } from 'react-icons/lu';

import type { SongListItem } from '../api';

type Props = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  songs: SongListItem[];
  title?: string;
};

function pickRandomIndex(len: number): number {
  if (len <= 1) return 0;
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % len;
}

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

function easeOutCubic(t01: number): number {
  const t = clamp(t01, 0, 1);
  return 1 - Math.pow(1 - t, 3);
}

export function SongLottoRandomizer({ open, onOpenChange, songs, title = 'Лото песен' }: Props) {
  const candidates = useMemo(() => songs.filter((s) => Boolean(String(s.title ?? '').trim())), [songs]);
  const [phase, setPhase] = useState<'idle' | 'spin' | 'done'>('idle');
  const [cursor, setCursor] = useState(0);
  const [winner, setWinner] = useState<SongListItem | null>(null);
  const [history, setHistory] = useState<SongListItem[]>([]);
  const runIdRef = useRef(0);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const safeClose = () => {
    runIdRef.current += 1;
    setPhase('idle');
    setWinner(null);
    onOpenChange(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') safeClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // reset when opened
    setPhase('idle');
    setWinner(null);
    setCursor(0);
  }, [open]);

  const spin = () => {
    if (candidates.length === 0) return;
    const localRun = runIdRef.current + 1;
    runIdRef.current = localRun;

    setPhase('spin');
    setWinner(null);

    const totalMs = 3600;
    const start = performance.now();
    const pick = pickRandomIndex(candidates.length);
    const target = candidates[pick]!;

    const tick = () => {
      if (runIdRef.current !== localRun) return;
      const now = performance.now();
      const t01 = clamp((now - start) / totalMs, 0, 1);
      const e = easeOutCubic(t01);

      // more steps at the beginning, fewer at the end
      const steps = Math.floor(10 + (1 - e) * 80);
      setCursor((prev) => (prev + Math.max(1, steps)) % Math.max(1, candidates.length));

      if (t01 >= 1) {
        setWinner(target);
        setHistory((prev) => [target, ...prev.filter((x) => x.id !== target.id)].slice(0, 8));
        setCursor(candidates.findIndex((s) => s.id === target.id));
        setPhase('done');
        return;
      }

      const nextDelay = 26 + e * 140;
      window.setTimeout(tick, nextDelay);
    };
    tick();
  };

  if (!open) return null;

  const current = candidates[cursor] ?? null;
  const disabled = candidates.length === 0;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-[2px]"
        aria-label="Закрыть лото"
        onClick={safeClose}
      />
      <div
        className="fixed inset-x-3 top-16 z-[201] mx-auto w-auto max-w-xl rounded-3xl border border-stone-200 bg-white p-4 shadow-2xl sm:inset-x-6 sm:p-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="song-lotto-title"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="song-lotto-title" className="truncate text-base font-semibold text-stone-900">
              {title}
            </h2>
            <p className="mt-1 text-xs text-stone-500">
              Крутит песни как лото и выбирает одну случайно из текущего списка.
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-stone-500 hover:bg-stone-100 hover:text-stone-900"
            onClick={safeClose}
            aria-label="Закрыть"
          >
            <LuX className="h-5 w-5" />
          </button>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              Барабан
            </p>
            <p className="text-xs text-stone-500">
              Кандидатов: <span className="font-semibold text-stone-700">{candidates.length}</span>
            </p>
          </div>

          <div className="mt-3 grid gap-2">
            <div
              className={[
                'relative overflow-hidden rounded-2xl border bg-white p-3',
                phase === 'spin' ? 'border-primary/40 shadow-[0_0_0_3px_rgba(59,130,246,0.12)]' : 'border-stone-200',
              ].join(' ')}
            >
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white via-transparent to-white" />

              <div className="flex items-center gap-3">
                <div
                  className={[
                    'grid h-10 w-10 shrink-0 place-items-center rounded-2xl border',
                    phase === 'spin'
                      ? 'border-primary/30 bg-primary/10 text-primary animate-pulse'
                      : 'border-stone-200 bg-stone-50 text-stone-700',
                  ].join(' ')}
                >
                  <LuDice5 className={['h-5 w-5', phase === 'spin' ? 'animate-[spin_0.7s_linear_infinite]' : ''].join(' ')} />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-stone-900">
                    {current?.title ?? (disabled ? 'Нет песен для выбора' : '—')}
                  </p>
                  <p className="truncate text-xs text-stone-500">
                    {current?.song_number != null ? `№ ${current.song_number}` : ' '}
                  </p>
                </div>
              </div>
            </div>

            {winner ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">
                  Выпало
                </p>
                <p className="mt-1 text-sm font-semibold text-emerald-950">{winner.title}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link
                    to={`/songbook/${winner.id}`}
                    className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-600"
                    onClick={() => onOpenChange(false)}
                  >
                    Открыть песню
                  </Link>
                  <button
                    type="button"
                    className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-emerald-200 bg-white px-4 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
                    onClick={spin}
                  >
                    Ещё раз
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={disabled || phase === 'spin'}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
                  onClick={spin}
                >
                  <LuDice5 className={['h-5 w-5', phase === 'spin' ? 'animate-[spin_0.7s_linear_infinite]' : ''].join(' ')} />
                  {phase === 'spin' ? 'Крутим…' : 'Крутить лото'}
                </button>
                <button
                  type="button"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-800 hover:bg-stone-50"
                  onClick={() => {
                    setHistory([]);
                    setWinner(null);
                    setPhase('idle');
                  }}
                  disabled={phase === 'spin'}
                >
                  Сброс
                </button>
              </div>
            )}
          </div>
        </div>

        {history.length > 0 ? (
          <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              История (последние)
            </p>
            <ul className="mt-2 space-y-1">
              {history.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm text-stone-800">{s.title}</span>
                  <Link
                    to={`/songbook/${s.id}`}
                    className="shrink-0 text-xs font-semibold text-sky-700 hover:text-sky-800"
                    onClick={() => onOpenChange(false)}
                  >
                    открыть
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-3 text-center text-[11px] text-stone-500">
          Подсказка: учитывает вкладку и фильтры каталога.
        </div>
      </div>
    </>
  );
}

