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
} from 'react-icons/lu';

import { memberRosterName } from '../../../lib/memberRosterName';
import type { MeResponse } from '../../profile/api';
import type { NextWeekMemberDay } from '../../../types';
import type { CycleCollectionClaimRow, CycleCollectionClaimsSnapshot } from '../collectionTypes';
import {
  getCycleCollectionClaims,
  getWeekPlanMembers,
  patchCycleCollectionClaim,
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
  } = props;

  const claimByMemberId = useClaimByMemberId(claimsSnapshot);
  const [filterMode, setFilterMode] = useState<'all' | 'mine' | 'free' | 'busy'>('all');
  const [searchQuery, setSearchQuery] = useState('');

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

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const listRows = days.filter((row) => {
    const m = row.member;
    const searchBlob = m
      ? `${memberRosterName(m)} ${m.name} ${m.first_name ?? ''} ${m.last_name ?? ''}`.toLowerCase()
      : '';
    if (normalizedSearch && !searchBlob.includes(normalizedSearch)) return false;

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

                return (
                  <li
                    key={`claim-${row.date}`}
                    className="group flex flex-col transition-colors hover:bg-stone-50/70"
                  >
                    <div className="flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:py-2.5">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                      <span className="w-[4.5rem] shrink-0 text-[11px] font-semibold tabular-nums text-stone-500">
                        {label}
                      </span>
                      <span className="min-w-0 text-[14px] font-bold leading-tight tracking-tight text-stone-900">
                        {name ?? '—'}
                      </span>
                    </div>
                    {mid != null && claimRow && !claimsError ? (
                      <div className="flex flex-wrap items-center justify-end gap-2 sm:shrink-0">
                        {/* Статус */}
                        {claimRow.claimed_by ? (
                          <span
                            className={[
                              'inline-flex max-w-[7rem] truncate rounded-full px-2 py-0.5 text-[10px] font-bold',
                              mine
                                ? 'bg-primary/10 text-primary'
                                : 'bg-amber-500/12 text-amber-950',
                            ].join(' ')}
                          >
                            {claimedByLabel}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
                            Своб.
                          </span>
                        )}

                        {/* Современный выбор: toggle-кнопка */}
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
                                ? 'Уже занято другим ответственным'
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
                      </div>
                    ) : null}
                    </div>
                    {mine && mid != null && mem && !claimsError ? (
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
        className="flex max-h-[min(88dvh,720px)] w-full max-w-md flex-col rounded-t-2xl border border-stone-200/90 bg-[var(--surface)] shadow-2xl sm:max-h-[85vh] sm:rounded-2xl"
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

type Props = { canView: boolean; currentUserId: number | null };

/** Кнопка и модалка: очередь цикла и отметки сбора нужд; под «своими» участниками — предыдущие нужды. */
export function NextWeekPrayerPlanSection({ canView, currentUserId }: Props) {
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
              />
            </ModalFrame>,
            document.body,
          )
        : null}
    </div>
  );
}
