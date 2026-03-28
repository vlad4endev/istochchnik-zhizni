import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useMemo, useState } from 'react';

import { LuCross, LuImage, LuPenLine } from 'react-icons/lu';

import { ADMIN_TABS, type AdminTabId } from '../adminTabs';
import { useBrandingStore } from '../../branding/brandingStore';
import {
  apiErrorMessage,
  createAdminMember,
  createBacksliderApi,
  createDirectionTemplate,
  createGlobalThemeApi,
  createMinistryApi,
  createRoleTemplate,
  deleteAdminMember,
  deleteBacksliderApi,
  deleteDirectionTemplate,
  deleteGlobalThemeApi,
  deleteMinistryApi,
  deleteRoleTemplate,
  fetchAdminMembers,
  fetchDirectionTemplates,
  fetchGlobalBacksliders,
  fetchGlobalMinistries,
  fetchGlobalThemes,
  fetchRoleTemplates,
  setMemberAppRole,
  setOneTimeMemberDate,
  startPrayerCycle,
  updateAdminMember,
} from '../api';
import type { AppUser } from '../types';

const Q_MEMBERS = ['admin', 'members'] as const;
const Q_ROLES = ['admin', 'templates', 'roles'] as const;
const Q_DIRS = ['admin', 'templates', 'directions'] as const;
const Q_GT = ['admin', 'global', 'themes'] as const;
const Q_GM = ['admin', 'global', 'ministries'] as const;
const Q_GB = ['admin', 'global', 'backsliders'] as const;

function displayName(u: AppUser): string {
  const f = (u.first_name ?? '').trim();
  const l = (u.last_name ?? '').trim();
  if (f || l) return `${f} ${l}`.trim();
  return u.name.trim() || `#${u.id}`;
}

function fieldClass() {
  return (
    'w-full rounded-xl border border-stone-200/90 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none ' +
    'focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-stone-400'
  );
}

function btnPrimary(className = '') {
  return `rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:opacity-95 disabled:opacity-50 ${className}`;
}

function btnSecondary(className = '') {
  return `rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 ${className}`;
}

function btnDangerOutline(className = '') {
  return `rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 ${className}`;
}

export function AdminPage() {
  const [tab, setTab] = useState<AdminTabId>('members');
  const meta = ADMIN_TABS.find((t) => t.id === tab)!;
  const MetaIcon = meta.Icon;

  return (
    <div className="mx-auto max-w-6xl px-4 py-4 shell:flex shell:min-h-0 shell:gap-8 shell:px-6 shell:py-6">
      {/* Боковое меню — desktop */}
      <aside className="mb-4 hidden w-[220px] shrink-0 shell:block">
        <div className="sticky top-4 rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-2 shadow-[var(--shadow)]">
          <p className="px-3 pb-2 pt-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-stone-400">
            Разделы панели
          </p>
          <nav className="flex flex-col gap-1" aria-label="Админ-разделы">
            {ADMIN_TABS.map((t) => {
              const active = tab === t.id;
              const TabIcon = t.Icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={
                    active
                      ? 'group flex items-center gap-3 rounded-xl bg-primary px-3 py-2.5 text-left text-sm font-bold text-white shadow-md shadow-primary/20'
                      : 'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-stone-700 transition hover:bg-stone-100'
                  }
                >
                  <span
                    className={
                      active
                        ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/20'
                        : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-100'
                    }
                    aria-hidden
                  >
                    <TabIcon
                      className={`h-5 w-5 transition-colors ${active ? 'text-white' : 'text-stone-600 group-hover:text-primary'}`}
                    />
                  </span>
                  <span className="min-w-0 leading-tight">
                    <span className="block">{t.label}</span>
                    <span
                      className={
                        active ? 'mt-0.5 block text-[10px] font-medium text-white/80' : 'mt-0.5 block text-[10px] font-medium text-stone-500'
                      }
                    >
                      {t.short}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="mb-5 overflow-hidden rounded-3xl border border-stone-200/80 bg-gradient-to-br from-primary/[0.07] via-[var(--surface-elevated)] to-stone-50/90 p-5 shadow-[var(--shadow)]">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-primary/85">Настройки</p>
          <h1 className="mt-2 text-[22px] font-extrabold tracking-tight text-stone-900 shell:text-2xl">
            Админ-панель
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">{meta.description}</p>
        </header>

        {/* Табы — мобильные и узкий экран */}
        <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-stone-200/80 bg-[var(--surface)] px-4 py-2 shell:hidden">
          <div className="flex gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {ADMIN_TABS.map((t) => {
              const active = tab === t.id;
              const TabIcon = t.Icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={
                    active
                      ? 'group shrink-0 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white shadow-sm'
                      : 'group shrink-0 rounded-xl border border-stone-200 bg-[var(--surface-elevated)] px-3 py-2 text-xs font-semibold text-stone-700 transition hover:border-stone-300'
                  }
                >
                  <span className="inline-flex items-center gap-1">
                    <TabIcon
                      className={`h-4 w-4 shrink-0 transition-colors ${active ? 'text-white' : 'text-stone-500 group-hover:text-primary'}`}
                      aria-hidden
                    />
                    {t.short}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-3 flex items-center gap-3 shell:mb-4">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm"
            aria-hidden
          >
            <MetaIcon className="h-5 w-5" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold tracking-tight text-stone-900">{meta.label}</h2>
            <p className="text-xs font-medium text-stone-500">{meta.short}</p>
          </div>
        </div>

        {tab === 'members' && <MembersSection />}
        {tab === 'calendar' && <CalendarSection />}
        {tab === 'templates' && <TemplatesSection />}
        {tab === 'project' && <ProjectSection />}
      </div>
    </div>
  );
}

function MembersSection() {
  const qc = useQueryClient();
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: Q_MEMBERS,
    queryFn: fetchAdminMembers,
  });
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    phone_number: '',
    birth_date: '',
    ministry_role: '',
    ministry_direction: '',
  });
  const [showCreate, setShowCreate] = useState(true);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [editForm, setEditForm] = useState({
    first_name: '',
    last_name: '',
    phone_number: '',
    birth_date: '',
    ministry_role: '',
    ministry_direction: '',
    prayer_request: '',
    is_active: true,
  });
  const [oneTimeId, setOneTimeId] = useState<number | null>(null);
  const [oneTimeDate, setOneTimeDate] = useState('');
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [menuOpenFor, setMenuOpenFor] = useState<number | null>(null);

  const invalidate = () => void qc.invalidateQueries({ queryKey: Q_MEMBERS });

  const filtered = useMemo(() => {
    const list = data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((u) => {
      const blob = `${displayName(u)} ${u.phone_number ?? ''} ${u.email ?? ''}`.toLowerCase();
      return blob.includes(q);
    });
  }, [data, search]);

  const stats = useMemo(() => {
    const list = data ?? [];
    return {
      total: list.length,
      active: list.filter((u) => u.is_active).length,
      admins: list.filter((u) => u.app_role === 'admin').length,
    };
  }, [data]);

  const createMut = useMutation({
    mutationFn: () =>
      createAdminMember({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone_number: form.phone_number.trim(),
        birth_date: form.birth_date.trim(),
        ...(form.ministry_role.trim() ? { ministry_role: form.ministry_role.trim() } : {}),
        ...(form.ministry_direction.trim()
          ? { ministry_direction: form.ministry_direction.trim() }
          : {}),
      }),
    onSuccess: () => {
      setBanner({ type: 'ok', text: 'Участник создан.' });
      setForm({
        first_name: '',
        last_name: '',
        phone_number: '',
        birth_date: '',
        ministry_role: '',
        ministry_direction: '',
      });
      invalidate();
    },
    onError: (e) => setBanner({ type: 'err', text: apiErrorMessage(e, 'Не удалось создать.') }),
  });

  const saveEditMut = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error('no edit');
      return updateAdminMember(editing.id, {
        first_name: editForm.first_name.trim(),
        last_name: editForm.last_name.trim(),
        phone_number: editForm.phone_number.trim(),
        birth_date: editForm.birth_date.trim(),
        ministry_role: editForm.ministry_role.trim(),
        ministry_direction: editForm.ministry_direction.trim(),
        prayer_request: editForm.prayer_request.trim(),
        is_active: editForm.is_active,
      });
    },
    onSuccess: () => {
      setEditing(null);
      setBanner({ type: 'ok', text: 'Сохранено.' });
      invalidate();
    },
    onError: (e) => setBanner({ type: 'err', text: apiErrorMessage(e, 'Ошибка сохранения.') }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteAdminMember(id),
    onSuccess: () => {
      setBanner({ type: 'ok', text: 'Удалено.' });
      invalidate();
    },
    onError: (e) => setBanner({ type: 'err', text: apiErrorMessage(e, 'Не удалось удалить.') }),
  });

  const roleMut = useMutation({
    mutationFn: ({ id, role }: { id: number; role: 'member' | 'admin' }) => setMemberAppRole(id, role),
    onSuccess: () => {
      setBanner({ type: 'ok', text: 'Роль обновлена.' });
      invalidate();
    },
    onError: (e) => setBanner({ type: 'err', text: apiErrorMessage(e, 'Нельзя изменить роль.') }),
  });

  const oneTimeMut = useMutation({
    mutationFn: () => {
      if (oneTimeId == null || !oneTimeDate.trim()) throw new Error('no date');
      return setOneTimeMemberDate(oneTimeId, oneTimeDate.trim());
    },
    onSuccess: () => {
      setOneTimeId(null);
      setOneTimeDate('');
      setBanner({ type: 'ok', text: 'Разовая дата назначена.' });
      invalidate();
    },
    onError: (e) => setBanner({ type: 'err', text: apiErrorMessage(e, 'Ошибка.') }),
  });

  function openEdit(u: AppUser) {
    setMenuOpenFor(null);
    setEditing(u);
    setEditForm({
      first_name: (u.first_name ?? '').trim(),
      last_name: (u.last_name ?? '').trim(),
      phone_number: (u.phone_number ?? '').trim(),
      birth_date: (u.birth_date ?? '').trim(),
      ministry_role: (u.ministry_role ?? '').trim(),
      ministry_direction: (u.ministry_direction ?? '').trim(),
      prayer_request: (u.prayer_request ?? '').trim(),
      is_active: u.is_active,
    });
  }

  function onCreate(e: FormEvent) {
    e.preventDefault();
    setBanner(null);
    createMut.mutate();
  }

  function closeMenu() {
    setMenuOpenFor(null);
  }

  const oneTimeSubject =
    oneTimeId != null ? ((data ?? []).find((u) => u.id === oneTimeId) ?? null) : null;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-2xl bg-stone-200/60" />
        <div className="h-48 animate-pulse rounded-2xl bg-stone-200/60" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/80 p-6 text-center">
        <p className="font-semibold text-red-900">Не удалось загрузить список</p>
        <p className="mt-2 text-sm text-red-800">{apiErrorMessage(error, 'Ошибка сети или сервера.')}</p>
        <button type="button" className={`${btnPrimary('mt-4')}`} onClick={() => void invalidate()}>
          Обновить
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {menuOpenFor != null ? (
        <button
          type="button"
          className="fixed inset-0 z-[90] cursor-default bg-transparent"
          aria-label="Закрыть меню"
          onClick={closeMenu}
        />
      ) : null}

      {banner && (
        <div
          className={
            banner.type === 'ok'
              ? 'flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900'
              : 'flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900'
          }
        >
          <span>{banner.text}</span>
          <button
            type="button"
            className="shrink-0 rounded-lg px-2 py-0.5 text-stone-500 hover:bg-black/5"
            onClick={() => setBanner(null)}
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] px-4 py-3 shadow-[var(--shadow)]">
        <div className="flex flex-wrap gap-4 text-sm">
          <span>
            <span className="font-extrabold text-stone-900">{stats.total}</span>
            <span className="text-stone-500"> всего</span>
          </span>
          <span>
            <span className="font-extrabold text-emerald-700">{stats.active}</span>
            <span className="text-stone-500"> активных</span>
          </span>
          <span>
            <span className="font-extrabold text-primary">{stats.admins}</span>
            <span className="text-stone-500"> админов</span>
          </span>
        </div>
        {isFetching && !isLoading ? (
          <span className="text-xs text-stone-400">Обновление…</span>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          className={`${fieldClass()} sm:max-w-xs`}
          placeholder="Поиск по имени или телефону…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Поиск участников"
        />
        <button
          type="button"
          className={btnSecondary('self-start sm:self-auto')}
          onClick={() => setShowCreate((v) => !v)}
        >
          {showCreate ? 'Скрыть форму добавления' : 'Добавить участника'}
        </button>
      </div>

      {showCreate ? (
        <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow)] shell:p-5">
          <h3 className="text-sm font-extrabold text-stone-900">Новый участник</h3>
          <p className="mt-1 text-xs text-stone-500">
            Обязательны имя, фамилия, телефон и дата рождения. Служение можно указать позже в карточке.
          </p>
          <form onSubmit={onCreate} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-600">Имя</label>
              <input
                className={fieldClass()}
                value={form.first_name}
                onChange={(e) => setForm((s) => ({ ...s, first_name: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-600">Фамилия</label>
              <input
                className={fieldClass()}
                value={form.last_name}
                onChange={(e) => setForm((s) => ({ ...s, last_name: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-600">Телефон</label>
              <input
                className={fieldClass()}
                inputMode="tel"
                value={form.phone_number}
                onChange={(e) => setForm((s) => ({ ...s, phone_number: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-600">Дата рождения</label>
              <input
                className={fieldClass()}
                type="date"
                value={form.birth_date}
                onChange={(e) => setForm((s) => ({ ...s, birth_date: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-600">Роль служения</label>
              <input
                className={fieldClass()}
                placeholder="Необязательно"
                value={form.ministry_role}
                onChange={(e) => setForm((s) => ({ ...s, ministry_role: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-600">Направление</label>
              <input
                className={fieldClass()}
                placeholder="Необязательно"
                value={form.ministry_direction}
                onChange={(e) => setForm((s) => ({ ...s, ministry_direction: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <button type="submit" disabled={createMut.isPending} className={btnPrimary()}>
                {createMut.isPending ? 'Создание…' : 'Создать участника'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {/* Карточки — мобильные */}
      <div className="space-y-3 shell:hidden">
        {filtered.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-200 py-10 text-center text-sm text-stone-500">
            {search.trim() ? 'Никого не найдено.' : 'Список пуст.'}
          </p>
        ) : (
          filtered.map((u) => (
            <article
              key={u.id}
              className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-stone-900">{displayName(u)}</p>
                  <p className="mt-0.5 text-sm text-stone-600">{u.phone_number ?? '—'}</p>
                </div>
                <div className="relative shrink-0">
                  <button
                    type="button"
                    className={btnSecondary('px-3 py-1.5 text-xs')}
                    onClick={() => setMenuOpenFor(menuOpenFor === u.id ? null : u.id)}
                    aria-expanded={menuOpenFor === u.id}
                  >
                    Действия ▾
                  </button>
                  {menuOpenFor === u.id ? (
                    <ul className="absolute right-0 z-[100] mt-1 min-w-[13rem] overflow-hidden rounded-xl border border-stone-200 bg-white py-1 text-sm shadow-xl">
                      <li>
                        <button
                          type="button"
                          className="block w-full px-3 py-2.5 text-left hover:bg-stone-50"
                          onClick={() => openEdit(u)}
                        >
                          Изменить данные
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          className="block w-full px-3 py-2.5 text-left hover:bg-stone-50"
                          onClick={() => {
                            closeMenu();
                            setBanner(null);
                            roleMut.mutate({
                              id: u.id,
                              role: u.app_role === 'admin' ? 'member' : 'admin',
                            });
                          }}
                        >
                          {u.app_role === 'admin' ? 'Снять права админа' : 'Сделать администратором'}
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          className="block w-full px-3 py-2.5 text-left hover:bg-stone-50"
                          onClick={() => {
                            closeMenu();
                            setBanner(null);
                            void updateAdminMember(u.id, { is_active: !u.is_active }).then(
                              () => {
                                setBanner({ type: 'ok', text: 'Статус обновлён.' });
                                invalidate();
                              },
                              (e) =>
                                setBanner({ type: 'err', text: apiErrorMessage(e, 'Ошибка.') }),
                            );
                          }}
                        >
                          {u.is_active ? 'Деактивировать' : 'Активировать'}
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          className="block w-full px-3 py-2.5 text-left hover:bg-stone-50"
                          onClick={() => {
                            closeMenu();
                            setOneTimeId(u.id);
                            setOneTimeDate('');
                            setBanner(null);
                          }}
                        >
                          Разовая дата в цикле
                        </button>
                      </li>
                      <li className="border-t border-stone-100">
                        <button
                          type="button"
                          className="block w-full px-3 py-2.5 text-left font-semibold text-red-700 hover:bg-red-50"
                          onClick={() => {
                            closeMenu();
                            if (!window.confirm(`Удалить ${displayName(u)}?`)) return;
                            setBanner(null);
                            deleteMut.mutate(u.id);
                          }}
                        >
                          Удалить
                        </button>
                      </li>
                    </ul>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span
                  className={
                    u.app_role === 'admin'
                      ? 'rounded-full bg-primary/12 px-2.5 py-0.5 text-xs font-bold text-primary'
                      : 'rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-600'
                  }
                >
                  {u.app_role === 'admin' ? 'Админ' : 'Участник'}
                </span>
                <span
                  className={
                    u.is_active
                      ? 'rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800'
                      : 'rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-500'
                  }
                >
                  {u.is_active ? 'Активен' : 'Неактивен'}
                </span>
              </div>
            </article>
          ))
        )}
      </div>

      {/* Таблица — shell+ */}
      <div className="hidden overflow-hidden rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] shadow-[var(--shadow)] shell:block">
        <div className="overflow-x-auto">
          <table className="min-w-[640px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50/90 text-xs font-extrabold uppercase tracking-wider text-stone-500">
                <th className="px-4 py-3">Участник</th>
                <th className="px-4 py-3">Телефон</th>
                <th className="px-4 py-3">Роль в приложении</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3 text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-stone-500">
                    {search.trim() ? 'Никого не найдено.' : 'Список пуст.'}
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id} className="border-b border-stone-100/90 last:border-0">
                    <td className="px-4 py-3 font-semibold text-stone-900">{displayName(u)}</td>
                    <td className="px-4 py-3 text-stone-600">{u.phone_number ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          u.app_role === 'admin'
                            ? 'rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary'
                            : 'text-stone-600'
                        }
                      >
                        {u.app_role === 'admin' ? 'Администратор' : 'Участник'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.is_active ? (
                        <span className="text-emerald-700">Активен</span>
                      ) : (
                        <span className="text-stone-500">Неактивен</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="relative inline-block text-left">
                        <button
                          type="button"
                          className={btnSecondary('text-xs')}
                          onClick={() => setMenuOpenFor(menuOpenFor === u.id ? null : u.id)}
                        >
                          Меню ▾
                        </button>
                        {menuOpenFor === u.id ? (
                          <ul className="absolute right-0 z-[100] mt-1 min-w-[14rem] overflow-hidden rounded-xl border border-stone-200 bg-white py-1 text-sm shadow-xl">
                            <li>
                              <button
                                type="button"
                                className="block w-full px-3 py-2 text-left hover:bg-stone-50"
                                onClick={() => openEdit(u)}
                              >
                                Изменить данные
                              </button>
                            </li>
                            <li>
                              <button
                                type="button"
                                className="block w-full px-3 py-2 text-left hover:bg-stone-50"
                                onClick={() => {
                                  closeMenu();
                                  setBanner(null);
                                  roleMut.mutate({
                                    id: u.id,
                                    role: u.app_role === 'admin' ? 'member' : 'admin',
                                  });
                                }}
                              >
                                {u.app_role === 'admin'
                                  ? 'Снять права администратора'
                                  : 'Назначить администратором'}
                              </button>
                            </li>
                            <li>
                              <button
                                type="button"
                                className="block w-full px-3 py-2 text-left hover:bg-stone-50"
                                onClick={() => {
                                  closeMenu();
                                  setBanner(null);
                                  void updateAdminMember(u.id, { is_active: !u.is_active }).then(
                                    () => {
                                      setBanner({ type: 'ok', text: 'Статус обновлён.' });
                                      invalidate();
                                    },
                                    (e) =>
                                      setBanner({
                                        type: 'err',
                                        text: apiErrorMessage(e, 'Ошибка.'),
                                      }),
                                  );
                                }}
                              >
                                {u.is_active ? 'Деактивировать' : 'Активировать'}
                              </button>
                            </li>
                            <li>
                              <button
                                type="button"
                                className="block w-full px-3 py-2 text-left hover:bg-stone-50"
                                onClick={() => {
                                  closeMenu();
                                  setOneTimeId(u.id);
                                  setOneTimeDate('');
                                  setBanner(null);
                                }}
                              >
                                Разовая дата в цикле
                              </button>
                            </li>
                            <li className="border-t border-stone-100">
                              <button
                                type="button"
                                className="block w-full px-3 py-2 text-left font-semibold text-red-700 hover:bg-red-50"
                                onClick={() => {
                                  closeMenu();
                                  if (!window.confirm(`Удалить ${displayName(u)}?`)) return;
                                  setBanner(null);
                                  deleteMut.mutate(u.id);
                                }}
                              >
                                Удалить из базы
                              </button>
                            </li>
                          </ul>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {oneTimeId != null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="one-time-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 id="one-time-title" className="text-lg font-extrabold text-stone-900">
              Разовая дата в цикле
            </h3>
            <p className="mt-1 text-sm text-stone-600">
              Участник:{' '}
              <strong>{oneTimeSubject ? displayName(oneTimeSubject) : `#${oneTimeId}`}</strong>
            </p>
            <p className="mt-2 text-xs text-stone-500">
              Назначение на один день без сдвига общего расписания цикла.
            </p>
            <label className="mt-4 block text-xs font-semibold text-stone-600">Дата</label>
            <input
              type="date"
              className={`${fieldClass()} mt-1`}
              value={oneTimeDate}
              onChange={(e) => setOneTimeDate(e.target.value)}
            />
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                className={btnPrimary('flex-1')}
                disabled={!oneTimeDate || oneTimeMut.isPending}
                onClick={() => {
                  setBanner(null);
                  oneTimeMut.mutate();
                }}
              >
                {oneTimeMut.isPending ? 'Сохранение…' : 'Сохранить'}
              </button>
              <button type="button" className={btnSecondary()} onClick={() => setOneTimeId(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-extrabold text-stone-900">
              Карточка: {displayName(editing)}
            </h3>
            <div className="mt-4 grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-600">Имя</label>
                  <input
                    className={fieldClass()}
                    value={editForm.first_name}
                    onChange={(e) => setEditForm((s) => ({ ...s, first_name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-600">Фамилия</label>
                  <input
                    className={fieldClass()}
                    value={editForm.last_name}
                    onChange={(e) => setEditForm((s) => ({ ...s, last_name: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-600">Телефон</label>
                <input
                  className={fieldClass()}
                  value={editForm.phone_number}
                  onChange={(e) => setEditForm((s) => ({ ...s, phone_number: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-600">Дата рождения</label>
                <input
                  type="date"
                  className={fieldClass()}
                  value={editForm.birth_date}
                  onChange={(e) => setEditForm((s) => ({ ...s, birth_date: e.target.value }))}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-600">Роль служения</label>
                  <input
                    className={fieldClass()}
                    value={editForm.ministry_role}
                    onChange={(e) => setEditForm((s) => ({ ...s, ministry_role: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-600">Направление</label>
                  <input
                    className={fieldClass()}
                    value={editForm.ministry_direction}
                    onChange={(e) => setEditForm((s) => ({ ...s, ministry_direction: e.target.value }))}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-stone-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-stone-300 text-primary"
                  checked={editForm.is_active}
                  onChange={(e) => setEditForm((s) => ({ ...s, is_active: e.target.checked }))}
                />
                Активен (может войти в приложение)
              </label>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-600">
                  Молитвенная нужда
                </label>
                <textarea
                  className={`${fieldClass()} min-h-[100px] resize-y`}
                  value={editForm.prayer_request}
                  onChange={(e) => setEditForm((s) => ({ ...s, prayer_request: e.target.value }))}
                />
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                className={btnPrimary('flex-1')}
                disabled={saveEditMut.isPending}
                onClick={() => {
                  setBanner(null);
                  saveEditMut.mutate();
                }}
              >
                {saveEditMut.isPending ? 'Сохранение…' : 'Сохранить'}
              </button>
              <button type="button" className={btnSecondary()} onClick={() => setEditing(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarSection() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const mut = useMutation({
    mutationFn: () => startPrayerCycle(date.trim()),
    onSuccess: (d) => {
      const x = d.start_date ?? date;
      setMsg({ type: 'ok', text: `Цикл отсчитывается с ${x}.` });
    },
    onError: (e) => setMsg({ type: 'err', text: apiErrorMessage(e, 'Не удалось запустить цикл.') }),
  });

  return (
    <div className="space-y-8">
      <section className="max-w-xl rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
        <div className="flex items-start gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-extrabold text-primary"
            aria-hidden
          >
            1
          </span>
          <div>
            <h3 className="font-extrabold text-stone-900">Старт цикла молитв</h3>
            <p className="mt-1 text-sm text-stone-600">
              С какой даты считать «день 1» для ротации участников и глобальных блоков в разделе «Молитва».
            </p>
          </div>
        </div>
        <label className="mt-4 block text-xs font-semibold text-stone-600">Дата старта</label>
        <input
          type="date"
          className={`${fieldClass()} mt-1 max-w-xs`}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <button
          type="button"
          className={`${btnPrimary('mt-4')}`}
          disabled={mut.isPending}
          onClick={() => {
            setMsg(null);
            mut.mutate();
          }}
        >
          {mut.isPending ? 'Сохранение…' : 'Применить дату старта'}
        </button>
        {msg ? (
          <p
            className={
              msg.type === 'ok' ? 'mt-3 text-sm font-medium text-emerald-700' : 'mt-3 text-sm text-red-600'
            }
          >
            {msg.text}
          </p>
        ) : null}
      </section>

      <div>
        <div className="mb-4 flex items-start gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stone-200/80 text-sm font-extrabold text-stone-700"
            aria-hidden
          >
            2
          </span>
          <div>
            <h3 className="font-extrabold text-stone-900">Контент на экране молитвы</h3>
            <p className="mt-1 text-sm text-stone-600">
              Три колонки ниже — это блоки «Глобальные темы», «Служения» и «Отступники» в приложении.
            </p>
          </div>
        </div>
        <GlobalNeedsSection />
      </div>
    </div>
  );
}

function GlobalNeedsSection() {
  const qc = useQueryClient();
  const themes = useQuery({ queryKey: Q_GT, queryFn: fetchGlobalThemes });
  const ministries = useQuery({ queryKey: Q_GM, queryFn: fetchGlobalMinistries });
  const backsliders = useQuery({ queryKey: Q_GB, queryFn: fetchGlobalBacksliders });

  const [tTitle, setTTitle] = useState('');
  const [tVerse, setTVerse] = useState('');
  const [tPoints, setTPoints] = useState('');
  const [mTitle, setMTitle] = useState('');
  const [mPoints, setMPoints] = useState('');
  const [bName, setBName] = useState('');
  const [note, setNote] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const invT = () => void qc.invalidateQueries({ queryKey: Q_GT });
  const invM = () => void qc.invalidateQueries({ queryKey: Q_GM });
  const invB = () => void qc.invalidateQueries({ queryKey: Q_GB });

  const addT = useMutation({
    mutationFn: () =>
      createGlobalThemeApi({
        title: tTitle.trim(),
        ...(tVerse.trim() ? { bible_verse: tVerse.trim() } : {}),
        ...(tPoints.trim() ? { prayer_points: tPoints.trim() } : {}),
      }),
    onSuccess: () => {
      setTTitle('');
      setTVerse('');
      setTPoints('');
      setNote({ type: 'ok', text: 'Тема добавлена.' });
      invT();
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Ошибка.') }),
  });

  const delT = useMutation({
    mutationFn: (id: number) => deleteGlobalThemeApi(id),
    onSuccess: () => {
      setNote({ type: 'ok', text: 'Удалено.' });
      invT();
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Ошибка.') }),
  });

  const addM = useMutation({
    mutationFn: () =>
      createMinistryApi({
        title: mTitle.trim(),
        ...(mPoints.trim() ? { prayer_points: mPoints.trim() } : {}),
      }),
    onSuccess: () => {
      setMTitle('');
      setMPoints('');
      setNote({ type: 'ok', text: 'Служение добавлено.' });
      invM();
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Ошибка.') }),
  });

  const delM = useMutation({
    mutationFn: (id: number) => deleteMinistryApi(id),
    onSuccess: () => {
      setNote({ type: 'ok', text: 'Удалено.' });
      invM();
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Ошибка.') }),
  });

  const addB = useMutation({
    mutationFn: () => createBacksliderApi(bName.trim()),
    onSuccess: () => {
      setBName('');
      setNote({ type: 'ok', text: 'Добавлено.' });
      invB();
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Ошибка.') }),
  });

  const delB = useMutation({
    mutationFn: (id: number) => deleteBacksliderApi(id),
    onSuccess: () => {
      setNote({ type: 'ok', text: 'Удалено.' });
      invB();
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Ошибка.') }),
  });

  const loading = themes.isLoading || ministries.isLoading || backsliders.isLoading;

  return (
    <div>
      {note && (
        <div
          className={
            note.type === 'ok'
              ? 'mb-4 flex justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900'
              : 'mb-4 flex justify-between gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900'
          }
        >
          <span>{note.text}</span>
          <button type="button" className="text-stone-500 hover:text-stone-800" onClick={() => setNote(null)}>
            ✕
          </button>
        </div>
      )}
      {loading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 animate-pulse rounded-2xl bg-stone-200/50" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow)]">
            <h4 className="text-sm font-extrabold text-stone-900">Глобальные темы</h4>
            <p className="mt-1 text-xs text-stone-500">Заголовок, стих, акценты молитвы.</p>
            <input
              className={`${fieldClass()} mt-3`}
              placeholder="Заголовок *"
              value={tTitle}
              onChange={(e) => setTTitle(e.target.value)}
            />
            <input
              className={`${fieldClass()} mt-2`}
              placeholder="Стих (необязательно)"
              value={tVerse}
              onChange={(e) => setTVerse(e.target.value)}
            />
            <textarea
              className={`${fieldClass()} mt-2 min-h-[72px]`}
              placeholder="Акценты молитвы"
              value={tPoints}
              onChange={(e) => setTPoints(e.target.value)}
            />
            <button
              type="button"
              className={`${btnPrimary('mt-3 w-full')}`}
              disabled={!tTitle.trim() || addT.isPending}
              onClick={() => {
                setNote(null);
                addT.mutate();
              }}
            >
              Добавить тему
            </button>
            <ul className="mt-3 max-h-52 space-y-1.5 overflow-y-auto text-sm">
              {(themes.data ?? []).length === 0 ? (
                <li className="py-4 text-center text-xs text-stone-400">Пока нет тем</li>
              ) : (
                (themes.data ?? []).map((x) => (
                  <li
                    key={x.id}
                    className="flex items-start justify-between gap-2 rounded-xl border border-stone-100 bg-white px-3 py-2"
                  >
                    <span className="min-w-0 font-medium text-stone-800">{x.title}</span>
                    <button
                      type="button"
                      className="shrink-0 text-xs font-semibold text-red-600 hover:underline"
                      onClick={() => {
                        setNote(null);
                        delT.mutate(x.id);
                      }}
                    >
                      Удалить
                    </button>
                  </li>
                ))
              )}
            </ul>
          </section>
          <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow)]">
            <h4 className="text-sm font-extrabold text-stone-900">Служения</h4>
            <p className="mt-1 text-xs text-stone-500">Название и текст для блока служений.</p>
            <input
              className={`${fieldClass()} mt-3`}
              placeholder="Название *"
              value={mTitle}
              onChange={(e) => setMTitle(e.target.value)}
            />
            <textarea
              className={`${fieldClass()} mt-2 min-h-[72px]`}
              placeholder="Акценты молитвы"
              value={mPoints}
              onChange={(e) => setMPoints(e.target.value)}
            />
            <button
              type="button"
              className={`${btnPrimary('mt-3 w-full')}`}
              disabled={!mTitle.trim() || addM.isPending}
              onClick={() => {
                setNote(null);
                addM.mutate();
              }}
            >
              Добавить служение
            </button>
            <ul className="mt-3 max-h-52 space-y-1.5 overflow-y-auto text-sm">
              {(ministries.data ?? []).length === 0 ? (
                <li className="py-4 text-center text-xs text-stone-400">Пока нет записей</li>
              ) : (
                (ministries.data ?? []).map((x) => (
                  <li
                    key={x.id}
                    className="flex items-start justify-between gap-2 rounded-xl border border-stone-100 bg-white px-3 py-2"
                  >
                    <span className="min-w-0 font-medium text-stone-800">{x.title}</span>
                    <button
                      type="button"
                      className="shrink-0 text-xs font-semibold text-red-600 hover:underline"
                      onClick={() => {
                        setNote(null);
                        delM.mutate(x.id);
                      }}
                    >
                      Удалить
                    </button>
                  </li>
                ))
              )}
            </ul>
          </section>
          <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow)]">
            <h4 className="text-sm font-extrabold text-stone-900">Отступники</h4>
            <p className="mt-1 text-xs text-stone-500">Имена для блока «Отпавшие».</p>
            <div className="mt-3 flex gap-2">
              <input
                className={fieldClass()}
                placeholder="Имя *"
                value={bName}
                onChange={(e) => setBName(e.target.value)}
              />
              <button
                type="button"
                className={`${btnPrimary('shrink-0 px-5')}`}
                disabled={!bName.trim() || addB.isPending}
                onClick={() => {
                  setNote(null);
                  addB.mutate();
                }}
              >
                +
              </button>
            </div>
            <ul className="mt-3 max-h-60 space-y-1.5 overflow-y-auto text-sm">
              {(backsliders.data ?? []).length === 0 ? (
                <li className="py-4 text-center text-xs text-stone-400">Список пуст</li>
              ) : (
                (backsliders.data ?? []).map((x) => (
                  <li
                    key={x.id}
                    className="flex items-start justify-between gap-2 rounded-xl border border-stone-100 bg-white px-3 py-2"
                  >
                    <span className="min-w-0 font-medium text-stone-800">{x.name}</span>
                    <button
                      type="button"
                      className="shrink-0 text-xs font-semibold text-red-600 hover:underline"
                      onClick={() => {
                        setNote(null);
                        delB.mutate(x.id);
                      }}
                    >
                      Удалить
                    </button>
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

function TemplatesSection() {
  const qc = useQueryClient();
  const roles = useQuery({ queryKey: Q_ROLES, queryFn: fetchRoleTemplates });
  const dirs = useQuery({ queryKey: Q_DIRS, queryFn: fetchDirectionTemplates });
  const [roleTitle, setRoleTitle] = useState('');
  const [dirTitle, setDirTitle] = useState('');
  const [note, setNote] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const invRoles = () => void qc.invalidateQueries({ queryKey: Q_ROLES });
  const invDirs = () => void qc.invalidateQueries({ queryKey: Q_DIRS });

  const addRole = useMutation({
    mutationFn: () => createRoleTemplate(roleTitle.trim()),
    onSuccess: () => {
      setRoleTitle('');
      setNote({ type: 'ok', text: 'Шаблон добавлен.' });
      invRoles();
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Ошибка.') }),
  });

  const delRole = useMutation({
    mutationFn: (id: number) => deleteRoleTemplate(id),
    onSuccess: () => {
      setNote({ type: 'ok', text: 'Удалено.' });
      invRoles();
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Ошибка.') }),
  });

  const addDir = useMutation({
    mutationFn: () => createDirectionTemplate(dirTitle.trim()),
    onSuccess: () => {
      setDirTitle('');
      setNote({ type: 'ok', text: 'Шаблон добавлен.' });
      invDirs();
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Ошибка.') }),
  });

  const delDir = useMutation({
    mutationFn: (id: number) => deleteDirectionTemplate(id),
    onSuccess: () => {
      setNote({ type: 'ok', text: 'Удалено.' });
      invDirs();
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Ошибка.') }),
  });

  const loading = roles.isLoading || dirs.isLoading;

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600">
        Эти списки подставляются как подсказки при заполнении полей «роль служения» и «направление» у
        участника — удобно держать единый словарь.
      </p>
      {note && (
        <div
          className={
            note.type === 'ok'
              ? 'flex justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900'
              : 'flex justify-between gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900'
          }
        >
          <span>{note.text}</span>
          <button type="button" onClick={() => setNote(null)} className="text-stone-500">
            ✕
          </button>
        </div>
      )}
      {loading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-56 animate-pulse rounded-2xl bg-stone-200/50" />
          <div className="h-56 animate-pulse rounded-2xl bg-stone-200/50" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
            <h3 className="font-extrabold text-stone-900">Роли служений</h3>
            <div className="mt-3 flex gap-2">
              <input
                className={fieldClass()}
                placeholder="Новая роль"
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
              />
              <button
                type="button"
                className={`${btnPrimary('shrink-0')}`}
                disabled={!roleTitle.trim() || addRole.isPending}
                onClick={() => {
                  setNote(null);
                  addRole.mutate();
                }}
              >
                Добавить
              </button>
            </div>
            <ul className="mt-4 max-h-72 space-y-1.5 overflow-y-auto">
              {(roles.data ?? []).map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-stone-100 bg-white px-3 py-2.5 text-sm"
                >
                  <span>{t.title}</span>
                  <button
                    type="button"
                    className="text-xs font-semibold text-red-600 hover:underline"
                    onClick={() => {
                      setNote(null);
                      delRole.mutate(t.id);
                    }}
                  >
                    Удалить
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
            <h3 className="font-extrabold text-stone-900">Направления</h3>
            <div className="mt-3 flex gap-2">
              <input
                className={fieldClass()}
                placeholder="Новое направление"
                value={dirTitle}
                onChange={(e) => setDirTitle(e.target.value)}
              />
              <button
                type="button"
                className={`${btnPrimary('shrink-0')}`}
                disabled={!dirTitle.trim() || addDir.isPending}
                onClick={() => {
                  setNote(null);
                  addDir.mutate();
                }}
              >
                Добавить
              </button>
            </div>
            <ul className="mt-4 max-h-72 space-y-1.5 overflow-y-auto">
              {(dirs.data ?? []).map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-stone-100 bg-white px-3 py-2.5 text-sm"
                >
                  <span>{t.title}</span>
                  <button
                    type="button"
                    className="text-xs font-semibold text-red-600 hover:underline"
                    onClick={() => {
                      setNote(null);
                      delDir.mutate(t.id);
                    }}
                  >
                    Удалить
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

function ProjectSection() {
  const appName = useBrandingStore((s) => s.appName);
  const description = useBrandingStore((s) => s.description);
  const logoScalePercent = useBrandingStore((s) => s.logoScalePercent);
  const removeLightBackground = useBrandingStore((s) => s.removeLightBackground);
  const customLogoDataUrl = useBrandingStore((s) => s.customLogoDataUrl);
  const updateBranding = useBrandingStore((s) => s.updateBranding);
  const resetBrandingDefaults = useBrandingStore((s) => s.resetBrandingDefaults);
  const applyCustomLogoDataUrl = useBrandingStore((s) => s.applyCustomLogoDataUrl);

  const [localName, setLocalName] = useState(appName);
  const [localDesc, setLocalDesc] = useState(description);

  useEffect(() => {
    setLocalName(appName);
    setLocalDesc(description);
  }, [appName, description]);

  return (
    <div className="max-w-lg space-y-6">
      <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
        <h3 className="flex items-center gap-2 font-extrabold text-stone-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden>
            <LuPenLine className="h-5 w-5" strokeWidth={2} />
          </span>
          Тексты в шапке
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-stone-600">
          Хранятся только на этом устройстве в браузере, без отправки на сервер. Тот же набор полей, что в
          мобильном приложении — при необходимости можно перенести оформление между устройствами.
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-600">Название</label>
            <input
              className={fieldClass()}
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              onBlur={() => updateBranding({ appName: localName.trim() || appName })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-600">Подзаголовок</label>
            <input
              className={fieldClass()}
              value={localDesc}
              onChange={(e) => setLocalDesc(e.target.value)}
              onBlur={() => updateBranding({ description: localDesc.trim() || description })}
            />
          </div>
        </div>
      </section>
      <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
        <h3 className="flex items-center gap-2 font-extrabold text-stone-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden>
            <LuImage className="h-5 w-5" strokeWidth={2} />
          </span>
          Логотип
        </h3>
        <label className="mt-3 block text-xs font-semibold text-stone-600">
          Масштаб: {logoScalePercent}%
        </label>
        <input
          type="range"
          min={80}
          max={160}
          value={logoScalePercent}
          className="mt-2 w-full accent-primary"
          onChange={(e) =>
            updateBranding({ logoScalePercent: Number.parseInt(e.target.value, 10) || 110 })
          }
        />
        <label className="mt-4 flex items-start gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-stone-300"
            checked={removeLightBackground}
            onChange={(e) => updateBranding({ removeLightBackground: e.target.checked })}
          />
          <span>Убирать светлый фон при загрузке PNG/JPEG</span>
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-stone-200 bg-stone-50">
            {customLogoDataUrl ? (
              <img
                src={customLogoDataUrl}
                alt=""
                className="max-h-full max-w-full object-contain"
                style={{ transform: `scale(${logoScalePercent / 100})` }}
              />
            ) : (
              <LuCross className="h-7 w-7 text-stone-300" strokeWidth={1.75} aria-hidden />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              type="file"
              accept="image/*"
              className="max-w-[220px] text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () => {
                  const url = typeof reader.result === 'string' ? reader.result : '';
                  if (url) void applyCustomLogoDataUrl(url, false);
                };
                reader.readAsDataURL(f);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              className={btnSecondary('self-start text-xs')}
              onClick={() => void applyCustomLogoDataUrl(null, true)}
            >
              Убрать свой логотип
            </button>
          </div>
        </div>
      </section>
      <button
        type="button"
        className={`${btnDangerOutline('w-full')}`}
        onClick={() => {
          resetBrandingDefaults();
          setLocalName(useBrandingStore.getState().appName);
          setLocalDesc(useBrandingStore.getState().description);
        }}
      >
        Сбросить оформление к значениям по умолчанию
      </button>
    </div>
  );
}
