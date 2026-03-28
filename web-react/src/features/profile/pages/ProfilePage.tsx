import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiClock, FiLock, FiUser } from 'react-icons/fi';
import { LuUser } from 'react-icons/lu';

import { useAuthStore } from '../../auth/authStore';
import { formatRuPhoneInput } from '../../auth/utils/formatRuPhone';
import {
  changePassword,
  fetchMe,
  fetchPrayerRequestHistory,
  patchProfile,
  type MeResponse,
  type PrayerHistoryItem,
} from '../api';

function displayName(user: MeResponse): string {
  const fn = (user.first_name ?? '').trim();
  const ln = (user.last_name ?? '').trim();
  const combined = `${fn} ${ln}`.trim();
  if (combined) return combined;
  return (user.name ?? '').trim() || 'Профиль';
}

function roleLabel(role: string): string {
  const r = role.trim().toLowerCase();
  if (r === 'admin') return 'Администратор';
  return 'Участник';
}

function formatHistoryDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function axiosMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: { error?: string } } }).response?.data;
    if (data?.error && typeof data.error === 'string') return data.error;
  }
  return 'Произошла ошибка';
}

export function ProfilePage() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const applyServerProfile = useAuthStore((s) => s.applyServerProfile);

  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [draft, setDraft] = useState({
    first_name: '',
    last_name: '',
    phone_number: '',
    email: '',
    birth_date: '',
    prayer_request: '',
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [history, setHistory] = useState<PrayerHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    setProfileMsg(null);
    try {
      const me = await fetchMe();
      setUser(me);
      applyServerProfile({
        firstName: me.first_name ?? '',
        lastName: me.last_name ?? '',
        role: me.app_role ?? 'member',
      });
      setDraft({
        first_name: me.first_name ?? '',
        last_name: me.last_name ?? '',
        phone_number: me.phone_number ?? '',
        email: me.email ?? '',
        birth_date: me.birth_date ? me.birth_date.slice(0, 10) : '',
        prayer_request: me.prayer_request ?? '',
      });
    } catch (e) {
      setError(e);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [applyServerProfile]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);
    void fetchPrayerRequestHistory(user.id, 50)
      .then((rows) => {
        if (!cancelled) setHistory(rows);
      })
      .catch(() => {
        if (!cancelled) setHistoryError('Не удалось загрузить историю');
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function handleSaveProfile() {
    setProfileMsg(null);
    if (!draft.first_name.trim() || !draft.last_name.trim()) {
      setProfileMsg({ kind: 'err', text: 'Укажите имя и фамилию' });
      return;
    }
    const phoneDigits = draft.phone_number.replace(/\D/g, '');
    if (phoneDigits.length < 7 || phoneDigits.length > 20) {
      setProfileMsg({ kind: 'err', text: 'Укажите корректный номер телефона (7–20 цифр)' });
      return;
    }
    setProfileSaving(true);
    try {
      const updated = await patchProfile({
        first_name: draft.first_name.trim(),
        last_name: draft.last_name.trim(),
        phone_number: draft.phone_number.trim(),
        email: draft.email.trim(),
        birth_date: draft.birth_date.trim() ? draft.birth_date.trim() : '',
        prayer_request: draft.prayer_request,
      });
      setUser(updated);
      applyServerProfile({
        firstName: updated.first_name ?? '',
        lastName: updated.last_name ?? '',
        role: updated.app_role ?? 'member',
      });
      setDraft({
        first_name: updated.first_name ?? '',
        last_name: updated.last_name ?? '',
        phone_number: updated.phone_number ?? '',
        email: updated.email ?? '',
        birth_date: updated.birth_date ? updated.birth_date.slice(0, 10) : '',
        prayer_request: updated.prayer_request ?? '',
      });
      setProfileMsg({ kind: 'ok', text: 'Данные сохранены' });
    } catch (e) {
      setProfileMsg({ kind: 'err', text: axiosMessage(e) });
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleChangePassword() {
    setPwdMsg(null);
    if (pwdNew.length < 8) {
      setPwdMsg({ kind: 'err', text: 'Новый пароль — не короче 8 символов' });
      return;
    }
    if (pwdNew !== pwdConfirm) {
      setPwdMsg({ kind: 'err', text: 'Новый пароль и подтверждение не совпадают' });
      return;
    }
    setPwdSaving(true);
    try {
      await changePassword(pwdCurrent, pwdNew);
      setPwdCurrent('');
      setPwdNew('');
      setPwdConfirm('');
      setPwdMsg({ kind: 'ok', text: 'Пароль обновлён' });
    } catch (e) {
      setPwdMsg({ kind: 'err', text: axiosMessage(e) });
    } finally {
      setPwdSaving(false);
    }
  }

  async function handleLogout() {
    const ok = window.confirm('Завершить текущую сессию?');
    if (!ok) return;
    await logout();
    navigate('/login', { replace: true });
  }

  const sectionClass =
    'rounded-[1.35rem] border border-stone-200/70 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow-card)] sm:rounded-3xl sm:p-6 sm:shadow-[var(--shadow)] lg:p-8 shell:p-8';
  const sectionTitleClass =
    'flex items-center gap-2 text-base font-extrabold text-stone-900 sm:text-lg md:text-xl';
  const labelClass = 'block text-sm font-semibold text-stone-700';
  const inputClass =
    'mt-1.5 min-h-[48px] w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-base text-stone-900 outline-none ring-primary/20 transition placeholder:text-stone-400 focus:border-primary focus:ring-2 sm:min-h-0 sm:text-[15px]';

  return (
    <div className="min-h-full bg-[var(--surface)] pb-6 shell:pb-8">
      <header className="bg-primary px-4 py-4 text-white shadow-[0_4px_24px_rgba(125,54,64,0.3)] sm:px-5 sm:py-5 md:rounded-none md:shadow-sm md:px-6 max-md:rounded-b-[1.75rem]">
        <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl md:text-3xl">Профиль</h1>
        <p className="mt-1 max-w-3xl text-sm text-white/85 md:text-base">
          Данные аккаунта, безопасность и история молитвенных записок
        </p>
      </header>

      <div className="px-3 py-6 sm:px-4 sm:py-8 md:px-6 lg:px-8 xl:px-10">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-stone-500">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="mt-4 text-sm font-semibold">Загрузка…</p>
          </div>
        ) : error ? (
          <div className="mx-auto max-w-md rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-8 text-center shadow-[var(--shadow)]">
            <p className="font-semibold text-stone-900">Не удалось загрузить профиль</p>
            <button
              type="button"
              onClick={() => void loadProfile()}
              className="mt-4 min-h-[44px] rounded-xl border-2 border-primary px-6 py-2.5 text-sm font-bold text-primary transition hover:bg-primary/5"
            >
              Повторить
            </button>
          </div>
        ) : user ? (
          <div className="mx-auto flex w-full max-w-lg flex-col gap-6 sm:gap-8 md:max-w-xl lg:max-w-2xl xl:max-w-3xl">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/[0.08] text-primary/80">
                <LuUser className="h-10 w-10" strokeWidth={1.75} aria-hidden />
              </div>
              <h2 className="mt-4 text-xl font-extrabold tracking-tight text-stone-900">
                {displayName(user)}
              </h2>
              <p className="mt-0.5 text-sm text-stone-500">Роль: {roleLabel(user.app_role)}</p>
            </div>

            {/* Данные */}
            <section className={sectionClass} aria-labelledby="profile-data-heading">
              <h2 id="profile-data-heading" className={sectionTitleClass}>
                <FiUser className="h-5 w-5 text-primary" aria-hidden />
                Данные
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                Имя, контакты и дата рождения хранятся в вашей учётной записи.
              </p>

              {user.app_role?.toLowerCase() === 'admin' ? (
                <Link
                  to="/admin"
                  className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:bg-primary-dark"
                >
                  Админ-панель
                </Link>
              ) : null}

              <div className="mt-6 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="pf-first" className={labelClass}>
                      Имя
                    </label>
                    <input
                      id="pf-first"
                      type="text"
                      autoComplete="given-name"
                      value={draft.first_name}
                      onChange={(e) => setDraft((d) => ({ ...d, first_name: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="pf-last" className={labelClass}>
                      Фамилия
                    </label>
                    <input
                      id="pf-last"
                      type="text"
                      autoComplete="family-name"
                      value={draft.last_name}
                      onChange={(e) => setDraft((d) => ({ ...d, last_name: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="pf-phone" className={labelClass}>
                    Телефон
                  </label>
                  <input
                    id="pf-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={draft.phone_number}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        phone_number: formatRuPhoneInput(e.target.value),
                      }))
                    }
                    className={inputClass}
                    placeholder="+7 (___) ___-__-__"
                  />
                </div>
                <div>
                  <label htmlFor="pf-email" className={labelClass}>
                    Эл. почта
                  </label>
                  <input
                    id="pf-email"
                    type="email"
                    autoComplete="email"
                    value={draft.email}
                    onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                    className={inputClass}
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <label htmlFor="pf-birth" className={labelClass}>
                    День рождения
                  </label>
                  <input
                    id="pf-birth"
                    type="date"
                    value={draft.birth_date}
                    onChange={(e) => setDraft((d) => ({ ...d, birth_date: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="pf-prayer" className={labelClass}>
                    Молитвенная нужда
                  </label>
                  <p className="mt-0.5 text-xs text-stone-500">
                    Текст показывается в календаре в день, когда назначена молитва за вас.
                  </p>
                  <textarea
                    id="pf-prayer"
                    value={draft.prayer_request}
                    onChange={(e) => setDraft((d) => ({ ...d, prayer_request: e.target.value }))}
                    rows={4}
                    className={`${inputClass} resize-y`}
                    placeholder="О чём просим молиться…"
                    maxLength={8000}
                  />
                </div>
              </div>

              {profileMsg ? (
                <p
                  className={`mt-4 text-sm font-medium ${profileMsg.kind === 'ok' ? 'text-teal-700' : 'text-red-600'}`}
                  role="status"
                >
                  {profileMsg.text}
                </p>
              ) : null}

              <button
                type="button"
                disabled={profileSaving}
                onClick={() => void handleSaveProfile()}
                className="mt-5 min-h-[48px] w-full rounded-xl bg-primary px-6 text-sm font-bold text-white shadow-md shadow-primary/25 transition hover:bg-primary-dark disabled:opacity-60 sm:w-auto"
              >
                {profileSaving ? 'Сохранение…' : 'Сохранить данные'}
              </button>
            </section>

            {/* Безопасность */}
            <section className={sectionClass} aria-labelledby="profile-security-heading">
              <h2 id="profile-security-heading" className={sectionTitleClass}>
                <FiLock className="h-5 w-5 text-primary" aria-hidden />
                Безопасность
              </h2>
              <p className="mt-1 text-sm text-stone-500">Смена пароля и выход из аккаунта на этом устройстве.</p>

              <div className="mt-6 space-y-4">
                <div>
                  <label htmlFor="pf-cur-pwd" className={labelClass}>
                    Текущий пароль
                  </label>
                  <input
                    id="pf-cur-pwd"
                    type="password"
                    autoComplete="current-password"
                    value={pwdCurrent}
                    onChange={(e) => setPwdCurrent(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="pf-new-pwd" className={labelClass}>
                    Новый пароль
                  </label>
                  <input
                    id="pf-new-pwd"
                    type="password"
                    autoComplete="new-password"
                    value={pwdNew}
                    onChange={(e) => setPwdNew(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="pf-confirm-pwd" className={labelClass}>
                    Повторите новый пароль
                  </label>
                  <input
                    id="pf-confirm-pwd"
                    type="password"
                    autoComplete="new-password"
                    value={pwdConfirm}
                    onChange={(e) => setPwdConfirm(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              {pwdMsg ? (
                <p
                  className={`mt-4 text-sm font-medium ${pwdMsg.kind === 'ok' ? 'text-teal-700' : 'text-red-600'}`}
                  role="status"
                >
                  {pwdMsg.text}
                </p>
              ) : null}

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <button
                  type="button"
                  disabled={pwdSaving}
                  onClick={() => void handleChangePassword()}
                  className="min-h-[48px] rounded-xl border-2 border-primary bg-white px-6 text-sm font-bold text-primary transition hover:bg-primary/5 disabled:opacity-60"
                >
                  {pwdSaving ? 'Сохранение…' : 'Сменить пароль'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="min-h-[48px] rounded-xl border-2 border-stone-300 bg-stone-50 px-6 text-sm font-bold text-stone-800 transition hover:bg-stone-100"
                >
                  Выйти из аккаунта
                </button>
              </div>
            </section>

            {/* История */}
            <section className={sectionClass} aria-labelledby="profile-history-heading">
              <h2 id="profile-history-heading" className={sectionTitleClass}>
                <FiClock className="h-5 w-5 text-primary" aria-hidden />
                История
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                Предыдущие тексты молитвенных записок (если вы меняли записку в календаре).
              </p>

              {historyLoading ? (
                <p className="mt-6 text-sm text-stone-500">Загрузка…</p>
              ) : historyError ? (
                <p className="mt-6 text-sm text-red-600">{historyError}</p>
              ) : history.length === 0 ? (
                <p className="mt-6 rounded-2xl border border-dashed border-stone-200 bg-stone-50/80 px-4 py-8 text-center text-sm text-stone-500">
                  Пока нет сохранённых записей в истории.
                </p>
              ) : (
                <ul className="mt-6 space-y-4">
                  {history.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-2xl border border-stone-100 bg-stone-50/80 p-4 text-left"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                        {formatHistoryDate(item.created_at)}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-stone-800">
                        {item.prayer_request}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
