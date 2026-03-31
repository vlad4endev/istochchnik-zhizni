import { useCallback, useEffect, useState } from 'react';
import { LuImagePlus, LuLogOut, LuShield, LuUser } from 'react-icons/lu';
import { useAuthStore } from '../../auth/authStore';
import { formatRuPhoneInput } from '../../auth/utils/formatRuPhone';
import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import {
  changePassword,
  changePhone,
  fetchMe,
  uploadMyAvatar,
  type MeResponse,
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

  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [phoneNew, setPhoneNew] = useState('');
  const [phonePwd, setPhonePwd] = useState('');
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneMsg, setPhoneMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

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
      setPhoneNew(me.phone_number ?? '');
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
      <div className={section}>
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="h-16 w-16 overflow-hidden rounded-2xl bg-primary/10 ring-1 ring-primary/10">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Аватар" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center text-primary/60">
                  <LuUser size={28} />
                </div>
              )}
            </div>
            <label className="absolute -bottom-2 -right-2 grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-white text-primary shadow-md ring-1 ring-stone-200">
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
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-extrabold text-stone-900">{name}</p>
            <p className="mt-0.5 text-sm font-semibold text-stone-500">Роль: {roleLabel(user?.app_role ?? 'member')}</p>
            <p className="mt-1 text-[11px] font-semibold text-stone-400">Версия: {__WEB_REACT_BUILD_STAMP__}</p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-white/70 px-4 py-2 text-sm font-extrabold text-stone-700 ring-1 ring-stone-200/70"
          >
            <LuLogOut />
            Выйти
          </button>
        </div>
        {msg ? (
          <p className={`mt-4 text-sm font-semibold ${msg.kind === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>
            {msg.text}
          </p>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4">
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
      </div>
    </div>
  );
}
