import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LuBookOpen,
  LuCamera,
  LuChevronLeft,
  LuHeart,
  LuLayoutGrid,
  LuLogOut,
  LuPencil,
  LuSave,
  LuSend,
  LuSettings,
  LuShield,
  LuUser,
  LuX,
} from 'react-icons/lu';

import { normalizeRegistrationStatus, useAuthStore } from '../../auth/authStore';
import { formatRuPhoneInput } from '../../auth/utils/formatRuPhone';
import { dateInputValueFromApi } from '../../../lib/dateInputValueFromApi';
import { formatBirthDateDisplay } from '../../../lib/birthDate';
import { BirthDayMonthFields } from '@/components/BirthDayMonthFields';
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
import {
  fetchProfileByMemberId,
  patchPublicProfileSettings,
  type ProfileFeedResponse,
} from '../publicProfileApi';
import { fetchMyPreacherSermonHistory, type PreacherSermonHistoryRow } from '../../servicePlanner/sermonFeedbackApi';
import { ProfileAccessibilitySection } from '../components/ProfileAccessibilitySection';
import { PushSettings } from '../components/PushSettings';
import { SkeletonBox } from '@/components/ui/SkeletonBox';
import { pluralizeRu } from '../../../lib/pluralizeRu';
import { memberNameFirstLast } from '../memberDisplayName';

import profileShell from '../profileShell.module.css';
import ig from './PublicProfilePage.module.css';

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
  'mt-1.5 min-h-[48px] w-full rounded-2xl border border-[color:var(--profile-card-ring)] bg-[color:var(--profile-surface-elevated)] px-4 py-3 text-[15px] font-semibold text-[color:var(--profile-text-heading)] outline-none transition placeholder:text-[color:var(--profile-text-faint)] focus:border-[color:var(--profile-primary)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--profile-primary)_20%,transparent)]';

/** Та же оболочка, что у публичного профиля: компактная шапка, без «веб-баннера», нативный скролл. */
const profileRootCn = `${profileShell.profileRoot} ${ig.igPage} min-h-full [touch-action:manipulation]`;

/* ═══════════════════════════════════════════════════════════
   ProfilePage
   ═══════════════════════════════════════════════════════════ */

export function ProfilePage() {
  const messengerWebOrigin = resolveMessengerWebOrigin();
  const logout = useAuthStore((s) => s.logout);
  const applyServerProfile = useAuthStore((s) => s.applyServerProfile);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

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
  /** Ответ ленты — для счётчика публикаций в шапке (как в Instagram). */
  const [feedSnapshot, setFeedSnapshot] = useState<ProfileFeedResponse | null>(null);

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
  const [sermonHistory, setSermonHistory] = useState<PreacherSermonHistoryRow[]>([]);
  const [sermonHistoryLoading, setSermonHistoryLoading] = useState(false);
  const [sermonHistoryError, setSermonHistoryError] = useState<string | null>(null);

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
        setFeedSnapshot(feed);
        setPublicDraft({
          display_name: feed.profile.display_name?.trim() ?? '',
          bio: feed.profile.bio?.trim() ?? '',
        });
      })
      .catch(() => {
        if (!cancelled) {
          setFeedSnapshot(null);
          setPublicDraft({ display_name: '', bio: '' });
        }
      })
      .finally(() => {
        if (!cancelled) setPublicLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const canViewSermonHistory = useMemo(() => {
    const role = String(user?.app_role ?? '').toLowerCase();
    if (role === 'pastor' || role === 'minister' || role === 'admin') return true;
    return String(user?.ministry_role ?? '').toLowerCase().includes('проповед');
  }, [user?.app_role, user?.ministry_role]);

  useEffect(() => {
    if (!user?.id || !canViewSermonHistory) return;
    let cancelled = false;
    setSermonHistoryLoading(true);
    setSermonHistoryError(null);
    void fetchMyPreacherSermonHistory(20)
      .then((items) => {
        if (!cancelled) setSermonHistory(items);
      })
      .catch((e) => {
        if (!cancelled) setSermonHistoryError(axiosMessage(e));
      })
      .finally(() => {
        if (!cancelled) setSermonHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, canViewSermonHistory]);

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

  const usernameTrim = (user?.username ?? '').trim();
  const isPlaceholderUsername =
    usernameTrim.length > 0 && /^member-\d+$/i.test(usernameTrim);

  const headerHandleLine = useMemo(() => {
    if (!usernameTrim || isPlaceholderUsername) return null;
    const at = `@${usernameTrim}`;
    const n = name.trim();
    if (n.toLowerCase() === at.toLowerCase() || n.toLowerCase() === usernameTrim.toLowerCase()) {
      return null;
    }
    return at;
  }, [usernameTrim, isPlaceholderUsername, name]);

  const postsCount = feedSnapshot?.posts.length ?? 0;
  const postsLabel = pluralizeRu(postsCount, ['публикация', 'публикации', 'публикаций']);

  const publicFeedLink = useMemo(() => {
    if (!user) return '/profile';
    const slug = usernameTrim || (user.id != null ? `member-${user.id}` : '');
    return slug ? `/profile/${encodeURIComponent(slug)}` : '/profile';
  }, [user, usernameTrim]);

  const joinedLabel = useMemo(() => {
    if (!user?.created_at) return null;
    const d = new Date(user.created_at);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('ru-RU', { year: 'numeric', month: 'long' });
  }, [user?.created_at]);

  /* ── Loading / Error states ── */

  if (loading) {
    return (
      <div className={profileRootCn} data-profile-root>
        <div className={ig.igTopBar} aria-hidden>
          <div className={ig.igTopBarSkelBtn} />
          <div className={ig.igTopBarSkelTitleWrap}>
            <div className={ig.igTopBarSkelTitle} />
          </div>
          <div className={ig.igTopBarSkelBtn} />
        </div>
        <div className={ig.igHeader}>
          <div className={ig.igHeaderInner}>
            <div className={ig.igSkelRow}>
              <div className={ig.igSkelAvatar} aria-hidden />
              <div className={ig.igSkelMeta}>
                <div className={`${ig.igSkelLine} ${ig.igSkelLineLg}`} />
                <div className={`${ig.igSkelLine} ${ig.igSkelLineSm}`} />
              </div>
            </div>
          </div>
        </div>
        <div className={ig.igFeedSection}>
          <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 pb-8 pt-4 sm:px-5">
            <div className="h-36 animate-pulse rounded-2xl bg-[color:var(--profile-media-placeholder-mid)]" />
            <div className="h-48 animate-pulse rounded-2xl bg-[color:var(--profile-media-placeholder-mid)]" />
            <div className="h-32 animate-pulse rounded-2xl bg-[color:var(--profile-media-placeholder)]" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={profileRootCn} data-profile-root>
        <div className={ig.igTopBar}>
          <Link to="/dashboard" className={ig.igTopBarIconBtn} aria-label="На главную" title="На главную">
            <LuChevronLeft className="h-6 w-6" strokeWidth={2.25} aria-hidden />
          </Link>
          <span className={ig.igTopBarTitle}>Моя страница</span>
          <span className={ig.igTopBarRightPad} aria-hidden />
        </div>
        <div className={ig.igError}>
          <p>{error}</p>
          <button type="button" onClick={() => void loadProfile()} className={ig.igErrorLink}>
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
    <div className={profileRootCn} data-profile-root>
      <div className={ig.igTopBar}>
        <Link to="/dashboard" className={ig.igTopBarIconBtn} aria-label="На главную" title="На главную">
          <LuChevronLeft className="h-6 w-6" strokeWidth={2.25} aria-hidden />
        </Link>
        <span className={ig.igTopBarTitle}>Моя страница</span>
        <div className="flex shrink-0 items-center gap-0.5 pr-0.5">
          <Link
            to={publicFeedLink}
            className={ig.igTopBarIconBtn}
            aria-label="Открыть ленту профиля"
            title="Лента профиля"
          >
            <LuLayoutGrid className="h-5 w-5" strokeWidth={2} aria-hidden />
          </Link>
          <Link to="/settings" className={ig.igTopBarIconBtn} aria-label="Настройки приложения" title="Настройки">
            <LuSettings className="h-5 w-5" strokeWidth={2} aria-hidden />
          </Link>
        </div>
      </div>

      <header className={ig.igHeader}>
        <div className={ig.igHeaderInner}>
          <div className={ig.igProfileMainRow}>
            <div className={ig.igAvatarBlock}>
              <div className={ig.igAvatarRing}>
                <div className={ig.igAvatar}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" />
                  ) : (
                    <div className={ig.igAvatarPh}>
                      <LuUser className={ig.igAvatarPhIcon} strokeWidth={1.25} aria-hidden />
                    </div>
                  )}
                </div>
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className={ig.igHiddenFile}
                disabled={avatarUploading}
                onChange={(e) => void onPickAvatar(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                className={ig.igAvatarCam}
                aria-label="Загрузить фото профиля"
                disabled={avatarUploading}
                onClick={() => avatarInputRef.current?.click()}
              >
                <LuCamera className="h-5 w-5" strokeWidth={2} aria-hidden />
              </button>
            </div>

            <div className={ig.igProfileRight}>
              <h1 className={ig.igDisplayNameTitle}>{name}</h1>
              {headerHandleLine ? <p className={ig.igHandleSub}>{headerHandleLine}</p> : null}

              <div className={ig.igStatColumns} role="group" aria-label="Статистика профиля">
                <div className={ig.igStatCell}>
                  <span className={ig.igStatCellNum}>{postsCount}</span>
                  <span className={ig.igStatCellLabel}>{postsLabel}</span>
                </div>
                <div className={ig.igStatCellMuted}>
                  <span className={ig.igStatCellNum}>0</span>
                  <span className={ig.igStatCellLabel}>подписчики</span>
                </div>
                <div className={ig.igStatCellMuted}>
                  <span className={ig.igStatCellNum}>0</span>
                  <span className={ig.igStatCellLabel}>подписки</span>
                </div>
              </div>

              <p className={ig.igPrivacyInline}>
                <span className={ig.igPrivacyDot} aria-hidden />
                {roleLabel(user?.app_role ?? 'member')}
                {joinedLabel ? ` · ${joinedLabel}` : null}
              </p>
            </div>
          </div>

          {avatarUploading && (
            <p className="mt-2 text-xs font-semibold text-[color:var(--profile-text-muted)] animate-pulse">
              Загружаем фото…
            </p>
          )}

          <div className={ig.igBioSection}>
            <div className={ig.igBioBlock}>
              {publicLoading ? (
                <p className={ig.igBioEmpty}>Загружаем описание…</p>
              ) : publicDraft.bio.trim() ? (
                <>
                  <span className={ig.igBioLabel}>О себе в ленте</span>
                  <p className={ig.igBioText}>{publicDraft.bio.trim()}</p>
                </>
              ) : (
                <>
                  <span className={ig.igBioLabel}>О себе в ленте</span>
                  <p className={ig.igBioEmpty}>
                    Добавьте текст ниже в блоке «Публичная страница» — так вас увидят в ленте.
                  </p>
                </>
              )}
            </div>
          </div>

          <div className={ig.igPrimaryActions}>
            <Link to={publicFeedLink} className={ig.igBtnEditProfile}>
              Открыть ленту профиля
            </Link>
            <div className={ig.igActions}>
              {messengerWebOrigin ? (
                <a href={`${messengerWebOrigin}/messenger`} className={ig.igBtnSecondary}>
                  <LuSend className="h-4 w-4 -rotate-12" aria-hidden />
                  Сообщение
                </a>
              ) : (
                <Link to="/messenger" className={ig.igBtnSecondary}>
                  <LuSend className="h-4 w-4 -rotate-12" aria-hidden />
                  Сообщение
                </Link>
              )}
              <button type="button" className={ig.igBtnSecondary} onClick={() => void logout()}>
                <LuLogOut className="h-4 w-4" aria-hidden />
                Выйти
              </button>
            </div>
          </div>

          {msg && (
            <p
              className={`mt-3 text-center text-sm font-semibold sm:text-left ${msg.kind === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}
            >
              {msg.text}
            </p>
          )}
        </div>
      </header>

      {/* ── Все секции настроек (как список под шапкой профиля) ── */}
      <div className={ig.igFeedSection}>
        <div className="mx-auto flex max-w-xl flex-col gap-5 px-4 pb-10 pt-1 sm:gap-6 sm:px-5">

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

        <section className={CARD}>
          <p className={LABEL}>Уведомления</p>
          <div className="mt-3">
            <PushSettings />
          </div>
        </section>

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
                label="День и месяц рождения"
                value={formatBirthDateDisplay(user?.birth_date) || '—'}
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
                <BirthDayMonthFields
                  value={draft.birth_date}
                  onChange={(apiYmd) => setDraft((d) => ({ ...d, birth_date: apiYmd }))}
                  labelClassName={LABEL}
                  selectClassName={INPUT}
                />
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

        {canViewSermonHistory ? (
          <section className={CARD}>
            <p className={LABEL}>История проповедей</p>
            <div className="mt-4">
              {sermonHistoryLoading ? (
                <div className="space-y-3">
                  <div className="h-14 animate-pulse rounded-2xl bg-[color:var(--profile-media-placeholder-mid)]" />
                  <div className="h-14 animate-pulse rounded-2xl bg-[color:var(--profile-media-placeholder-mid)]" />
                </div>
              ) : sermonHistoryError ? (
                <p className="text-sm font-semibold text-red-600">{sermonHistoryError}</p>
              ) : sermonHistory.length === 0 ? (
                <p className="text-sm font-semibold text-[color:var(--profile-text-muted)]">Пока пусто.</p>
              ) : (
                <div className="space-y-2">
                  {sermonHistory.map((row) => (
                    <div key={row.service_plan_id} className="rounded-2xl bg-[color:color-mix(in_srgb,var(--profile-card-bg)_72%,var(--profile-surface))] p-4 ring-1 ring-[color:var(--profile-card-ring)]">
                      <p className="text-sm font-extrabold text-[color:var(--profile-text-heading)]">{row.topic}</p>
                      <p className="mt-1 text-xs font-semibold text-[color:var(--profile-text-muted)]">Писание: {row.scripture}</p>
                      <p className="mt-1 text-xs font-semibold text-[color:var(--profile-text-muted)]">
                        {new Date(`${row.service_date}T12:00:00`).toLocaleDateString('ru-RU')} •
                        {' '}оценок: {row.ratings_count} • средняя: {row.avg_rating == null ? '—' : row.avg_rating.toFixed(2)}
                      </p>
                      <Link
                        to={`/service-plan/sermon-comments/${row.share_token}`}
                        className="mt-2 inline-flex text-xs font-bold text-[color:var(--profile-primary)] hover:underline"
                      >
                        Открыть комментарии
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {/* Version stamp */}
        <p className="text-center text-[11px] font-semibold text-[color:var(--profile-text-faint)]">
          Версия: {__WEB_REACT_BUILD_STAMP__}
        </p>
        </div>
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
