import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parse } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useId, useMemo, useState, type ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  LuCalendarClock,
  LuCheck,
  LuClipboardList,
  LuLoader,
  LuSearch,
  LuX,
  LuCircleAlert,
  LuCircleCheck,
  LuPencilLine,
} from 'react-icons/lu';

import { memberRosterName } from '../../../lib/memberRosterName';
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
import { CoordinatorPreviousNeedsPanel } from './CoordinatorPreviousNeedsPanel';
import { loadErrorDescription } from '../prayerPageUtils';

export function userCanViewNextWeekPrayerPlan(me: MeResponse | undefined): boolean {
  if (!me) return false;
  if (me.app_role?.trim().toLowerCase() === 'admin') return true;
  return Boolean(me.is_collection_coordinator);
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

function NextWeekMembersPanel(props: {
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
  /** Админ: панель «предыдущие нужды» у всех строк; удобнее массовая работа. */
  isAdmin?: boolean;
}) {
  const sectionId = useId();
  const {
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
    isAdmin = false,
  } = props;

  const claimByMemberId = useClaimByMemberId(claimsSnapshot);
  const [filterMode, setFilterMode] = useState<'all' | 'mine' | 'free' | 'busy'>('all');
  const [needFilter, setNeedFilter] = useState<'all' | 'empty' | 'filled'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [prayerDraft, setPrayerDraft] = useState('');

  const savePrayerMut = useMutation({
    mutationFn: async (input: { memberId: number; date: string; text: string }) => {
      await patchMemberCyclePrayer(input.memberId, input.date, input.text);
    },
    onSuccess: () => {
      onPrayerSaved();
      setExpandedDate(null);
    },
  });

  function needText(m: NextWeekMemberDay['member']): string {
    return (m?.prayer_request ?? '').trim();
  }

  if (isPending || claimsPending) {
    return (
      <div aria-busy="true" aria-label="Загрузка очереди">
        <div className="space-y-1.5 rounded-xl border border-stone-200/80 bg-[var(--surface-elevated)] p-2.5 shadow-sm">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex justify-between gap-2 border-b border-stone-100 py-2 last:border-0 last:pb-0">
              <div className="h-3.5 w-24 animate-pulse rounded bg-stone-100" />
              <div className="h-3.5 w-16 animate-pulse rounded bg-stone-100" />
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
    return <p className="text-center text-[13px] text-stone-500">Нет данных.</p>;
  }

  const filledNeedCount = days.filter((r) => r.member && needText(r.member).length > 0).length;
  const emptyNeedCount = days.filter((r) => r.member && needText(r.member).length === 0).length;

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const listRows = days.filter((row) => {
    const m = row.member;
    const searchBlob = m
      ? `${memberRosterName(m)} ${m.name} ${m.first_name ?? ''} ${m.last_name ?? ''}`.toLowerCase()
      : '';
    if (normalizedSearch && !searchBlob.includes(normalizedSearch)) return false;

    if (needFilter === 'empty') {
      if (!m || needText(m).length > 0) return false;
    }
    if (needFilter === 'filled') {
      if (!m || needText(m).length === 0) return false;
    }

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
      <h2 id={sectionId} className="sr-only">
        Очередь молитвенного цикла и отметки сбора нужд{weekKind === 'next' ? ', следующая неделя' : ', текущая неделя'}
      </h2>
      {claimsError ? (
        <p className="mb-2 text-[12px] leading-snug text-amber-800">Отметки сбора недоступны.</p>
      ) : null}

      <div>
          <div className="mb-2 space-y-1.5">
            <label className="relative block">
              <span className="sr-only">Поиск по имени</span>
              <LuSearch className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск"
                className="min-h-[40px] w-full rounded-lg border border-stone-200 bg-white pl-9 pr-2.5 text-[13px] text-stone-800 outline-none ring-primary/15 focus:border-primary focus:ring-1"
              />
            </label>

            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-stone-200/90 bg-white px-2.5 py-2 text-[11px] leading-snug text-stone-700">
              <span className="font-extrabold text-stone-900">Нужды недели:</span>
              <span className="inline-flex items-center gap-0.5 font-bold text-emerald-800">
                <LuCircleCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} aria-hidden />
                заполнено {filledNeedCount}
              </span>
              <span className="text-stone-300">·</span>
              <span className="inline-flex items-center gap-0.5 font-bold text-amber-900">
                <LuCircleAlert className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} aria-hidden />
                пусто {emptyNeedCount}
              </span>
            </p>

            <div>
              <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wide text-stone-400">Нужда</p>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ['all', `Весь список (${days.length})`],
                    ['empty', `Без нужды (${emptyNeedCount})`],
                    ['filled', `С нуждой (${filledNeedCount})`],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setNeedFilter(mode)}
                    className={[
                      'rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-wide transition',
                      needFilter === mode
                        ? 'border-amber-500/50 bg-amber-50 text-amber-950'
                        : 'border-stone-200 bg-white text-stone-600 hover:text-stone-900',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wide text-stone-400">
                Ответственный (куратор)
              </p>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch]">
                {([
                  ['all', `Все ${days.length}`],
                  ['mine', `Мои ${myClaimsCount}`],
                  ['free', `Своб. ${freeCount}`],
                  ['busy', `Занят. ${busyCount}`],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setFilterMode(mode)}
                    className={[
                      'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-wide transition',
                      filterMode === mode
                        ? 'border-primary/60 bg-primary/10 text-primary'
                        : 'border-stone-200 bg-white text-stone-600 hover:text-stone-900',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {listRows.length === 0 ? (
            <p className="mb-2 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-2 text-[12px] text-stone-500">
              Ничего не найдено.
            </p>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-stone-200/80 bg-[var(--surface-elevated)] shadow-sm">
            <ul className="divide-y divide-stone-100">
              {listRows.map((row) => {
                const d = parse(row.date, 'yyyy-MM-dd', new Date());
                const label = format(d, 'EEE d.MM', { locale: ru });
                const mem = row.member;
                const name = mem ? memberRosterName(mem) : null;
                const mid = row.member?.id;
                const claimRow = claimsError ? undefined : mid != null ? claimByMemberId.get(mid) : undefined;
                const mine = currentUserId != null && claimRow?.claimed_by?.id === currentUserId;
                const canToggle = Boolean(claimRow && (claimRow.can_toggle || mine));
                const disabled = mutPending || !canToggle;
                const claimedByLabel = claimRow?.claimed_by
                  ? mine
                    ? 'Вы'
                    : memberRosterName({
                        id: claimRow.claimed_by.id,
                        name: claimRow.claimed_by.name,
                        first_name: claimRow.claimed_by.first_name,
                        last_name: claimRow.claimed_by.last_name,
                      })
                  : null;
                const hasNeed = Boolean(mem && needText(mem).length > 0);
                const showPrevPanel = (mine || isAdmin) && mid != null && mem && !claimsError;

                return (
                  <li
                    key={`claim-${row.date}`}
                    className="group flex flex-col transition-colors hover:bg-stone-50/70"
                  >
                    <div className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="w-[4.5rem] shrink-0 text-[11px] font-semibold tabular-nums text-stone-500">
                            {label}
                          </span>
                          <span className="min-w-0 text-[14px] font-bold leading-tight tracking-tight text-stone-900">
                            {name ?? '—'}
                          </span>
                          {mem && mid != null ? (
                            <span
                              className={[
                                'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide',
                                hasNeed ? 'bg-emerald-500/15 text-emerald-900' : 'bg-amber-500/15 text-amber-950',
                              ].join(' ')}
                            >
                              {hasNeed ? (
                                <>
                                  <LuCircleCheck className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                                  Нужда
                                </>
                              ) : (
                                <>
                                  <LuCircleAlert className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                                  Пусто
                                </>
                              )}
                            </span>
                          ) : null}
                        </div>
                        {mem && mid != null && hasNeed ? (
                          <p className="line-clamp-2 text-[12px] leading-snug text-stone-600 sm:max-w-xl">
                            {needText(mem)}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2 sm:max-w-[200px] sm:flex-col sm:items-end">
                        {mid != null && claimRow && !claimsError ? (
                          <>
                            {claimRow.claimed_by ? (
                              <span
                                className={[
                                  'inline-flex max-w-[10rem] truncate rounded-full px-2 py-0.5 text-[10px] font-bold',
                                  mine ? 'bg-primary/10 text-primary' : 'bg-amber-500/12 text-amber-950',
                                ].join(' ')}
                                title={claimedByLabel ?? ''}
                              >
                                Куратор: {claimedByLabel}
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
                                Куратор не назначен
                              </span>
                            )}
                            <button
                              type="button"
                              disabled={disabled}
                              aria-pressed={mine}
                              aria-label={
                                mine
                                  ? 'Снять отметку сбора нужд'
                                  : claimRow.claimed_by
                                    ? 'Недоступно: уже занято'
                                    : 'Взять сбор нужд на себя'
                              }
                              onClick={() => {
                                if (disabled) return;
                                onToggle(mid, !mine);
                              }}
                              className={[
                                'relative inline-flex h-9 w-[60px] items-center rounded-full border transition',
                                'focus:outline-none focus:ring-2 focus:ring-primary/25 focus:ring-offset-1 focus:ring-offset-[var(--surface)]',
                                disabled
                                  ? 'cursor-not-allowed border-stone-200 bg-stone-100 opacity-60'
                                  : mine
                                    ? 'border-primary/40 bg-primary/10 hover:bg-primary/15'
                                    : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50',
                              ].join(' ')}
                              title={
                                disabled
                                  ? claimRow.claimed_by && !mine
                                    ? 'Уже занято другим'
                                    : 'Недоступно'
                                  : mine
                                    ? 'Снять отметку'
                                    : 'Взять на себя'
                              }
                            >
                              <span
                                className={[
                                  'absolute left-0.5 flex h-7 w-7 items-center justify-center rounded-full shadow-sm transition-transform',
                                  mine
                                    ? 'translate-x-[26px] bg-primary text-white'
                                    : 'translate-x-0 bg-stone-200 text-stone-600',
                                ].join(' ')}
                              >
                                <LuCheck className={mine ? 'h-4 w-4' : 'h-4 w-4 opacity-0'} aria-hidden />
                              </span>
                              <span className="sr-only">{mine ? 'Выбрано' : 'Не выбрано'}</span>
                            </button>
                          </>
                        ) : claimsError && mid != null ? (
                          <span className="text-[10px] font-medium text-amber-800">Отметки кураторов недоступны</span>
                        ) : null}
                      </div>
                    </div>

                    {mem && mid != null ? (
                      <div className="border-t border-stone-100 bg-white/70 px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-stone-600">Молитвенная нужда на этот день</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (expandedDate === row.date) {
                                setExpandedDate(null);
                              } else {
                                setExpandedDate(row.date);
                                setPrayerDraft(mem.prayer_request ?? '');
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-stone-50"
                          >
                            <LuPencilLine className="h-3.5 w-3.5" aria-hidden />
                            {expandedDate === row.date ? 'Свернуть' : hasNeed ? 'Изменить' : 'Заполнить'}
                          </button>
                        </div>
                        {expandedDate === row.date ? (
                          <div className="mt-2 space-y-2">
                            <textarea
                              value={prayerDraft}
                              onChange={(e) => setPrayerDraft(e.target.value)}
                              rows={4}
                              maxLength={8000}
                              placeholder="О чём просим молиться в этот день цикла…"
                              className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-[13px] text-stone-800 outline-none ring-primary/15 focus:border-primary focus:ring-1"
                            />
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                disabled={savePrayerMut.isPending}
                                onClick={() =>
                                  void savePrayerMut.mutateAsync({
                                    memberId: mid,
                                    date: row.date,
                                    text: prayerDraft,
                                  })
                                }
                                className="min-h-[40px] rounded-lg bg-primary px-4 text-[13px] font-bold text-white shadow-sm hover:bg-primary/90 disabled:opacity-50"
                              >
                                {savePrayerMut.isPending ? 'Сохранение…' : 'Сохранить нужду'}
                              </button>
                              {savePrayerMut.isError ? (
                                <span className="text-[12px] text-red-600">
                                  {loadErrorDescription(savePrayerMut.error) ?? 'Ошибка'}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {showPrevPanel ? (
                      <div className="border-t border-stone-100 bg-stone-50/80 px-3 py-2">
                        <CoordinatorPreviousNeedsPanel
                          memberId={mid}
                          memberLabel={name ?? ''}
                          items={mem.previous_manual_prayer_needs ?? []}
                          onChanged={onPrayerSaved}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
    </div>
  );
}

function ModalFrame(props: {
  titleId: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Шире окно — удобнее список с полем нужды. */
  size?: 'default' | 'wide';
}) {
  const { titleId, title, onClose, children, size = 'default' } = props;
  const widthClass = size === 'wide' ? 'max-w-2xl' : 'max-w-md';
  const maxHClass =
    size === 'wide' ? 'max-h-[min(92dvh,820px)] sm:max-h-[88vh]' : 'max-h-[min(88dvh,720px)] sm:max-h-[85vh]';

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
        className={`flex w-full flex-col rounded-t-2xl border border-stone-200/90 bg-[var(--surface)] shadow-2xl sm:rounded-2xl ${maxHClass} ${widthClass}`}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-stone-200/80 px-3 py-2 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <LuCalendarClock className="h-4 w-4" aria-hidden />
            </span>
            <h2 id={titleId} className="truncate text-[14px] font-extrabold text-stone-900">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100"
            aria-label="Закрыть"
          >
            <LuX className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">{children}</div>
      </div>
    </div>
  );
}

type Props = { canView: boolean; currentUserId: number | null; isAdmin?: boolean };

/** Кнопка и модалка: очередь цикла и отметки сбора нужд; под «своими» участниками — предыдущие нужды. */
export function NextWeekPrayerPlanSection({ canView, currentUserId, isAdmin = false }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const [mutErr, setMutErr] = useState<string | null>(null);
  const [weekKind, setWeekKind] = useState<WeekPlanKind>('current');

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
    queryKey: ['calendar', 'cycle', 'collection-claims', weekKind],
    queryFn: () => getCycleCollectionClaims(weekKind),
    enabled,
    staleTime: 30_000,
  });

  const mut = useMutation({
    mutationFn: ({ memberId, claim }: { memberId: number; claim: boolean }) =>
      patchCycleCollectionClaim(memberId, claim, weekKind),
    onSuccess: (data) => {
      setMutErr(null);
      qc.setQueryData(['calendar', 'cycle', 'collection-claims', weekKind], data);
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
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="touch-manipulation flex w-full min-h-[48px] items-center gap-2.5 rounded-xl border border-primary/30 bg-[var(--surface-elevated)] px-3 py-2.5 text-left shadow-sm transition hover:border-primary/45 hover:shadow-md"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
          <LuClipboardList className="h-4 w-4" strokeWidth={2} aria-hidden />
        </span>
        <span className="min-w-0 flex-1 text-[15px] font-extrabold leading-tight text-stone-900">
          Сбор нужд · очередь недели
        </span>
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <ModalFrame
              titleId={titleId}
              title="Очередь недели"
              onClose={() => setOpen(false)}
              size="wide"
            >
              <div className="mb-2 flex rounded-lg border border-stone-200/90 bg-stone-100/90 p-0.5">
                <button
                  type="button"
                  onClick={() => setWeekKind('current')}
                  className={`min-h-[36px] flex-1 rounded-md px-2 text-[12px] font-bold transition ${
                    weekKind === 'current'
                      ? 'bg-[var(--surface-elevated)] text-stone-900 shadow-sm'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  Эта неделя
                </button>
                <button
                  type="button"
                  onClick={() => setWeekKind('next')}
                  className={`min-h-[36px] flex-1 rounded-md px-2 text-[12px] font-bold transition ${
                    weekKind === 'next'
                      ? 'bg-[var(--surface-elevated)] text-stone-900 shadow-sm'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  Следующая
                </button>
              </div>

              {mutErr ? <p className="mb-2 text-[12px] text-red-600">{mutErr}</p> : null}
              {!weekPending &&
              !claimsPending &&
              enabled &&
              (weekFetching || claimsFetching) ? (
                <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-primary">
                  <LuLoader className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                  Обновление…
                </p>
              ) : null}
              {claimsError && !weekError ? (
                <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200/90 bg-amber-50/90 px-2.5 py-1.5 text-[12px] text-amber-950">
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
                <p className="mb-2 flex items-center gap-1.5 text-[12px] text-stone-500">
                  <LuLoader className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Сохранение…
                </p>
              ) : null}
              <NextWeekMembersPanel
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
                isAdmin={isAdmin}
              />
            </ModalFrame>,
            document.body,
          )
        : null}
    </div>
  );
}
