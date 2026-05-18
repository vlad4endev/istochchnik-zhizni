import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parse } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useId, useMemo, useState, type ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  LuCalendarClock,
  LuCheck,
  LuChevronDown,
  LuClipboardList,
  LuLoader,
  LuSearch,
  LuSend,
  LuX,
  LuCircleAlert,
  LuCircleCheck,
} from 'react-icons/lu';
import { SiOpenai } from 'react-icons/si';

import { memberRosterName } from '../../../lib/memberRosterName';
import type { NextWeekMemberDay } from '../../../types';
import type { CycleCollectionClaimRow, CycleCollectionClaimsSnapshot } from '../collectionTypes';
import {
  getCycleCollectionClaims,
  getWeekPlanMembers,
  improvePrayerNeedTextWithAi,
  patchCycleCollectionClaim,
  patchMemberCyclePrayer,
  runCuratorAutoDistribution,
  type WeekPlanKind,
} from '../api';
import { CoordinatorPreviousNeedsPanel } from './CoordinatorPreviousNeedsPanel';
import { loadErrorDescription } from '../prayerPageUtils';

export { userCanManageCoordinatorDashboardNotes, userCanViewNextWeekPrayerPlan } from '../prayerAccess';

type QuickListFilter =
  | 'all'
  | 'need_empty'
  | 'need_filled'
  | 'curator_free'
  | 'curator_mine'
  | 'curator_busy';

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
  onAssignCurator: (memberId: number, coordinatorId: number | null) => void;
  mutPending: boolean;
  assignCuratorPending: boolean;
  canAssignCurators: boolean;
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
    onAssignCurator,
    mutPending,
    assignCuratorPending,
    canAssignCurators,
    onPrayerSaved,
    isAdmin = false,
  } = props;

  const claimByMemberId = useClaimByMemberId(claimsSnapshot);
  const [quickFilter, setQuickFilter] = useState<QuickListFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [prayerDraft, setPrayerDraft] = useState('');

  useEffect(() => {
    setQuickFilter('all');
    setSearchQuery('');
    setExpandedDate(null);
  }, [weekKind]);

  useEffect(() => {
    if (
      claimsError &&
      (quickFilter === 'curator_free' || quickFilter === 'curator_mine' || quickFilter === 'curator_busy')
    ) {
      setQuickFilter('all');
    }
  }, [claimsError, quickFilter]);

  const savePrayerMut = useMutation({
    mutationFn: async (input: { memberId: number; date: string; text: string }) => {
      await patchMemberCyclePrayer(input.memberId, input.date, input.text);
    },
    onSuccess: () => {
      onPrayerSaved();
      setExpandedDate(null);
    },
  });

  const improvePrayerMut = useMutation({
    mutationFn: async (input: { text: string; memberLabel: string }) =>
      improvePrayerNeedTextWithAi(input.text, input.memberLabel),
    onSuccess: (text) => {
      setPrayerDraft(text);
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

    if (quickFilter === 'need_empty') {
      if (!m || needText(m).length > 0) return false;
    }
    if (quickFilter === 'need_filled') {
      if (!m || needText(m).length === 0) return false;
    }

    if (claimsError) {
      return quickFilter === 'all' || quickFilter === 'need_empty' || quickFilter === 'need_filled';
    }
    const mid = row.member?.id;
    const claimRow = mid != null ? claimByMemberId.get(mid) : undefined;
    const mine = currentUserId != null && claimRow?.claimed_by?.id === currentUserId;

    if (quickFilter === 'curator_mine') return mine;
    if (quickFilter === 'curator_free') return Boolean(claimRow && !claimRow.claimed_by);
    if (quickFilter === 'curator_busy') return Boolean(claimRow?.claimed_by && !mine);
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
          <div className="mb-3 rounded-xl border border-stone-200/80 bg-stone-50/80 px-3 py-2.5">
            <p className="text-[12px] font-semibold text-stone-700">
              <span className="tabular-nums text-stone-900">{days.length}</span> дней · с нуждой{' '}
              <span className="tabular-nums font-bold text-emerald-800">{filledNeedCount}</span> · без текста{' '}
              <span className="tabular-nums font-bold text-amber-900">{emptyNeedCount}</span>
              {!claimsError ? (
                <>
                  {' '}
                  · без куратора <span className="tabular-nums font-bold text-stone-800">{freeCount}</span>
                </>
              ) : null}
            </p>
            <label className="relative mt-2 block">
              <span className="sr-only">Поиск по имени</span>
              <LuSearch className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Имя участника…"
                className="min-h-[42px] w-full rounded-lg border border-stone-200 bg-white pl-9 pr-2.5 text-[14px] text-stone-800 outline-none ring-primary/15 focus:border-primary focus:ring-1"
              />
            </label>
            <div className="mt-2">
              <label htmlFor={`${sectionId}-quick-filter`} className="sr-only">
                Быстрый фильтр списка
              </label>
              <select
                id={`${sectionId}-quick-filter`}
                value={quickFilter}
                onChange={(e) => setQuickFilter(e.target.value as QuickListFilter)}
                className="min-h-[42px] w-full rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-[13px] font-semibold text-stone-800 outline-none ring-primary/15 focus:border-primary focus:ring-1"
              >
                <option value="all">Все дни ({days.length})</option>
                <option value="need_empty">Только без текста нужды ({emptyNeedCount})</option>
                <option value="need_filled">Только с текстом нужды ({filledNeedCount})</option>
                {!claimsError ? (
                  <>
                    <option value="curator_free">Без ответственного куратора ({freeCount})</option>
                    <option value="curator_mine">Мои дни ({myClaimsCount})</option>
                    <option value="curator_busy">Заняты другими кураторами ({busyCount})</option>
                  </>
                ) : null}
              </select>
            </div>
          </div>

          {listRows.length === 0 ? (
            <p className="mb-2 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-2 text-[12px] text-stone-500">
              Ничего не найдено — смените фильтр или поиск.
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
                const disabled = (mutPending || assignCuratorPending) || !canToggle;
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
                    className="flex flex-col transition-colors hover:bg-stone-50/70"
                  >
                    <div className="grid grid-cols-1 gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="shrink-0 text-[11px] font-bold tabular-nums text-stone-500">{label}</span>
                          <span className="min-w-0 text-[15px] font-extrabold leading-tight text-stone-900">
                            {name ?? '—'}
                          </span>
                          {mem && mid != null ? (
                            <span
                              className={[
                                'inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                                hasNeed ? 'bg-emerald-500/12 text-emerald-900' : 'bg-amber-500/12 text-amber-950',
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
                          <p className="mt-0.5 line-clamp-1 text-[12px] leading-snug text-stone-500">{needText(mem)}</p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        {mid != null && claimRow && !claimsError ? (
                          <>
                            {claimRow.claimed_by ? (
                              <span
                                className={[
                                  'inline-flex max-w-[11rem] truncate rounded-md px-2 py-1 text-[11px] font-semibold',
                                  mine ? 'bg-primary/10 text-primary' : 'bg-stone-100 text-stone-800',
                                ].join(' ')}
                                title={claimedByLabel ?? ''}
                              >
                                {claimedByLabel}
                              </span>
                            ) : (
                              <span className="inline-flex rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-900">
                                Свободно
                              </span>
                            )}
                            {canAssignCurators ? (
                              <label className="min-w-[10.5rem]">
                                <span className="sr-only">Назначенный куратор</span>
                                <select
                                  value={claimRow.claimed_by?.id ?? ''}
                                  disabled={assignCuratorPending}
                                  onChange={(e) => {
                                    const raw = e.target.value.trim();
                                    if (!raw) {
                                      onAssignCurator(mid, null);
                                      return;
                                    }
                                    const selectedId = Number(raw);
                                    if (Number.isInteger(selectedId) && selectedId > 0) {
                                      onAssignCurator(mid, selectedId);
                                    }
                                  }}
                                  className="min-h-[36px] w-full rounded-md border border-stone-200 bg-white px-2 py-1 text-[12px] font-semibold text-stone-800"
                                  title="Назначить ответственного куратора"
                                >
                                  <option value="">Без куратора</option>
                                  {(claimsSnapshot?.coordinators ?? []).map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {memberRosterName({
                                        id: c.id,
                                        name: c.name,
                                        first_name: c.first_name,
                                        last_name: c.last_name,
                                      })}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ) : (
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
                                  'relative inline-flex h-9 w-[52px] shrink-0 items-center rounded-full border transition',
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
                                      ? 'Снять: я не отвечаю'
                                      : 'Я отвечаю за сбор'
                                }
                              >
                                <span
                                  className={[
                                    'absolute left-0.5 flex h-7 w-7 items-center justify-center rounded-full shadow-sm transition-transform',
                                    mine
                                      ? 'translate-x-[22px] bg-primary text-white'
                                      : 'translate-x-0 bg-stone-200 text-stone-600',
                                  ].join(' ')}
                                >
                                  <LuCheck className={mine ? 'h-4 w-4' : 'h-4 w-4 opacity-0'} aria-hidden />
                                </span>
                                <span className="sr-only">{mine ? 'Выбрано' : 'Не выбрано'}</span>
                              </button>
                            )}
                          </>
                        ) : claimsError && mid != null ? (
                          <span className="text-[10px] font-medium text-amber-800">Отметки недоступны</span>
                        ) : null}
                      </div>
                    </div>

                    {mem && mid != null ? (
                      <div className="border-t border-stone-100 bg-white/70 px-3 py-2">
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
                          className="flex w-full items-center justify-between gap-2 rounded-lg py-1 text-left text-[13px] font-bold text-stone-800 hover:bg-stone-50/80"
                        >
                          <span className="text-stone-600">
                            {expandedDate === row.date ? 'Скрыть редактор' : hasNeed ? 'Текст нужды' : 'Добавить нужду'}
                          </span>
                          <LuChevronDown
                            className={[
                              'h-4 w-4 shrink-0 text-stone-400 transition-transform',
                              expandedDate === row.date ? 'rotate-180' : '',
                            ].join(' ')}
                            aria-hidden
                          />
                        </button>
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
                            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  disabled={
                                    improvePrayerMut.isPending ||
                                    savePrayerMut.isPending ||
                                    !prayerDraft.trim()
                                  }
                                  onClick={() =>
                                    void improvePrayerMut.mutateAsync({
                                      text: prayerDraft,
                                      memberLabel: name ?? '',
                                    })
                                  }
                                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-violet-300/80 bg-violet-50 px-3 text-[13px] font-bold text-violet-900 shadow-sm hover:bg-violet-100/90 disabled:cursor-not-allowed disabled:opacity-50"
                                  title="Улучшить формулировку по системному промпту раздела «Молитвенный календарь» (настройки ИИ в админке). Текст в поле заменится на вариант от модели."
                                >
                                  <SiOpenai className="h-4 w-4 shrink-0" aria-hidden />
                                  {improvePrayerMut.isPending ? 'ИИ…' : 'Улучшить с ИИ'}
                                </button>
                                <button
                                  type="button"
                                  disabled={savePrayerMut.isPending || improvePrayerMut.isPending}
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
                              </div>
                              {improvePrayerMut.isError ? (
                                <span className="text-[12px] text-red-600">
                                  {loadErrorDescription(improvePrayerMut.error) ?? 'Ошибка ИИ'}
                                </span>
                              ) : null}
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
                      <details className="group border-t border-stone-100 bg-stone-50/60">
                        <summary className="cursor-pointer list-none px-3 py-2 text-[12px] font-bold text-stone-600 marker:content-none [&::-webkit-details-marker]:hidden">
                          <span className="inline-flex w-full items-center justify-between gap-2">
                            Предыдущие нужды (справка)
                            <LuChevronDown
                              className="h-3.5 w-3.5 shrink-0 text-stone-400 transition-transform group-open:rotate-180"
                              aria-hidden
                            />
                          </span>
                        </summary>
                        <div className="border-t border-stone-100/80 px-3 pb-2 pt-1">
                          <CoordinatorPreviousNeedsPanel
                            memberId={mid}
                            memberLabel={name ?? ''}
                            items={mem.previous_manual_prayer_needs ?? []}
                            onChanged={onPrayerSaved}
                          />
                        </div>
                      </details>
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
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  /** Шире окно — удобнее список с полем нужды. */
  size?: 'default' | 'wide';
}) {
  const { titleId, title, subtitle, onClose, children, size = 'default' } = props;
  const widthClass = size === 'wide' ? 'max-w-2xl' : 'max-w-md';
  const maxHClass =
    size === 'wide' ? 'max-h-[min(92dvh,820px)] sm:max-h-[88dvh]' : 'max-h-[min(88dvh,720px)] sm:max-h-[85dvh]';

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
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex w-full flex-col rounded-2xl border border-stone-200/90 bg-[var(--surface)] shadow-2xl ${maxHClass} ${widthClass}`}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-stone-200/80 px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <LuCalendarClock className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-[15px] font-extrabold text-stone-900">
                {title}
              </h2>
              {subtitle ? (
                <p className="mt-0.5 line-clamp-2 text-[12px] font-medium leading-snug text-stone-500">{subtitle}</p>
              ) : null}
            </div>
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

type Props = {
  canView: boolean;
  currentUserId: number | null;
  currentUserRole?: string | null;
  isAdmin?: boolean;
  /** Контент сразу под кнопкой «Сбор нужд · очередь недели» (например, срочная молитвенная нужда). */
  afterWeekQueueButton?: ReactNode;
  /** Админ: открыть рассылку молитвы в Telegram (иконка рядом с кнопкой сбора нужд). */
  onTelegramPrayerDispatch?: () => void;
};

/** Кнопка и модалка: очередь цикла и отметки сбора нужд; под «своими» участниками — предыдущие нужды. */
export function NextWeekPrayerPlanSection({
  canView,
  currentUserId,
  currentUserRole = null,
  isAdmin = false,
  afterWeekQueueButton,
  onTelegramPrayerDispatch,
}: Props) {
  const canAssignCurators = useMemo(() => {
    const role = (currentUserRole ?? '').trim().toLowerCase();
    return role === 'pastor' || role === 'admin';
  }, [currentUserRole]);

  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const [mutErr, setMutErr] = useState<string | null>(null);
  const [weekKind, setWeekKind] = useState<WeekPlanKind>('current');
  const [distributionInfo, setDistributionInfo] = useState<string | null>(null);

  useEffect(() => {
    setDistributionInfo(null);
  }, [weekKind]);

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
    mutationFn: ({
      memberId,
      claim,
      assignedCoordinatorId,
    }: {
      memberId: number;
      claim: boolean;
      assignedCoordinatorId?: number;
    }) => patchCycleCollectionClaim(memberId, claim, weekKind, assignedCoordinatorId),
    onSuccess: (data) => {
      setMutErr(null);
      qc.setQueryData(['calendar', 'cycle', 'collection-claims', weekKind], data);
      void qc.invalidateQueries({ queryKey: ['calendar', 'week-members'] });
    },
    onError: (e: unknown) => {
      setMutErr(loadErrorDescription(e) ?? 'Не удалось сохранить');
    },
  });

  const autoDistributionMut = useMutation({
    mutationFn: async (kind: WeekPlanKind) => runCuratorAutoDistribution(kind),
    onSuccess: (data) => {
      setMutErr(null);
      const label = data.week_kind === 'current' ? 'текущую' : 'следующую';
      setDistributionInfo(
        `Автораспределение на ${label} неделю завершено: ${data.total} назначений, уведомлены ${data.pushed_coordinators} куратор(ов).`,
      );
      void qc.invalidateQueries({ queryKey: ['calendar', 'cycle', 'collection-claims'] });
      void qc.invalidateQueries({ queryKey: ['calendar', 'week-members'] });
      void qc.invalidateQueries({ queryKey: ['calendar', 'curator-distribution'] });
    },
    onError: (e: unknown) => {
      setDistributionInfo(null);
      setMutErr(loadErrorDescription(e) ?? 'Не удалось выполнить автораспределение');
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

  const weekQueueButton = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="touch-manipulation flex min-h-[48px] min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-primary/[0.05] active:bg-primary/[0.08]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-sm shadow-primary/15">
        <LuClipboardList className="h-4 w-4" strokeWidth={2} aria-hidden />
      </span>
      <span className="min-w-0 flex-1 text-[15px] font-extrabold leading-tight text-stone-900">
        Сбор нужд · очередь недели
      </span>
    </button>
  );

  return (
    <div className="mb-4 flex flex-col gap-3">
      {onTelegramPrayerDispatch ? (
        <div className="flex min-h-[48px] items-stretch overflow-hidden rounded-xl border border-primary/30 bg-[var(--surface-elevated)] shadow-sm ring-1 ring-black/[0.03] transition hover:border-primary/45 hover:shadow-md">
          {weekQueueButton}
          <div className="w-px shrink-0 self-stretch bg-gradient-to-b from-transparent via-primary/25 to-transparent" aria-hidden />
          <button
            type="button"
            onClick={onTelegramPrayerDispatch}
            className="tap-highlight-transparent flex w-[52px] shrink-0 items-center justify-center self-stretch transition hover:bg-primary/[0.06] active:bg-primary/[0.09] sm:w-14"
            aria-label="Рассылка молитвы в Telegram"
            title="Рассылка молитвы в Telegram"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white shadow-sm shadow-primary/15">
              <LuSend className="h-4 w-4" strokeWidth={2} aria-hidden />
            </span>
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-primary/30 bg-[var(--surface-elevated)] shadow-sm ring-1 ring-black/[0.03] transition hover:border-primary/45 hover:shadow-md">
          {weekQueueButton}
        </div>
      )}

      {afterWeekQueueButton}

      {open && typeof document !== 'undefined'
        ? createPortal(
            <ModalFrame
              titleId={titleId}
              title="Сбор нужд"
              subtitle="По дням недели: кто в очереди и кто отвечает за сбор. Ниже — поиск, фильтр и список."
              onClose={() => setOpen(false)}
              size="wide"
            >
              <div className="mb-3 flex rounded-xl border border-stone-200/90 bg-stone-100/90 p-1">
                <button
                  type="button"
                  onClick={() => setWeekKind('current')}
                  className={`min-h-[44px] flex-1 rounded-lg px-2 text-[13px] font-extrabold transition ${
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
                  className={`min-h-[44px] flex-1 rounded-lg px-2 text-[13px] font-extrabold transition ${
                    weekKind === 'next'
                      ? 'bg-[var(--surface-elevated)] text-stone-900 shadow-sm'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  Следующая
                </button>
              </div>
              <div className="mb-3 rounded-xl border border-stone-200/80 bg-stone-50/70 px-3 py-2.5">
                <p className="text-[12px] leading-snug text-stone-600">
                  Назначить кураторов по правилам нагрузки и отправить им уведомление.
                </p>
                <button
                  type="button"
                  onClick={() => autoDistributionMut.mutate(weekKind)}
                  disabled={autoDistributionMut.isPending}
                  className="mt-2 min-h-[44px] w-full rounded-lg bg-primary px-3 text-[13px] font-extrabold text-white shadow-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {autoDistributionMut.isPending
                    ? 'Выполняется…'
                    : `Автораспределить (${weekKind === 'current' ? 'эта' : 'следующая'} неделя)`}
                </button>
                {distributionInfo ? (
                  <p className="mt-2 text-[12px] font-semibold leading-snug text-emerald-800">{distributionInfo}</p>
                ) : null}
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
                onAssignCurator={(memberId, coordinatorId) =>
                  mut.mutate({
                    memberId,
                    claim: coordinatorId != null,
                    assignedCoordinatorId: coordinatorId ?? undefined,
                  })
                }
                mutPending={mut.isPending}
                assignCuratorPending={mut.isPending}
                canAssignCurators={canAssignCurators}
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
