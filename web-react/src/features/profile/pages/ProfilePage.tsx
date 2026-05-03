import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LuBookOpen,
  LuHeart,
  LuImagePlus,
  LuLayoutGrid,
  LuLogOut,
  LuPencil,
  LuSave,
  LuSend,
  LuShield,
  LuUser,
  LuX,
} from 'react-icons/lu';

import { normalizeRegistrationStatus, useAuthStore } from '../../auth/authStore';
import { formatRuPhoneInput } from '../../auth/utils/formatRuPhone';
import { dateInputValueFromApi } from '../../../lib/dateInputValueFromApi';
import { resolveMessengerWebOrigin } from '../../../lib/config';
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
import { fetchProfileByMemberId, patchPublicProfileSettings } from '../publicProfileApi';
import { ProfileAccessibilitySection } from '../components/ProfileAccessibilitySection';
import { SkeletonBox } from '@/components/ui/SkeletonBox';
import { memberNameFirstLast } from '../memberDisplayName';

import profileShell from '../profileShell.module.css';
import pfStyles from './ProfilePage.module.css';

/* ── Helpers ─────────────────────────────────────────────── */

function roleLabel(role: string): string {
  const r = (role ?? '').trim().toLowerCase();
  if (r === 'admin') return 'Администратор';
  if (r === 'minister') return 'Служитель';
  if (r === 'pastor') return 'Пастор';
  return 'Пользователь';
}

function axiosMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: { error?: string } } }).response?.data;
    if (data?.error && typeof data.error === 'string') return data.error;
  }
  return 'Произошла ошибка';
}

function normalizeMinistryRoles(value: string): string {
  const unique = Array.from(
    new Set(
      String(value ?? '')
        .split(/[;,]/)
        .map((x) => x.trim())
        .filter((x) => x.length > 0),
    ),
  );
  return unique.join(', ');
}

function roleArray(value: string): string[] {
  return normalizeMinistryRoles(value)
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

/* ── Shared class names ──────────────────────────────────── */

const SECTION_TITLE =
  'text-[11px] font-bold uppercase tracking-[0.18em] text-[color:var(--profile-text-faint)]';
const CARD =
  'rounded-3xl bg-[color:var(--profile-card-bg)] p-5 shadow-[0_10px_30px_rgba(28,25,23,0.08)] ring-1 ring-[color:var(--profile-card-ring)] backdrop-blur';
const LABEL = 'text-[11px] font-extrabold uppercase tracking-[0.14em] text-[color:var(--profile-text-soft)]';
const INPUT =
  'mt-1.5 min-h-[48px] w-full rounded-2xl border border-[color:var(--profile-card-ring)] bg-white px-4 py-3 text-[15px] font-semibold text-[color:var(--profile-text-heading)] outline-none transition placeholder:text-[color:var(--profile-text-faint)] focus:border-[color:var(--profile-primary)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--profile-primary)_20%,transparent)]';

const profilePageRoot = `${profileShell.profileRoot} min-h-full max-lg:pb-8 lg:pb-24`;

/* ═══════════════════════════════════════════════════════════
   ProfilePage
   ═══════════════════════════════════════════════════════════ */

export function ProfilePage() {
  const messengerWebOrigin = resolveMessengerWebOrigin();
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
  const allRoleOptions = useMemo(() => {
    const fromTemplates = ministryTemplates.flatMap((d) => (d.roles ?? []).map((r) => r.title));
    return Array.from(new Set([...fromTemplates, 'Ведущий', 'Проповедник']));
  }, [ministryTemplates]);
  const roleOptionsForDirection = (directionTitle: string): string[] => {
    const scoped = (ministryTemplates.find((x) => x.title === directionTitle)?.roles ?? []).map((r) => r.title);
    const withDefaults = Array.from(new Set([...scoped, 'Ведущий', 'Проповедник']));
    return withDefaults.length > 0 ? withDefaults : allRoleOptions;
  };

  /* ── Публичная лента (имя и «О себе» на странице /profile/:username) ── */
  const [publicDraft, setPublicDraft] = useState({ display_name: '', bio: '' });
  const [publicLoading, setPublicLoading] = useState(false);
  const [savingPublic, setSavingPublic] = useState(false);

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
        registrationStatus: normalizeRegistrationStatus(me.registration_status),
        username: (me.username ?? '').trim(),
        memberId: typeof me.id === 'number' ? me.id : null,
      });
      const nextDraft = {
        first_name: me.first_name ?? '',
        last_name: me.last_name ?? '',
        phone_number: me.phone_number ?? '',
        ministry_direction: me.ministry_direction ?? '',
        ministry_role: normalizeMinistryRoles(me.ministry_role ?? ''),
        email: me.email ?? '',
        birth_date: dateInputValueFromApi(me.birth_date),
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
    setPublicLoading(true);
    void fetchProfileByMemberId(user.id)
      .then((feed) => {
        if (cancelled) return;
        setPublicDraft({
          display_name: feed.profile.display_name?.trim() ?? '',
          bio: feed.profile.bio?.trim() ?? '',
        });
      })
      .catch(() => {
        if (!cancelled) setPublicDraft({ display_name: '', bio: '' });
      })
      .finally(() => {
        if (!cancelled) setPublicLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

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
        ministry_role: normalizeMinistryRoles(draft.ministry_role),
        email: draft.email.trim(),
        birth_date: (() => {
          const y = dateInputValueFromApi(draft.birth_date.trim());
          return y.length > 0 ? y : null;
        })(),
        prayer_request: draft.prayer_request,
      });
      setUser(next);
      setDraft({
        first_name: next.first_name ?? '',
        last_name: next.last_name ?? '',
        phone_number: next.phone_number ?? '',
        ministry_direction: next.ministry_direction ?? '',
        ministry_role: normalizeMinistryRoles(next.ministry_role ?? ''),
        email: next.email ?? '',
        birth_date: dateInputValueFromApi(next.birth_date),
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

  const savePublicProfile = async () => {
    setSavingPublic(true);
    setMsg(null);
    try {
      await patchPublicProfileSettings({
        display_name: publicDraft.display_name.trim() || null,
        bio: publicDraft.bio.trim() || null,
      });
      setMsg({ kind: 'ok', text: 'Публичный профиль сохранён' });
    } catch (e) {
      setMsg({ kind: 'err', text: axiosMessage(e) });
    } finally {
      setSavingPublic(false);
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

  const name = user ? memberNameFirstLast(user) || 'Профиль' : 'Профиль';
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
      <div className={profilePageRoot} data-profile-root>
        <div className={`${pfStyles.pfSkelBanner} animate-pulse`} />
        <div className="mx-auto -mt-16 flex max-w-xl flex-col items-center gap-4 px-4">
          <div className={`${pfStyles.pfSkelAvatar} animate-pulse`} />
          <div className={`${pfStyles.pfSkelLine} ${pfStyles.pfSkelLineMd} mx-auto animate-pulse`} />
          <div className={`${pfStyles.pfSkelLine} ${pfStyles.pfSkelLineSm} animate-pulse`} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${profilePageRoot} px-4 pt-20`} data-profile-root>
        <div className="mx-auto max-w-md rounded-3xl bg-[color:var(--profile-card-bg)] p-8 text-center ring-1 ring-[color:var(--profile-card-ring)]">
          <p className="text-sm font-semibold text-red-600">{error}</p>
          <button
            type="button"
            onClick={() => void loadProfile()}
            className="mt-5 min-h-[44px] rounded-2xl bg-[color:var(--profile-primary)] px-6 py-2.5 text-sm font-extrabold text-white shadow-[0_10px_30px_color-mix(in_srgb,var(--profile-primary)_25%,transparent)]"
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
    <div className={profilePageRoot} data-profile-root>

      {/* ═══════════════════════════════════════════════════════
          1. HEADER — gradient banner + avatar + name
         ═══════════════════════════════════════════════════════ */}
      <div className="relative">
        {/* Gradient banner */}
        <div className="relative h-44 overflow-hidden bg-gradient-to-br from-[var(--profile-gradient-from)] via-[color:var(--profile-primary)] to-[var(--profile-gradient-to)] sm:h-52 md:h-56">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_20%_-20%,rgba(255,255,255,0.13),transparent)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_90%_120%,rgba(255,255,255,0.08),transparent)]" />
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/[0.04]" />
          <div className="absolute -bottom-6 left-1/4 h-24 w-24 rounded-full bg-white/[0.03]" />
        </div>

        {/* Avatar + name overlay */}
        <div className="relative mx-auto -mt-16 flex max-w-xl flex-col items-center px-4 text-center sm:-mt-[4.5rem]">
          {/* Avatar with upload */}
          <div className="relative">
            <div className="flex h-[7.5rem] w-[7.5rem] items-center justify-center overflow-hidden rounded-full border-4 border-white bg-[color:var(--profile-surface)] shadow-[0_8px_30px_rgba(125,54,64,0.18)] sm:h-[8.5rem] sm:w-[8.5rem]">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Аватар" className="h-full w-full object-cover" />
              ) : (
                <LuUser
                  className="h-14 w-14 text-[color:color-mix(in_srgb,var(--profile-primary)_40%,transparent)] sm:h-16 sm:w-16"
                  strokeWidth={1.4}
                  aria-hidden
                />
              )}
            </div>
            <label className="absolute -bottom-1 -right-1 grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-white text-[color:var(--profile-primary)] shadow-lg ring-1 ring-[color:var(--profile-card-ring)] transition hover:bg-[color:color-mix(in_srgb,var(--profile-surface-elevated)_85%,var(--profile-surface))]">
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
            <p className="mt-2 text-xs font-semibold text-[color:var(--profile-text-muted)] animate-pulse">Загружаем фото…</p>
          )}

          {/* Name + Role */}
          <h1 className="mt-3.5 text-[1.6rem] font-extrabold leading-tight tracking-tight text-[color:var(--profile-text-heading)] sm:text-[1.85rem]">
            {name}
          </h1>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center rounded-full bg-[color:color-mix(in_srgb,var(--profile-text-heading)_5%,transparent)] px-3 py-1 text-xs font-semibold text-[color:var(--profile-text-soft)]">
              {roleLabel(user?.app_role ?? 'member')}
            </span>
            {joinedLabel && (
              <span className="inline-flex items-center rounded-full bg-[color:color-mix(in_srgb,var(--profile-primary)_10%,transparent)] px-3 py-1 text-xs font-semibold text-[color:var(--profile-primary)]">
                с {joinedLabel}
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <Link
              to={user?.id != null ? `/profile/member-${user.id}` : '/profile'}
              className="inline-flex items-center gap-2.5 rounded-full bg-white px-6 py-2.5 text-sm font-bold text-[color:var(--profile-text-body)] shadow-md ring-1 ring-[color:var(--profile-card-ring)] transition-all hover:bg-[color:color-mix(in_srgb,var(--profile-surface-elevated)_90%,var(--profile-surface))] active:scale-[0.97]"
            >
              <LuLayoutGrid className="h-4 w-4" aria-hidden />
              Лента профиля
            </Link>
            {messengerWebOrigin ? (
              <a
                href={`${messengerWebOrigin}/messenger`}
                className="inline-flex items-center gap-2.5 rounded-full bg-[color:var(--profile-primary)] px-7 py-2.5 text-sm font-bold text-white shadow-[0_8px_24px_color-mix(in_srgb,var(--profile-primary)_20%,transparent)] transition-all hover:bg-[color:var(--profile-primary-dark)] active:scale-[0.97]"
              >
                <LuSend className="h-4 w-4 -rotate-12" aria-hidden />
                Написать сообщение
              </a>
            ) : (
              <Link
                to="/messenger"
                className="inline-flex items-center gap-2.5 rounded-full bg-[color:var(--profile-primary)] px-7 py-2.5 text-sm font-bold text-white shadow-[0_8px_24px_color-mix(in_srgb,var(--profile-primary)_20%,transparent)] transition-all hover:bg-[color:var(--profile-primary-dark)] active:scale-[0.97]"
              >
                <LuSend className="h-4 w-4 -rotate-12" aria-hidden />
                Написать сообщение
              </Link>
            )}
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--profile-card-bg)_90%,transparent)] text-[color:var(--profile-text-soft)] ring-1 ring-[color:var(--profile-card-ring)] transition hover:bg-[color:var(--profile-border-light)]"
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
          <section className="rounded-2xl border border-[color:color-mix(in_srgb,var(--profile-card-bg)_50%,transparent)] bg-[color:color-mix(in_srgb,var(--profile-card-bg-soft)_82%,var(--profile-surface))] p-5 shadow-[0_8px_32px_color-mix(in_srgb,var(--profile-primary)_7%,transparent)] backdrop-blur-xl sm:rounded-3xl sm:p-6">
            <h2 className={SECTION_TITLE}>Сейчас в фокусе</h2>

            <div className="mt-4 space-y-3.5">
              <div className="flex items-center gap-3.5">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
                  <LuBookOpen className="h-[1.2rem] w-[1.2rem]" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-[10.5px] font-bold uppercase tracking-wider text-[color:var(--profile-text-faint)]">Молитвенный цикл</p>
                  <p className="text-[15px] font-semibold leading-snug text-[color:var(--profile-text-body)]">
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
                  <p className="text-[10.5px] font-bold uppercase tracking-wider text-[color:var(--profile-text-faint)]">Молюсь за</p>
                  <p className="whitespace-pre-wrap text-[15px] font-semibold leading-snug text-[color:var(--profile-text-body)]">
                    {user.prayer_request}
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Публичная страница (как в Instagram) */}
        <section className={CARD}>
          <p className={LABEL}>Публичная страница</p>
          <p className="mt-2 text-sm font-medium leading-snug text-[color:var(--profile-text-muted)]">
            Имя и блок «О себе» видят все на вашей ленте{' '}
            <Link
              to={user?.username ? `/profile/${encodeURIComponent(user.username)}` : `/profile/member-${user?.id ?? ''}`}
              className="font-bold text-[color:var(--profile-primary)] underline-offset-2 hover:underline"
            >
              в профиле
            </Link>
            . Фото меняется кнопкой на аватаре выше.
          </p>
          {publicLoading ? (
            <div className="mt-4 space-y-2">
              <SkeletonBox width="55%" height="14px" />
              <SkeletonBox width="100%" height="42px" radius="12px" />
              <SkeletonBox width="100%" height="96px" radius="12px" />
            </div>
          ) : (
            <div className="mt-4 grid gap-4">
              <div>
                <label className={LABEL} htmlFor="pub-display">
                  Имя в ленте
                </label>
                <input
                  id="pub-display"
                  className={INPUT}
                  placeholder="Как к вам обращаться"
                  value={publicDraft.display_name}
                  onChange={(e) => setPublicDraft((d) => ({ ...d, display_name: e.target.value }))}
                />
                <p className="mt-1.5 text-xs font-medium leading-snug text-[color:var(--profile-text-muted)]">
                  Оставьте пустым — в ленте будет показано имя и фамилия из блока «Профиль» ниже (сначала имя, затем фамилия).
                </p>
              </div>
              <div>
                <label className={LABEL} htmlFor="pub-bio">
                  О себе
                </label>
                <textarea
                  id="pub-bio"
                  className={`${INPUT} min-h-[120px] resize-y`}
                  placeholder="Коротко о себе для церкви…"
                  rows={4}
                  value={publicDraft.bio}
                  onChange={(e) => setPublicDraft((d) => ({ ...d, bio: e.target.value }))}
                />
              </div>
              <button
                type="button"
                disabled={savingPublic}
                onClick={() => void savePublicProfile()}
                className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-[color:var(--profile-primary)] px-5 text-sm font-extrabold text-white shadow-[0_8px_24px_color-mix(in_srgb,var(--profile-primary)_22%,transparent)] disabled:opacity-50"
              >
                {savingPublic ? 'Сохраняем…' : 'Сохранить ленту'}
              </button>
            </div>
          )}
        </section>

        <ProfileAccessibilitySection />

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
                className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--profile-text-heading)] px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-white transition hover:bg-[color:color-mix(in_srgb,var(--profile-text-heading)_88%,black)]"
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
                  className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--profile-primary)] px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[0_6px_20px_color-mix(in_srgb,var(--profile-primary)_22%,transparent)] transition disabled:opacity-60"
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
                    ministry_role: normalizeMinistryRoles(user?.ministry_role ?? ''),
                      email: user?.email ?? '',
                      birth_date: dateInputValueFromApi(user?.birth_date),
                      prayer_request: user?.prayer_request ?? '',
                    });
                    setMsg(null);
                  }}
                  className="inline-flex items-center gap-1 rounded-full bg-[color:var(--profile-card-bg)] px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-[color:var(--profile-text-soft)] ring-1 ring-[color:var(--profile-card-ring)]"
                >
                  <LuX className="h-3.5 w-3.5" aria-hidden />
                  Отмена
                </button>
              </div>
            )}
          </div>

          {!editing ? (
            <div className="mt-4 grid gap-3">
              <InfoRow label="Имя" value={user ? memberNameFirstLast(user) || user.name || '—' : '—'} />
              <div className="grid gap-3 sm:grid-cols-2">
                <InfoRow label="Телефон" value={user?.phone_number || '—'} />
                <InfoRow label="Email" value={user?.email || '—'} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <InfoRow label="Направление" value={(user?.ministry_direction ?? '').trim() || '—'} />
                <InfoRow label="Роль" value={(user?.ministry_role ?? '').trim() || '—'} />
              </div>
              <InfoRow
                label="Дата рождения"
                value={dateInputValueFromApi(user?.birth_date) || '—'}
              />
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
                        return { ...d, ministry_direction: nextDir };
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
                    multiple
                    size={Math.min(7, Math.max(3, roleOptionsForDirection(draft.ministry_direction).length))}
                    className={INPUT}
                    value={roleArray(draft.ministry_role)}
                    onChange={(e) => {
                      const selected = Array.from(e.currentTarget.selectedOptions).map((opt) => opt.value);
                      setDraft((d) => ({ ...d, ministry_role: normalizeMinistryRoles(selected.join(', ')) }));
                    }}
                  >
                    {roleOptionsForDirection(draft.ministry_direction).map((role) => (
                      <option key={role} value={role}>
                        {role}
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
            <div className="inline-flex items-center gap-2 rounded-2xl bg-[color:var(--profile-text-heading)] px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-white">
              <LuShield className="h-3.5 w-3.5" aria-hidden />
              Аккаунт
            </div>
          </div>

          <div className="mt-4 grid gap-6">
            {/* Phone change */}
            <div className="rounded-3xl bg-[color:color-mix(in_srgb,var(--profile-card-bg)_72%,var(--profile-surface))] p-4 ring-1 ring-[color:var(--profile-card-ring)]">
              <p className="text-sm font-extrabold text-[color:var(--profile-text-heading)]">Смена номера</p>
              <p className="mt-1 text-sm font-semibold text-[color:var(--profile-text-muted)]">
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
                  className="min-h-[48px] rounded-2xl bg-[color:var(--profile-primary)] px-5 py-3 text-sm font-extrabold text-white shadow-[0_10px_30px_color-mix(in_srgb,var(--profile-primary)_25%,transparent)] transition disabled:opacity-60"
                >
                  {phoneSaving ? 'Обновляем…' : 'Обновить номер'}
                </button>
              </div>
            </div>

            {/* Password change */}
            <div className="rounded-3xl bg-[color:color-mix(in_srgb,var(--profile-card-bg)_72%,var(--profile-surface))] p-4 ring-1 ring-[color:var(--profile-card-ring)]">
              <p className="text-sm font-extrabold text-[color:var(--profile-text-heading)]">Смена пароля</p>
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
                  className="min-h-[48px] rounded-2xl bg-[color:var(--profile-text-heading)] px-5 py-3 text-sm font-extrabold text-white shadow-lg transition disabled:opacity-60"
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
                <div className="h-14 animate-pulse rounded-2xl bg-[color:var(--profile-media-placeholder-mid)]" />
                <div className="h-14 animate-pulse rounded-2xl bg-[color:var(--profile-media-placeholder-mid)]" />
              </div>
            ) : historyError ? (
              <p className="text-sm font-semibold text-red-600">{historyError}</p>
            ) : history.length === 0 ? (
              <p className="text-sm font-semibold text-[color:var(--profile-text-muted)]">Пока пусто.</p>
            ) : (
              <div className="space-y-2">
                {history.map((h) => (
                  <div key={h.id} className="rounded-2xl bg-[color:color-mix(in_srgb,var(--profile-card-bg)_72%,var(--profile-surface))] p-4 ring-1 ring-[color:var(--profile-card-ring)]">
                    <p className="whitespace-pre-wrap text-sm font-semibold text-[color:var(--profile-text-heading)]">{h.prayer_request}</p>
                    <p className="mt-1 text-[12px] font-semibold text-[color:var(--profile-text-muted)]">
                      {new Date(h.created_at).toLocaleString('ru-RU')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Version stamp */}
        <p className="text-center text-[11px] font-semibold text-[color:var(--profile-text-faint)]">
          Версия: {__WEB_REACT_BUILD_STAMP__}
        </p>
      </div>
    </div>
  );
}

/* ── Small helper component ── */

function InfoRow({ label, value, pre }: { label: string; value: string; pre?: boolean }) {
  return (
    <div className="rounded-2xl bg-[color:color-mix(in_srgb,var(--profile-card-bg)_72%,var(--profile-surface))] p-4 ring-1 ring-[color:var(--profile-card-ring)]">
      <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[color:var(--profile-text-soft)]">{label}</p>
      <p className={`mt-1 text-sm font-extrabold text-[color:var(--profile-text-heading)] ${pre ? 'whitespace-pre-wrap' : ''}`}>
        {value}
      </p>
    </div>
  );
}
