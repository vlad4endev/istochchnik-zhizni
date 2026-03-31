import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LuBookOpen,
  LuHeart,
  LuImagePlus,
  LuLogOut,
  LuPencil,
  LuSave,
  LuSend,
  LuShield,
  LuUser,
  LuX,
} from 'react-icons/lu';

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
import { fetchDirectionTemplates, type MinistryDirectionTemplate } from '../../admin/api';

/* ── Helpers ─────────────────────────────────────────────── */

function displayName(user: MeResponse): string {
  const fn = (user.first_name ?? '').trim();
  const ln = (user.last_name ?? '').trim();
  const combined = `${fn} ${ln}`.trim();
  if (combined) return combined;
  return (user.name ?? '').trim() || 'Профиль';
}

function roleLabel(role: string): string {
  const r = (role ?? '').trim().toLowerCase();
  if (r === 'admin') return 'Администратор';
  return 'Пользователь';
}

function axiosMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: { error?: string } } }).response?.data;
    if (data?.error && typeof data.error === 'string') return data.error;
  }
  return 'Произошла ошибка';
}

/* ── Shared class names ──────────────────────────────────── */

const SECTION_TITLE = 'text-[11px] font-bold uppercase tracking-[0.18em] text-stone-400';
const CARD = 'rounded-3xl bg-white/80 p-5 shadow-[0_10px_30px_rgba(28,25,23,0.08)] ring-1 ring-stone-200/70 backdrop-blur';
const LABEL = 'text-[11px] font-extrabold uppercase tracking-[0.14em] text-stone-500';
const INPUT =
  'mt-1.5 min-h-[48px] w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-[15px] font-semibold text-stone-900 outline-none ring-primary/20 transition placeholder:text-stone-400 focus:border-primary focus:ring-2';

/* ═══════════════════════════════════════════════════════════
   ProfilePage
   ═══════════════════════════════════════════════════════════ */

export function ProfilePage() {
  const logout = useAuthStore((s) => s.logout);
  const applyServerProfile = useAuthStore((s) => s.applyServerProfile);

  /* ── Profile state ── */
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  /* ── Edit mode ── */
  const [editing, setEditing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [draft, setDraft] = useState({
    first_name: '',
    last_name: '',
    phone_number: '',
    ministry_direction: '',
    ministry_role: '',
    email: '',
    birth_date: '',
    prayer_request: '',
  });

  const [ministryTemplates, setMinistryTemplates] = useState<MinistryDirectionTemplate[]>([]);

  /* ── Password ── */
  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  /* ── Phone ── */
  const [phoneNew, setPhoneNew] = useState('');
  const [phonePwd, setPhonePwd] = useState('');
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneMsg, setPhoneMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  /* ── Prayer history ── */
  const [history, setHistory] = useState<PrayerHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  /* ── Data fetching ── */

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
        ministry_direction: me.ministry_direction ?? '',
        ministry_role: me.ministry_role ?? '',
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
    let cancelled = false;
    void fetchDirectionTemplates()
      .then((dirs) => {
        if (!cancelled) setMinistryTemplates(dirs);
      })
      .catch(() => {
        if (!cancelled) setMinistryTemplates([]);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);
    void fetchPrayerRequestHistory(user.id, 30)
      .then((items) => !cancelled && setHistory(items))
      .catch((e) => !cancelled && setHistoryError(axiosMessage(e)))
      .finally(() => !cancelled && setHistoryLoading(false));
    return () => { cancelled = true; };
  }, [user?.id]);

  /* ── Actions ── */

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
        ministry_direction: draft.ministry_direction.trim(),
        ministry_role: draft.ministry_role.trim(),
        email: draft.email.trim(),
        birth_date: draft.birth_date.trim() || null,
        prayer_request: draft.prayer_request,
      });
      setUser(next);
      setDraft({
        first_name: next.first_name ?? '',
        last_name: next.last_name ?? '',
        phone_number: next.phone_number ?? '',
        ministry_direction: next.ministry_direction ?? '',
        ministry_role: next.ministry_role ?? '',
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

  /* ── Derived values ── */

  const name = user ? displayName(user) : 'Профиль';
  const avatarUrl = resolvePublicUrl(user?.avatar_url ?? null);

  const joinedLabel = useMemo(() => {
    if (!user?.created_at) return null;
    const d = new Date(user.created_at);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('ru-RU', { year: 'numeric', month: 'long' });
  }, [user?.created_at]);

  /* ── Loading / Error states ── */

  if (loading) {
    return (
      <div className="min-h-full bg-[var(--surface)] pb-24">
        <div className="h-44 animate-pulse bg-stone-200 sm:h-52" />
        <div className="mx-auto -mt-16 flex max-w-xl flex-col items-center gap-4 px-4">
          <div className="h-[7.5rem] w-[7.5rem] animate-pulse rounded-full bg-stone-100 ring-4 ring-white" />
          <div className="h-6 w-40 animate-pulse rounded-xl bg-stone-100" />
          <div className="h-4 w-28 animate-pulse rounded-lg bg-stone-100" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-full bg-[var(--surface)] px-4 pb-24 pt-20">
        <div className="mx-auto max-w-md rounded-3xl bg-white/80 p-8 text-center ring-1 ring-stone-200/70">
          <p className="text-sm font-semibold text-red-600">{error}</p>
          <button
            type="button"
            onClick={() => void loadProfile()}
            className="mt-5 min-h-[44px] rounded-2xl bg-primary px-6 py-2.5 text-sm font-extrabold text-white shadow-lg shadow-primary/25"
          >
            Повторить
          </button>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════
     JSX
     ═══════════════════════════════════════════════════════════ */

  return (
    <div className="min-h-full bg-[var(--surface)] pb-24">

      {/* ═══════════════════════════════════════════════════════
          1. HEADER — gradient banner + avatar + name
         ═══════════════════════════════════════════════════════ */}
      <div className="relative">
        {/* Gradient banner */}
        <div className="relative h-44 overflow-hidden bg-gradient-to-br from-[#4a1e26] via-primary to-[#a25260] sm:h-52 md:h-56">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_20%_-20%,rgba(255,255,255,0.13),transparent)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_90%_120%,rgba(255,255,255,0.08),transparent)]" />
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/[0.04]" />
          <div className="absolute -bottom-6 left-1/4 h-24 w-24 rounded-full bg-white/[0.03]" />
        </div>

        {/* Avatar + name overlay */}
        <div className="relative mx-auto -mt-16 flex max-w-xl flex-col items-center px-4 text-center sm:-mt-[4.5rem]">
          {/* Avatar with upload */}
          <div className="relative">
            <div className="flex h-[7.5rem] w-[7.5rem] items-center justify-center overflow-hidden rounded-full border-4 border-white bg-[var(--surface)] shadow-[0_8px_30px_rgba(125,54,64,0.18)] sm:h-[8.5rem] sm:w-[8.5rem]">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Аватар" className="h-full w-full object-cover" />
              ) : (
                <LuUser className="h-14 w-14 text-primary/40 sm:h-16 sm:w-16" strokeWidth={1.4} aria-hidden />
              )}
            </div>
            <label className="absolute -bottom-1 -right-1 grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-white text-primary shadow-lg ring-1 ring-stone-200/80 transition hover:bg-stone-50">
              <LuImagePlus className="h-[18px] w-[18px]" aria-hidden />
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

          {avatarUploading && (
            <p className="mt-2 text-xs font-semibold text-stone-500 animate-pulse">Загружаем фото…</p>
          )}

          {/* Name + Role */}
          <h1 className="mt-3.5 text-[1.6rem] font-extrabold leading-tight tracking-tight text-stone-900 sm:text-[1.85rem]">
            {name}
          </h1>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center rounded-full bg-stone-900/5 px-3 py-1 text-xs font-semibold text-stone-600">
              {roleLabel(user?.app_role ?? 'member')}
            </span>
            {joinedLabel && (
              <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                с {joinedLabel}
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/messenger"
              className="inline-flex items-center gap-2.5 rounded-full bg-primary px-7 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary-dark active:scale-[0.97]"
            >
              <LuSend className="h-4 w-4 -rotate-12" aria-hidden />
              Написать сообщение
            </Link>
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-stone-600 ring-1 ring-stone-200/70 transition hover:bg-stone-100"
              aria-label="Выйти"
              title="Выйти из аккаунта"
            >
              <LuLogOut className="h-[18px] w-[18px]" aria-hidden />
            </button>
          </div>

          {msg && (
            <p className={`mt-3 text-sm font-semibold ${msg.kind === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>
              {msg.text}
            </p>
          )}
        </div>
      </div>

      {/* ── All content sections ── */}
      <div className="mx-auto mt-8 flex max-w-xl flex-col gap-7 px-4 sm:mt-10 sm:gap-9 sm:px-5">

        {/* ═══════════════════════════════════════════════════
            2. СЕЙЧАС В ФОКУСЕ — glassmorphism card
           ═══════════════════════════════════════════════════ */}
        {(user?.prayer_request?.trim()) && (
          <section className="rounded-2xl border border-white/50 bg-white/55 p-5 shadow-[0_8px_32px_rgba(125,54,64,0.07)] backdrop-blur-xl sm:rounded-3xl sm:p-6">
            <h2 className={SECTION_TITLE}>Сейчас в фокусе</h2>

            <div className="mt-4 space-y-3.5">
              <div className="flex items-center gap-3.5">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
                  <LuBookOpen className="h-[1.2rem] w-[1.2rem]" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-[10.5px] font-bold uppercase tracking-wider text-stone-400">Молитвенный цикл</p>
                  <p className="text-[15px] font-semibold leading-snug text-stone-800">
                    {user.prayer_cycle
                      ? `Цикл ${user.prayer_cycle.number}, день ${user.prayer_cycle.day_index + 1}`
                      : 'Не в текущем цикле'}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-500 ring-1 ring-rose-100">
                  <LuHeart className="h-[1.2rem] w-[1.2rem]" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-[10.5px] font-bold uppercase tracking-wider text-stone-400">Молюсь за</p>
                  <p className="whitespace-pre-wrap text-[15px] font-semibold leading-snug text-stone-800">
                    {user.prayer_request}
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ═══════════════════════════════════════════════════
            3. ПРОФИЛЬ — данные / редактирование
           ═══════════════════════════════════════════════════ */}
        <section className={CARD}>
          <div className="flex items-center justify-between">
            <p className={LABEL}>Профиль</p>
            {!editing ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-white transition hover:bg-stone-800"
              >
                <LuPencil className="h-3.5 w-3.5" aria-hidden />
                Редактировать
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={savingProfile}
                  onClick={() => void saveProfile()}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-md shadow-primary/25 transition disabled:opacity-60"
                >
                  <LuSave className="h-3.5 w-3.5" aria-hidden />
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
                    ministry_direction: user?.ministry_direction ?? '',
                    ministry_role: user?.ministry_role ?? '',
                      email: user?.email ?? '',
                      birth_date: user?.birth_date ? user.birth_date.slice(0, 10) : '',
                      prayer_request: user?.prayer_request ?? '',
                    });
                    setMsg(null);
                  }}
                  className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-stone-600 ring-1 ring-stone-200/70"
                >
                  <LuX className="h-3.5 w-3.5" aria-hidden />
                  Отмена
                </button>
              </div>
            )}
          </div>

          {!editing ? (
            <div className="mt-4 grid gap-3">
              <InfoRow label="Имя" value={`${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim() || user?.name || '—'} />
              <div className="grid gap-3 sm:grid-cols-2">
                <InfoRow label="Телефон" value={user?.phone_number || '—'} />
                <InfoRow label="Email" value={user?.email || '—'} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <InfoRow label="Направление" value={(user?.ministry_direction ?? '').trim() || '—'} />
                <InfoRow label="Роль" value={(user?.ministry_role ?? '').trim() || '—'} />
              </div>
              <InfoRow label="Дата рождения" value={user?.birth_date ? user.birth_date.slice(0, 10) : '—'} />
              <InfoRow label="Молитвенная нужда" value={user?.prayer_request?.trim() || '—'} pre />
            </div>
          ) : (
            <div className="mt-4 grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={LABEL}>Имя</label>
                  <input className={INPUT} value={draft.first_name} onChange={(e) => setDraft((d) => ({ ...d, first_name: e.target.value }))} />
                </div>
                <div>
                  <label className={LABEL}>Фамилия</label>
                  <input className={INPUT} value={draft.last_name} onChange={(e) => setDraft((d) => ({ ...d, last_name: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className={LABEL}>Телефон</label>
                <input className={INPUT} value={draft.phone_number} onChange={(e) => setDraft((d) => ({ ...d, phone_number: formatRuPhoneInput(e.target.value) }))} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={LABEL}>Направление</label>
                  <select
                    className={INPUT}
                    value={draft.ministry_direction}
                    onChange={(e) => {
                      const nextDir = e.target.value;
                      setDraft((d) => {
                        const dir = ministryTemplates.find((x) => x.title === nextDir);
                        const allowed = new Set((dir?.roles ?? []).map((r) => r.title));
                        const nextRole = allowed.size === 0 || allowed.has(d.ministry_role) ? d.ministry_role : '';
                        return { ...d, ministry_direction: nextDir, ministry_role: nextRole };
                      });
                    }}
                  >
                    <option value="">—</option>
                    {ministryTemplates.map((d) => (
                      <option key={d.id} value={d.title}>
                        {d.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Роль</label>
                  <select
                    className={INPUT}
                    value={draft.ministry_role}
                    disabled={!draft.ministry_direction}
                    onChange={(e) => setDraft((d) => ({ ...d, ministry_role: e.target.value }))}
                  >
                    <option value="">—</option>
                    {(ministryTemplates.find((x) => x.title === draft.ministry_direction)?.roles ?? []).map((r) => (
                      <option key={r.id} value={r.title}>
                        {r.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className={LABEL}>Email</label>
                <input className={INPUT} value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} />
              </div>
              <div>
                <label className={LABEL}>Дата рождения</label>
                <input className={INPUT} type="date" value={draft.birth_date} onChange={(e) => setDraft((d) => ({ ...d, birth_date: e.target.value }))} />
              </div>
              <div>
                <label className={LABEL}>Молитвенная нужда</label>
                <textarea
                  className={`${INPUT} min-h-[120px] resize-y`}
                  value={draft.prayer_request}
                  onChange={(e) => setDraft((d) => ({ ...d, prayer_request: e.target.value }))}
                  maxLength={8000}
                />
              </div>
            </div>
          )}
        </section>

        {/* ═══════════════════════════════════════════════════
            4. БЕЗОПАСНОСТЬ
           ═══════════════════════════════════════════════════ */}
        <section className={CARD}>
          <div className="flex items-center justify-between gap-3">
            <p className={LABEL}>Безопасность</p>
            <div className="inline-flex items-center gap-2 rounded-2xl bg-stone-900 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-white">
              <LuShield className="h-3.5 w-3.5" aria-hidden />
              Аккаунт
            </div>
          </div>

          <div className="mt-4 grid gap-6">
            {/* Phone change */}
            <div className="rounded-3xl bg-white/70 p-4 ring-1 ring-stone-200/60">
              <p className="text-sm font-extrabold text-stone-900">Смена номера</p>
              <p className="mt-1 text-sm font-semibold text-stone-500">
                Текущий: {user?.phone_number || 'не указан'}
              </p>
              <div className="mt-4 grid gap-3">
                <input
                  className={INPUT}
                  placeholder="Новый номер"
                  value={phoneNew}
                  onChange={(e) => setPhoneNew(formatRuPhoneInput(e.target.value))}
                />
                <input
                  className={INPUT}
                  type="password"
                  placeholder="Текущий пароль"
                  value={phonePwd}
                  onChange={(e) => setPhonePwd(e.target.value)}
                />
                {phoneMsg && (
                  <p className={`text-sm font-semibold ${phoneMsg.kind === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>
                    {phoneMsg.text}
                  </p>
                )}
                <button
                  type="button"
                  disabled={phoneSaving}
                  onClick={() => void savePhone()}
                  className="min-h-[48px] rounded-2xl bg-primary px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-primary/25 transition disabled:opacity-60"
                >
                  {phoneSaving ? 'Обновляем…' : 'Обновить номер'}
                </button>
              </div>
            </div>

            {/* Password change */}
            <div className="rounded-3xl bg-white/70 p-4 ring-1 ring-stone-200/60">
              <p className="text-sm font-extrabold text-stone-900">Смена пароля</p>
              <div className="mt-4 grid gap-3">
                <input className={INPUT} type="password" placeholder="Текущий пароль" value={pwdCurrent} onChange={(e) => setPwdCurrent(e.target.value)} />
                <input className={INPUT} type="password" placeholder="Новый пароль (мин. 8)" value={pwdNew} onChange={(e) => setPwdNew(e.target.value)} />
                <input className={INPUT} type="password" placeholder="Повторите новый пароль" value={pwdConfirm} onChange={(e) => setPwdConfirm(e.target.value)} />
                {pwdMsg && (
                  <p className={`text-sm font-semibold ${pwdMsg.kind === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>{pwdMsg.text}</p>
                )}
                <button
                  type="button"
                  disabled={pwdSaving}
                  onClick={() => void savePassword()}
                  className="min-h-[48px] rounded-2xl bg-stone-900 px-5 py-3 text-sm font-extrabold text-white shadow-lg transition disabled:opacity-60"
                >
                  {pwdSaving ? 'Обновляем…' : 'Обновить пароль'}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════
            5. ИСТОРИЯ МОЛИТВЕННЫХ ЗАПИСОК
           ═══════════════════════════════════════════════════ */}
        <section className={CARD}>
          <p className={LABEL}>История молитвенных записок</p>
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
                    <p className="whitespace-pre-wrap text-sm font-semibold text-stone-900">{h.prayer_request}</p>
                    <p className="mt-1 text-[12px] font-semibold text-stone-500">
                      {new Date(h.created_at).toLocaleString('ru-RU')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Version stamp */}
        <p className="text-center text-[11px] font-semibold text-stone-400">
          Версия: {__WEB_REACT_BUILD_STAMP__}
        </p>
      </div>
    </div>
  );
}

/* ── Small helper component ── */

function InfoRow({ label, value, pre }: { label: string; value: string; pre?: boolean }) {
  return (
    <div className="rounded-2xl bg-white/70 p-4 ring-1 ring-stone-200/60">
      <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-stone-500">{label}</p>
      <p className={`mt-1 text-sm font-extrabold text-stone-900 ${pre ? 'whitespace-pre-wrap' : ''}`}>
        {value}
      </p>
    </div>
  );
}
