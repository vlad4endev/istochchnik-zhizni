import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parse, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useId, useMemo, useState, type ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  LuCalendarClock,
  LuCheck,
  LuClipboardList,
  LuLoader,
  LuSearch,
  LuUsers,
  LuX,
} from 'react-icons/lu';

import type { MeResponse } from '../../profile/api';
import type { NextWeekMemberDay } from '../../../types';
import type { CycleCollectionClaimRow, CycleCollectionClaimsSnapshot } from '../collectionTypes';
import {
  getCycleCollectionClaims,
  getWeekPlanMembers,
  patchCycleCollectionClaim,
  patchMemberCyclePrayer,
  type WeekPlanKind,
} from '../api';
import { loadErrorDescription } from '../prayerPageUtils';

export function userCanViewNextWeekPrayerPlan(me: MeResponse | undefined): boolean {
  if (!me) return false;
  if (me.app_role?.trim().toLowerCase() === 'admin') return true;
  return Boolean(me.is_collection_coordinator);
}

export function userCanEditNextWeekPrayerNeeds(me: MeResponse | undefined): boolean {
  if (!me) return false;
  return me.app_role?.trim().toLowerCase() === 'admin';
}

function formatWeekRangeLabel(days: NextWeekMemberDay[]): string {
  if (days.length < 2) return '';
  const a = parse(days[0].date, 'yyyy-MM-dd', new Date());
  const b = parse(days[days.length - 1].date, 'yyyy-MM-dd', new Date());
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${format(a, 'd', { locale: ru })}–${format(b, 'd MMMM yyyy', { locale: ru })}`;
  }
  return `${format(a, 'd MMMM yyyy', { locale: ru })} — ${format(b, 'd MMMM yyyy', { locale: ru })}`;
}

function useClaimByMemberId(snapshot: CycleCollectionClaimsSnapshot | undefined) {
  return useMemo(() => {
    const m = new Map<number, CycleCollectionClaimRow>();
    if (!snapshot?.members) return m;
    for (const row of snapshot.members) {
      m.set(row.id, row);
    }
    return m;
  }, [snapshot]);
}

function formatUpdatedAt(iso: string | null | undefined): string | null {
  if (iso == null || typeof iso !== 'string' || !iso.trim()) return null;
  try {
    const d = parseISO(iso.replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return null;
    return format(d, 'd MMM yyyy, HH:mm', { locale: ru });
  } catch {
    return null;
  }
}

function DayPrayerNeedRow(props: {
  row: NextWeekMemberDay;
  onSaved: () => void;
}) {
  const { row, onSaved } = props;
  const mid = row.member?.id;
  const initial = row.member?.prayer_request ?? '';
  const [text, setText] = useState(initial);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setText(row.member?.prayer_request ?? '');
  }, [row.date, row.member?.id, row.member?.prayer_request]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (mid == null) throw new Error('no_member');
      await patchMemberCyclePrayer(mid, row.date, text);
    },
    onSuccess: () => {
      onSaved();
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2000);
    },
  });

  const d = parse(row.date, 'yyyy-MM-dd', new Date());
  const weekday = format(d, 'EEEE', { locale: ru });
  const dayShort = format(d, 'd MMM', { locale: ru });
  const name = row.member?.name?.trim() || null;
  const updatedLabel = formatUpdatedAt(row.member?.prayer_need_updated_at);

  if (mid == null) {
    return (
      <li className="rounded-xl border border-stone-100 bg-stone-50/80 px-3 py-3 sm:px-4">
        <p className="text-[13px] font-medium text-stone-500">
          {weekday}, {dayShort}
        </p>
        <p className="mt-1 text-[14px] text-stone-400">Нет назначенного участника</p>
      </li>
    );
  }

  const dirty = text !== (row.member?.prayer_request ?? '');

  return (
    <li className="rounded-xl border border-stone-200/80 bg-[var(--surface-elevated)] px-3 py-3 shadow-sm sm:px-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wide text-stone-500">
            {weekday} · {dayShort}
          </p>
          <p className="text-[16px] font-bold text-stone-900">{name}</p>
        </div>
        {savedFlash ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-900">
            <LuCheck className="h-3.5 w-3.5" aria-hidden />
            Сохранено
          </span>
        ) : null}
      </div>
      <label className="block">
        <span className="sr-only">Молитвенная нужда для {name}</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              if (saveMut.isPending || !dirty) return;
              void saveMut.mutateAsync();
            }
          }}
          rows={3}
          maxLength={8000}
          placeholder="Введите нужду…"
          className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-[15px] text-stone-800 outline-none ring-primary/15 focus:border-primary focus:ring-2"
        />
      </label>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-stone-400">
          {updatedLabel ? <>Последнее сохранение: {updatedLabel}</> : <>Ещё не сохраняли для этого цикла</>}
          <span className="hidden sm:inline"> · </span>
          <span className="sm:hidden">
            <br />
          </span>
          <span className="text-stone-400">Ctrl+Enter — сохранить</span>
        </p>
        <button
          type="button"
          disabled={saveMut.isPending || !dirty}
          onClick={() => void saveMut.mutateAsync()}
          className="min-h-[40px] shrink-0 rounded-xl bg-primary px-4 py-2 text-[13px] font-bold text-white shadow-sm shadow-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saveMut.isPending ? (
            <span className="inline-flex items-center gap-2">
              <LuLoader className="h-4 w-4 animate-spin" aria-hidden />
              Сохранение…
            </span>
          ) : (
            'Сохранить'
          )}
        </button>
      </div>
      {saveMut.isError ? (
        <p className="mt-2 text-[13px] text-red-600">{loadErrorDescription(saveMut.error) ?? 'Ошибка'}</p>
      ) : null}
    </li>
  );
}

function NextWeekMembersPanel(props: {
  mode: 'collection' | 'fill';
  weekKind: WeekPlanKind;
  days: NextWeekMemberDay[] | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  claimsSnapshot: CycleCollectionClaimsSnapshot | undefined;
  claimsPending: boolean;
  claimsError: boolean;
  currentUserId: number | null;
  onToggle: (memberId: number, claim: boolean) => void;
  mutPending: boolean;
  onPrayerSaved: () => void;
}) {
  const sectionId = useId();
  const {
    mode,
    weekKind,
    days,
    isPending,
    isError,
    error,
    onRetry,
    claimsSnapshot,
    claimsPending,
    claimsError,
    currentUserId,
    onToggle,
    mutPending,
    onPrayerSaved,
  } = props;

  const claimByMemberId = useClaimByMemberId(claimsSnapshot);
  const [filterMode, setFilterMode] = useState<'all' | 'mine' | 'free' | 'busy'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const isCollectionMode = mode === 'collection';

  const heading =
    weekKind === 'current' ? 'Текущая неделя — молитва за члена' : 'Следующая неделя — молитва за члена';

  if (isPending || claimsPending) {
    return (
      <div aria-busy="true" aria-label="Загрузка плана на неделю">
        <div className="mb-3 flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-[10px] bg-stone-200/90" />
          <div className="h-4 w-48 animate-pulse rounded bg-stone-200/90" />
        </div>
        <div className="space-y-2 rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow)]">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="flex justify-between gap-3 border-b border-stone-100 pb-2 last:border-0 last:pb-0"
            >
              <div className="h-4 w-28 animate-pulse rounded bg-stone-100" />
              <div className="h-4 w-32 max-w-[50%] animate-pulse rounded bg-stone-100" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-[14px] text-amber-950">
        <p className="font-semibold">План на неделю</p>
        <p className="mt-1 text-[13px] text-amber-900/90">{loadErrorDescription(error) ?? 'Ошибка загрузки'}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 min-h-[44px] rounded-lg px-2 text-left text-[13px] font-bold text-primary underline"
        >
          Повторить
        </button>
      </div>
    );
  }

  if (!days || days.length === 0) {
    return <p className="text-center text-[14px] text-stone-500">Нет данных на выбранную неделю.</p>;
  }

  const range = formatWeekRangeLabel(days);
  const cycleLabel =
    claimsSnapshot != null ? `Молитвенный цикл №${claimsSnapshot.cycle_number}` : null;

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const listRows = days.filter((row) => {
    const name = row.member?.name?.trim() || '';
    if (normalizedSearch && !name.toLowerCase().includes(normalizedSearch)) return false;

    if (claimsError) return filterMode === 'all';
    const mid = row.member?.id;
    const claimRow = mid != null ? claimByMemberId.get(mid) : undefined;
    const mine = currentUserId != null && claimRow?.claimed_by?.id === currentUserId;

    if (filterMode === 'mine') return mine;
    if (filterMode === 'free') return Boolean(claimRow && !claimRow.claimed_by);
    if (filterMode === 'busy') return Boolean(claimRow?.claimed_by && !mine);
    return true;
  });

  const myClaimsCount = days.filter((row) => {
    const mid = row.member?.id;
    const claimRow = mid != null ? claimByMemberId.get(mid) : undefined;
    return currentUserId != null && claimRow?.claimed_by?.id === currentUserId;
  }).length;
  const freeCount = days.filter((row) => {
    const mid = row.member?.id;
    const claimRow = mid != null ? claimByMemberId.get(mid) : undefined;
    return Boolean(claimRow && !claimRow.claimed_by);
  }).length;
  const busyCount = days.filter((row) => {
    const mid = row.member?.id;
    const claimRow = mid != null ? claimByMemberId.get(mid) : undefined;
    const mine = currentUserId != null && claimRow?.claimed_by?.id === currentUserId;
    return Boolean(claimRow?.claimed_by && !mine);
  }).length;

  return (
    <div aria-labelledby={sectionId}>
      <div className="mb-3 flex items-center gap-3 pl-0.5">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-primary/10 text-primary"
          aria-hidden
        >
          <LuUsers className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 id={sectionId} className="text-xs font-extrabold uppercase tracking-[0.12em] text-stone-900">
            {heading}
          </h2>
          <p className="mt-0.5 text-[13px] text-stone-500">{range}</p>
          {claimsError ? (
            <p className="mt-1 text-[12px] leading-snug text-amber-800">
              Отметки сбора нужд сейчас недоступны (ошибка загрузки).
            </p>
          ) : cycleLabel ? (
            <p className="mt-1 text-[12px] leading-snug text-stone-500">
              {cycleLabel}. Отметьте, за кого вы собираете нужды: один участник — только у одного ответственного.
            </p>
          ) : null}
        </div>
      </div>

      <p className="mb-3 text-[13px] leading-snug text-stone-600">
        {isCollectionMode
          ? 'Список участников для сбора нужд: используйте поиск и фильтры, затем закрепляйте ответственного.'
          : 'Заполняйте нужды по дням — они сохраняются для участника в текущем молитвенном цикле и попадают в историю при изменении текста.'}
      </p>

      {!isCollectionMode ? (
        <ul className="mb-6 space-y-3">
          {days.map((row) => (
            <DayPrayerNeedRow key={row.date} row={row} onSaved={onPrayerSaved} />
          ))}
        </ul>
      ) : (
        <div>
          <div className="mb-3 grid gap-2 sm:grid-cols-2">
            <label className="relative block sm:col-span-2">
              <span className="sr-only">Поиск участника</span>
              <LuSearch className="pointer-events-none absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-stone-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по имени участника"
                className="min-h-[44px] w-full rounded-xl border border-stone-200 bg-white pl-10 pr-3 text-[14px] text-stone-800 outline-none ring-primary/15 focus:border-primary focus:ring-2"
              />
            </label>

            {([
              ['all', `Все (${days.length})`],
              ['mine', `Мои (${myClaimsCount})`],
              ['free', `Свободные (${freeCount})`],
              ['busy', `Занятые (${busyCount})`],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilterMode(mode)}
                className={`min-h-[42px] rounded-xl border px-3 text-[13px] font-bold transition ${
                  filterMode === mode
                    ? 'border-primary/60 bg-primary/10 text-primary'
                    : 'border-stone-200 bg-white text-stone-600 hover:text-stone-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {listRows.length === 0 ? (
            <p className="mb-3 rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-[13px] text-stone-500">
              Ничего не найдено по текущему фильтру.
            </p>
          ) : null}

          <div className="overflow-hidden rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] shadow-[var(--shadow)]">
            <ul className="divide-y divide-stone-100">
              {listRows.map((row) => {
                const d = parse(row.date, 'yyyy-MM-dd', new Date());
                const label = format(d, 'EEEE, d MMMM', { locale: ru });
                const name = row.member?.name?.trim() || null;
                const mid = row.member?.id;
                const claimRow = claimsError ? undefined : mid != null ? claimByMemberId.get(mid) : undefined;
                const mine = currentUserId != null && claimRow?.claimed_by?.id === currentUserId;
                const disabled = mutPending || !claimRow?.can_toggle;

                return (
                  <li
                    key={`claim-${row.date}`}
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 shell:px-5"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                      <span className="shrink-0 text-[13px] font-medium text-stone-600">{label}</span>
                      <span className="min-w-0 text-[15px] font-semibold text-stone-900">{name ?? '—'}</span>
                    </div>
                    {mid != null && claimRow && !claimsError ? (
                      <div className="flex flex-wrap items-center justify-end gap-2 sm:shrink-0">
                        <label
                          className={`inline-flex cursor-pointer items-center gap-2 ${!claimRow.can_toggle && !mine ? 'cursor-default opacity-90' : ''}`}
                        >
                          <input
                            type="checkbox"
                            className="h-5 w-5 shrink-0 rounded border-stone-300 text-primary focus:ring-primary/30 disabled:cursor-not-allowed"
                            checked={mine}
                            disabled={disabled}
                            onChange={(e) => onToggle(mid, e.target.checked)}
                          />
                          <span className="sr-only">Сбор нужд для {name}</span>
                        </label>
                        {claimRow.claimed_by ? (
                          <span className="inline-flex max-w-full items-center rounded-full bg-amber-500/12 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-950">
                            {mine ? 'Вы' : claimRow.claimed_by.name}
                          </span>
                        ) : (
                          <span className="inline-flex max-w-full items-center rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-900">
                            Свободно
                          </span>
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function ModalFrame(props: {
  titleId: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { titleId, title, onClose, children } = props;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[min(92dvh,920px)] w-full max-w-lg flex-col rounded-t-3xl border border-stone-200/90 bg-[var(--surface)] shadow-2xl sm:max-h-[88vh] sm:rounded-3xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-stone-200/80 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <LuCalendarClock className="h-5 w-5" aria-hidden />
            </span>
            <h2 id={titleId} className="truncate text-[15px] font-extrabold text-stone-900 sm:text-base">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-stone-500 hover:bg-stone-100"
            aria-label="Закрыть"
          >
            <LuX className="h-6 w-6" strokeWidth={2} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">{children}</div>
      </div>
    </div>
  );
}

type Props = { canView: boolean; currentUserId: number | null };

/** Кнопка и модалка: 7 дней недели по циклу в одном из режимов (сбор или заполнение). */
export function NextWeekPrayerPlanSection({
  canView,
  currentUserId,
  mode = 'collection',
}: Props & { mode?: 'collection' | 'fill' }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const [mutErr, setMutErr] = useState<string | null>(null);
  const [weekKind, setWeekKind] = useState<WeekPlanKind>('current');
  const isCollectionMode = mode === 'collection';

  const enabled = canView && open;

  const {
    data: weekDays,
    isPending: weekPending,
    isFetching: weekFetching,
    isError: weekError,
    error: weekErr,
    refetch: refetchWeek,
  } = useQuery({
    queryKey: ['calendar', 'week-members', weekKind],
    queryFn: () => getWeekPlanMembers(weekKind),
    enabled,
    staleTime: 60_000,
  });

  const {
    data: claimsSnapshot,
    isPending: claimsPending,
    isFetching: claimsFetching,
    isError: claimsError,
    error: claimsErr,
    refetch: refetchClaims,
  } = useQuery({
    queryKey: ['calendar', 'cycle', 'collection-claims'],
    queryFn: getCycleCollectionClaims,
    enabled,
    staleTime: 30_000,
  });

  const mut = useMutation({
    mutationFn: ({ memberId, claim }: { memberId: number; claim: boolean }) =>
      patchCycleCollectionClaim(memberId, claim),
    onSuccess: (data) => {
      setMutErr(null);
      qc.setQueryData(['calendar', 'cycle', 'collection-claims'], data);
      void qc.invalidateQueries({ queryKey: ['calendar', 'week-members'] });
    },
    onError: (e: unknown) => {
      setMutErr(loadErrorDescription(e) ?? 'Не удалось сохранить');
    },
  });

  const invalidateAfterPrayerSave = () => {
    void qc.invalidateQueries({ queryKey: ['calendar', 'week-members'] });
    void qc.invalidateQueries({ queryKey: ['calendar', 'day'] });
  };

  const retryAll = () => {
    void refetchWeek();
    void refetchClaims();
  };

  if (!canView) return null;

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="touch-manipulation flex w-full min-h-[56px] items-center gap-3 rounded-2xl border-2 border-primary/25 bg-gradient-to-br from-[var(--surface-elevated)] to-primary/[0.06] px-4 py-3.5 text-left shadow-[var(--shadow)] transition hover:border-primary/40 hover:shadow-md"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-primary text-white shadow-md shadow-primary/25">
          <LuClipboardList className="h-5 w-5" strokeWidth={2} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-extrabold text-stone-900">
            {isCollectionMode ? 'Список сбора нужд недели' : 'Заполнение нужд недели'}
          </span>
          <span className="mt-0.5 block text-[12px] leading-snug text-stone-600">
            {isCollectionMode
              ? '7 дней · список участников · поиск и отбор'
              : '7 дней · текущая или следующая неделя · ввод нужд'}
          </span>
        </span>
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <ModalFrame
              titleId={titleId}
              title={isCollectionMode ? 'Список сбора нужд' : 'Заполнение нужд на неделю'}
              onClose={() => setOpen(false)}
            >
              <div className="mb-4 flex rounded-2xl border border-stone-200/90 bg-stone-100/80 p-1">
                <button
                  type="button"
                  onClick={() => setWeekKind('current')}
                  className={`min-h-[44px] flex-1 rounded-[10px] px-3 text-[13px] font-bold transition ${
                    weekKind === 'current'
                      ? 'bg-[var(--surface-elevated)] text-stone-900 shadow-sm'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  Текущая неделя
                </button>
                <button
                  type="button"
                  onClick={() => setWeekKind('next')}
                  className={`min-h-[44px] flex-1 rounded-[10px] px-3 text-[13px] font-bold transition ${
                    weekKind === 'next'
                      ? 'bg-[var(--surface-elevated)] text-stone-900 shadow-sm'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  Следующая
                </button>
              </div>

              {mutErr ? <p className="mb-3 text-[13px] text-red-600">{mutErr}</p> : null}
              {!weekPending &&
              !claimsPending &&
              enabled &&
              (weekFetching || claimsFetching) ? (
                <p className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-primary">
                  <LuLoader className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                  Обновляем план и отметки…
                </p>
              ) : null}
              {claimsError && !weekError ? (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-[13px] text-amber-950">
                  <span>{loadErrorDescription(claimsErr) ?? 'Ошибка загрузки отметок'}</span>
                  <button
                    type="button"
                    onClick={() => void refetchClaims()}
                    className="font-bold text-primary underline"
                  >
                    Повторить
                  </button>
                </div>
              ) : null}
              {mut.isPending ? (
                <p className="mb-3 flex items-center gap-2 text-[13px] text-stone-500">
                  <LuLoader className="h-4 w-4 animate-spin" aria-hidden />
                  Сохранение отметки…
                </p>
              ) : null}
              <NextWeekMembersPanel
                mode={mode}
                weekKind={weekKind}
                days={weekDays}
                isPending={weekPending}
                isError={weekError}
                error={weekErr}
                onRetry={retryAll}
                claimsSnapshot={claimsSnapshot}
                claimsPending={claimsPending}
                claimsError={claimsError}
                currentUserId={currentUserId}
                onToggle={(memberId, claim) => mut.mutate({ memberId, claim })}
                mutPending={mut.isPending}
                onPrayerSaved={invalidateAfterPrayerSave}
              />
            </ModalFrame>,
            document.body,
          )
        : null}
    </div>
  );
}
