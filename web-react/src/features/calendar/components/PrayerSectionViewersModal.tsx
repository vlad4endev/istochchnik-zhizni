import { format, isToday, isValid, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LuClock3, LuEye, LuSearch, LuUsers, LuX } from 'react-icons/lu';

import { AppAvatar } from '../../../components/AppAvatar';
import { memberRosterName } from '../../../lib/memberRosterName';
import type { PrayerSectionViewer } from '../api';

function formatVisitTime(iso: string): string {
  if (!iso) return '';
  const d = parseISO(iso);
  if (!isValid(d)) return '';
  if (isToday(d)) {
    return `сегодня в ${format(d, 'HH:mm')}`;
  }
  return format(d, "d MMM 'в' HH:mm", { locale: ru });
}

function formatStatsDate(ymd: string): string {
  if (!ymd) return '';
  const d = parseISO(ymd);
  if (!isValid(d)) return ymd;
  return format(d, 'd MMMM yyyy', { locale: ru });
}

function viewerDisplayName(v: PrayerSectionViewer): string {
  return memberRosterName({
    id: v.member_id,
    name: v.name,
    first_name: v.first_name,
    last_name: v.last_name,
  });
}

export function PrayerSectionViewersModal(props: {
  open: boolean;
  onClose: () => void;
  dateYmd: string;
  viewers: PrayerSectionViewer[];
  isLoading?: boolean;
}) {
  const { open, onClose, dateYmd, viewers, isLoading = false } = props;
  const titleId = useId();
  const searchId = useId();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/ё/g, 'е');
    if (!q) return viewers;
    return viewers.filter((v) => {
      const name = viewerDisplayName(v).toLowerCase().replace(/ё/g, 'е');
      return name.includes(q);
    });
  }, [query, viewers]);

  if (!open || typeof document === 'undefined') return null;

  const dateLabel = formatStatsDate(dateYmd);
  const showSearch = viewers.length >= 8;

  const body: ReactNode = isLoading ? (
    <div className="space-y-2.5 py-1" aria-busy="true" aria-label="Загрузка списка">
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border border-[var(--border)]/60 bg-[var(--surface-elevated)]/60 px-3 py-2.5"
        >
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-stone-200/80 dark:bg-stone-700/60" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-stone-200/80 dark:bg-stone-700/60" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-stone-200/60 dark:bg-stone-700/40" />
          </div>
        </div>
      ))}
    </div>
  ) : viewers.length === 0 ? (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/[0.08] text-primary">
        <LuUsers className="h-7 w-7" strokeWidth={1.75} aria-hidden />
      </span>
      <p className="mt-4 text-base font-extrabold text-[var(--text)]">Пока никого</p>
      <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-[var(--text-muted)]">
        Сегодня раздел «Молитва» ещё никто не открывал. Список обновится, когда участники зайдут.
      </p>
    </div>
  ) : (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 items-center justify-between gap-3 rounded-xl border border-primary/15 bg-gradient-to-r from-primary/[0.07] via-[var(--surface-elevated)] to-[var(--surface-elevated)] px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary/80">Сегодня</p>
          <p className="mt-0.5 text-sm font-semibold text-[var(--text-secondary)]">
            {dateLabel || 'текущий день'}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tabular-nums text-2xl font-black leading-none text-[var(--text)]">{viewers.length}</p>
          <p className="mt-0.5 text-[11px] font-semibold text-[var(--text-muted)]">
            {viewers.length === 1 ? 'человек' : viewers.length < 5 ? 'человека' : 'человек'}
          </p>
        </div>
      </div>

      {showSearch ? (
        <label htmlFor={searchId} className="relative block shrink-0">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--text-muted)]">
            <LuSearch className="h-4 w-4" strokeWidth={2} aria-hidden />
          </span>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти по имени…"
            autoComplete="off"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] py-2.5 pl-10 pr-3 text-sm font-medium text-[var(--text)] outline-none ring-primary/30 placeholder:text-[var(--text-muted)] focus:border-primary/40 focus:ring-2"
          />
        </label>
      ) : null}

      {filtered.length === 0 ? (
        <p className="px-1 py-6 text-center text-sm font-medium text-[var(--text-muted)]">
          Никого не найдено по запросу «{query.trim()}»
        </p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pb-1 [-webkit-overflow-scrolling:touch]">
          {filtered.map((v, index) => {
            const displayName = viewerDisplayName(v);
            const timeLabel = formatVisitTime(v.first_seen_at);
            return (
              <li
                key={v.member_id}
                className="flex items-center gap-3 rounded-xl border border-[var(--border)]/70 bg-[var(--surface-elevated)]/80 px-3 py-2.5 transition-colors hover:border-primary/25 hover:bg-primary/[0.04]"
              >
                <AppAvatar
                  src={v.avatar_url}
                  alt=""
                  className="h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2 ring-primary/10"
                  initialsFallbackText={displayName}
                  initialsColorSeed={String(v.member_id)}
                  fallback={
                    <span className="flex h-full w-full items-center justify-center bg-primary/10 text-sm font-bold text-primary">
                      {displayName.slice(0, 1).toUpperCase() || '?'}
                    </span>
                  }
                  priority={index < 8}
                  width={40}
                  height={40}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[var(--text)]">{displayName}</p>
                  {timeLabel ? (
                    <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-[var(--text-muted)]">
                      <LuClock3 className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                      <span className="truncate">Открыл(а) {timeLabel}</span>
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs font-medium text-[var(--text-muted)]">Открыл(а) раздел</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return createPortal(
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
        className="flex max-h-[min(92dvh,720px)] w-full max-w-md flex-col rounded-t-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border)]/80 px-3 py-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <LuEye className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-[15px] font-extrabold text-[var(--text)]">
                Кто открыл раздел
              </h2>
              <p className="mt-0.5 truncate text-[12px] font-medium text-[var(--text-muted)]">
                Молитва · уникальные визиты за день
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="tap-highlight-transparent flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text)]"
            aria-label="Закрыть"
          >
            <LuX className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-3 py-3 sm:px-4">{body}</div>
      </div>
    </div>,
    document.body,
  );
}
