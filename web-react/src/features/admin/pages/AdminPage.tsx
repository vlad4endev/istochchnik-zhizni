import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useState } from 'react';

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

export function AdminPage() {
  const [tab, setTab] = useState(0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 shell:px-6 shell:py-6">
      <header className="mb-6">
        <h1 className="text-xl font-extrabold tracking-tight text-stone-900">Админ панель</h1>
        <p className="mt-1 text-sm text-stone-600">
          Управление участниками, циклом молитв и шаблонами. Оформление сохраняется локально (как во Flutter).
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2 border-b border-stone-200/90 pb-3">
        {(
          [
            ['Пользователи', '👥'],
            ['Календарь', '📅'],
            ['Шаблоны', '📋'],
            ['Проект', '⚙️'],
          ] as const
        ).map(([label, emoji], i) => (
          <button
            key={label}
            type="button"
            onClick={() => setTab(i)}
            className={
              tab === i
                ? 'rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white shadow-md shadow-primary/20'
                : 'rounded-xl px-4 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-100'
            }
          >
            <span className="mr-1.5" aria-hidden>
              {emoji}
            </span>
            {label}
          </button>
        ))}
      </div>

      {tab === 0 && <MembersSection />}
      {tab === 1 && <CalendarSection />}
      {tab === 2 && <TemplatesSection />}
      {tab === 3 && <ProjectSection />}

      <p className="mt-10 text-center text-[10px] text-stone-400">
        web-react · сборка {__WEB_REACT_BUILD_STAMP__}
      </p>
    </div>
  );
}

function fieldClass(short?: boolean) {
  return (
    'rounded-xl border border-stone-200/90 bg-white px-3 py-2 text-sm text-stone-900 outline-none ' +
    'focus:border-primary focus:ring-2 focus:ring-primary/20 ' +
    (short ? 'w-full max-w-[140px]' : 'w-full')
  );
}

function MembersSection() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: Q_MEMBERS, queryFn: fetchAdminMembers });
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    phone_number: '',
    birth_date: '',
    ministry_role: '',
    ministry_direction: '',
  });
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

  const invalidate = () => void qc.invalidateQueries({ queryKey: Q_MEMBERS });

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

  if (isLoading) {
    return <p className="text-sm text-stone-500">Загрузка списка…</p>;
  }
  if (error) {
    return (
      <p className="text-sm text-red-600">
        {apiErrorMessage(error, 'Не удалось загрузить участников.')}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {banner && (
        <div
          className={
            banner.type === 'ok'
              ? 'rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900'
              : 'rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900'
          }
        >
          {banner.text}
        </div>
      )}

      <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow)] shell:p-5">
        <h2 className="mb-3 text-xs font-extrabold uppercase tracking-[0.12em] text-stone-900">
          Новый участник
        </h2>
        <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <input
            className={fieldClass()}
            placeholder="Имя"
            value={form.first_name}
            onChange={(e) => setForm((s) => ({ ...s, first_name: e.target.value }))}
            required
          />
          <input
            className={fieldClass()}
            placeholder="Фамилия"
            value={form.last_name}
            onChange={(e) => setForm((s) => ({ ...s, last_name: e.target.value }))}
            required
          />
          <input
            className={fieldClass()}
            placeholder="Телефон"
            value={form.phone_number}
            onChange={(e) => setForm((s) => ({ ...s, phone_number: e.target.value }))}
            required
          />
          <input
            className={fieldClass()}
            type="date"
            value={form.birth_date}
            onChange={(e) => setForm((s) => ({ ...s, birth_date: e.target.value }))}
            required
          />
          <input
            className={fieldClass()}
            placeholder="Служение (роль), необязательно"
            value={form.ministry_role}
            onChange={(e) => setForm((s) => ({ ...s, ministry_role: e.target.value }))}
          />
          <input
            className={fieldClass()}
            placeholder="Направление, необязательно"
            value={form.ministry_direction}
            onChange={(e) => setForm((s) => ({ ...s, ministry_direction: e.target.value }))}
          />
          <div className="sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              disabled={createMut.isPending}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/20 disabled:opacity-50"
            >
              {createMut.isPending ? 'Создание…' : 'Добавить'}
            </button>
          </div>
        </form>
      </section>

      <div className="overflow-x-auto rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] shadow-[var(--shadow)]">
        <table className="min-w-[720px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50/80 text-xs font-extrabold uppercase tracking-wider text-stone-600">
              <th className="px-3 py-3">Участник</th>
              <th className="px-3 py-3">Телефон</th>
              <th className="px-3 py-3">Роль</th>
              <th className="px-3 py-3">Статус</th>
              <th className="px-3 py-3 text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((u) => (
              <tr key={u.id} className="border-b border-stone-100/90">
                <td className="px-3 py-2.5 font-medium text-stone-900">{displayName(u)}</td>
                <td className="px-3 py-2.5 text-stone-600">{u.phone_number ?? '—'}</td>
                <td className="px-3 py-2.5 text-stone-700">
                  {u.app_role === 'admin' ? 'Админ' : 'Участник'}
                </td>
                <td className="px-3 py-2.5">
                  {u.is_active ? (
                    <span className="text-emerald-700">Активен</span>
                  ) : (
                    <span className="text-stone-500">Неактивен</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <button
                      type="button"
                      className="rounded-lg border border-stone-200 px-2 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                      onClick={() => openEdit(u)}
                    >
                      Изменить
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-stone-200 px-2 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                      onClick={() => {
                        setBanner(null);
                        roleMut.mutate({
                          id: u.id,
                          role: u.app_role === 'admin' ? 'member' : 'admin',
                        });
                      }}
                      disabled={roleMut.isPending}
                    >
                      {u.app_role === 'admin' ? '→ Участник' : '→ Админ'}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-stone-200 px-2 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                      onClick={() => {
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
                    <button
                      type="button"
                      className="rounded-lg border border-stone-200 px-2 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                      onClick={() => {
                        setOneTimeId(u.id);
                        setOneTimeDate('');
                        setBanner(null);
                      }}
                    >
                      Разовая дата
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                      onClick={() => {
                        if (!window.confirm(`Удалить ${displayName(u)}?`)) return;
                        setBanner(null);
                        deleteMut.mutate(u.id);
                      }}
                      disabled={deleteMut.isPending}
                    >
                      Удалить
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {oneTimeId != null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="font-bold text-stone-900">Разовая дата молитвы</h3>
            <p className="mt-1 text-sm text-stone-600">Участник #{oneTimeId}</p>
            <input
              type="date"
              className={`${fieldClass()} mt-4`}
              value={oneTimeDate}
              onChange={(e) => setOneTimeDate(e.target.value)}
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl bg-primary py-2 text-sm font-bold text-white disabled:opacity-50"
                disabled={!oneTimeDate || oneTimeMut.isPending}
                onClick={() => {
                  setBanner(null);
                  oneTimeMut.mutate();
                }}
              >
                Сохранить
              </button>
              <button
                type="button"
                className="rounded-xl border border-stone-200 px-4 py-2 text-sm font-semibold"
                onClick={() => setOneTimeId(null)}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="font-bold text-stone-900">Редактирование</h3>
            <div className="mt-4 grid gap-3">
              <input
                className={fieldClass()}
                placeholder="Имя"
                value={editForm.first_name}
                onChange={(e) => setEditForm((s) => ({ ...s, first_name: e.target.value }))}
              />
              <input
                className={fieldClass()}
                placeholder="Фамилия"
                value={editForm.last_name}
                onChange={(e) => setEditForm((s) => ({ ...s, last_name: e.target.value }))}
              />
              <input
                className={fieldClass()}
                placeholder="Телефон"
                value={editForm.phone_number}
                onChange={(e) => setEditForm((s) => ({ ...s, phone_number: e.target.value }))}
              />
              <input
                type="date"
                className={fieldClass()}
                value={editForm.birth_date}
                onChange={(e) => setEditForm((s) => ({ ...s, birth_date: e.target.value }))}
              />
              <input
                className={fieldClass()}
                placeholder="Роль служения"
                value={editForm.ministry_role}
                onChange={(e) => setEditForm((s) => ({ ...s, ministry_role: e.target.value }))}
              />
              <input
                className={fieldClass()}
                placeholder="Направление"
                value={editForm.ministry_direction}
                onChange={(e) => setEditForm((s) => ({ ...s, ministry_direction: e.target.value }))}
              />
              <label className="flex items-center gap-2 text-sm text-stone-700">
                <input
                  type="checkbox"
                  checked={editForm.is_active}
                  onChange={(e) => setEditForm((s) => ({ ...s, is_active: e.target.checked }))}
                />
                Активен
              </label>
              <textarea
                className={`${fieldClass()} min-h-[100px]`}
                placeholder="Молитвенная нужда"
                value={editForm.prayer_request}
                onChange={(e) => setEditForm((s) => ({ ...s, prayer_request: e.target.value }))}
              />
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl bg-primary py-2 text-sm font-bold text-white disabled:opacity-50"
                disabled={saveEditMut.isPending}
                onClick={() => {
                  setBanner(null);
                  saveEditMut.mutate();
                }}
              >
                Сохранить
              </button>
              <button
                type="button"
                className="rounded-xl border border-stone-200 px-4 py-2 text-sm font-semibold"
                onClick={() => setEditing(null)}
              >
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
    onSuccess: (data) => {
      const d = data.start_date ?? date;
      setMsg({ type: 'ok', text: `Цикл запущен с даты ${d}.` });
    },
    onError: (e) => setMsg({ type: 'err', text: apiErrorMessage(e, 'Не удалось запустить цикл.') }),
  });

  return (
    <div className="space-y-8">
      <section className="max-w-md rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
        <h2 className="text-xs font-extrabold uppercase tracking-[0.12em] text-stone-900">
          Старт цикла молитв
        </h2>
        <p className="mt-2 text-sm text-stone-600">
          Устанавливает дату отсчёта цикла в настройках (как во Flutter, вкладка «Календарь»).
        </p>
        <input
          type="date"
          className={`${fieldClass()} mt-4`}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <button
          type="button"
          className="mt-4 w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-white shadow-md shadow-primary/20 disabled:opacity-50"
          disabled={mut.isPending}
          onClick={() => {
            setMsg(null);
            mut.mutate();
          }}
        >
          {mut.isPending ? 'Отправка…' : 'Запустить цикл'}
        </button>
        {msg && (
          <p
            className={
              msg.type === 'ok'
                ? 'mt-3 text-sm text-emerald-700'
                : 'mt-3 text-sm text-red-600'
            }
          >
            {msg.text}
          </p>
        )}
      </section>
      <GlobalNeedsSection />
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

  return (
    <div>
      <h2 className="mb-3 text-xs font-extrabold uppercase tracking-[0.12em] text-stone-900">
        Глобальные молитвенные нужды
      </h2>
      <p className="mb-4 text-sm text-stone-600">
        Темы, служения и отступники на неделю — как в мобильной админке (раздел календаря).
      </p>
      {note && (
        <div
          className={
            note.type === 'ok'
              ? 'mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900'
              : 'mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900'
          }
        >
          {note.text}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow)]">
          <h3 className="text-sm font-bold text-stone-900">Глобальные темы</h3>
          <input
            className={`${fieldClass()} mt-2`}
            placeholder="Заголовок *"
            value={tTitle}
            onChange={(e) => setTTitle(e.target.value)}
          />
          <input
            className={`${fieldClass()} mt-2`}
            placeholder="Стих (необяз.)"
            value={tVerse}
            onChange={(e) => setTVerse(e.target.value)}
          />
          <textarea
            className={`${fieldClass()} mt-2 min-h-[72px]`}
            placeholder="Акценты молитвы (необяз.)"
            value={tPoints}
            onChange={(e) => setTPoints(e.target.value)}
          />
          <button
            type="button"
            className="mt-2 w-full rounded-xl bg-primary py-2 text-sm font-bold text-white disabled:opacity-50"
            disabled={!tTitle.trim() || addT.isPending}
            onClick={() => {
              setNote(null);
              addT.mutate();
            }}
          >
            Добавить тему
          </button>
          <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-sm">
            {(themes.data ?? []).map((x) => (
              <li
                key={x.id}
                className="flex items-start justify-between gap-2 rounded-lg border border-stone-100 bg-white px-2 py-1.5"
              >
                <span className="min-w-0 break-words">{x.title}</span>
                <button
                  type="button"
                  className="shrink-0 text-xs font-semibold text-red-600"
                  onClick={() => {
                    setNote(null);
                    delT.mutate(x.id);
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow)]">
          <h3 className="text-sm font-bold text-stone-900">Служения</h3>
          <input
            className={`${fieldClass()} mt-2`}
            placeholder="Название *"
            value={mTitle}
            onChange={(e) => setMTitle(e.target.value)}
          />
          <textarea
            className={`${fieldClass()} mt-2 min-h-[72px]`}
            placeholder="Акценты (необяз.)"
            value={mPoints}
            onChange={(e) => setMPoints(e.target.value)}
          />
          <button
            type="button"
            className="mt-2 w-full rounded-xl bg-primary py-2 text-sm font-bold text-white disabled:opacity-50"
            disabled={!mTitle.trim() || addM.isPending}
            onClick={() => {
              setNote(null);
              addM.mutate();
            }}
          >
            Добавить
          </button>
          <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-sm">
            {(ministries.data ?? []).map((x) => (
              <li
                key={x.id}
                className="flex items-start justify-between gap-2 rounded-lg border border-stone-100 bg-white px-2 py-1.5"
              >
                <span className="min-w-0 break-words">{x.title}</span>
                <button
                  type="button"
                  className="shrink-0 text-xs font-semibold text-red-600"
                  onClick={() => {
                    setNote(null);
                    delM.mutate(x.id);
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow)]">
          <h3 className="text-sm font-bold text-stone-900">Отступники</h3>
          <div className="mt-2 flex gap-2">
            <input
              className={fieldClass()}
              placeholder="Имя *"
              value={bName}
              onChange={(e) => setBName(e.target.value)}
            />
            <button
              type="button"
              className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              disabled={!bName.trim() || addB.isPending}
              onClick={() => {
                setNote(null);
                addB.mutate();
              }}
            >
              +
            </button>
          </div>
          <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto text-sm">
            {(backsliders.data ?? []).map((x) => (
              <li
                key={x.id}
                className="flex items-start justify-between gap-2 rounded-lg border border-stone-100 bg-white px-2 py-1.5"
              >
                <span className="min-w-0 break-words">{x.name}</span>
                <button
                  type="button"
                  className="shrink-0 text-xs font-semibold text-red-600"
                  onClick={() => {
                    setNote(null);
                    delB.mutate(x.id);
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
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
      setNote({ type: 'ok', text: 'Шаблон роли добавлен.' });
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
      setNote({ type: 'ok', text: 'Шаблон направления добавлен.' });
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

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {note && (
        <div
          className={
            note.type === 'ok'
              ? 'lg:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900'
              : 'lg:col-span-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900'
          }
        >
          {note.text}
        </div>
      )}
      <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow)]">
        <h2 className="text-xs font-extrabold uppercase tracking-[0.12em] text-stone-900">
          Роли служений
        </h2>
        <div className="mt-3 flex gap-2">
          <input
            className={fieldClass()}
            placeholder="Название"
            value={roleTitle}
            onChange={(e) => setRoleTitle(e.target.value)}
          />
          <button
            type="button"
            className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            disabled={!roleTitle.trim() || addRole.isPending}
            onClick={() => {
              setNote(null);
              addRole.mutate();
            }}
          >
            +
          </button>
        </div>
        <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto text-sm">
          {(roles.data ?? []).map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-stone-100 bg-white px-3 py-2"
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
      <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow)]">
        <h2 className="text-xs font-extrabold uppercase tracking-[0.12em] text-stone-900">
          Направления
        </h2>
        <div className="mt-3 flex gap-2">
          <input
            className={fieldClass()}
            placeholder="Название"
            value={dirTitle}
            onChange={(e) => setDirTitle(e.target.value)}
          />
          <button
            type="button"
            className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            disabled={!dirTitle.trim() || addDir.isPending}
            onClick={() => {
              setNote(null);
              addDir.mutate();
            }}
          >
            +
          </button>
        </div>
        <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto text-sm">
          {(dirs.data ?? []).map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-stone-100 bg-white px-3 py-2"
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
    <section className="max-w-lg space-y-5 rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
      <h2 className="text-xs font-extrabold uppercase tracking-[0.12em] text-stone-900">
        Оформление приложения
      </h2>
      <p className="text-sm text-stone-600">
        Те же настройки, что вкладка «Проект» в Flutter: синхронизация через ключ{' '}
        <code className="rounded bg-stone-100 px-1">project_branding_settings_v1</code>.
      </p>
      <div>
        <label className="text-xs font-semibold text-stone-600">Название</label>
        <input
          className={`${fieldClass()} mt-1`}
          value={localName}
          onChange={(e) => setLocalName(e.target.value)}
          onBlur={() => updateBranding({ appName: localName.trim() || appName })}
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-stone-600">Описание</label>
        <input
          className={`${fieldClass()} mt-1`}
          value={localDesc}
          onChange={(e) => setLocalDesc(e.target.value)}
          onBlur={() => updateBranding({ description: localDesc.trim() || description })}
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-stone-600">
          Масштаб логотипа: {logoScalePercent}%
        </label>
        <input
          type="range"
          min={80}
          max={160}
          value={logoScalePercent}
          className="mt-2 w-full"
          onChange={(e) =>
            updateBranding({ logoScalePercent: Number.parseInt(e.target.value, 10) || 110 })
          }
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-stone-700">
        <input
          type="checkbox"
          checked={removeLightBackground}
          onChange={(e) => updateBranding({ removeLightBackground: e.target.checked })}
        />
        Убирать светлый фон у логотипа при загрузке
      </label>
      <div>
        <label className="text-xs font-semibold text-stone-600">Логотип</label>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
            {customLogoDataUrl ? (
              <img
                src={customLogoDataUrl}
                alt=""
                className="max-h-full max-w-full object-contain"
                style={{ transform: `scale(${logoScalePercent / 100})` }}
              />
            ) : (
              <span className="text-stone-400">✝</span>
            )}
          </div>
          <input
            type="file"
            accept="image/*"
            className="max-w-[200px] text-xs"
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
            className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold"
            onClick={() => void applyCustomLogoDataUrl(null, true)}
          >
            Сбросить лого
          </button>
        </div>
      </div>
      <button
        type="button"
        className="w-full rounded-xl border border-stone-200 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
        onClick={() => {
          resetBrandingDefaults();
          setLocalName(useBrandingStore.getState().appName);
          setLocalDesc(useBrandingStore.getState().description);
        }}
      >
        Сбросить оформление по умолчанию
      </button>
    </section>
  );
}
