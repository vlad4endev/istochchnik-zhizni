import { useEffect, useMemo, useState } from 'react';
import { LuLoaderCircle, LuSearch, LuUsers, LuX } from 'react-icons/lu';

import { AppAvatar } from '../../../components/AppAvatar';
import {
  memberHasMinistryRole,
  musicRoleMemberMatchTokens,
  parseMinistryRoles,
} from '../ministryRoleMatch';
import type { MusicRole, MusicScheduleMember } from '../types';
import { memberAvatarColor } from '../types';

type Props = {
  open: boolean;
  onClose: () => void;
  members: MusicScheduleMember[];
  roles: MusicRole[];
  preselectedRoleId?: number | null;
  eventDate: string;
  eventTitle: string;
  busyMemberIdsOnDate?: number[];
  onAssign: (memberId: number, roleId: number) => Promise<void>;
  loading?: boolean;
};

export function MemberPickerModal({
  open,
  onClose,
  members,
  roles,
  preselectedRoleId,
  eventDate,
  eventTitle,
  busyMemberIdsOnDate = [],
  onAssign,
  loading = false,
}: Props) {
  const [search, setSearch] = useState('');
  const [roleId, setRoleId] = useState<number | ''>(preselectedRoleId ?? '');
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllMembers, setShowAllMembers] = useState(false);

  useEffect(() => {
    if (open) {
      setRoleId(preselectedRoleId ?? '');
      setShowAllMembers(false);
      setSearch('');
      setSelectedMemberId(null);
      setError(null);
    }
  }, [open, preselectedRoleId]);

  const selectedRole = typeof roleId === 'number' ? roles.find((r) => r.id === roleId) : null;
  const roleMatchTokens = selectedRole ? musicRoleMemberMatchTokens(selectedRole) : [];
  const roleMatchToken = roleMatchTokens[0] ?? '';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = members;
    if (roleMatchTokens.length > 0 && !showAllMembers) {
      list = list.filter((m) =>
        roleMatchTokens.some((token) => memberHasMinistryRole(m.ministry_role, token)),
      );
    }
    if (!q) return list;
    return list.filter((m) => {
      const name = m.name.toLowerCase();
      const dir = (m.ministry_direction ?? '').toLowerCase();
      const rolesText = parseMinistryRoles(m.ministry_role).join(' ').toLowerCase();
      return name.includes(q) || dir.includes(q) || rolesText.includes(q);
    });
  }, [members, search, roleMatchTokens, showAllMembers]);

  const grouped = useMemo(() => {
    const map = new Map<string, MusicScheduleMember[]>();
    for (const m of filtered) {
      const key = parseMinistryRoles(m.ministry_role).join(', ') || 'Без роли в карточке';
      const list = map.get(key) ?? [];
      list.push(m);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'ru'));
  }, [filtered]);

  if (!open) return null;

  const busySet = new Set(busyMemberIdsOnDate);
  const selectedMember = members.find((m) => m.id === selectedMemberId) ?? null;
  const selectedBusy = selectedMemberId != null && busySet.has(selectedMemberId);

  async function handleAssign() {
    const rid = typeof roleId === 'number' ? roleId : null;
    if (!selectedMemberId || rid == null) {
      setError('Выберите служителя и роль');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onAssign(selectedMemberId, rid);
      onClose();
      setSearch('');
      setSelectedMemberId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось назначить');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-4" role="presentation">
      <button
        type="button"
        aria-label="Закрыть"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-picker-title"
        className="relative z-[121] flex max-h-[min(92dvh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-stone-200/80 bg-white shadow-2xl sm:max-h-[min(90dvh,640px)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-stone-100 px-4 py-3">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-stone-200 sm:hidden" />
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 id="member-picker-title" className="truncate text-base font-extrabold text-stone-900">
                Назначить служителя
              </h2>
              <p className="truncate text-xs font-semibold text-stone-500">
                {eventTitle} · {eventDate}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="tap-highlight-transparent grid h-11 w-11 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-600"
            >
              <LuX className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Роль</span>
            <select
              value={roleId}
              onChange={(e) => {
                setRoleId(e.target.value ? Number(e.target.value) : '');
                setShowAllMembers(false);
                setSelectedMemberId(null);
              }}
              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-3 text-base sm:py-2 sm:text-sm"
            >
              <option value="">Выберите роль</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>

          {roleMatchToken ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-900 ring-1 ring-sky-200">
              <span>
                В карточке: <strong>{roleMatchToken}</strong>
              </span>
              <button
                type="button"
                onClick={() => setShowAllMembers((v) => !v)}
                className="inline-flex items-center gap-1 font-semibold text-primary"
              >
                <LuUsers className="h-3.5 w-3.5" />
                {showAllMembers ? 'Только подходящие' : 'Показать всех'}
              </button>
            </div>
          ) : null}

          <div className="relative">
            <LuSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по имени или роли"
              className="w-full rounded-xl border border-stone-200 bg-white py-3 pl-9 pr-3 text-base sm:py-2 sm:text-sm"
            />
          </div>

          {selectedBusy ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
              У этого служителя уже есть назначение на {eventDate}. Можно назначить, но проверьте загрузку.
            </p>
          ) : null}

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <div className="max-h-[min(40dvh,280px)] space-y-3 overflow-y-auto overscroll-contain sm:max-h-64">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-[var(--text-muted)]">
                <LuLoaderCircle className="h-6 w-6 animate-spin" />
              </div>
            ) : grouped.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--text-muted)]">
                {roleMatchToken && !showAllMembers
                  ? `Нет служителей с ролью «${roleMatchToken}» в карточке`
                  : 'Никого не найдено'}
              </p>
            ) : (
              grouped.map(([groupLabel, groupMembers]) => (
                <div key={groupLabel}>
                  {grouped.length > 1 ? (
                    <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                      {groupLabel}
                    </p>
                  ) : null}
                  <ul className="space-y-1">
                    {groupMembers.map((m) => {
                      const active = selectedMemberId === m.id;
                      const bg = memberAvatarColor(m.id);
                      const roleLabel = parseMinistryRoles(m.ministry_role).join(', ');
                      return (
                        <li key={m.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedMemberId(m.id)}
                            className={[
                              'tap-highlight-transparent flex w-full min-h-[48px] items-center gap-3 rounded-xl px-3 py-2.5 text-left transition active:scale-[0.99]',
                              active ? 'bg-primary/10 ring-1 ring-primary/30' : 'active:bg-stone-50',
                            ].join(' ')}
                          >
                            <AppAvatar
                              src={m.avatar_url}
                              fallback={
                                <span className="text-xs font-bold text-white">
                                  {m.name.slice(0, 1).toUpperCase()}
                                </span>
                              }
                              initialsFallbackText={m.name}
                              className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full"
                              style={{ backgroundColor: m.avatar_url ? undefined : bg }}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{m.name}</p>
                              {roleLabel ? (
                                <p className="truncate text-[11px] text-[var(--text-muted)]">{roleLabel}</p>
                              ) : m.ministry_direction ? (
                                <p className="truncate text-[11px] text-[var(--text-muted)]">
                                  {m.ministry_direction}
                                </p>
                              ) : null}
                            </div>
                            {busySet.has(m.id) ? (
                              <span className="shrink-0 text-[10px] font-semibold uppercase text-amber-700">
                                занят
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-stone-100 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            disabled={submitting || !selectedMember}
            onClick={() => void handleAssign()}
            className="tap-highlight-transparent w-full min-h-[48px] rounded-xl bg-primary text-sm font-extrabold text-white disabled:opacity-50"
          >
            {submitting ? 'Назначаем…' : 'Назначить'}
          </button>
        </div>
      </div>
    </div>
  );
}
