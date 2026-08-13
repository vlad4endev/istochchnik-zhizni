import { useMutation, useQuery, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import {
  LuArrowLeftRight,
  LuCalendarDays,
  LuCheck,
  LuChevronDown,
  LuEllipsis,
  LuHeart,
  LuHistory,
  LuPhone,
  LuSend,
  LuShield,
  LuSparkles,
  LuTrash2,
  LuUser,
  LuX,
} from 'react-icons/lu';

import { BirthDayMonthFields } from '@/components/BirthDayMonthFields';
import { memberRosterName, splitMemberNameParts } from '../../lib/memberRosterName';
import { parseBirthDayMonthFromApi } from '../../lib/birthDate';
import { apiErrorMessage, addAdminPrayerRequestHistory, type MinistryDirectionTemplate } from './api';
import { MemberAppRolesPicker } from './MemberAppRolesPicker';
import { displayMemberAppRoles, formatMemberPhone } from './memberListQuery';
import { fetchPrayerRequestHistory, type PrayerHistoryItem } from '../profile/api';
import { APP_ROLE_IDS, appRoleLabel } from '../settings/sectionVisibilityApi';
import type { AppUser } from './types';

export type MemberEditForm = {
  first_name: string;
  last_name: string;
  phone_number: string;
  telegram_chat_id: string;
  birth_date: string;
  ministry_role: string;
  ministry_direction: string;
  prayer_request: string;
  is_active: boolean;
  in_prayer_cycle: boolean;
};

type SheetTab = 'profile' | 'ministry' | 'access' | 'prayer' | 'more';

const TABS: ReadonlyArray<{ id: SheetTab; label: string; Icon: typeof LuUser }> = [
  { id: 'profile', label: 'Профиль', Icon: LuUser },
  { id: 'ministry', label: 'Служение', Icon: LuSparkles },
  { id: 'access', label: 'Доступ', Icon: LuShield },
  { id: 'prayer', label: 'Молитва', Icon: LuHeart },
  { id: 'more', label: 'Ещё', Icon: LuEllipsis },
];

const inputClass =
  'w-full min-h-[48px] rounded-2xl border border-stone-200/90 bg-white px-4 text-base text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-primary focus:ring-4 focus:ring-primary/15 sm:min-h-[44px] sm:text-sm';

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

function directionArray(value: string): string[] {
  return roleArray(value);
}

function memberInitials(u: AppUser): string {
  const { first, last } = splitMemberNameParts(u);
  const initials = `${(first || '').trim().charAt(0)}${(last || '').trim().charAt(0)}`.toUpperCase();
  return initials || '??';
}

function memberAvatarColors(name: string): { bg: string; fg: string } {
  const PALETTES = [
    { bg: '#F3EEF0', fg: '#7B2D3F' },
    { bg: '#EEF5F1', fg: '#1F6B42' },
    { bg: '#EEF2FA', fg: '#2D4E8F' },
    { bg: '#FBF3E8', fg: '#8A5B1C' },
    { bg: '#F2EEF5', fg: '#5E2D8F' },
    { bg: '#EEF6F6', fg: '#1C6B6B' },
  ] as const;
  const code = (name || '').trim().toUpperCase().charCodeAt(0) || 0;
  return PALETTES[code % PALETTES.length]!;
}

function appRoleBadgeClass(role: string): string {
  if (role === 'admin') return 'rounded-full bg-primary/12 px-2.5 py-0.5 text-[11px] font-bold text-primary';
  if (role === 'parishioner') return 'rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-800';
  if (role === 'pastor') return 'rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-900';
  if (role === 'minister') return 'rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900';
  if (role === 'editor') return 'rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-semibold text-violet-800';
  if (role === 'musician') return 'rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-semibold text-sky-900';
  return 'rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-semibold text-stone-600';
}

function birthLabel(apiYmd: string): string | null {
  const { day, month } = parseBirthDayMonthFromApi(apiYmd);
  if (!day || !month) return null;
  const d = Number(day);
  const m = Number(month);
  if (!Number.isFinite(d) || !Number.isFinite(m)) return null;
  try {
    return format(new Date(2000, m - 1, d, 12, 0, 0, 0), 'd MMMM', { locale: ru });
  } catch {
    return `${day}.${month}`;
  }
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function toggleValue(current: string[], value: string, checked: boolean): string {
  const next = checked ? Array.from(new Set([...current, value])) : current.filter((x) => x !== value);
  return normalizeMinistryRoles(next.join(', '));
}

function SectionCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[22px] bg-white p-4 shadow-sm ring-1 ring-stone-200/80 sm:p-5 ${className}`}>{children}</div>
  );
}

function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-3">
      <h4 className="text-[13px] font-extrabold tracking-tight text-stone-900 sm:text-sm">{children}</h4>
      {hint ? <p className="mt-0.5 text-[12px] leading-snug text-stone-500">{hint}</p> : null}
    </div>
  );
}

function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex min-h-[56px] cursor-pointer items-center justify-between gap-3 px-1 py-2">
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold leading-snug text-stone-900 sm:text-sm">{label}</span>
        {hint ? <span className="mt-0.5 block text-[12px] leading-snug text-stone-500">{hint}</span> : null}
      </span>
      <span className="relative inline-flex h-7 w-12 shrink-0 items-center">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="h-7 w-12 rounded-full bg-stone-200 transition-colors peer-checked:bg-primary" />
        <span className="absolute left-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

function ChipButton({
  selected,
  children,
  onClick,
}: {
  selected: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex min-h-[44px] items-center rounded-full border px-3.5 text-[13px] font-semibold transition',
        selected
          ? 'border-primary bg-primary text-white shadow-sm shadow-primary/20'
          : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50',
      ].join(' ')}
    >
      {selected ? <LuCheck className="mr-1.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden /> : null}
      {children}
    </button>
  );
}

export function AdminMemberEditSheet({
  editing,
  editForm,
  setEditForm,
  titleId,
  dirs,
  roleOptionsForDirection,
  savePending,
  deletePending,
  swapPending,
  resetPasswordPending,
  oneTimePending,
  roleMut,
  onClose,
  onSave,
  onDelete,
  onSwapNames,
  onResetPassword,
  onClearBanner,
  onToggleCollectionCoordinator,
  onAssignOneTimeDate,
}: {
  editing: AppUser;
  editForm: MemberEditForm;
  setEditForm: Dispatch<SetStateAction<MemberEditForm>>;
  titleId: string;
  dirs: MinistryDirectionTemplate[];
  roleOptionsForDirection: (directionTitle: string) => string[];
  savePending: boolean;
  deletePending: boolean;
  swapPending: boolean;
  resetPasswordPending: boolean;
  oneTimePending: boolean;
  roleMut: UseMutationResult<
    AppUser,
    unknown,
    {
      id: number;
      roles: Array<(typeof APP_ROLE_IDS)[number]>;
    },
    unknown
  >;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
  onSwapNames: () => void;
  onResetPassword: () => void;
  onClearBanner: () => void;
  onToggleCollectionCoordinator: () => void;
  onAssignOneTimeDate: (date: string) => Promise<void> | void;
}) {
  const [tab, setTab] = useState<SheetTab>('profile');
  const [copied, setCopied] = useState<'phone' | 'telegram' | null>(null);
  const [oneTimeDate, setOneTimeDate] = useState('');
  const displayName = memberRosterName(editing);
  const avatar = memberAvatarColors(displayName);
  const phonePretty = formatMemberPhone(editForm.phone_number);
  const birthday = birthLabel(editForm.birth_date);
  const selectedDirs = directionArray(editForm.ministry_direction);
  const selectedRoles = roleArray(editForm.ministry_role);
  const ministryRoleOptions = roleOptionsForDirection(editForm.ministry_direction);

  useEffect(() => {
    setTab('profile');
    setCopied(null);
    setOneTimeDate('');
  }, [editing.id]);

  async function handleCopy(kind: 'phone' | 'telegram', value: string) {
    if (!value.trim()) return;
    const ok = await copyText(value.trim());
    if (!ok) return;
    setCopied(kind);
    window.setTimeout(() => setCopied((prev) => (prev === kind ? null : prev)), 1600);
  }

  const loginStatus = editing.password_reset_required
    ? { tone: 'amber' as const, text: 'Нужно задать новый пароль' }
    : editing.has_registered
      ? { tone: 'emerald' as const, text: 'Пароль создан, вход доступен' }
      : { tone: 'stone' as const, text: 'Вход в приложение ещё не оформлен' };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-stretch justify-center bg-black/50 p-0 backdrop-blur-[2px] lg:items-center lg:p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="member-sheet user-modal flex h-[100dvh] w-full max-w-3xl flex-col overflow-hidden bg-[#F6F4F2] shadow-2xl lg:h-auto lg:max-h-[min(92dvh,880px)] lg:rounded-[28px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header
          className="relative shrink-0 border-b border-stone-200/70 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] lg:px-6 lg:pt-5"
          style={{ background: `linear-gradient(180deg, ${avatar.bg} 0%, #F6F4F2 100%)` }}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-[max(10px,env(safe-area-inset-top))] flex h-11 w-11 items-center justify-center rounded-full bg-white/80 text-stone-600 shadow-sm ring-1 ring-stone-200/80 backdrop-blur-sm transition hover:bg-white hover:text-stone-900 lg:right-5 lg:top-4"
            aria-label="Закрыть карточку"
            title="Закрыть"
          >
            <LuX className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>

          <div className="flex items-start gap-3.5 pr-12 sm:gap-4">
            <div
              className="flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-[22px] text-xl font-bold shadow-sm sm:h-20 sm:w-20 sm:text-2xl"
              style={{ backgroundColor: avatar.bg, color: avatar.fg }}
            >
              {memberInitials(editing)}
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-stone-500">Карточка участника</p>
              <h3 id={titleId} className="mt-0.5 truncate text-[22px] font-extrabold leading-tight tracking-tight text-stone-900 sm:text-[26px]">
                {displayName}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span
                  className={
                    editing.has_registered
                      ? 'inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800'
                      : 'inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900'
                  }
                >
                  {editing.has_registered ? 'В приложении' : 'Нет входа'}
                </span>
                {displayMemberAppRoles(editing).map((role) => (
                  <span key={role} className={appRoleBadgeClass(role)}>
                    {appRoleLabel(role)}
                  </span>
                ))}
                <span
                  className={
                    editForm.is_active
                      ? 'rounded-full bg-teal-100 px-2.5 py-1 text-[11px] font-semibold text-teal-800'
                      : 'rounded-full bg-stone-200 px-2.5 py-1 text-[11px] font-semibold text-stone-600'
                  }
                >
                  {editForm.is_active ? 'Активен' : 'Неактивен'}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {editForm.phone_number.trim() ? (
              <button
                type="button"
                onClick={() => void handleCopy('phone', editForm.phone_number)}
                className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full bg-white/80 px-3 text-[12px] font-semibold text-stone-700 ring-1 ring-stone-200/80"
                title="Скопировать телефон"
              >
                {copied === 'phone' ? <LuCheck className="h-3.5 w-3.5 text-emerald-600" /> : <LuPhone className="h-3.5 w-3.5 text-stone-400" />}
                {copied === 'phone' ? 'Скопировано' : phonePretty}
              </button>
            ) : null}
            {editForm.telegram_chat_id.trim() ? (
              <button
                type="button"
                onClick={() => void handleCopy('telegram', editForm.telegram_chat_id)}
                className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full bg-white/80 px-3 text-[12px] font-semibold text-stone-700 ring-1 ring-stone-200/80"
                title="Скопировать Telegram ID"
              >
                {copied === 'telegram' ? <LuCheck className="h-3.5 w-3.5 text-emerald-600" /> : <LuSend className="h-3.5 w-3.5 text-stone-400" />}
                {copied === 'telegram' ? 'Скопировано' : editForm.telegram_chat_id.trim()}
              </button>
            ) : null}
            {birthday ? (
              <span className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full bg-white/80 px-3 text-[12px] font-semibold text-stone-700 ring-1 ring-stone-200/80">
                <LuCalendarDays className="h-3.5 w-3.5 text-stone-400" />
                {birthday}
              </span>
            ) : null}
          </div>

          <nav
            className="mt-3.5 flex gap-1 overflow-x-auto rounded-2xl bg-white/70 p-1 ring-1 ring-stone-200/70 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="Разделы карточки"
          >
            {TABS.map(({ id, label, Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  aria-current={active ? 'page' : undefined}
                  className={[
                    'inline-flex min-h-[42px] min-w-[4.6rem] flex-1 items-center justify-center gap-1.5 rounded-xl px-2.5 text-[12px] font-bold transition sm:min-w-0 sm:px-3 sm:text-[13px]',
                    active ? 'bg-stone-900 text-white shadow-sm' : 'text-stone-500 hover:bg-white hover:text-stone-800',
                  ].join(' ')}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" strokeWidth={2.2} aria-hidden />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>
        </header>

        <div className="member-sheet__body min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6">
          {tab === 'profile' ? (
            <div className="space-y-3">
              <SectionCard>
                <SectionTitle hint="Имя в списках и молитвенном цикле">Личные данные</SectionTitle>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-semibold text-stone-500">Фамилия</span>
                    <input
                      className={inputClass}
                      autoComplete="family-name"
                      value={editForm.last_name}
                      onChange={(e) => setEditForm((s) => ({ ...s, last_name: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-semibold text-stone-500">Имя</span>
                    <input
                      className={inputClass}
                      autoComplete="given-name"
                      value={editForm.first_name}
                      onChange={(e) => setEditForm((s) => ({ ...s, first_name: e.target.value }))}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-stone-50 px-3 text-[13px] font-semibold text-stone-700 transition hover:bg-stone-100 sm:w-auto sm:px-4"
                  disabled={swapPending}
                  onClick={() => {
                    if (
                      !window.confirm(
                        'Поменять в базе местами поля «имя» и «фамилия» у этого пользователя? Используйте, если данные оказались в неправильных колонках.',
                      )
                    ) {
                      return;
                    }
                    onClearBanner();
                    onSwapNames();
                  }}
                >
                  <LuArrowLeftRight className="h-4 w-4" strokeWidth={2} aria-hidden />
                  {swapPending ? 'Меняем…' : 'Поменять имя и фамилию'}
                </button>
              </SectionCard>

              <SectionCard>
                <SectionTitle hint="Телефон — логин для входа в приложение">Контакты</SectionTitle>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-semibold text-stone-500">Телефон</span>
                    <input
                      className={inputClass}
                      inputMode="tel"
                      autoComplete="tel"
                      value={editForm.phone_number}
                      onChange={(e) => setEditForm((s) => ({ ...s, phone_number: e.target.value }))}
                      placeholder="+7 900 123-45-67"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-semibold text-stone-500">Telegram ID</span>
                    <input
                      className={inputClass}
                      inputMode="numeric"
                      value={editForm.telegram_chat_id}
                      onChange={(e) => setEditForm((s) => ({ ...s, telegram_chat_id: e.target.value }))}
                      placeholder="123456789"
                    />
                  </label>
                </div>
                {editing.telegram_delivery_blocked ? (
                  <p className="mt-3 rounded-2xl bg-red-50 px-3.5 py-2.5 text-[13px] font-semibold leading-snug text-red-800">
                    Telegram недоступен для рассылок
                    {editing.telegram_delivery_block_reason ? `: ${editing.telegram_delivery_block_reason}` : ''}
                  </p>
                ) : null}
                <div className="mt-3">
                  <BirthDayMonthFields
                    value={editForm.birth_date}
                    onChange={(apiYmd) => setEditForm((s) => ({ ...s, birth_date: apiYmd }))}
                    labelClassName="mb-1.5 block text-[12px] font-semibold text-stone-500"
                    selectClassName={inputClass}
                  />
                </div>
              </SectionCard>
            </div>
          ) : null}

          {tab === 'ministry' ? (
            <div className="space-y-3">
              <SectionCard>
                <div className="flex items-start justify-between gap-2">
                  <SectionTitle hint="Можно выбрать несколько направлений">Направления</SectionTitle>
                  <div className="mt-0.5 flex shrink-0 gap-2">
                    <button
                      type="button"
                      className="text-[12px] font-bold text-primary"
                      onClick={() =>
                        setEditForm((s) => ({
                          ...s,
                          ministry_direction: normalizeMinistryRoles(dirs.map((d) => d.title).join(', ')),
                        }))
                      }
                    >
                      Все
                    </button>
                    <button
                      type="button"
                      className="text-[12px] font-bold text-stone-400"
                      onClick={() => setEditForm((s) => ({ ...s, ministry_direction: '' }))}
                    >
                      Сбросить
                    </button>
                  </div>
                </div>
                {dirs.length === 0 ? (
                  <p className="text-[13px] text-stone-500">Сначала добавьте направления в шаблонах служения.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {dirs.map((d) => (
                      <ChipButton
                        key={d.id}
                        selected={selectedDirs.includes(d.title)}
                        onClick={() =>
                          setEditForm((s) => ({
                            ...s,
                            ministry_direction: toggleValue(
                              directionArray(s.ministry_direction),
                              d.title,
                              !directionArray(s.ministry_direction).includes(d.title),
                            ),
                          }))
                        }
                      >
                        {d.title}
                      </ChipButton>
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard>
                <div className="flex items-start justify-between gap-2">
                  <SectionTitle hint="Роли зависят от выбранных направлений">Роли служения</SectionTitle>
                  <div className="mt-0.5 flex shrink-0 gap-2">
                    <button
                      type="button"
                      className="text-[12px] font-bold text-primary"
                      onClick={() =>
                        setEditForm((s) => ({
                          ...s,
                          ministry_role: normalizeMinistryRoles(roleOptionsForDirection(s.ministry_direction).join(', ')),
                        }))
                      }
                    >
                      Все
                    </button>
                    <button
                      type="button"
                      className="text-[12px] font-bold text-stone-400"
                      onClick={() => setEditForm((s) => ({ ...s, ministry_role: '' }))}
                    >
                      Сбросить
                    </button>
                  </div>
                </div>
                {ministryRoleOptions.length === 0 ? (
                  <p className="text-[13px] text-stone-500">Нет ролей для выбранного направления.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {ministryRoleOptions.map((role) => (
                      <ChipButton
                        key={role}
                        selected={selectedRoles.includes(role)}
                        onClick={() =>
                          setEditForm((s) => ({
                            ...s,
                            ministry_role: toggleValue(roleArray(s.ministry_role), role, !roleArray(s.ministry_role).includes(role)),
                          }))
                        }
                      >
                        {role}
                      </ChipButton>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>
          ) : null}

          {tab === 'access' ? (
            <div className="space-y-3">
              <SectionCard>
                <MemberAppRolesPicker editing={editing} roleMut={roleMut} onBannerClear={onClearBanner} />
              </SectionCard>

              <SectionCard className="divide-y divide-stone-100 !p-2 sm:!px-4">
                <SwitchRow
                  label="Активен"
                  hint="Может войти в приложение"
                  checked={editForm.is_active}
                  onChange={(is_active) => setEditForm((s) => ({ ...s, is_active }))}
                />
                <SwitchRow
                  label="В молитвенном цикле"
                  hint="Участвует в общей очереди по дням"
                  checked={editForm.in_prayer_cycle}
                  onChange={(in_prayer_cycle) => setEditForm((s) => ({ ...s, in_prayer_cycle }))}
                />
              </SectionCard>

              <SectionCard>
                <SectionTitle>Вход в приложение</SectionTitle>
                <div className="flex items-start gap-3 rounded-2xl bg-stone-50 px-3.5 py-3">
                  <span
                    className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                      loginStatus.tone === 'emerald'
                        ? 'bg-emerald-500'
                        : loginStatus.tone === 'amber'
                          ? 'bg-amber-500'
                          : 'bg-stone-400'
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-stone-900">{loginStatus.text}</p>
                    <p className="mt-0.5 break-all text-[12px] text-stone-500">
                      Логин: {editForm.phone_number.trim() || '—'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-2xl border border-stone-200 bg-white px-4 text-[13px] font-semibold text-stone-700 transition hover:bg-stone-50 sm:w-auto"
                  disabled={resetPasswordPending}
                  onClick={() => {
                    if (!window.confirm('Сбросить пароль пользователя? При следующем входе он задаст новый пароль.')) {
                      return;
                    }
                    onClearBanner();
                    onResetPassword();
                  }}
                >
                  {resetPasswordPending ? 'Сбрасываем…' : 'Сбросить пароль'}
                </button>
              </SectionCard>
            </div>
          ) : null}

          {tab === 'prayer' ? (
            <div className="space-y-3">
              <SectionCard>
                <SectionTitle hint="Текущая нужда сохранится вместе с карточкой">Молитвенная нужда</SectionTitle>
                <textarea
                  className={`${inputClass} min-h-[140px] resize-y py-3 leading-relaxed`}
                  value={editForm.prayer_request}
                  onChange={(e) => setEditForm((s) => ({ ...s, prayer_request: e.target.value }))}
                  placeholder="Текст молитвенной нужды…"
                />
              </SectionCard>
              <AdminPrayerHistory memberId={editing.id} defaultOpen />
            </div>
          ) : null}

          {tab === 'more' ? (
            <div className="space-y-3">
              <SectionCard>
                <SectionTitle hint="Назначение на один день без сдвига общего расписания">
                  Разовая дата в цикле
                </SectionTitle>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="date"
                    className={inputClass}
                    value={oneTimeDate}
                    onChange={(e) => setOneTimeDate(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={!oneTimeDate || oneTimePending}
                    onClick={() => {
                      onClearBanner();
                      void Promise.resolve(onAssignOneTimeDate(oneTimeDate)).then(
                        () => setOneTimeDate(''),
                        () => undefined,
                      );
                    }}
                    className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-primary px-4 text-[14px] font-bold text-white shadow-md shadow-primary/20 disabled:opacity-50 sm:min-h-[44px] sm:shrink-0"
                  >
                    {oneTimePending ? 'Сохранение…' : 'Назначить'}
                  </button>
                </div>
              </SectionCard>

              <SectionCard className="!p-2 sm:!px-4">
                <SwitchRow
                  label="Ответственный за сбор"
                  hint="Координатор сбора пожертвований"
                  checked={Boolean(editing.is_collection_coordinator)}
                  onChange={() => {
                    onClearBanner();
                    onToggleCollectionCoordinator();
                  }}
                />
              </SectionCard>

              <div className="rounded-[22px] bg-red-50/70 p-4 ring-1 ring-red-100 sm:p-5">
                <h4 className="text-[13px] font-extrabold text-red-900">Удаление</h4>
                <p className="mt-1 text-[12px] leading-snug text-red-800/80">
                  Карточка исчезнет из списков. Это действие нельзя отменить.
                </p>
                <button
                  type="button"
                  className="mt-3 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white px-4 text-[14px] font-bold text-red-700 transition hover:bg-red-50 sm:w-auto"
                  disabled={deletePending}
                  onClick={() => {
                    if (!window.confirm(`Удалить ${displayName}?`)) return;
                    onClearBanner();
                    onDelete();
                  }}
                >
                  <LuTrash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                  {deletePending ? 'Удаление…' : 'Удалить пользователя'}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <footer className="member-sheet__footer shrink-0 border-t border-stone-200/80 bg-white/95 px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] backdrop-blur-sm lg:px-6 lg:py-4">
          <div className="flex flex-col gap-2 lg:flex-row-reverse">
            <button
              type="button"
              className="inline-flex min-h-[50px] w-full items-center justify-center rounded-2xl bg-primary px-5 text-[15px] font-extrabold text-white shadow-lg shadow-primary/25 transition hover:opacity-95 disabled:opacity-50 sm:min-h-[46px] sm:w-auto sm:min-w-[9.5rem]"
              disabled={savePending}
              onClick={() => {
                onClearBanner();
                onSave();
              }}
            >
              {savePending ? 'Сохранение…' : 'Сохранить'}
            </button>
            <button
              type="button"
              className="inline-flex min-h-[46px] w-full items-center justify-center rounded-2xl border border-stone-200 bg-white px-5 text-[14px] font-semibold text-stone-700 transition hover:bg-stone-50 sm:w-auto"
              onClick={onClose}
            >
              Отмена
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function AdminPrayerHistory({ memberId, defaultOpen = false }: { memberId: number; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [manualText, setManualText] = useState('');
  const [cycleInput, setCycleInput] = useState('');
  const qc = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: ['admin', 'prayer-history', memberId],
    queryFn: () => fetchPrayerRequestHistory(memberId, 30),
    enabled: open,
    staleTime: 30_000,
  });

  const addHistoryMut = useMutation({
    mutationFn: () => {
      const trimmed = manualText.trim();
      if (!trimmed) {
        return Promise.reject(new Error('Укажите текст нужды'));
      }
      const cycleTrim = cycleInput.trim();
      let cycle_number: number | undefined;
      if (cycleTrim !== '') {
        const n = Number.parseInt(cycleTrim, 10);
        if (!Number.isFinite(n) || n < 1) {
          return Promise.reject(new Error('Номер цикла — целое число от 1'));
        }
        cycle_number = n;
      }
      return addAdminPrayerRequestHistory(memberId, { prayer_request: trimmed, cycle_number });
    },
    onSuccess: async () => {
      setManualText('');
      setCycleInput('');
      await qc.invalidateQueries({ queryKey: ['admin', 'prayer-history', memberId] });
    },
  });

  return (
    <section className="rounded-[22px] bg-white p-2 shadow-sm ring-1 ring-stone-200/80 sm:p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[48px] w-full items-center gap-2 rounded-xl px-2.5 text-left text-[14px] font-bold text-stone-700 transition-colors hover:bg-stone-50"
      >
        <LuHistory className="h-4 w-4 shrink-0 text-primary/70" strokeWidth={2} aria-hidden />
        <span className="flex-1">История молитвенных нужд</span>
        <LuChevronDown
          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          strokeWidth={2}
          aria-hidden
        />
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <div className="px-2 pb-2 pt-1">
            <div className="mb-4 rounded-2xl border border-dashed border-primary/30 bg-primary/[0.04] p-3">
              <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-stone-500">
                Добавить запись вручную
              </p>
              <label className="block">
                <span className="sr-only">Текст молитвенной нужды</span>
                <textarea
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  rows={3}
                  maxLength={8000}
                  placeholder="Текст нужды…"
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[15px] text-stone-800 outline-none ring-primary/15 focus:border-primary focus:ring-1 sm:text-[13px]"
                />
              </label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="block min-w-0 sm:max-w-[11rem]">
                  <span className="mb-0.5 block text-[11px] font-semibold text-stone-500">№ цикла (необязательно)</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={cycleInput}
                    onChange={(e) => setCycleInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="Как в списке: 5"
                    className="w-full min-h-[44px] rounded-xl border border-stone-200 bg-white px-2.5 text-[15px] text-stone-800 outline-none focus:border-primary focus:ring-1 sm:text-[13px]"
                  />
                </label>
                <button
                  type="button"
                  disabled={addHistoryMut.isPending || !manualText.trim()}
                  onClick={() => void addHistoryMut.mutateAsync()}
                  className="min-h-[44px] shrink-0 rounded-xl bg-primary px-4 text-[13px] font-bold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {addHistoryMut.isPending ? 'Сохранение…' : 'Добавить в историю'}
                </button>
              </div>
              {addHistoryMut.isError ? (
                <p className="mt-2 text-[12px] text-red-600">
                  {apiErrorMessage(
                    addHistoryMut.error,
                    addHistoryMut.error instanceof Error ? addHistoryMut.error.message : 'Ошибка',
                  )}
                </p>
              ) : null}
            </div>

            {isPending ? (
              <div className="space-y-3 py-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex animate-pulse gap-3">
                    <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-stone-200" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-28 rounded bg-stone-100" />
                      <div className="h-3 w-full rounded bg-stone-100" />
                    </div>
                  </div>
                ))}
              </div>
            ) : data && data.length > 0 ? (
              <div className="space-y-0">
                {data.map((item, idx) => (
                  <AdminPrayerHistoryRow key={item.id} item={item} isLast={idx === data.length - 1} />
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-[13px] italic text-stone-400">Пока нет записей</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function AdminPrayerHistoryRow({ item, isLast }: { item: PrayerHistoryItem; isLast: boolean }) {
  const prayedDate = item.prayed_on_date ? formatAdminDate(item.prayed_on_date) : null;
  const createdDate = formatAdminDate(item.created_at);

  return (
    <div className={`relative flex gap-3 py-2.5 ${!isLast ? 'border-b border-stone-100' : ''}`}>
      <div className="flex flex-col items-center pt-1.5">
        <div className="h-2 w-2 shrink-0 rounded-full bg-primary/40" />
        {!isLast ? <div className="mt-1 w-px flex-1 bg-stone-100" /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {prayedDate ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-primary">
              <LuCalendarDays className="h-3 w-3" aria-hidden />
              Цикл {item.cycle_index != null ? item.cycle_index + 1 : '—'} · {prayedDate}
            </span>
          ) : (
            <span className="text-[11px] font-semibold text-stone-400">{createdDate}</span>
          )}
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-snug text-stone-600">{item.prayer_request}</p>
      </div>
    </div>
  );
}

function formatAdminDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    const now = new Date();
    const sameYear = d.getFullYear() === now.getFullYear();
    return format(d, sameYear ? 'd MMM' : 'd MMM yyyy', { locale: ru });
  } catch {
    return dateStr;
  }
}
