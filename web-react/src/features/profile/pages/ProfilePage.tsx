import { useCallback, useEffect, useMemo, useState } from 'react';
import { LuImagePlus, LuLogOut, LuPencil, LuSave, LuShield, LuUser, LuX } from 'react-icons/lu';
import { useAuthStore } from '../../auth/authStore';
import { formatRuPhoneInput } from '../../auth/utils/formatRuPhone';
import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import {
  changePassword,
  changePhone,
  fetchMe,
  fetchPrayerRequestHistory,
  patchProfile,
  uploadMyAvatar,
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

function axiosMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: { error?: string } } }).response?.data;
    if (data?.error && typeof data.error === 'string') return data.error;
  }
  return 'Произошла ошибка';
}

function roleLabel(role: string): string {
  const r = (role ?? '').trim().toLowerCase();
  if (r === 'admin') return 'Администратор';
  return 'Пользователь';
}

export function ProfilePage() {
  const logout = useAuthStore((s) => s.logout);
  const applyServerProfile = useAuthStore((s) => s.applyServerProfile);

  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [editing, setEditing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [draft, setDraft] = useState({
    first_name: '',
    last_name: '',
    phone_number: '',
    email: '',
    birth_date: '',
    prayer_request: '',
  });

  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [phoneNew, setPhoneNew] = useState('');
  const [phonePwd, setPhonePwd] = useState('');
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneMsg, setPhoneMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [history, setHistory] = useState<PrayerHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMsg(null);
    try {
      const me = await fetchMe();
      setUser(me);
      applyServerProfile({
        firstName: me.first_name ?? '',
        lastName: me.last_name ?? '',
        role: me.app_role ?? 'member',
      });
      const nextDraft = {
        first_name: me.first_name ?? '',
        last_name: me.last_name ?? '',
        phone_number: me.phone_number ?? '',
        email: me.email ?? '',
        birth_date: me.birth_date ? me.birth_date.slice(0, 10) : '',
        prayer_request: me.prayer_request ?? '',
      };
      setDraft(nextDraft);
      setPhoneNew(nextDraft.phone_number);
    } catch (e) {
      setError(axiosMessage(e));
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
    void fetchPrayerRequestHistory(user.id, 30)
      .then((items) => {
        if (cancelled) return;
        setHistory(items);
      })
      .catch((e) => {
        if (cancelled) return;
        setHistoryError(axiosMessage(e));
      })
      .finally(() => {
        if (cancelled) return;
        setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const onPickAvatar = async (file: File | null) => {
    if (!file) return;
    setAvatarUploading(true);
    setMsg(null);
    try {
      const next = await uploadMyAvatar(file);
      setUser(next);
      setMsg({ kind: 'ok', text: 'Аватар обновлён' });
    } catch (e) {
      setMsg({ kind: 'err', text: axiosMessage(e) });
    } finally {
      setAvatarUploading(false);
    }
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    setMsg(null);
    try {
      const next = await patchProfile({
        first_name: draft.first_name.trim(),
        last_name: draft.last_name.trim(),
        phone_number: draft.phone_number.trim(),
        email: draft.email.trim(),
        birth_date: draft.birth_date.trim() ? draft.birth_date.trim() : null,
        prayer_request: draft.prayer_request,
      });
      setUser(next);
      setDraft({
        first_name: next.first_name ?? '',
        last_name: next.last_name ?? '',
        phone_number: next.phone_number ?? '',
        email: next.email ?? '',
        birth_date: next.birth_date ? next.birth_date.slice(0, 10) : '',
        prayer_request: next.prayer_request ?? '',
      });
      setPhoneNew(next.phone_number ?? '');
      setEditing(false);
      setMsg({ kind: 'ok', text: 'Профиль сохранён' });
    } catch (e) {
      setMsg({ kind: 'err', text: axiosMessage(e) });
    } finally {
      setSavingProfile(false);
    }
  };

  const savePhone = async () => {
    setPhoneSaving(true);
    setPhoneMsg(null);
    try {
      const formatted = formatRuPhoneInput(phoneNew).trim();
      if (!formatted) throw new Error('Введите новый номер');
      if (!phonePwd.trim()) throw new Error('Введите текущий пароль');
      await changePhone(phonePwd, formatted);
      setPhonePwd('');
      setPhoneMsg({ kind: 'ok', text: 'Номер обновлён' });
      await loadProfile();
    } catch (e) {
      setPhoneMsg({ kind: 'err', text: e instanceof Error ? e.message : axiosMessage(e) });
    } finally {
      setPhoneSaving(false);
    }
  };

  const savePassword = async () => {
    setPwdSaving(true);
    setPwdMsg(null);
    try {
      if (pwdNew.length < 8) throw new Error('Пароль должен быть минимум 8 символов');
      if (pwdNew !== pwdConfirm) throw new Error('Пароли не совпадают');
      await changePassword(pwdCurrent, pwdNew);
      setPwdCurrent('');
      setPwdNew('');
      setPwdConfirm('');
      setPwdMsg({ kind: 'ok', text: 'Пароль обновлён' });
    } catch (e) {
      setPwdMsg({ kind: 'err', text: e instanceof Error ? e.message : axiosMessage(e) });
    } finally {
      setPwdSaving(false);
    }
  };

  const name = user ? displayName(user) : 'Профиль';
  const avatarUrl = resolvePublicUrl(user?.avatar_url ?? null);
  const joinedLabel = useMemo(() => {
    const createdAt = user?.created_at;
    if (!createdAt) return null;
    const d = new Date(createdAt);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('ru-RU', { year: 'numeric', month: 'long' });
  }, [user?.created_at]);

  const section = 'rounded-3xl bg-white/80 p-5 shadow-[0_10px_30px_rgba(28,25,23,0.08)] ring-1 ring-stone-200/70 backdrop-blur';
  const label = 'text-[11px] font-extrabold uppercase tracking-[0.14em] text-stone-500';
  const input = 'mt-1.5 min-h-[48px] w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-[15px] font-semibold text-stone-900 outline-none ring-primary/20 transition placeholder:text-stone-400 focus:border-primary focus:ring-2';

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pt-6 pb-24">
        <div className="h-24 animate-pulse rounded-3xl bg-stone-100" />
        <div className="h-64 animate-pulse rounded-3xl bg-stone-100" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 pt-6 pb-24">
        <div className="rounded-3xl bg-white/80 p-6 ring-1 ring-stone-200/70">
          <p className="text-sm font-semibold text-red-600">{error}</p>
          <button
            type="button"
            onClick={() => void loadProfile()}
            className="mt-4 min-h-[44px] rounded-2xl bg-primary px-5 py-2.5 text-sm font-extrabold text-white shadow-lg shadow-primary/25"
          >
            Повторить
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 pt-5 pb-24">
      <div className={`${section} overflow-hidden p-0`}>
        <div className="relative h-28 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.25),_rgba(99,102,241,0.22),_rgba(16,185,129,0.18),_transparent_70%)]">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,_rgba(255,255,255,0.15),_rgba(255,255,255,0.82))]" />
        </div>
        <div className="px-5 pb-5">
          <div className="-mt-8 flex items-start gap-4">
            <div className="relative">
              <div className="h-20 w-20 overflow-hidden rounded-3xl bg-white shadow-md ring-1 ring-stone-200">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Аватар" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-primary/60">
                    <LuUser size={32} />
                  </div>
                )}
              </div>
              <label className="absolute -bottom-2 -right-2 grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-white text-primary shadow-md ring-1 ring-stone-200">
                <LuImagePlus size={18} />
                <span className="sr-only">Загрузить аватар</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={avatarUploading}
                  onChange={(e) => void onPickAvatar(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <div className="min-w-0 flex-1 pt-2">
              <p className="truncate text-xl font-extrabold text-stone-900">{name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-stone-500">
                <span>Роль: {roleLabel(user?.app_role ?? 'member')}</span>
                {joinedLabel ? <span className="text-stone-400">•</span> : null}
                {joinedLabel ? <span>в приложении с {joinedLabel}</span> : null}
              </div>
              <p className="mt-1 text-[11px] font-semibold text-stone-400">Версия: {__WEB_REACT_BUILD_STAMP__}</p>
            </div>

            <button
              type="button"
              onClick={() => void logout()}
              className="mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-white/80 px-4 py-2 text-sm font-extrabold text-stone-700 ring-1 ring-stone-200/70"
            >
              <LuLogOut />
              Выйти
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {!editing ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-stone-900 px-4 py-2 text-sm font-extrabold text-white shadow-lg"
              >
                <LuPencil />
                Редактировать
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={savingProfile}
                  onClick={() => void saveProfile()}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-primary px-4 py-2 text-sm font-extrabold text-white shadow-lg shadow-primary/25 disabled:opacity-60"
                >
                  <LuSave />
                  {savingProfile ? 'Сохраняем…' : 'Сохранить'}
                </button>
                <button
                  type="button"
                  disabled={savingProfile}
                  onClick={() => {
                    setEditing(false);
                    setDraft({
                      first_name: user?.first_name ?? '',
                      last_name: user?.last_name ?? '',
                      phone_number: user?.phone_number ?? '',
                      email: user?.email ?? '',
                      birth_date: user?.birth_date ? user.birth_date.slice(0, 10) : '',
                      prayer_request: user?.prayer_request ?? '',
                    });
                    setMsg(null);
                  }}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-white/80 px-4 py-2 text-sm font-extrabold text-stone-700 ring-1 ring-stone-200/70 disabled:opacity-60"
                >
                  <LuX />
                  Отмена
                </button>
              </>
            )}
          </div>

          {msg ? (
            <p className={`mt-3 text-sm font-semibold ${msg.kind === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>
              {msg.text}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        <div className={section}>
          <p className={label}>Профиль</p>
          {!editing ? (
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl bg-white/70 p-4 ring-1 ring-stone-200/60">
                <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-stone-500">Имя</p>
                <p className="mt-1 text-base font-extrabold text-stone-900">
                  {`${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim() || user?.name || '—'}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-white/70 p-4 ring-1 ring-stone-200/60">
                  <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-stone-500">Телефон</p>
                  <p className="mt-1 text-sm font-extrabold text-stone-900">{user?.phone_number || '—'}</p>
                </div>
                <div className="rounded-2xl bg-white/70 p-4 ring-1 ring-stone-200/60">
                  <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-stone-500">Email</p>
                  <p className="mt-1 text-sm font-extrabold text-stone-900">{user?.email || '—'}</p>
                </div>
              </div>
              <div className="rounded-2xl bg-white/70 p-4 ring-1 ring-stone-200/60">
                <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-stone-500">Дата рождения</p>
                <p className="mt-1 text-sm font-extrabold text-stone-900">{user?.birth_date ? user.birth_date.slice(0, 10) : '—'}</p>
              </div>
              <div className="rounded-2xl bg-white/70 p-4 ring-1 ring-stone-200/60">
                <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-stone-500">Молитвенная нужда</p>
                <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-stone-900">
                  {user?.prayer_request?.trim() ? user.prayer_request : '—'}
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={label}>Имя</label>
                  <input className={input} value={draft.first_name} onChange={(e) => setDraft((d) => ({ ...d, first_name: e.target.value }))} />
                </div>
                <div>
                  <label className={label}>Фамилия</label>
                  <input className={input} value={draft.last_name} onChange={(e) => setDraft((d) => ({ ...d, last_name: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className={label}>Телефон</label>
                <input
                  className={input}
                  value={draft.phone_number}
                  onChange={(e) => setDraft((d) => ({ ...d, phone_number: formatRuPhoneInput(e.target.value) }))}
                />
              </div>
              <div>
                <label className={label}>Email</label>
                <input className={input} value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} />
              </div>
              <div>
                <label className={label}>Дата рождения</label>
                <input className={input} value={draft.birth_date} placeholder="YYYY-MM-DD" onChange={(e) => setDraft((d) => ({ ...d, birth_date: e.target.value }))} />
              </div>
              <div>
                <label className={label}>Молитвенная нужда</label>
                <textarea
                  className={`${input} min-h-[120px]`}
                  value={draft.prayer_request}
                  onChange={(e) => setDraft((d) => ({ ...d, prayer_request: e.target.value }))}
                />
              </div>
            </div>
          )}
        </div>

        <div className={section}>
          <div className="flex items-center justify-between gap-3">
            <p className={label}>Безопасность</p>
            <div className="inline-flex items-center gap-2 rounded-2xl bg-stone-900 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-white">
              <LuShield />
              Аккаунт
            </div>
          </div>
          <div className="mt-4 grid gap-6">
            <div className="rounded-3xl bg-white/70 p-4 ring-1 ring-stone-200/60">
              <p className="text-sm font-extrabold text-stone-900">Смена номера</p>
              <p className="mt-1 text-sm font-semibold text-stone-500">
                Текущий: {user?.phone_number ? user.phone_number : 'не указан'}
              </p>
              <div className="mt-4 grid gap-3">
                <input
                  className={input}
                  placeholder="Новый номер"
                  value={phoneNew}
                  onChange={(e) => setPhoneNew(formatRuPhoneInput(e.target.value))}
                />
                <input
                  className={input}
                  type="password"
                  placeholder="Текущий пароль"
                  value={phonePwd}
                  onChange={(e) => setPhonePwd(e.target.value)}
                />
                {phoneMsg ? (
                  <p className={`text-sm font-semibold ${phoneMsg.kind === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>
                    {phoneMsg.text}
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={phoneSaving}
                  onClick={() => void savePhone()}
                  className="min-h-[48px] rounded-2xl bg-primary px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-primary/25 disabled:opacity-60"
                >
                  {phoneSaving ? 'Обновляем…' : 'Обновить номер'}
                </button>
              </div>
            </div>

            <div className="rounded-3xl bg-white/70 p-4 ring-1 ring-stone-200/60">
              <p className="text-sm font-extrabold text-stone-900">Смена пароля</p>
              <div className="mt-4 grid gap-3">
                <input className={input} type="password" placeholder="Текущий пароль" value={pwdCurrent} onChange={(e) => setPwdCurrent(e.target.value)} />
                <input className={input} type="password" placeholder="Новый пароль (мин. 8)" value={pwdNew} onChange={(e) => setPwdNew(e.target.value)} />
                <input className={input} type="password" placeholder="Повторите новый пароль" value={pwdConfirm} onChange={(e) => setPwdConfirm(e.target.value)} />
                {pwdMsg ? (
                  <p className={`text-sm font-semibold ${pwdMsg.kind === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>{pwdMsg.text}</p>
                ) : null}
                <button
                  type="button"
                  disabled={pwdSaving}
                  onClick={() => void savePassword()}
                  className="min-h-[48px] rounded-2xl bg-stone-900 px-5 py-3 text-sm font-extrabold text-white shadow-lg disabled:opacity-60"
                >
                  {pwdSaving ? 'Обновляем…' : 'Обновить пароль'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className={section}>
          <p className={label}>История молитвенных записок</p>
          <div className="mt-4">
            {historyLoading ? (
              <div className="space-y-3">
                <div className="h-14 animate-pulse rounded-2xl bg-stone-100" />
                <div className="h-14 animate-pulse rounded-2xl bg-stone-100" />
              </div>
            ) : historyError ? (
              <p className="text-sm font-semibold text-red-600">{historyError}</p>
            ) : history.length === 0 ? (
              <p className="text-sm font-semibold text-stone-500">Пока пусто.</p>
            ) : (
              <div className="space-y-2">
                {history.map((h) => (
                  <div key={h.id} className="rounded-2xl bg-white/70 p-4 ring-1 ring-stone-200/60">
                    <p className="text-sm font-semibold text-stone-900">{h.prayer_request}</p>
                    <p className="mt-1 text-[12px] font-semibold text-stone-500">{new Date(h.created_at).toLocaleString('ru-RU')}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
