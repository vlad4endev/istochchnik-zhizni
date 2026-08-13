import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  type FormEvent,
  type MouseEvent,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react';

import {
  LuCalendarDays,
  LuChevronDown,
  LuGripVertical,
  LuImage,
  LuSearch,
  LuTable2,
  LuX,
} from 'react-icons/lu';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

import {
  ADMIN_SIDEBAR_GROUPS,
  ADMIN_TABS,
  adminTabNavLabel,
  parseAdminTabParam,
  type AdminTabId,
} from '../adminTabs';
import { AccessRequestsSection } from '../AccessRequestsSection';
import { AiAssistantMonitorSection } from '../AiAssistantMonitorSection';
import { AiSettingsSection } from '../AiSettingsSection';
import { AppSectionsAccessSection } from '../AppSectionsAccessSection';
import { RolePermissionsManagerSection } from '../RolePermissionsManagerSection';
import { AdminMemberEditSheet } from '../AdminMemberEditSheet';
import {
  countMembersMatchingRole,
  displayMemberAppRoles,
  filterAdminMembers,
  formatMemberPhone,
  groupMembersByLetter,
  memberHasAppRole,
  memberListQueryIsActive,
  isAppRoleId,
  parseMemberAccountFilter,
  ruPeopleCount,
  uniqueMinistryDirections,
  type MemberAccountFilter,
} from '../memberListQuery';
import { NotificationsSettingsSection } from '../NotificationsSettingsSection';
import { TelegramSettingsSection } from '../TelegramSettingsSection';
import { BackupSettingsSection } from '../BackupSettingsSection';
import { ProjectJournalSection } from '../ProjectJournalSection';
import { DiagnosticsDashboardSection } from '../DiagnosticsDashboardSection';
import { useBrandingStore } from '../../branding/brandingStore';
import {
  anchorPrayerCycleMember,
  apiErrorMessage,
  bulkCreateAdminMembers,
  createAdminMember,
  createAdminEvent,
  createDirectionTemplate,
  createRoleTemplate,
  deleteAdminMember,
  deleteAdminEvent,
  deleteDirectionTemplate,
  deleteRoleTemplate,
  fetchAdminMembers,
  fetchPrayerCycleRoster,
  savePrayerCycleRosterOrder,
  fetchDirectionTemplates,
  fetchAdminEvents,
  fetchChurchEventCategoryOptions,
  uploadChurchEventPoster,
  fetchRoleTemplates,
  fetchSmsSettings,
  mergeDuplicateMembers,
  resetAdminMemberPassword,
  swapAllMembersFirstLastNames,
  patchSmsSettings,
  setDirectionTemplateRoles,
  setMemberAppRoles,
  setOneTimeMemberDate,
  startPrayerCycle,
  updateAdminEvent,
  updateAdminMember,
  type MinistryDirectionTemplate,
  type ChurchEventItem,
  type SmsSettingsResponse,
} from '../api';
import { CHURCH_EVENT_CATEGORY_OPTIONS_FALLBACK } from '../churchEventCategoryOptions';
import { GlobalNeedsSection } from '../GlobalNeedsSection';
import { UserListSkeleton } from '../../../components/skeletons/UserListSkeleton';
import { dateInputValueFromApi } from '../../../lib/dateInputValueFromApi';
import { BirthDayMonthFields } from '@/components/BirthDayMonthFields';
import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { nextOccurrenceLocalYmd } from '../../../lib/weekdayAnchor';
import {
  compareMembersByPrayerCycleOrder,
  memberRosterName,
  splitMemberNameParts,
} from '../../../lib/memberRosterName';
import type { AppUser } from '../types';
import { Link, useSearchParams } from 'react-router-dom';
import { useImpersonation } from '../hooks/useImpersonation';
import { isAppAdministratorSession } from '../../auth/authStore';
import { APP_ROLE_IDS, appRoleLabel } from '../../settings/sectionVisibilityApi';

type UpcomingBirthday = {
  nextDate: Date;
  daysUntil: number;
  /** "12 мая" */
  dateLabel: string;
  /** "через 5 дн." / "сегодня" / "завтра" */
  relativeLabel: string;
};

function nextBirthdayLocal(birthDateYmd: string, now: Date): Date | null {
  // birthDateYmd: "YYYY-MM-DD"
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDateYmd);
  if (!m) return null;
  const month = Number(m[2]); // 1-12
  const day = Number(m[3]); // 1-31
  if (!Number.isFinite(month) || !Number.isFinite(day) || month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Use local noon to reduce DST/timezone edge cases.
  const todayNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  let candidate = new Date(todayNoon.getFullYear(), month - 1, day, 12, 0, 0, 0);

  // If already passed today, move to next year.
  if (candidate.getTime() < todayNoon.getTime()) {
    candidate = new Date(todayNoon.getFullYear() + 1, month - 1, day, 12, 0, 0, 0);
  }

  // Guard invalid dates (e.g. 29 Feb on non-leap year) - JS will roll over to Mar.
  if (candidate.getMonth() !== month - 1 || candidate.getDate() !== day) return null;
  return candidate;
}

function upcomingBirthday(birthDateYmd: string | null | undefined, now: Date, withinDays: number): UpcomingBirthday | null {
  if (!birthDateYmd) return null;
  const next = nextBirthdayLocal(birthDateYmd, now);
  if (!next) return null;

  const todayNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysUntil = Math.round((next.getTime() - todayNoon.getTime()) / msPerDay);
  if (daysUntil < 0 || daysUntil > withinDays) return null;

  const relativeLabel =
    daysUntil === 0 ? 'сегодня' : daysUntil === 1 ? 'завтра' : `через ${daysUntil} дн.`;

  return {
    nextDate: next,
    daysUntil,
    dateLabel: format(next, 'd MMMM', { locale: ru }),
    relativeLabel,
  };
}

function memberIsAdmin(u: AppUser): boolean {
  return memberHasAppRole(u, 'admin');
}

function appRoleBadgeClass(role: string): string {
  const base = 'inline-flex max-w-full shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold';
  if (role === 'admin') {
    return `${base} bg-primary/12 font-bold text-primary`;
  }
  if (role === 'parishioner') {
    return `${base} bg-slate-100 text-slate-800`;
  }
  if (role === 'pastor') {
    return `${base} bg-emerald-100 text-emerald-900`;
  }
  if (role === 'minister') {
    return `${base} bg-amber-100 text-amber-900`;
  }
  if (role === 'editor') {
    return `${base} bg-violet-100 text-violet-800`;
  }
  if (role === 'musician') {
    return `${base} bg-sky-100 text-sky-900`;
  }
  return `${base} bg-stone-100 text-stone-600`;
}

function MemberAppRoleBadges({
  u,
  onSelect,
}: {
  u: AppUser;
  onSelect?: (role: (typeof APP_ROLE_IDS)[number]) => void;
}) {
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-1">
      {displayMemberAppRoles(u).map((role) => {
        const className = appRoleBadgeClass(role);
        if (!onSelect) {
          return (
            <span key={role} className={className}>
              {appRoleLabel(role)}
            </span>
          );
        }
        return (
          <button
            key={role}
            type="button"
            className={className}
            title={`Показать всех с ролью «${appRoleLabel(role)}»`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(role);
            }}
          >
            {appRoleLabel(role)}
          </button>
        );
      })}
    </span>
  );
}

function scrollToMemberLetter(letter: string) {
  const nodes = document.querySelectorAll(`[data-member-letter="${letter}"]`);
  for (const node of nodes) {
    if (node instanceof HTMLElement && node.getClientRects().length > 0) {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
  }
}

function MemberListEmptyState({
  filtersActive,
  onReset,
}: {
  filtersActive: boolean;
  onReset: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-200 px-4 py-10 text-center">
      <p className="text-sm font-semibold text-stone-700">
        {filtersActive ? 'Никого не найдено' : 'Список пуст'}
      </p>
      <p className="mt-1 text-sm text-stone-500">
        {filtersActive
          ? 'Попробуйте другое имя, телефон или сбросьте фильтры.'
          : 'Добавьте первого пользователя кнопкой выше.'}
      </p>
      {filtersActive ? (
        <button type="button" className="mt-3 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50" onClick={onReset}>
          Сбросить поиск и фильтры
        </button>
      ) : null}
    </div>
  );
}

const Q_MEMBERS = ['admin', 'members'] as const;
const Q_ROLES = ['admin', 'templates', 'roles'] as const;
const Q_DIRS = ['admin', 'templates', 'directions'] as const;
const Q_EVENTS = ['admin', 'events'] as const;
const Q_EVENT_CATEGORY_OPTIONS = ['admin', 'church-event-category-options'] as const;
const Q_SMS = ['admin', 'sms', 'settings'] as const;
type BulkMemberRow = {
  key: string;
  last_name: string;
  first_name: string;
  phone_number: string;
  birth_date: string;
  ministry_direction: string;
  ministry_role: string;
};

function makeBulkRowKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `bulk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyBulkRow(): BulkMemberRow {
  return {
    key: makeBulkRowKey(),
    last_name: '',
    first_name: '',
    phone_number: '',
    birth_date: '',
    ministry_direction: '',
    ministry_role: '',
  };
}

/** Tab или `;`: фамилия, имя, телефон, дата ГГГГ-ММ-ДД, опц. направление, опц. роль. */
function parseBulkMemberPaste(text: string): Omit<BulkMemberRow, 'key'>[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const rows: Omit<BulkMemberRow, 'key'>[] = [];
  for (const line of lines) {
    const cells = line.includes('\t')
      ? line.split('\t').map((c) => c.trim())
      : line.split(';').map((c) => c.trim());
    if (cells.length < 4) continue;
    const last_name = cells[0] ?? '';
    const first_name = cells[1] ?? '';
    const phone_number = cells[2] ?? '';
    const birthRaw = cells[3] ?? '';
    const ministry_direction = cells[4] ?? '';
    const ministry_role = normalizeMinistryRoles(cells[5] ?? '');
    rows.push({
      last_name,
      first_name,
      phone_number,
      birth_date: birthRaw.slice(0, 10),
      ministry_direction,
      ministry_role,
    });
  }
  return rows;
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

function directionArray(value: string): string[] {
  return roleArray(value);
}

function memberServiceLine(u: AppUser): string {
  return [u.ministry_direction, u.ministry_role].map((x) => (x ?? '').trim()).filter(Boolean).join(' · ');
}

function displayName(u: AppUser): string {
  const f = (u.first_name ?? '').trim();
  const l = (u.last_name ?? '').trim();
  if (f || l) return `${f} ${l}`.trim();
  return u.name.trim() || `#${u.id}`;
}

/**
 * Поля имени в БД могут быть заполнены только через `name` (старые записи).
 * Для формы редактирования раскладываем `name` в имя и фамилию.
 * — 3+ слова: «Фамилия Имя Отчество» (как в сиде).
 * — 2 слова: «Имя Фамилия» (как при создании в админке).
 */
/** Плашка: есть ли у пользователя аккаунт в приложении (пароль в базе). */
function MemberRegistrationBadge({ u }: { u: AppUser }) {
  const ok = Boolean(u.has_registered);
  return (
    <span
      className={
        ok
          ? 'inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800'
          : 'inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900'
      }
      title={
        ok
          ? 'Пароль задан — можно войти в приложение по телефону'
          : 'В списке пользователей, но вход в приложение ещё не оформлен'
      }
    >
      <span className={ok ? 'text-emerald-600' : 'text-amber-700'} aria-hidden>
        {ok ? '●' : '○'}
      </span>
      {ok ? 'В приложении' : 'Нет входа'}
    </span>
  );
}

function splitNameForEditForm(u: AppUser): { first_name: string; last_name: string } {
  const p = splitMemberNameParts(u);
  return { first_name: p.first, last_name: p.last };
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

function birthdayBadge(u: AppUser, now: Date, withinDays: number): UpcomingBirthday | null {
  return upcomingBirthday(u.birth_date, now, withinDays);
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
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseAdminTabParam(searchParams.get('tab'));
  const [showAddUser, setShowAddUser] = useState(false);

  const setTab = (next: AdminTabId) => {
    if (next === 'members') {
      setSearchParams({}, { replace: true });
      return;
    }
    setSearchParams({ tab: next }, { replace: true });
  };

  const meta = ADMIN_TABS.find((t) => t.id === tab)!;

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl px-3 py-3 sm:px-4 sm:py-4 shell:px-6 shell:py-6">
      <div className="min-w-0">
        {/* На узких экранах разделы в основном меню недоступны — компактный переключатель */}
        <label className="mb-3 block lg:hidden">
          <span className="sr-only">Раздел админки</span>
          <select
            value={tab}
            onChange={(e) => setTab(parseAdminTabParam(e.target.value))}
            className="w-full rounded-xl border border-stone-200 bg-[var(--surface-elevated)] px-3 py-2.5 text-sm font-medium text-stone-800 shadow-sm"
          >
            {ADMIN_SIDEBAR_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {adminTabNavLabel(item.id)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-medium tracking-tight text-stone-900">{meta.label}</h2>
            <p className="mt-0.5 truncate text-xs text-stone-500">{meta.description}</p>
          </div>
          {tab === 'members' && (
            <button
              type="button"
              className={btnPrimary('shrink-0 text-xs')}
              onClick={() => setShowAddUser(true)}
            >
              + Добавить пользователя
            </button>
          )}
        </div>

        {tab === 'members' && (
          <MembersSection showAddUser={showAddUser} onAddUserClose={() => setShowAddUser(false)} />
        )}
        {tab === 'requests' && <AccessRequestsSection />}
        {tab === 'calendar' && <CalendarSection />}
        {tab === 'events' && <EventsSection />}
        {tab === 'templates' && <TemplatesSection />}
        {tab === 'project' && <ProjectSection />}
        {tab === 'sections' && <AppSectionsAccessSection />}
        {tab === 'roles' && <RolePermissionsManagerSection />}
        {tab === 'journal' && <ProjectJournalSection />}
        {tab === 'notifications' && <NotificationsSettingsSection />}
        {tab === 'telegram' && <TelegramSettingsSection />}
        {tab === 'backup' && <BackupSettingsSection />}
        {tab === 'diagnostics' && <DiagnosticsDashboardSection />}
        {tab === 'integrations' && <IntegrationsSection />}
      </div>
    </div>
  );
}

function IntegrationsSection() {
  const [searchParams, setSearchParams] = useSearchParams();
  const subFromUrl = searchParams.get('sub');
  const hasAiChat = Boolean(searchParams.get('ai_chat'));
  const initialSub =
    subFromUrl === 'ai' ||
    subFromUrl === 'ai_monitor' ||
    subFromUrl === 'sms' ||
    subFromUrl === 'song_import'
      ? subFromUrl
      : hasAiChat
        ? 'ai_monitor'
        : 'sms';
  const [subTab, setSubTab] = useState<'sms' | 'ai' | 'ai_monitor' | 'song_import'>(initialSub);

  const openSub = (next: 'sms' | 'ai' | 'ai_monitor' | 'song_import') => {
    setSubTab(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'sms') params.delete('sub');
    else params.set('sub', next);
    if (next !== 'ai_monitor') params.delete('ai_chat');
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[10px] bg-stone-100 p-1">
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
          <button
            type="button"
            className={
              subTab === 'sms'
                ? 'flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2.5 text-sm font-medium text-stone-900 shadow'
                : 'flex items-center justify-center gap-2 rounded-lg bg-transparent px-3 py-2.5 text-sm font-medium text-stone-500'
            }
            onClick={() => openSub('sms')}
          >
            <span aria-hidden>💬</span>
            SMS.ru
            <span className="rounded-lg bg-red-100 px-1.5 py-0.5 text-[11px] text-red-600">Не настроено</span>
          </button>
          <button
            type="button"
            className={
              subTab === 'ai'
                ? 'flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2.5 text-sm font-medium text-stone-900 shadow'
                : 'flex items-center justify-center gap-2 rounded-lg bg-transparent px-3 py-2.5 text-sm font-medium text-stone-500'
            }
            onClick={() => openSub('ai')}
          >
            <span aria-hidden>🤖</span>
            ИИ интеграции
            <span className="rounded-lg bg-emerald-100 px-1.5 py-0.5 text-[11px] text-emerald-700">Подключено</span>
          </button>
          <button
            type="button"
            className={
              subTab === 'ai_monitor'
                ? 'flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2.5 text-sm font-medium text-stone-900 shadow'
                : 'flex items-center justify-center gap-2 rounded-lg bg-transparent px-3 py-2.5 text-sm font-medium text-stone-500'
            }
            onClick={() => openSub('ai_monitor')}
          >
            <span aria-hidden>📡</span>
            Мониторинг ИИ
          </button>
          <button
            type="button"
            className={
              subTab === 'song_import'
                ? 'flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2.5 text-sm font-medium text-stone-900 shadow'
                : 'flex items-center justify-center gap-2 rounded-lg bg-transparent px-3 py-2.5 text-sm font-medium text-stone-500'
            }
            onClick={() => openSub('song_import')}
          >
            <span aria-hidden>🎵</span>
            Импорт песен
          </button>
        </div>
      </section>

      {subTab === 'sms' ? (
        <SmsSection />
      ) : subTab === 'ai' ? (
        <AiSettingsSection />
      ) : subTab === 'ai_monitor' ? (
        <AiAssistantMonitorSection />
      ) : (
        <section className="rounded-2xl border border-stone-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-stone-900">Импорт песен</h3>
          <p className="mt-1 text-xs text-stone-500">
            Импорт перенесён в окно добавления песни, чтобы всё было в одном месте.
          </p>
          <Link
            to="/songbook/add"
            className="mt-3 inline-flex min-h-[40px] items-center justify-center rounded-xl bg-stone-900 px-4 text-sm font-semibold text-white hover:bg-stone-800"
          >
            Открыть импорт
          </Link>
        </section>
      )}
    </div>
  );
}

function MembersSection({
  showAddUser,
  onAddUserClose,
}: {
  showAddUser: boolean;
  onAddUserClose: () => void;
}) {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { startImpersonation, canStartImpersonation, isImpersonating } = useImpersonation();
  const showImpersonateButton = canStartImpersonation && isAppAdministratorSession() && !isImpersonating;
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: Q_MEMBERS,
    queryFn: fetchAdminMembers,
  });
  const dirsQ = useQuery({ queryKey: Q_DIRS, queryFn: fetchDirectionTemplates, staleTime: 30_000 });

  const search = searchParams.get('q') ?? '';
  const roleFromUrl = searchParams.get('role') ?? '';
  const roleFilter = isAppRoleId(roleFromUrl) ? roleFromUrl : '';
  const accountFilter = parseMemberAccountFilter(searchParams.get('status'));
  const ministryFilter = searchParams.get('dir') ?? '';
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showBirthdays, setShowBirthdays] = useState(false);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    phone_number: '',
    telegram_chat_id: '',
    birth_date: '',
    ministry_role: '',
    ministry_direction: '',
  });
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [editForm, setEditForm] = useState({
    first_name: '',
    last_name: '',
    phone_number: '',
    telegram_chat_id: '',
    birth_date: '',
    ministry_role: '',
    ministry_direction: '',
    prayer_request: '',
    is_active: true,
    in_prayer_cycle: false,
  });
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [showBulkCreate, setShowBulkCreate] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkMemberRow[]>(() => [
    emptyBulkRow(),
    emptyBulkRow(),
    emptyBulkRow(),
  ]);
  const [bulkMergeDupes, setBulkMergeDupes] = useState(false);
  const [bulkPasteText, setBulkPasteText] = useState('');
  const memberEditTitleId = useId();

  useEffect(() => {
    if (!editing) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditing(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [editing]);

  const invalidate = () => void qc.invalidateQueries({ queryKey: Q_MEMBERS });

  const listQuery = useMemo(
    () => ({ search, role: roleFilter, account: accountFilter, ministry: ministryFilter }),
    [search, roleFilter, accountFilter, ministryFilter],
  );
  const filtersActive = memberListQueryIsActive(listQuery);

  const filtered = useMemo(() => {
    const matched = filterAdminMembers(data ?? [], listQuery);
    return [...matched].sort(compareMembersByPrayerCycleOrder);
  }, [data, listQuery]);

  const letterGroups = useMemo(() => groupMembersByLetter(filtered), [filtered]);
  const ministryOptions = useMemo(() => uniqueMinistryDirections(data ?? []), [data]);

  const now = useMemo(() => new Date(), []);
  const upcomingBirthdays = useMemo(() => {
    const list = data ?? [];
    const withinDays = 30;
    const rows = list
      .filter((u) => u.is_active)
      .map((u) => {
        const b = birthdayBadge(u, now, withinDays);
        return b ? { u, b } : null;
      })
      .filter(Boolean) as Array<{ u: AppUser; b: UpcomingBirthday }>;
    rows.sort((a, b) => a.b.daysUntil - b.b.daysUntil || memberRosterName(a.u).localeCompare(memberRosterName(b.u), 'ru'));
    return rows;
  }, [data, now]);

  const dirs = (dirsQ.data ?? []) as MinistryDirectionTemplate[];
  const rolesForDirection = (directionTitlesRaw: string) => {
    const selectedDirs = directionArray(directionTitlesRaw);
    const fromDirection = dirs
      .filter((d) => selectedDirs.includes(d.title))
      .flatMap((d) => (d.roles ?? []).map((r) => r.title));
    const mustHave = ['Ведущий', 'Проповедник'];
    return Array.from(new Set([...fromDirection, ...mustHave]));
  };
  const allRoleOptions = useMemo(() => {
    const fromDirs = dirs.flatMap((d) => (d.roles ?? []).map((r) => r.title));
    return Array.from(new Set([...fromDirs, 'Ведущий', 'Проповедник']));
  }, [dirs]);
  const roleOptionsForDirection = (directionTitle: string) => {
    const scoped = rolesForDirection(directionTitle);
    return scoped.length > 0 ? scoped : allRoleOptions;
  };

  const stats = useMemo(() => {
    const list = data ?? [];
    const registered = list.filter((u) => u.has_registered).length;
    return {
      total: list.length,
      admins: list.filter((u) => memberHasAppRole(u, 'admin')).length,
      registered,
      withoutApp: Math.max(0, list.length - registered),
    };
  }, [data]);

  const roleFilterCounts = useMemo(() => {
    const list = data ?? [];
    return Object.fromEntries(APP_ROLE_IDS.map((role) => [role, countMembersMatchingRole(list, role)])) as Record<
      (typeof APP_ROLE_IDS)[number],
      number
    >;
  }, [data]);

  function patchMemberListParams(patch: {
    q?: string;
    role?: string;
    status?: MemberAccountFilter;
    dir?: string;
  }) {
    const next = new URLSearchParams(searchParams);
    if (patch.q !== undefined) {
      if (patch.q) next.set('q', patch.q);
      else next.delete('q');
    }
    if (patch.role !== undefined) {
      if (patch.role) next.set('role', patch.role);
      else next.delete('role');
    }
    if (patch.status !== undefined) {
      if (patch.status === 'all') next.delete('status');
      else next.set('status', patch.status);
    }
    if (patch.dir !== undefined) {
      if (patch.dir) next.set('dir', patch.dir);
      else next.delete('dir');
    }
    setSearchParams(next, { replace: true });
  }

  const clearMemberFilters = () => {
    patchMemberListParams({ q: '', role: '', status: 'all', dir: '' });
  };

  function toggleRoleFilter(role: string) {
    patchMemberListParams({ role: roleFilter === role ? '' : role });
  }

  async function copyMemberPhone(e: MouseEvent, phone: string | null) {
    e.stopPropagation();
    const raw = (phone ?? '').trim();
    if (!raw) return;
    try {
      await navigator.clipboard.writeText(raw);
      setBanner({ type: 'ok', text: 'Телефон скопирован' });
    } catch {
      setBanner({ type: 'err', text: 'Не удалось скопировать телефон' });
    }
  }

  const createPayload = () => ({
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim(),
    phone_number: form.phone_number.trim(),
    ...(form.telegram_chat_id.trim() ? { telegram_chat_id: form.telegram_chat_id.trim() } : {}),
    birth_date: dateInputValueFromApi(form.birth_date.trim()),
    ...(normalizeMinistryRoles(form.ministry_role) ? { ministry_role: normalizeMinistryRoles(form.ministry_role) } : {}),
    ...(form.ministry_direction.trim() ? { ministry_direction: form.ministry_direction.trim() } : {}),
  });

  const createMut = useMutation({
    mutationFn: () => createAdminMember(createPayload()),
    onSuccess: () => {
      setBanner({ type: 'ok', text: 'Пользователь создан.' });
      setForm({
        first_name: '',
        last_name: '',
        phone_number: '',
        telegram_chat_id: '',
        birth_date: '',
        ministry_role: '',
        ministry_direction: '',
      });
      invalidate();
      onAddUserClose();
    },
    onError: (e) => {
      const msg = apiErrorMessage(e, 'Не удалось создать.');
      const duplicateByCode =
        axios.isAxiosError(e) &&
        !!e.response?.data &&
        typeof e.response.data === 'object' &&
        (e.response.data as { code?: unknown }).code === 'member_name_duplicate';
      const duplicateByText = /Участник с таким именем и фамилией уже есть/i.test(msg);
      if (duplicateByCode || duplicateByText) {
        const agree = window.confirm(
          'Пользователь с таким именем и фамилией уже есть. Объединить введённые данные с существующей карточкой?',
        );
        if (agree) {
          mergeOnCreateMut.mutate();
          return;
        }
      }
      setBanner({ type: 'err', text: msg });
    },
  });

  const mergeOnCreateMut = useMutation({
    mutationFn: () => createAdminMember({ ...createPayload(), merge_if_duplicate: true }),
    onSuccess: () => {
      setBanner({ type: 'ok', text: 'Данные объединены с существующей карточкой пользователя.' });
      setForm({
        first_name: '',
        last_name: '',
        phone_number: '',
        telegram_chat_id: '',
        birth_date: '',
        ministry_role: '',
        ministry_direction: '',
      });
      invalidate();
    },
    onError: (e) =>
      setBanner({ type: 'err', text: apiErrorMessage(e, 'Не удалось объединить с существующей карточкой.') }),
  });

  const bulkCreateMut = useMutation({
    mutationFn: async () => {
      const partialRows: number[] = [];
      bulkRows.forEach((r, i) => {
        const f = [r.first_name, r.last_name, r.phone_number, r.birth_date].map((x) => x.trim().length > 0);
        const any = f.some(Boolean);
        const all = f.every(Boolean);
        if (any && !all) partialRows.push(i + 1);
      });
      if (partialRows.length > 0) {
        throw new Error(
          `Заполните все обязательные поля в строках ${partialRows.join(', ')} или очистите их.`,
        );
      }

      const eligible = bulkRows
        .map((r, displayIdx) => ({ r, displayIdx }))
        .filter(({ r }) =>
          [r.first_name, r.last_name, r.phone_number, r.birth_date].every((x) => x.trim().length > 0),
        );

      if (eligible.length === 0) {
        throw new Error('Добавьте хотя бы одну полностью заполненную строку.');
      }

      const members = eligible.map(({ r }) => ({
        first_name: r.first_name.trim(),
        last_name: r.last_name.trim(),
        phone_number: r.phone_number.trim(),
        birth_date: dateInputValueFromApi(r.birth_date.trim()),
        ...(normalizeMinistryRoles(r.ministry_role)
          ? { ministry_role: normalizeMinistryRoles(r.ministry_role) }
          : {}),
        ...(r.ministry_direction.trim() ? { ministry_direction: r.ministry_direction.trim() } : {}),
      }));

      return bulkCreateAdminMembers({
        members,
        merge_if_duplicate: bulkMergeDupes,
      }).then((res) => ({ res, eligible }));
    },
    onSuccess: ({ res, eligible }) => {
      invalidate();
      if (res.errors.length === 0) {
        setBanner({ type: 'ok', text: `Создано пользователей: ${res.created}.` });
        setBulkRows([emptyBulkRow(), emptyBulkRow(), emptyBulkRow()]);
        setBulkPasteText('');
      } else {
        const lines = res.errors.map((e) => {
          const rowNum = eligible[e.index] ? eligible[e.index]!.displayIdx + 1 : e.index + 1;
          return `Строка ${rowNum}: ${e.message}`;
        });
        setBanner({
          type: res.created > 0 ? 'ok' : 'err',
          text:
            `${res.created > 0 ? `Создано: ${res.created}. ` : ''}` +
            `Не удалось: ${res.errors.length}. ` +
            lines.join('; '),
        });
      }
    },
    onError: (e) => setBanner({ type: 'err', text: apiErrorMessage(e, 'Массовое создание не выполнено.') }),
  });

  const saveEditMut = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error('no edit');
      return updateAdminMember(editing.id, {
        first_name: editForm.first_name.trim(),
        last_name: editForm.last_name.trim(),
        phone_number: editForm.phone_number.trim(),
        telegram_chat_id: editForm.telegram_chat_id.trim(),
        birth_date: dateInputValueFromApi(editForm.birth_date.trim()),
        ministry_role: normalizeMinistryRoles(editForm.ministry_role),
        ministry_direction: editForm.ministry_direction.trim(),
        prayer_request: editForm.prayer_request.trim(),
        is_active: editForm.is_active,
        ...(editForm.in_prayer_cycle !== editing.in_prayer_cycle
          ? { in_prayer_cycle: editForm.in_prayer_cycle }
          : {}),
      });
    },
    onSuccess: () => {
      setEditing(null);
      setBanner({ type: 'ok', text: 'Сохранено.' });
      invalidate();
    },
    onError: (e) => setBanner({ type: 'err', text: apiErrorMessage(e, 'Ошибка сохранения.') }),
  });

  const swapNameFieldsMut = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error('no edit');
      return updateAdminMember(editing.id, { swap_first_and_last_name: true });
    },
    onSuccess: (updated) => {
      setEditing(updated);
      const { first_name: ef, last_name: el } = splitNameForEditForm(updated);
      setEditForm((s) => ({ ...s, first_name: ef, last_name: el }));
      setBanner({ type: 'ok', text: 'В базе имя и фамилия поменяны местами.' });
      invalidate();
    },
    onError: (e) =>
      setBanner({ type: 'err', text: apiErrorMessage(e, 'Не удалось поменять поля имени.') }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteAdminMember(id),
    onSuccess: () => {
      setEditing(null);
      setBanner({ type: 'ok', text: 'Удалено.' });
      invalidate();
    },
    onError: (e) => setBanner({ type: 'err', text: apiErrorMessage(e, 'Не удалось удалить.') }),
  });

  const resetPasswordMut = useMutation({
    mutationFn: (id: number) => resetAdminMemberPassword(id),
    onSuccess: (updated) => {
      setEditing(updated);
      setBanner({
        type: 'ok',
        text: 'Пароль сброшен. При следующем входе пользователь задаст новый пароль по номеру телефона.',
      });
      invalidate();
    },
    onError: (e) => setBanner({ type: 'err', text: apiErrorMessage(e, 'Не удалось сбросить пароль.') }),
  });

  const roleMut = useMutation({
    mutationFn: ({
      id,
      roles,
    }: {
      id: number;
      roles: Array<
        'parishioner' | 'member' | 'minister' | 'pastor' | 'musician' | 'editor' | 'admin'
      >;
    }) => setMemberAppRoles(id, roles),
    onSuccess: (updated) => {
      setEditing((prev) => (prev && prev.id === updated.id ? updated : prev));
      setBanner({ type: 'ok', text: 'Роли обновлены.' });
      invalidate();
    },
    onError: (e) => setBanner({ type: 'err', text: apiErrorMessage(e, 'Нельзя изменить роль.') }),
  });

  const mergeDupesMut = useMutation({
    mutationFn: () => mergeDuplicateMembers(),
    onSuccess: (r) => {
      setBanner({
        type: 'ok',
        text:
          r.mergedPairs > 0
            ? `Объединено пар дубликатов: ${r.mergedPairs}.`
            : 'Дубликатов с одинаковым ФИО не найдено.',
      });
      invalidate();
    },
    onError: (e) => setBanner({ type: 'err', text: apiErrorMessage(e, 'Не удалось объединить.') }),
  });

  const swapAllNamesMut = useMutation({
    mutationFn: () => swapAllMembersFirstLastNames(),
    onSuccess: (r) => {
      setEditing(null);
      if (r.updated === 0) {
        setBanner({
          type: 'ok',
          text:
            'Нечего обновить: нет пользователей с заполненными колонками имени/фамилии и нет карточек, где в name ровно два слова при пустых колонках.',
        });
      } else {
        const bits: string[] = [];
        if (r.swapped > 0) {
          bits.push(`колонки имени и фамилии поменяны местами: ${r.swapped}`);
        }
        if (r.filledFromName > 0) {
          bits.push(`из поля name перенесены имя и фамилия (два слова): ${r.filledFromName}`);
        }
        let text = `${bits.join('. ')}. Всего карточек: ${r.updated}.`;
        if (r.swapped > 0) {
          text += ' Повторное нажатие снова меняет колонки местами у тех же строк.';
        } else if (r.filledFromName > 0) {
          text += ' Если порядок всё ещё неверный, нажмите ещё раз — теперь сработает обмен колонок.';
        }
        setBanner({ type: 'ok', text });
      }
      invalidate();
    },
    onError: (e) =>
      setBanner({ type: 'err', text: apiErrorMessage(e, 'Не удалось выполнить массовую замену.') }),
  });

  const oneTimeMut = useMutation({
    mutationFn: ({ id, date }: { id: number; date: string }) => setOneTimeMemberDate(id, date),
    onSuccess: () => {
      setBanner({ type: 'ok', text: 'Разовая дата назначена.' });
      invalidate();
    },
    onError: (e) => setBanner({ type: 'err', text: apiErrorMessage(e, 'Ошибка.') }),
  });

  function openEdit(u: AppUser) {
    setEditing(u);
    const { first_name: ef, last_name: el } = splitNameForEditForm(u);
    setEditForm({
      first_name: ef,
      last_name: el,
      phone_number: (u.phone_number ?? '').trim(),
      telegram_chat_id: (u.telegram_chat_id ?? '').trim(),
      birth_date: dateInputValueFromApi(u.birth_date),
      ministry_role: normalizeMinistryRoles((u.ministry_role ?? '').trim()),
      ministry_direction: (u.ministry_direction ?? '').trim(),
      prayer_request: (u.prayer_request ?? '').trim(),
      is_active: u.is_active,
      in_prayer_cycle: u.in_prayer_cycle,
    });
  }

  function handleImpersonate(u: AppUser, e: MouseEvent) {
    e.stopPropagation();
    const name = memberRosterName(u);
    if (!window.confirm(`Войти в аккаунт ${name}? Чаты будут недоступны.`)) return;
    void startImpersonation(u.id);
  }

  function onCreate(e: FormEvent) {
    e.preventDefault();
    setBanner(null);
    createMut.mutate();
  }

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
    <div className="space-y-3">
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

      {/* Метрики — компактная полоса, клик включает фильтр */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(
          [
            {
              key: 'all',
              label: 'Всего',
              value: stats.total,
              valueClass: 'text-stone-900',
              active: !filtersActive,
              onClick: () => clearMemberFilters(),
            },
            {
              key: 'in_app',
              label: 'В приложении',
              value: stats.registered,
              valueClass: 'text-emerald-700',
              active: accountFilter === 'in_app' && !roleFilter && !ministryFilter,
              onClick: () =>
                patchMemberListParams({
                  role: '',
                  dir: '',
                  status: accountFilter === 'in_app' ? 'all' : 'in_app',
                }),
            },
            {
              key: 'no_login',
              label: 'Нет входа',
              value: stats.withoutApp,
              valueClass: 'text-red-600',
              active: accountFilter === 'no_login' && !roleFilter && !ministryFilter,
              onClick: () =>
                patchMemberListParams({
                  role: '',
                  dir: '',
                  status: accountFilter === 'no_login' ? 'all' : 'no_login',
                }),
            },
            {
              key: 'admin',
              label: 'Админы',
              value: stats.admins,
              valueClass: 'text-primary',
              active: roleFilter === 'admin',
              onClick: () =>
                patchMemberListParams({
                  status: 'all',
                  role: roleFilter === 'admin' ? '' : 'admin',
                }),
            },
          ] as const
        ).map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={card.onClick}
            aria-pressed={card.active}
            className={
              card.active
                ? 'inline-flex shrink-0 items-baseline gap-1.5 rounded-full border border-primary/40 bg-primary/[0.08] px-3 py-1.5'
                : 'inline-flex shrink-0 items-baseline gap-1.5 rounded-full border border-stone-200/80 bg-[var(--surface-elevated)] px-3 py-1.5 transition hover:border-primary/30'
            }
          >
            <span className="text-[11px] font-medium text-stone-500">{card.label}</span>
            <span className={`text-sm font-extrabold tabular-nums ${card.valueClass}`}>{card.value}</span>
            {card.key === 'all' && isFetching && !isLoading ? (
              <span className="text-[10px] font-medium text-stone-400">…</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Upcoming birthdays — свёрнуты, чтобы не закрывать список */}
      {upcomingBirthdays.length ? (
        <div className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] shadow-[var(--shadow)]">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left"
            onClick={() => setShowBirthdays((v) => !v)}
            aria-expanded={showBirthdays}
          >
            <span className="min-w-0 text-sm font-semibold text-stone-900">
              <span aria-hidden>🎂</span> Дни рождения в ближайшие 30 дней
              <span className="ml-2 rounded-full bg-pink-50 px-2 py-0.5 text-[11px] font-bold text-pink-800">
                {upcomingBirthdays.length}
              </span>
            </span>
            <LuChevronDown
              className={`h-4 w-4 shrink-0 text-stone-400 transition ${showBirthdays ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>
          {showBirthdays ? (
            <div className="border-t border-stone-100 px-4 pb-4 pt-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {upcomingBirthdays.slice(0, 8).map(({ u, b }) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => openEdit(u)}
                    className="group flex min-w-0 items-center justify-between gap-3 rounded-xl border border-stone-200/80 bg-white px-3 py-2 text-left shadow-sm transition hover:border-primary/40 hover:bg-primary/[0.04]"
                    title="Открыть карточку"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-stone-900">
                        {memberRosterName(u)}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-stone-500">
                        {formatMemberPhone(u.phone_number)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block whitespace-nowrap text-xs font-semibold text-stone-700">{b.dateLabel}</span>
                      <span className="mt-0.5 block whitespace-nowrap text-[11px] font-bold text-primary">
                        {b.relativeLabel}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              {upcomingBirthdays.length > 8 ? (
                <p className="mt-2 text-xs text-stone-500">
                  И ещё: <strong>{upcomingBirthdays.length - 8}</strong>
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Toolbar */}
      <div className="sticky top-0 z-20 -mx-1 space-y-2 bg-[var(--surface,#f4f1ed)]/95 px-1 py-2 backdrop-blur">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1 basis-[12rem]">
            <LuSearch
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
              aria-hidden
            />
            <input
              type="search"
              className={`${fieldClass()} pl-9 ${search ? 'pr-9' : ''}`}
              placeholder="Имя, фамилия, телефон, роль, служение…"
              value={search}
              onChange={(e) => patchMemberListParams({ q: e.target.value })}
              aria-label="Поиск пользователей"
            />
            {search ? (
              <button
                type="button"
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                onClick={() => patchMemberListParams({ q: '' })}
                aria-label="Очистить поиск"
              >
                <LuX className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
          </label>
          <select
            className="max-w-[11.5rem] min-w-0 rounded-xl border border-stone-200/90 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            value={roleFilter}
            onChange={(e) => patchMemberListParams({ role: e.target.value })}
            aria-label="Фильтр по роли приложения"
          >
            <option value="">Все роли</option>
            {APP_ROLE_IDS.map((role) => (
              <option key={role} value={role}>
                {appRoleLabel(role)} ({roleFilterCounts[role]})
              </option>
            ))}
          </select>
          {ministryOptions.length > 0 ? (
            <select
              className="max-w-[12rem] min-w-0 rounded-xl border border-stone-200/90 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={ministryFilter}
              onChange={(e) => patchMemberListParams({ dir: e.target.value })}
              aria-label="Фильтр по направлению служения"
            >
              <option value="">Все служения</option>
              {ministryOptions.map((dir) => (
                <option key={dir} value={dir}>
                  {dir}
                </option>
              ))}
            </select>
          ) : null}
          {filtersActive ? (
            <button type="button" className={btnSecondary('')} onClick={clearMemberFilters} title="Сбросить поиск и фильтры">
              Сбросить
            </button>
          ) : null}
          <button
            type="button"
            className={
              showBulkCreate
                ? `${btnPrimary('')} inline-flex items-center gap-1.5`
                : `${btnSecondary('')} inline-flex items-center gap-1.5`
            }
            onClick={() => setShowBulkCreate((v) => !v)}
          >
            <LuTable2 className="h-4 w-4 shrink-0" aria-hidden />
            Массово
          </button>
          <div className="relative">
            <button
              type="button"
              className={btnSecondary('')}
              onClick={() => setShowActionsMenu((v) => !v)}
            >
              ⋯
            </button>
            {showActionsMenu && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setShowActionsMenu(false)}
                  aria-hidden
                />
                <div className="absolute right-0 top-full z-30 mt-1 min-w-[230px] rounded-xl border border-stone-200 bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    className="w-full px-4 py-2 text-left text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                    disabled={mergeDupesMut.isPending || swapAllNamesMut.isPending}
                    onClick={() => {
                      setShowActionsMenu(false);
                      if (
                        !window.confirm(
                          'Объединить дубликаты пользователей? Останется одна карточка с меньшим номером, пароль и данные перенесутся.',
                        )
                      )
                        return;
                      setBanner(null);
                      mergeDupesMut.mutate();
                    }}
                  >
                    {mergeDupesMut.isPending ? 'Объединение…' : 'Объединить дубликаты'}
                  </button>
                  <button
                    type="button"
                    className="w-full px-4 py-2 text-left text-sm font-semibold text-amber-900 hover:bg-stone-50 disabled:opacity-50"
                    disabled={mergeDupesMut.isPending || swapAllNamesMut.isPending}
                    onClick={() => {
                      setShowActionsMenu(false);
                      if (
                        !window.confirm(
                          'Поменять местами поля «имя» и «фамилия» у ВСЕХ пользователей? Повторный запуск снова меняет местами (откат).',
                        )
                      )
                        return;
                      setBanner(null);
                      swapAllNamesMut.mutate();
                    }}
                  >
                    {swapAllNamesMut.isPending ? 'Обновление…' : 'Поменять имя/фамилию у всех'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-stone-500" aria-live="polite">
            {filtersActive
              ? `Показано ${ruPeopleCount(filtered.length)} из ${stats.total}`
              : `${ruPeopleCount(stats.total)} · по фамилии А–Я`}
            {roleFilter && isAppRoleId(roleFilter) ? ` · ${appRoleLabel(roleFilter)}` : ''}
            {accountFilter !== 'all'
              ? ` · ${accountFilter === 'in_app' ? 'в приложении' : accountFilter === 'no_login' ? 'нет входа' : 'неактивные'}`
              : ''}
            {ministryFilter ? ` · ${ministryFilter}` : ''}
          </p>
          {letterGroups.length > 3 && filtered.length >= 16 ? (
            <div className="hidden max-w-full flex-wrap gap-0.5 shell:flex" aria-label="Переход по буквам">
              {letterGroups
                .filter((g) => g.letter !== '#')
                .map((g) => (
                  <button
                    key={g.letter}
                    type="button"
                    className="rounded px-1 py-0.5 text-[11px] font-bold text-stone-500 hover:bg-stone-200 hover:text-stone-800"
                    onClick={() => scrollToMemberLetter(g.letter)}
                  >
                    {g.letter}
                  </button>
                ))}
            </div>
          ) : null}
        </div>
      </div>

      {showBulkCreate ? (
        <section className="rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/90 via-white to-violet-50/40 p-4 shadow-[var(--shadow)] shell:p-5">
          <h3 className="flex items-center gap-2 text-sm font-extrabold text-stone-900">
            <LuTable2 className="h-4 w-4 text-indigo-700" aria-hidden />
            Массовое создание пользователей
          </h3>
          <p className="mt-1 text-xs text-stone-600">
            Заполните строки в таблице. Обязательны фамилия, имя, телефон и дата рождения (ГГГГ-ММ-ДД).
            Пустые строки не отправляются. Можно вставить фрагмент из Excel: колонки через Tab — фамилия,
            имя, телефон, дата, по желанию направление и роль служения.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex min-w-0 cursor-pointer items-start gap-2 text-xs font-semibold text-stone-700">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-stone-300 text-primary focus:ring-primary/30"
                checked={bulkMergeDupes}
                onChange={(e) => setBulkMergeDupes(e.target.checked)}
              />
              <span className="min-w-0 flex-1">
                При совпадении имени и фамилии — объединить с существующей карточкой
              </span>
            </label>
          </div>
          <div className="mt-4 grid gap-2 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-600">
                Вставка из таблицы (Tab или «;» между колонками)
              </label>
              <textarea
                className={`${fieldClass()} min-h-[88px] font-mono text-xs`}
                placeholder={
                  'Иванов\tИван\t+79001234567\t2000-05-12\nПетрова\tМария\t89161234567\t1995-01-30\tПрославление\tВокал'
                }
                value={bulkPasteText}
                onChange={(e) => setBulkPasteText(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={btnSecondary('text-xs')}
                onClick={() => {
                  const parsed = parseBulkMemberPaste(bulkPasteText);
                  if (parsed.length === 0) {
                    setBanner({
                      type: 'err',
                      text: 'Не удалось разобрать текст: нужно минимум 4 колонки (фамилия, имя, телефон, дата).',
                    });
                    return;
                  }
                  setBanner(null);
                  setBulkRows(
                    parsed.map((p) => ({
                      ...p,
                      key: makeBulkRowKey(),
                    })),
                  );
                }}
              >
                Заполнить таблицу из текста
              </button>
              <button
                type="button"
                className={btnSecondary('text-xs')}
                onClick={() => {
                  setBulkRows([emptyBulkRow(), emptyBulkRow(), emptyBulkRow()]);
                  setBulkPasteText('');
                }}
              >
                Очистить
              </button>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-stone-200/80 bg-white/90">
            <table className="min-w-[920px] w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/95 font-extrabold uppercase tracking-wide text-stone-500">
                  <th className="whitespace-nowrap px-2 py-2">#</th>
                  <th className="px-2 py-2">Фамилия</th>
                  <th className="px-2 py-2">Имя</th>
                  <th className="px-2 py-2">Телефон</th>
                  <th className="whitespace-nowrap px-2 py-2">Дата</th>
                  <th className="min-w-[8rem] px-2 py-2">Направление</th>
                  <th className="min-w-[8rem] px-2 py-2">Роль</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {bulkRows.map((row, idx) => (
                  <tr key={row.key} className="border-b border-stone-100 last:border-0">
                    <td className="px-2 py-1.5 align-middle text-stone-400">{idx + 1}</td>
                    <td className="px-2 py-1.5 align-middle">
                      <input
                        className={`${fieldClass()} py-1.5 text-xs`}
                        value={row.last_name}
                        onChange={(e) => {
                          const v = e.target.value;
                          setBulkRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, last_name: v } : r)));
                        }}
                      />
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <input
                        className={`${fieldClass()} py-1.5 text-xs`}
                        value={row.first_name}
                        onChange={(e) => {
                          const v = e.target.value;
                          setBulkRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, first_name: v } : r)));
                        }}
                      />
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <input
                        className={`${fieldClass()} py-1.5 text-xs`}
                        inputMode="tel"
                        value={row.phone_number}
                        onChange={(e) => {
                          const v = e.target.value;
                          setBulkRows((rs) =>
                            rs.map((r) => (r.key === row.key ? { ...r, phone_number: v } : r)),
                          );
                        }}
                      />
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 align-middle">
                      <BirthDayMonthFields
                        value={row.birth_date}
                        onChange={(apiYmd) => {
                          setBulkRows((rs) =>
                            rs.map((r) => (r.key === row.key ? { ...r, birth_date: apiYmd } : r)),
                          );
                        }}
                        label=""
                        labelClassName="sr-only"
                        selectClassName={`${fieldClass()} py-1.5 text-xs`}
                      />
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <select
                        className={`${fieldClass()} py-1.5 text-xs`}
                        value={row.ministry_direction}
                        onChange={(e) => {
                          const nextDir = e.target.value;
                          setBulkRows((rs) =>
                            rs.map((r) => {
                              if (r.key !== row.key) return r;
                              return { ...r, ministry_direction: nextDir };
                            }),
                          );
                        }}
                      >
                        <option value="">—</option>
                        {dirs.map((d) => (
                          <option key={d.id} value={d.title}>
                            {d.title}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <select
                        multiple
                        size={Math.min(6, Math.max(3, roleOptionsForDirection(row.ministry_direction).length))}
                        className={`${fieldClass()} min-h-[72px] py-1.5 text-xs`}
                        value={roleArray(row.ministry_role)}
                        onChange={(e) => {
                          const selected = Array.from(e.currentTarget.selectedOptions).map((opt) => opt.value);
                          const next = normalizeMinistryRoles(selected.join(', '));
                          setBulkRows((rs) =>
                            rs.map((r) => (r.key === row.key ? { ...r, ministry_role: next } : r)),
                          );
                        }}
                      >
                        {roleOptionsForDirection(row.ministry_direction).map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 align-middle text-right">
                      <button
                        type="button"
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                        onClick={() =>
                          setBulkRows((rs) => (rs.length <= 1 ? rs : rs.filter((r) => r.key !== row.key)))
                        }
                        aria-label="Удалить строку"
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={btnSecondary('text-xs')}
              onClick={() => setBulkRows((rs) => [...rs, emptyBulkRow()])}
            >
              + Строка
            </button>
            <button
              type="button"
              className={btnPrimary('')}
              disabled={bulkCreateMut.isPending}
              onClick={() => {
                setBanner(null);
                bulkCreateMut.mutate();
              }}
            >
              {bulkCreateMut.isPending ? 'Создание…' : 'Создать всех из таблицы'}
            </button>
          </div>
        </section>
      ) : null}

      {/* Add user modal */}
      {showAddUser && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onAddUserClose();
          }}
        >
          <div
            className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
          >
            <div className="sticky top-0 z-10 border-b border-stone-100 bg-white px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-[18px] font-medium tracking-tight text-stone-900">Новый пользователь</h3>
                  <p className="mt-0.5 text-xs text-stone-500">
                    Обязательны имя, фамилия, телефон и дата рождения.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onAddUserClose}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-stone-200 text-stone-500 transition hover:bg-stone-100 hover:text-stone-800"
                  aria-label="Закрыть"
                >
                  <LuX className="h-4 w-4" strokeWidth={2} aria-hidden />
                </button>
              </div>
            </div>
            <form onSubmit={onCreate} className="space-y-3 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
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
                  <label className="mb-1 block text-xs font-semibold text-stone-600">Имя</label>
                  <input
                    className={fieldClass()}
                    value={form.first_name}
                    onChange={(e) => setForm((s) => ({ ...s, first_name: e.target.value }))}
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
                  <label className="mb-1 block text-xs font-semibold text-stone-600">Telegram ID</label>
                  <input
                    className={fieldClass()}
                    value={form.telegram_chat_id}
                    onChange={(e) => setForm((s) => ({ ...s, telegram_chat_id: e.target.value }))}
                    placeholder="например: 123456789"
                  />
                </div>
                <div>
                  <BirthDayMonthFields
                    value={form.birth_date}
                    onChange={(apiYmd) => setForm((s) => ({ ...s, birth_date: apiYmd }))}
                    labelClassName="mb-1 block text-xs font-semibold text-stone-600"
                    selectClassName={fieldClass()}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-600">Направление</label>
                  <select
                    className={fieldClass()}
                    value={form.ministry_direction}
                    onChange={(e) => {
                      const nextDir = e.target.value;
                      setForm((s) => ({ ...s, ministry_direction: nextDir }));
                    }}
                  >
                    <option value="">—</option>
                    {dirs.map((d) => (
                      <option key={d.id} value={d.title}>
                        {d.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-600">Роль служения</label>
                  <select
                    multiple
                    size={Math.min(7, Math.max(3, roleOptionsForDirection(form.ministry_direction).length))}
                    className={fieldClass()}
                    value={roleArray(form.ministry_role)}
                    onChange={(e) => {
                      const selected = Array.from(e.currentTarget.selectedOptions).map((opt) => opt.value);
                      setForm((s) => ({ ...s, ministry_role: normalizeMinistryRoles(selected.join(', ')) }));
                    }}
                  >
                    {roleOptionsForDirection(form.ministry_direction).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-stone-100 pt-3">
                <button type="button" className={btnSecondary()} onClick={onAddUserClose}>
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={createMut.isPending || mergeOnCreateMut.isPending}
                  className={btnPrimary()}
                >
                  {createMut.isPending || mergeOnCreateMut.isPending ? 'Сохранение…' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Карточки — мобильные */}
      <div className="space-y-1.5 shell:hidden">
        {filtered.length === 0 ? (
          <MemberListEmptyState filtersActive={filtersActive} onReset={clearMemberFilters} />
        ) : (
          letterGroups.map((group) => (
            <div key={group.letter} className="space-y-1.5">
              <p
                data-member-letter={group.letter}
                className="sticky top-14 z-[1] bg-[var(--surface,#f4f1ed)]/95 px-1 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-stone-400 backdrop-blur"
              >
                {group.letter === '#' ? 'Без фамилии' : group.letter}
                <span className="ml-1.5 font-semibold normal-case tracking-normal text-stone-300">
                  {group.members.length}
                </span>
              </p>
              {group.members.map((u) => {
                const bday = birthdayBadge(u, now, 30);
                const service = memberServiceLine(u);
                return (
                  <article
                    key={u.id}
                    className={`cursor-pointer rounded-xl border border-stone-200/80 bg-[var(--surface-elevated)] px-3 py-2.5 shadow-sm transition hover:border-primary/40 ${u.is_active ? '' : 'opacity-70'}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => openEdit(u)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openEdit(u);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold leading-tight text-stone-900">{memberRosterName(u)}</p>
                        <button
                          type="button"
                          className="mt-0.5 text-left text-[13px] tabular-nums text-stone-600 hover:text-primary"
                          title={u.phone_number ? 'Скопировать телефон' : undefined}
                          onClick={(e) => void copyMemberPhone(e, u.phone_number)}
                        >
                          {formatMemberPhone(u.phone_number)}
                        </button>
                        {service ? <p className="mt-0.5 truncate text-[11px] text-stone-500">{service}</p> : null}
                      </div>
                      {showImpersonateButton && !memberIsAdmin(u) ? (
                        <button
                          type="button"
                          className="shrink-0 rounded-lg border border-stone-200 bg-white px-2 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-50"
                          title="Войти в аккаунт"
                          onClick={(e) => handleImpersonate(u, e)}
                        >
                          Войти
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <MemberRegistrationBadge u={u} />
                      <MemberAppRoleBadges u={u} onSelect={toggleRoleFilter} />
                      {bday ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-pink-50 px-2 py-0.5 text-[11px] font-semibold text-pink-800">
                          <span aria-hidden>🎂</span>
                          {bday.dateLabel}
                        </span>
                      ) : null}
                      {!u.is_active ? (
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-500">
                          Неактивен
                        </span>
                      ) : null}
                      {u.is_collection_coordinator ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                          Сбор
                        </span>
                      ) : null}
                      {u.in_prayer_cycle ? (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-900">
                          В цикле
                        </span>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Table — shown at shell+ breakpoint */}
      <div className="hidden min-w-0 overflow-hidden rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] shadow-[var(--shadow)] shell:block">
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50/90 text-[11px] font-extrabold uppercase tracking-wider text-stone-500">
              <th className="w-[40%] px-3 py-2">Участник</th>
              <th className="hidden w-[10.75rem] px-3 py-2 lg:table-cell">Телефон</th>
              <th className="px-3 py-2">Роли</th>
              {showImpersonateButton ? (
                <th className="w-[4.25rem] px-2 py-2">
                  <span className="sr-only">Действия</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={showImpersonateButton ? 4 : 3} className="px-3 py-6">
                  <MemberListEmptyState filtersActive={filtersActive} onReset={clearMemberFilters} />
                </td>
              </tr>
            ) : (
              letterGroups.flatMap((group) => [
                <tr key={`letter-${group.letter}`} className="bg-stone-50/90">
                  <td
                    colSpan={showImpersonateButton ? 4 : 3}
                    data-member-letter={group.letter}
                    className="px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-stone-400"
                  >
                    {group.letter === '#' ? 'Без фамилии' : group.letter}
                    <span className="ml-2 font-semibold normal-case tracking-normal text-stone-300">
                      {group.members.length}
                    </span>
                  </td>
                </tr>,
                ...group.members.map((u) => {
                  const name = memberRosterName(u);
                  const { bg, fg } = memberAvatarColors(name);
                  const bday = birthdayBadge(u, now, 30);
                  const service = memberServiceLine(u);
                  return (
                    <tr
                      key={u.id}
                      tabIndex={0}
                      title="Открыть карточку"
                      className={`cursor-pointer border-b border-stone-100/90 transition last:border-0 hover:bg-primary/[0.06] ${u.is_active ? '' : 'opacity-70'}`}
                      onClick={() => openEdit(u)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openEdit(u);
                        }
                      }}
                    >
                      <td className="px-3 py-1.5 align-middle">
                        <div className="flex min-w-0 items-center gap-2">
                          <div
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                            style={{ backgroundColor: bg, color: fg }}
                            aria-hidden
                          >
                            {memberInitials(u)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium leading-tight text-stone-900">{name}</p>
                            {service ? <p className="truncate text-[11px] leading-tight text-stone-500">{service}</p> : null}
                            <p className="truncate text-[12px] tabular-nums leading-tight text-stone-600 lg:hidden">
                              {u.phone_number ? (
                                <button
                                  type="button"
                                  className="hover:text-primary"
                                  title="Скопировать телефон"
                                  onClick={(e) => void copyMemberPhone(e, u.phone_number)}
                                >
                                  {formatMemberPhone(u.phone_number)}
                                </button>
                              ) : (
                                <span className="text-stone-400">—</span>
                              )}
                            </p>
                            {bday ? (
                              <p className="truncate text-[11px] font-semibold text-pink-800">
                                <span aria-hidden>🎂</span> {bday.dateLabel}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-3 py-1.5 align-middle lg:table-cell">
                        {u.phone_number ? (
                          <button
                            type="button"
                            className="block max-w-full truncate tabular-nums text-stone-600 hover:text-primary"
                            title="Скопировать телефон"
                            onClick={(e) => void copyMemberPhone(e, u.phone_number)}
                          >
                            {formatMemberPhone(u.phone_number)}
                          </button>
                        ) : (
                          <span className="text-stone-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 align-middle">
                        <div className="flex min-w-0 flex-wrap items-center gap-1">
                          <MemberAppRoleBadges u={u} onSelect={toggleRoleFilter} />
                          <MemberRegistrationBadge u={u} />
                          {!u.is_active ? (
                            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-500">
                              Неактивен
                            </span>
                          ) : null}
                        </div>
                      </td>
                      {showImpersonateButton ? (
                        <td className="px-2 py-1.5 align-middle">
                          {!memberIsAdmin(u) ? (
                            <button
                              type="button"
                              className="rounded-lg border border-stone-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-stone-700 hover:bg-stone-50"
                              title="Войти в аккаунт"
                              onClick={(e) => handleImpersonate(u, e)}
                            >
                              Войти
                            </button>
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                  );
                }),
              ])
            )}
          </tbody>
        </table>
      </div>

      {editing ? (
        <AdminMemberEditSheet
          editing={editing}
          editForm={editForm}
          setEditForm={setEditForm}
          titleId={memberEditTitleId}
          dirs={dirs}
          roleOptionsForDirection={roleOptionsForDirection}
          savePending={saveEditMut.isPending}
          deletePending={deleteMut.isPending}
          swapPending={swapNameFieldsMut.isPending}
          resetPasswordPending={resetPasswordMut.isPending}
          oneTimePending={oneTimeMut.isPending}
          roleMut={roleMut}
          onClose={() => setEditing(null)}
          onSave={() => saveEditMut.mutate()}
          onDelete={() => deleteMut.mutate(editing.id)}
          onSwapNames={() => swapNameFieldsMut.mutate()}
          onResetPassword={() => resetPasswordMut.mutate(editing.id)}
          onClearBanner={() => setBanner(null)}
          onToggleCollectionCoordinator={() => {
            void updateAdminMember(editing.id, {
              is_collection_coordinator: !editing.is_collection_coordinator,
            }).then(
              (updated) => {
                setEditing(updated);
                setBanner({ type: 'ok', text: 'Роль «сбор» обновлена.' });
                invalidate();
              },
              (e) => setBanner({ type: 'err', text: apiErrorMessage(e, 'Ошибка.') }),
            );
          }}
          onAssignOneTimeDate={(date) => oneTimeMut.mutateAsync({ id: editing.id, date })}
        />
      ) : null}
    </div>
  );
}

function reorderArray<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

/**
 * Очередь молитвенного цикла: флаг `in_prayer_cycle` (как в карточке пользователя).
 * Добавление вне цикла — модальное окно «Не в очереди».
 */
function CalendarPrayerCycleRoster() {
  const qc = useQueryClient();
  const rosterAnchorYmd = format(new Date(), 'yyyy-MM-dd');
  const notInQueueTitleId = useId();
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: Q_MEMBERS,
    queryFn: fetchAdminMembers,
  });
  const [listSearch, setListSearch] = useState('');
  const [addSearch, setAddSearch] = useState('');
  const [notInQueueOpen, setNotInQueueOpen] = useState(false);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!notInQueueOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotInQueueOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [notInQueueOpen]);

  const rosterSnapQ = useQuery({
    queryKey: ['admin', 'prayer-cycle-roster', rosterAnchorYmd] as const,
    queryFn: () => fetchPrayerCycleRoster(rosterAnchorYmd),
  });

  const anchorQueueMut = useMutation({
    mutationFn: (memberId: number) =>
      anchorPrayerCycleMember({
        member_id: memberId,
        anchor_date: format(new Date(), 'yyyy-MM-dd'),
      }),
    onSuccess: async () => {
      setBanner({
        type: 'ok',
        text: 'Дата старта цикла обновлена: с сегодняшнего дня первым в очереди идёт выбранный член церкви; дальше — по списку по кругу.',
      });
      await qc.invalidateQueries({ queryKey: Q_MEMBERS });
      await qc.invalidateQueries({ queryKey: ['calendar'] });
      await qc.invalidateQueries({ queryKey: ['admin', 'prayer-cycle-roster'] });
    },
    onError: (e) =>
      setBanner({ type: 'err', text: apiErrorMessage(e, 'Не удалось переставить очередь.') }),
  });

  const patchMut = useMutation({
    mutationFn: (p: { id: number; in_prayer_cycle: boolean }) =>
      updateAdminMember(p.id, { in_prayer_cycle: p.in_prayer_cycle }),
    onSuccess: async (_, vars) => {
      setBanner({
        type: 'ok',
        text: vars.in_prayer_cycle
          ? 'Член церкви добавлен в молитвенный цикл.'
          : 'Член церкви убран из молитвенного цикла.',
      });
      await qc.invalidateQueries({ queryKey: Q_MEMBERS });
      await qc.invalidateQueries({ queryKey: ['calendar'] });
      await qc.invalidateQueries({ queryKey: ['admin', 'prayer-cycle-roster'] });
    },
    onError: (e) =>
      setBanner({ type: 'err', text: apiErrorMessage(e, 'Не удалось сохранить изменение.') }),
  });

  const activeInQueue = useMemo(() => {
    const list = data ?? [];
    return list.filter((u) => u.is_active && u.in_prayer_cycle).length;
  }, [data]);

  const flaggedInCycle = useMemo(() => {
    const list = data ?? [];
    return list.filter((u) => u.in_prayer_cycle).length;
  }, [data]);

  const inCycleRows = useMemo(() => {
    const list = data ?? [];
    const q = listSearch.trim().toLowerCase();
    let rows = list.filter((u) => u.in_prayer_cycle);
    if (q) {
      rows = rows.filter((u) => {
        const blob =
          `${memberRosterName(u)} ${displayName(u)} ${u.phone_number ?? ''} ${u.email ?? ''} ${u.telegram_chat_id ?? ''}`.toLowerCase();
        return blob.includes(q);
      });
    }
    return [...rows].sort(compareMembersByPrayerCycleOrder);
  }, [data, listSearch]);

  const activeCycleMemberIds = useMemo(() => {
    const ids = new Set<number>();
    for (const r of rosterSnapQ.data?.roster ?? []) {
      ids.add(r.id);
    }
    return ids;
  }, [rosterSnapQ.data?.roster]);

  const candidates = useMemo(() => {
    const list = data ?? [];
    const q = addSearch.trim().toLowerCase();
    let rows = list.filter((u) => u.is_active && !u.in_prayer_cycle);
    if (q) {
      rows = rows.filter((u) => {
        const blob =
          `${memberRosterName(u)} ${displayName(u)} ${u.phone_number ?? ''} ${u.email ?? ''} ${u.telegram_chat_id ?? ''}`.toLowerCase();
        return blob.includes(q);
      });
    }
    return [...rows].sort(compareMembersByPrayerCycleOrder);
  }, [data, addSearch]);

  const notInQueueTotal = useMemo(() => {
    const list = data ?? [];
    return list.filter((u) => u.is_active && !u.in_prayer_cycle).length;
  }, [data]);

  /**
   * Режим перетаскивания: снимок очереди с API + без фильтра поиска.
   * Не требуем, чтобы каждый id из ростера уже был в кэше списка пользователей — иначе DnD
   * часто отключался из‑за гонки загрузки и выглядело как «ничего не поменялось».
   */
  const rosterDnDEnabled =
    Boolean(data?.length) &&
    !listSearch.trim() &&
    Boolean(rosterSnapQ.data?.roster?.length) &&
    !rosterSnapQ.isLoading;

  const inactiveOnlyInCycle = useMemo(() => {
    const list = data ?? [];
    const q = listSearch.trim().toLowerCase();
    let rows = list.filter((u) => u.in_prayer_cycle && !u.is_active);
    if (q) {
      rows = rows.filter((u) => {
        const blob =
          `${memberRosterName(u)} ${displayName(u)} ${u.phone_number ?? ''} ${u.email ?? ''} ${u.telegram_chat_id ?? ''}`.toLowerCase();
        return blob.includes(q);
      });
    }
    return [...rows].sort(compareMembersByPrayerCycleOrder);
  }, [data, listSearch]);

  const saveOrderMut = useMutation({
    mutationFn: (orderedIds: number[]) =>
      savePrayerCycleRosterOrder({ anchor_date: rosterAnchorYmd, ordered_member_ids: orderedIds }),
    onSuccess: async () => {
      setBanner({
        type: 'ok',
        text: 'Порядок очереди на этот молитвенный цикл сохранён. На новом цикле снова действует сортировка по фамилии А–Я.',
      });
      await qc.invalidateQueries({ queryKey: ['admin', 'prayer-cycle-roster'] });
      await qc.invalidateQueries({ queryKey: ['calendar'] });
    },
    onError: (e) =>
      setBanner({ type: 'err', text: apiErrorMessage(e, 'Не удалось сохранить порядок очереди.') }),
  });

  const handleRosterDragEnd = (result: DropResult) => {
    const roster = rosterSnapQ.data?.roster;
    if (!result.destination || !roster?.length) return;
    if (result.source.index === result.destination.index) return;
    const ids = roster.map((e) => e.id);
    const next = reorderArray(ids, result.source.index, result.destination.index);
    setBanner(null);
    saveOrderMut.mutate(next);
  };

  if (isLoading && !data) {
    return <UserListSkeleton />;
  }
  if (error) {
    return (
      <p className="text-sm text-red-600">
        Не удалось загрузить членов церкви: {error instanceof Error ? error.message : 'ошибка'}
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200/90 bg-[var(--surface-elevated)] shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-stone-200/80 bg-stone-50/95 px-4 py-3 text-sm">
        <span className="font-semibold text-stone-900">
          В ежедневной очереди:{' '}
          <span className="text-primary tabular-nums">{activeInQueue}</span>
          <span className="font-normal text-stone-500"> активных</span>
        </span>
        <span className="hidden h-4 w-px bg-stone-200 sm:block" aria-hidden />
        <span className="text-stone-600">
          С флагом «в цикле»: <span className="font-semibold tabular-nums text-stone-800">{flaggedInCycle}</span>
        </span>
        {rosterSnapQ.data ? (
          <>
            <span className="hidden h-4 w-px bg-stone-200 sm:block" aria-hidden />
            <span className="text-stone-600">
              Якорь цикла:{' '}
              <span className="font-mono font-semibold text-stone-800">{rosterSnapQ.data.start_date}</span>
            </span>
          </>
        ) : null}
        {rosterSnapQ.data?.has_custom_roster_order ? (
          <>
            <span className="hidden h-4 w-px bg-stone-200 sm:block" aria-hidden />
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-900">
              Свой порядок · цикл {rosterSnapQ.data.cycle_index + 1}
            </span>
          </>
        ) : null}
        {isFetching ? <span className="text-xs text-stone-400">Обновление…</span> : null}
      </div>

      {rosterSnapQ.isError ? (
        <p className="border-b border-amber-100 bg-amber-50/80 px-4 py-2 text-sm text-red-700">
          {apiErrorMessage(rosterSnapQ.error, 'Не удалось загрузить порядок цикла.')}
        </p>
      ) : null}

      {banner ? (
        <p
          className={
            banner.type === 'ok'
              ? 'border-b border-emerald-100 bg-emerald-50/60 px-4 py-2.5 text-sm font-medium text-emerald-800'
              : 'border-b border-red-100 bg-red-50/60 px-4 py-2.5 text-sm text-red-700'
          }
        >
          {banner.text}
        </p>
      ) : null}

      <div className="p-4 sm:p-5 lg:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-stone-900">Очередь членов</h3>
            <p className="mt-1 text-xs text-stone-500">
              Неактивные с флагом «в цикле» перечислены в конце списка, пока карточку не активируют.
            </p>
          </div>
          <button
            type="button"
            className={btnSecondary('shrink-0 self-start sm:self-center')}
            onClick={() => setNotInQueueOpen(true)}
          >
            Не в очереди
            {notInQueueTotal > 0 ? (
              <span className="ml-1.5 inline-flex min-w-[1.5rem] justify-center tabular-nums text-stone-500">
                ({notInQueueTotal})
              </span>
            ) : null}
          </button>
        </div>
        <label className="mt-4 block text-xs font-semibold text-stone-600">Поиск по очереди</label>
        <input
          type="search"
          className={`${fieldClass()} mt-1`}
          value={listSearch}
          onChange={(e) => setListSearch(e.target.value)}
          placeholder="Имя, телефон…"
          autoComplete="off"
        />
        {listSearch.trim() ? (
          <p className="mt-2 text-xs text-amber-800/90">
            Перетаскивание очереди недоступно при поиске — очистите поле, чтобы снова изменить порядок.
          </p>
        ) : null}
        <div className="mt-3 max-h-[min(70vh,52rem)] overflow-auto rounded-xl border border-stone-200/80">
            {inCycleRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-stone-500">
                {listSearch.trim()
                  ? 'Никого не найдено.'
                  : 'Список пуст — добавьте людей через кнопку «Не в очереди».'}
              </p>
            ) : rosterSnapQ.isLoading && !rosterSnapQ.data ? (
              <p className="py-10 text-center text-sm text-stone-500">Загрузка порядка очереди цикла…</p>
            ) : rosterDnDEnabled && rosterSnapQ.data ? (
              <DragDropContext onDragEnd={handleRosterDragEnd}>
                <div className="min-w-full bg-white/95 text-left text-[13px] leading-snug text-stone-800">
                  <div
                    className="sticky top-0 z-[2] flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-stone-200 bg-stone-50/98 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-stone-600 backdrop-blur-sm sm:flex-nowrap sm:gap-x-3"
                    role="row"
                  >
                    <div className="w-9 shrink-0 text-center" aria-hidden />
                    <div className="w-9 shrink-0 sm:w-10">№</div>
                    <div className="min-w-0 flex-[1.2] basis-[40%] sm:basis-auto">Член церкви</div>
                    <div className="hidden w-[7.5rem] shrink-0 sm:block">Телефон</div>
                    <div className="w-[5.75rem] shrink-0">Статус</div>
                    <div className="min-w-[10.5rem] shrink-0 text-right sm:ml-auto">Действия</div>
                  </div>
                  <span className="sr-only">Перетаскивание: захватите иконку слева</span>
                  <Droppable droppableId="prayer-cycle-in-roster">
                    {(droppableProvided) => (
                      <div
                        ref={droppableProvided.innerRef}
                        {...droppableProvided.droppableProps}
                        className="divide-y divide-stone-100"
                      >
                        {rosterSnapQ.data.roster.map((e, qIdx) => {
                          const u = (data ?? []).find((x) => x.id === e.id);
                          const rosterLabel =
                            u != null
                              ? memberRosterName(u)
                              : [e.last_name, e.first_name].filter(Boolean).join(' ').trim() ||
                                e.name ||
                                `Участник №${e.id}`;
                          const isFormulaToday = rosterSnapQ.data!.today_member_id === e.id;
                          const activeForFormula = u?.is_active ?? e.is_active;
                          const canAnchor = Boolean(activeForFormula && activeCycleMemberIds.has(e.id));
                          const zebra = qIdx % 2 === 0 ? 'bg-white' : 'bg-stone-50/80';
                          return (
                            <Draggable
                              key={e.id}
                              draggableId={`pc-roster-${e.id}`}
                              index={qIdx}
                              isDragDisabled={
                                saveOrderMut.isPending || patchMut.isPending || anchorQueueMut.isPending
                              }
                            >
                              {(dragProvided, dragSnapshot) => (
                                <div
                                  ref={dragProvided.innerRef}
                                  {...dragProvided.draggableProps}
                                  className={[
                                    'flex flex-wrap items-start gap-x-3 gap-y-2 px-3 py-3 sm:flex-nowrap sm:items-center sm:py-2.5 touch-manipulation',
                                    isFormulaToday ? 'border-l-[3px] border-l-primary bg-primary/[0.05]' : zebra,
                                    dragSnapshot.isDragging
                                      ? 'bg-stone-100 shadow-md ring-2 ring-stone-300/80'
                                      : '',
                                  ]
                                    .filter(Boolean)
                                    .join(' ')}
                                >
                                  <button
                                    type="button"
                                    {...dragProvided.dragHandleProps}
                                    className="mt-0.5 flex h-9 w-9 shrink-0 cursor-grab items-center justify-center rounded-md border border-transparent text-stone-400 transition hover:border-stone-200 hover:bg-stone-100 hover:text-stone-700 active:cursor-grabbing"
                                    title="Потяните, чтобы изменить порядок в цикле"
                                    aria-label={`Переместить ${rosterLabel}`}
                                  >
                                    <LuGripVertical className="h-4 w-4" aria-hidden />
                                  </button>
                                  <div className="w-9 shrink-0 pt-1 tabular-nums text-stone-600 sm:w-10 sm:pt-0">
                                    {qIdx + 1}
                                  </div>
                                  <div className="min-w-0 flex-[1.2] basis-[50%] sm:basis-auto">
                                    <span className="font-semibold text-stone-900">{rosterLabel}</span>
                                    {!u ? (
                                      <span className="ml-2 text-xs font-normal text-amber-700">обновите список</span>
                                    ) : null}
                                    {isFormulaToday ? (
                                      <span className="ml-2 inline-block rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-bold text-primary">
                                        сегодня
                                      </span>
                                    ) : null}
                                    <p className="mt-0.5 text-xs text-stone-500 sm:hidden">{u?.phone_number ?? '—'}</p>
                                  </div>
                                  <div className="hidden w-[7.5rem] shrink-0 text-stone-600 sm:block">
                                    {u?.phone_number ?? '—'}
                                  </div>
                                  <div className="w-[5.75rem] shrink-0">
                                    {activeForFormula ? (
                                      <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                                        В очереди
                                      </span>
                                    ) : (
                                      <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                                        Неактивен
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex w-full min-w-0 flex-col items-stretch gap-1.5 sm:w-auto sm:min-w-[10.5rem] sm:flex-row sm:justify-end sm:gap-2">
                                    <button
                                      type="button"
                                      className={btnPrimary('text-xs whitespace-nowrap')}
                                      disabled={
                                        anchorQueueMut.isPending ||
                                        patchMut.isPending ||
                                        saveOrderMut.isPending ||
                                        !canAnchor
                                      }
                                      title={
                                        !activeForFormula
                                          ? 'Сначала активируйте карточку'
                                          : !activeCycleMemberIds.has(e.id)
                                            ? 'Нет в расчёте очереди'
                                            : undefined
                                      }
                                      onClick={() => {
                                        setBanner(null);
                                        anchorQueueMut.mutate(e.id);
                                      }}
                                    >
                                      Первым сегодня
                                    </button>
                                    <button
                                      type="button"
                                      className={btnDangerOutline('text-xs whitespace-nowrap')}
                                      disabled={
                                        patchMut.isPending || anchorQueueMut.isPending || saveOrderMut.isPending
                                      }
                                      onClick={() => {
                                        setBanner(null);
                                        patchMut.mutate({ id: e.id, in_prayer_cycle: false });
                                      }}
                                    >
                                      Убрать
                                    </button>
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                        {droppableProvided.placeholder}
                      </div>
                    )}
                  </Droppable>
                  {inactiveOnlyInCycle.length > 0 ? (
                    <div className="border-t border-amber-200/80 bg-amber-50/40">
                      <div className="sticky top-0 z-[1] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-amber-900/90">
                        Не в расчёте очереди (неактивная карточка)
                      </div>
                      <div className="divide-y divide-amber-100/90">
                        {inactiveOnlyInCycle.map((u, i) => {
                          const isFormulaToday = rosterSnapQ.data?.today_member_id === u.id;
                          const canAnchor = u.is_active && activeCycleMemberIds.has(u.id);
                          const zebra = i % 2 === 0 ? 'bg-white/90' : 'bg-amber-50/50';
                          return (
                            <div
                              key={u.id}
                              className={[
                                'flex flex-wrap items-start gap-x-3 gap-y-2 px-3 py-3 sm:flex-nowrap sm:items-center sm:py-2.5',
                                isFormulaToday ? 'border-l-[3px] border-l-primary bg-primary/[0.05]' : zebra,
                              ]
                                .filter(Boolean)
                                .join(' ')}
                            >
                              <div className="w-9 shrink-0" aria-hidden />
                              <div className="w-9 shrink-0 pt-1 tabular-nums text-stone-400 sm:w-10 sm:pt-0">—</div>
                              <div className="min-w-0 flex-[1.2] basis-[50%] sm:basis-auto">
                                <span className="font-semibold text-stone-900">{memberRosterName(u)}</span>
                                {isFormulaToday ? (
                                  <span className="ml-2 inline-block rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-bold text-primary">
                                    сегодня
                                  </span>
                                ) : null}
                                <p className="mt-0.5 text-xs text-stone-500 sm:hidden">{u.phone_number ?? '—'}</p>
                              </div>
                              <div className="hidden w-[7.5rem] shrink-0 text-stone-600 sm:block">{u.phone_number ?? '—'}</div>
                              <div className="w-[5.75rem] shrink-0">
                                <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                                  Неактивен
                                </span>
                              </div>
                              <div className="flex w-full min-w-0 flex-col items-stretch gap-1.5 sm:w-auto sm:min-w-[10.5rem] sm:flex-row sm:justify-end sm:gap-2">
                                <button
                                  type="button"
                                  className={btnPrimary('text-xs whitespace-nowrap')}
                                  disabled={
                                    anchorQueueMut.isPending ||
                                    patchMut.isPending ||
                                    saveOrderMut.isPending ||
                                    !canAnchor
                                  }
                                  title={
                                    !u.is_active
                                      ? 'Сначала активируйте карточку'
                                      : !activeCycleMemberIds.has(u.id)
                                        ? 'Нет в расчёте очереди'
                                        : undefined
                                  }
                                  onClick={() => {
                                    setBanner(null);
                                    anchorQueueMut.mutate(u.id);
                                  }}
                                >
                                  Первым сегодня
                                </button>
                                <button
                                  type="button"
                                  className={btnDangerOutline('text-xs whitespace-nowrap')}
                                  disabled={patchMut.isPending || anchorQueueMut.isPending || saveOrderMut.isPending}
                                  onClick={() => {
                                    setBanner(null);
                                    patchMut.mutate({ id: u.id, in_prayer_cycle: false });
                                  }}
                                >
                                  Убрать
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              </DragDropContext>
            ) : (
              <table className="min-w-full border-collapse text-left text-[13px] leading-snug">
                <thead>
                  <tr className="sticky top-0 z-[2] border-b border-stone-200 bg-stone-50/98 text-[11px] font-semibold uppercase tracking-wide text-stone-600 backdrop-blur-sm">
                    <th className="whitespace-nowrap px-3 py-3">№</th>
                    <th className="min-w-[10rem] px-3 py-3">Член церкви</th>
                    <th className="hidden px-3 py-3 sm:table-cell">Телефон</th>
                    <th className="whitespace-nowrap px-3 py-3">Статус</th>
                    <th className="min-w-[11rem] px-3 py-3 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 bg-white/95">
                  {inCycleRows.map((u, alphaIdx) => {
                    const isFormulaToday = rosterSnapQ.data?.today_member_id === u.id;
                    const canAnchor = u.is_active && activeCycleMemberIds.has(u.id);
                    const zebra = alphaIdx % 2 === 0 ? 'bg-white' : 'bg-stone-50/75';
                    return (
                      <tr
                        key={u.id}
                        className={
                          isFormulaToday ? 'border-l-[3px] border-l-primary bg-primary/[0.05]' : zebra
                        }
                      >
                        <td className="whitespace-nowrap px-3 py-3 tabular-nums text-stone-600 align-top sm:align-middle">
                          {alphaIdx + 1}
                        </td>
                        <td className="px-3 py-3 align-top sm:align-middle">
                          <span className="font-semibold text-stone-900">{memberRosterName(u)}</span>
                          {isFormulaToday ? (
                            <span className="ml-2 inline-block rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-bold text-primary">
                              сегодня
                            </span>
                          ) : null}
                          <p className="mt-0.5 text-xs text-stone-500 sm:hidden">{u.phone_number ?? '—'}</p>
                        </td>
                        <td className="hidden px-3 py-3 text-stone-600 sm:table-cell">{u.phone_number ?? '—'}</td>
                        <td className="px-3 py-3 align-top sm:align-middle">
                          {u.is_active ? (
                            <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                              В очереди
                            </span>
                          ) : (
                            <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                              Неактивен
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 align-top sm:align-middle">
                          <div className="flex flex-col items-stretch gap-1.5 sm:flex-row sm:justify-end sm:gap-2">
                            <button
                              type="button"
                              className={btnPrimary('text-xs whitespace-nowrap')}
                              disabled={anchorQueueMut.isPending || patchMut.isPending || !canAnchor}
                              title={
                                !u.is_active
                                  ? 'Сначала активируйте карточку'
                                  : !activeCycleMemberIds.has(u.id)
                                    ? 'Нет в расчёте очереди'
                                    : undefined
                              }
                              onClick={() => {
                                setBanner(null);
                                anchorQueueMut.mutate(u.id);
                              }}
                            >
                              Первым сегодня
                            </button>
                            <button
                              type="button"
                              className={btnDangerOutline('text-xs whitespace-nowrap')}
                              disabled={patchMut.isPending || anchorQueueMut.isPending}
                              onClick={() => {
                                setBanner(null);
                                patchMut.mutate({ id: u.id, in_prayer_cycle: false });
                              }}
                            >
                              Убрать
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

      {notInQueueOpen ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setNotInQueueOpen(false);
          }}
        >
          <div
            className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby={notInQueueTitleId}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-3 border-b border-stone-100 bg-white px-5 py-4">
              <div className="min-w-0">
                <h3 id={notInQueueTitleId} className="text-[18px] font-medium tracking-tight text-stone-900">
                  Не в очереди
                </h3>
                <p className="mt-0.5 text-xs text-stone-500">
                  Активные без флага «в цикле». «В цикл» добавляет участника в очередь выше.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNotInQueueOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-stone-200 text-stone-500 transition hover:bg-stone-100 hover:text-stone-800"
                aria-label="Закрыть"
              >
                <LuX className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">
              <label className="block text-xs font-semibold text-stone-600">Поиск</label>
              <input
                type="search"
                className={`${fieldClass()} mt-1`}
                value={addSearch}
                onChange={(e) => setAddSearch(e.target.value)}
                placeholder="Имя или телефон…"
                autoComplete="off"
              />
              <div className="mt-4 max-h-[min(55vh,28rem)] overflow-auto rounded-xl border border-stone-200/80 bg-white/95">
                {candidates.length === 0 ? (
                  <p className="py-8 text-center text-sm text-stone-500">
                    {addSearch.trim()
                      ? 'Никого не найдено.'
                      : 'Все активные уже в цикле или нет карточек.'}
                  </p>
                ) : (
                  <table className="min-w-full border-collapse text-left text-[13px] leading-snug">
                    <thead>
                      <tr className="sticky top-0 z-[2] border-b border-stone-200 bg-stone-50/98 text-[11px] font-semibold uppercase tracking-wide text-stone-600 backdrop-blur-sm">
                        <th className="w-12 px-2 py-3 text-center text-stone-400">#</th>
                        <th className="min-w-[10rem] px-3 py-3">Член церкви</th>
                        <th className="hidden px-3 py-3 sm:table-cell">Телефон</th>
                        <th className="w-[1%] whitespace-nowrap px-3 py-3 text-right">Действие</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 bg-white/95">
                      {candidates.map((u, idx) => (
                        <tr key={u.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-stone-50/75'}>
                          <td className="px-2 py-3 text-center tabular-nums text-stone-400">{idx + 1}</td>
                          <td className="px-3 py-3">
                            <span className="font-semibold text-stone-900">{memberRosterName(u)}</span>
                            <p className="mt-0.5 text-xs text-stone-500 sm:hidden">{u.phone_number ?? '—'}</p>
                          </td>
                          <td className="hidden px-3 py-3 text-stone-600 sm:table-cell">{u.phone_number ?? '—'}</td>
                          <td className="px-3 py-3 text-right align-middle">
                            <button
                              type="button"
                              className={btnPrimary('text-xs whitespace-nowrap')}
                              disabled={patchMut.isPending}
                              onClick={() => {
                                setBanner(null);
                                patchMut.mutate({ id: u.id, in_prayer_cycle: true });
                              }}
                            >
                              В цикл
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CalendarSection() {
  const qc = useQueryClient();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const mut = useMutation({
    mutationFn: () => startPrayerCycle(date.trim()),
    onSuccess: async (d) => {
      const x = d.start_date ?? date;
      setMsg({ type: 'ok', text: `Цикл отсчитывается с ${x}.` });
      await qc.invalidateQueries({ queryKey: ['admin', 'prayer-cycle-roster'] });
      await qc.invalidateQueries({ queryKey: ['calendar'] });
    },
    onError: (e) => setMsg({ type: 'err', text: apiErrorMessage(e, 'Не удалось запустить цикл.') }),
  });

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[var(--shadow)]">
        <h2 className="text-lg font-semibold text-stone-900">Молитвенный календарь</h2>
        <div className="mt-5 flex items-start">
          <div className="flex flex-1 items-center">
            {[
              { id: 'cal-anchor', label: 'Дата старта' },
              { id: 'cal-roster', label: 'Очередь' },
              { id: 'cal-content', label: 'Контент' },
            ].map((step, i, arr) => (
              <div key={step.id} className="flex flex-1 items-start">
                <a href={`#${step.id}`} className="group flex flex-col items-center gap-1 text-center">
                  <span
                    className={[
                      'flex h-8 w-8 items-center justify-center rounded-full border-2 text-[13px] font-semibold transition',
                      i === 0
                        ? 'border-[#7B2D3F] bg-[#7B2D3F] text-white'
                        : i === 1
                          ? 'border-[#7B2D3F] bg-white text-[#7B2D3F]'
                          : 'border-stone-200 bg-white text-stone-400 group-hover:border-stone-300',
                    ].join(' ')}
                  >
                    {i + 1}
                  </span>
                  <span
                    className={[
                      'whitespace-nowrap text-[11px]',
                      i === 1 ? 'font-medium text-[#7B2D3F]' : 'text-stone-400',
                    ].join(' ')}
                  >
                    {step.label}
                  </span>
                </a>
                {i < arr.length - 1 ? (
                  <div className="mx-2 mt-4 h-[2px] flex-1 bg-stone-200" aria-hidden />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="cal-anchor"
        className="scroll-mt-6 rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]"
      >
        <div className="grid gap-5 lg:grid-cols-[1.2fr_auto] lg:items-end">
          <div>
            <h3 className="text-base font-semibold text-stone-900">Дата старта</h3>
            <div className="mt-3 flex gap-2 rounded-lg border-l-[3px] border-indigo-500 bg-indigo-50 px-4 py-3 text-[13px] text-stone-700">
              <span className="font-semibold text-indigo-700" aria-hidden>
                i
              </span>
              <span>Цикл молитвы начинается с выбранной даты и идет по списку членов церкви по кругу.</span>
            </div>
            <label className="mt-4 block text-sm font-medium text-stone-700">Дата начала отсчета цикла</label>
            <input
              type="date"
              className="mt-1 h-[42px] w-[220px] rounded-lg border border-stone-200 bg-white px-3.5 text-[15px] text-stone-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              className={btnPrimary('h-fit self-end whitespace-nowrap bg-[#7B2D3F]')}
              disabled={mut.isPending}
              onClick={() => {
                setMsg(null);
                mut.mutate();
              }}
            >
              {mut.isPending ? 'Сохранение…' : 'Сохранить дату'}
            </button>
          </div>
          {msg ? (
            <p
              className={
                msg.type === 'ok'
                  ? 'lg:col-span-2 text-sm font-medium text-emerald-700'
                  : 'lg:col-span-2 text-sm text-red-600'
              }
            >
              {msg.text}
            </p>
          ) : null}
        </div>
      </section>

      <section
        id="cal-roster"
        className="scroll-mt-6 rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-stone-900">Очередь членов</h3>
            <p className="mt-1 text-sm text-stone-600">
              Одна таблица очереди; добавление участников — кнопка «Не в очереди». Иконка ⋮⋮ меняет порядок в текущем цикле.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md border border-stone-200 bg-transparent px-3 py-1.5 text-xs font-medium text-stone-500 transition hover:bg-stone-50"
            onClick={() => void qc.invalidateQueries({ queryKey: ['admin', 'prayer-cycle-roster'] })}
          >
            Сбросить порядок
          </button>
        </div>
        <CalendarPrayerCycleRoster />
      </section>

      <section
        id="cal-content"
        className="scroll-mt-6 rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]"
      >
        <div className="mb-4 min-w-0">
          <h3 className="text-base font-semibold text-stone-900">Контент «Молитва»</h3>
          <p className="mt-1 text-sm text-stone-600">
            Глобальные темы, служения и отступники для ежедневных карточек. Поиск по тексту, полное
            чтение и удобное редактирование в отдельном окне.
          </p>
        </div>
        <div className="rounded-xl border border-stone-200/80 bg-white p-4">
          <GlobalNeedsSection />
        </div>
      </section>
    </div>
  );
}

function EventsSection() {
  const qc = useQueryClient();
  const eventsQ = useQuery({ queryKey: Q_EVENTS, queryFn: fetchAdminEvents });
  const categoryOptsQ = useQuery({
    queryKey: Q_EVENT_CATEGORY_OPTIONS,
    queryFn: fetchChurchEventCategoryOptions,
    staleTime: 300_000,
  });
  const categoryOptions =
    categoryOptsQ.data && categoryOptsQ.data.length > 0
      ? categoryOptsQ.data
      : CHURCH_EVENT_CATEGORY_OPTIONS_FALLBACK;
  const [note, setNote] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    event_date: new Date().toISOString().slice(0, 10),
    event_time: '11:00',
    recurrence_type: 'once' as 'once' | 'weekly',
    weekly_day: 0,
    is_active: true,
    category: 'service',
    poster_url: null as string | null,
  });
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const posterPreviewUrl = useMemo(
    () => (posterFile ? URL.createObjectURL(posterFile) : null),
    [posterFile],
  );
  useEffect(() => {
    return () => {
      if (posterPreviewUrl) URL.revokeObjectURL(posterPreviewUrl);
    };
  }, [posterPreviewUrl]);
  const [editing, setEditing] = useState<ChurchEventItem | null>(null);
  const [eventPlace, setEventPlace] = useState('');
  const [eventModalMode, setEventModalMode] = useState<'create' | 'edit' | null>(null);

  const invalidate = () => void qc.invalidateQueries({ queryKey: Q_EVENTS });
  const uploadedPosterSrc = resolvePublicUrl(form.poster_url);

  const categoryLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of categoryOptions) m.set(o.id, o.label);
    return m;
  }, [categoryOptions]);

  useEffect(() => {
    if (form.recurrence_type !== 'weekly') return;
    const ymd = nextOccurrenceLocalYmd(form.weekly_day);
    setForm((s) => (s.event_date === ymd ? s : { ...s, event_date: ymd }));
  }, [form.recurrence_type, form.weekly_day]);

  useEffect(() => {
    const opts = categoryOptions;
    if (!opts.length) return;
    const ids = new Set(opts.map((o) => o.id));
    setForm((s) => (ids.has(s.category) ? s : { ...s, category: opts[0].id }));
  }, [categoryOptions]);

  const createMut = useMutation({
    mutationFn: () =>
      createAdminEvent({
        title: form.title.trim(),
        description: form.description.trim(),
        event_date: form.event_date,
        event_time: form.event_time,
        recurrence_type: form.recurrence_type,
        weekly_day: form.recurrence_type === 'weekly' ? form.weekly_day : null,
        is_active: form.is_active,
        category: form.category.trim() || undefined,
        poster_url: form.poster_url,
      }),
    onSuccess: () => {
      setPosterFile(null);
      setEventModalMode(null);
      setForm((s) => ({ ...s, title: '', description: '', poster_url: null }));
      setNote({ type: 'ok', text: 'Событие добавлено.' });
      invalidate();
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось добавить событие.') }),
  });

  const uploadPosterMut = useMutation({
    mutationFn: async () => {
      if (!posterFile) throw new Error('no_file');
      return await uploadChurchEventPoster(posterFile);
    },
    onSuccess: (r) => {
      setForm((s) => ({ ...s, poster_url: r.poster_url }));
      setNote({ type: 'ok', text: 'Постер загружен.' });
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось загрузить постер.') }),
  });

  const updateMut = useMutation({
    mutationFn: (payload: ChurchEventItem) =>
      updateAdminEvent(payload.id, {
        title: payload.title.trim(),
        description: payload.description,
        event_date: payload.event_date,
        event_time: payload.event_time,
        recurrence_type: payload.recurrence_type,
        weekly_day: payload.recurrence_type === 'weekly' ? payload.weekly_day ?? 0 : null,
        is_active: payload.is_active,
        ...(payload.category !== undefined ? { category: payload.category } : {}),
      }),
    onSuccess: () => {
      setNote({ type: 'ok', text: 'Событие обновлено.' });
      setEditing(null);
      invalidate();
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось обновить событие.') }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteAdminEvent(id),
    onSuccess: () => {
      setNote({ type: 'ok', text: 'Событие удалено.' });
      invalidate();
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось удалить событие.') }),
  });

  return (
    <div className="space-y-4">
      {note ? (
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
      ) : null}

      <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow)] sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-stone-900">Мероприятия</h2>
            <p className="mt-1 text-sm text-stone-600">Анонсы и расписание мероприятий</p>
          </div>
          <button
            type="button"
            className={btnPrimary('bg-[#7B2D3F] text-xs')}
            id="add-event-btn"
            onClick={() => {
              setForm({
                title: '',
                description: '',
                event_date: new Date().toISOString().slice(0, 10),
                event_time: '11:00',
                recurrence_type: 'once',
                weekly_day: 0,
                is_active: true,
                category: categoryOptions[0]?.id ?? 'service',
                poster_url: null,
              });
              setPosterFile(null);
              setEventPlace('');
              setEditing(null);
              setEventModalMode('create');
            }}
          >
            + Добавить событие
          </button>
        </div>
      </section>

      {eventsQ.isLoading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-stone-100" />
      ) : eventsQ.isError ? (
        <p className="text-sm text-red-600">{apiErrorMessage(eventsQ.error, 'Не удалось загрузить список событий.')}</p>
      ) : (eventsQ.data ?? []).length === 0 ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-stone-200 bg-white text-center">
          <LuCalendarDays className="h-10 w-10 text-[#7B2D3F]" aria-hidden />
          <p className="mt-3 text-base font-medium text-stone-900">Нет предстоящих событий</p>
          <button
            type="button"
            className="mt-4 rounded-md bg-[#7B2D3F] px-3.5 py-2 text-xs font-medium text-white"
            onClick={() => setEventModalMode('create')}
          >
            + Добавить первое
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {(eventsQ.data ?? []).map((ev) => {
            const d = new Date(ev.event_date);
            const day = Number.isNaN(d.getTime()) ? ev.event_date.slice(8, 10) : String(d.getDate());
            const month =
              Number.isNaN(d.getTime())
                ? ev.event_date.slice(5, 7)
                : d.toLocaleString('ru-RU', { month: 'short' }).replace('.', '').toUpperCase();
            const catLabel = ev.category ? categoryLabelById.get(ev.category) ?? ev.category : '';
            return (
              <article
                key={ev.id}
                className="flex items-start gap-4 rounded-[10px] border border-[#F0E9EA] bg-white p-4"
              >
                <div className="w-12 shrink-0 rounded-lg bg-[#F3EEF0] py-2 text-center">
                  <div className="text-[22px] font-bold leading-none text-[#7B2D3F]">{day}</div>
                  <div className="mt-1 text-[10px] font-semibold tracking-[0.5px] text-[#9B5466]">{month}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold text-stone-900">{ev.title}</div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-stone-500">
                    <span>🕑 {ev.event_time}</span>
                    <span>📍 {catLabel || 'Главный зал'}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-stone-600">
                    {ev.description || 'Описание не указано.'}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-200 bg-transparent text-sm text-stone-600"
                    onClick={() => {
                      const raw = ev.category ?? '';
                      const category = categoryOptions.some((o) => o.id === raw)
                        ? raw
                        : categoryOptions[0]?.id ?? 'service';
                      setEditing({ ...ev, event_date: dateInputValueFromApi(ev.event_date), category });
                      setEventPlace(categoryLabelById.get(category) ?? '');
                      setEventModalMode('edit');
                    }}
                    aria-label="Редактировать событие"
                  >
                    ✏
                  </button>
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-red-100 bg-transparent text-sm text-red-500"
                    onClick={() => {
                      if (!window.confirm(`Удалить событие «${ev.title}»?`)) return;
                      setNote(null);
                      deleteMut.mutate(ev.id);
                    }}
                    aria-label="Удалить событие"
                  >
                    🗑
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {eventModalMode && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/45 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setEventModalMode(null);
              setEditing(null);
            }
          }}
        >
          <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-stone-100 px-5 py-4">
              <h3 className="text-base font-semibold text-stone-900">
                {eventModalMode === 'create' ? 'Добавить событие' : 'Редактировать событие'}
              </h3>
            </div>
            <div className="space-y-3 p-5">
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-600">Название</label>
                <input
                  className={fieldClass()}
                  value={eventModalMode === 'edit' ? (editing?.title ?? '') : form.title}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (eventModalMode === 'edit') setEditing((s) => (s ? { ...s, title: v } : s));
                    else setForm((s) => ({ ...s, title: v }));
                  }}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-600">Описание</label>
                <textarea
                  rows={4}
                  className={`${fieldClass()} resize-y`}
                  value={eventModalMode === 'edit' ? (editing?.description ?? '') : form.description}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (eventModalMode === 'edit') setEditing((s) => (s ? { ...s, description: v } : s));
                    else setForm((s) => ({ ...s, description: v }));
                  }}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-600">Дата</label>
                  <input
                    type="date"
                    className={fieldClass()}
                    value={eventModalMode === 'edit' ? (editing?.event_date ?? '') : form.event_date}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (eventModalMode === 'edit') setEditing((s) => (s ? { ...s, event_date: v } : s));
                      else setForm((s) => ({ ...s, event_date: v }));
                    }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-600">Время</label>
                  <input
                    type="time"
                    className={fieldClass()}
                    value={eventModalMode === 'edit' ? (editing?.event_time ?? '') : form.event_time}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (eventModalMode === 'edit') setEditing((s) => (s ? { ...s, event_time: v } : s));
                      else setForm((s) => ({ ...s, event_time: v }));
                    }}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-600">Место</label>
                <input
                  className={fieldClass()}
                  value={eventPlace}
                  onChange={(e) => setEventPlace(e.target.value)}
                  placeholder="Например: Главный зал"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-600">Изображение</label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="file"
                    accept="image/*"
                    className={fieldClass()}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setPosterFile(f);
                      if (eventModalMode === 'create') setForm((s) => ({ ...s, poster_url: null }));
                    }}
                  />
                  <button
                    type="button"
                    className={btnSecondary('text-xs')}
                    disabled={!posterFile || uploadPosterMut.isPending}
                    onClick={() => {
                      setNote(null);
                      uploadPosterMut.mutate();
                    }}
                  >
                    {uploadPosterMut.isPending ? 'Загрузка…' : 'Загрузить'}
                  </button>
                </div>
                {posterPreviewUrl || uploadedPosterSrc ? (
                  <img
                    src={posterPreviewUrl ?? uploadedPosterSrc ?? ''}
                    alt=""
                    className="mt-2 h-20 w-20 rounded-lg border border-stone-200 object-cover"
                    loading="lazy"
                  />
                ) : null}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-stone-100 px-5 py-3">
              <button
                type="button"
                className={btnSecondary()}
                onClick={() => {
                  setEventModalMode(null);
                  setEditing(null);
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                className={btnPrimary('bg-[#7B2D3F]')}
                disabled={eventModalMode === 'edit' ? updateMut.isPending : createMut.isPending}
                onClick={() => {
                  setNote(null);
                  if (eventModalMode === 'edit') {
                    if (!editing) return;
                    updateMut.mutate(editing);
                  } else {
                    createMut.mutate();
                  }
                  setEventModalMode(null);
                  setEditing(null);
                }}
              >
                {eventModalMode === 'edit'
                  ? updateMut.isPending
                    ? 'Сохранение…'
                    : 'Сохранить'
                  : createMut.isPending
                    ? 'Сохранение…'
                    : 'Сохранить'}
              </button>
            </div>
          </div>
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
  const [editingDirId, setEditingDirId] = useState<number | null>(null);
  const [editingRoleIds, setEditingRoleIds] = useState<number[]>([]);

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

  const saveDirRoles = useMutation({
    mutationFn: () => {
      if (!editingDirId) throw new Error('no direction');
      return setDirectionTemplateRoles(editingDirId, editingRoleIds);
    },
    onSuccess: () => {
      setNote({ type: 'ok', text: 'Связи сохранены.' });
      setEditingDirId(null);
      setEditingRoleIds([]);
      invDirs();
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось сохранить связи.') }),
  });

  const loading = roles.isLoading || dirs.isLoading;
  const allRoles = roles.data ?? [];
  const allDirs = (dirs.data ?? []) as MinistryDirectionTemplate[];
  const editingDir = editingDirId ? (allDirs.find((d) => d.id === editingDirId) ?? null) : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600">
        Эти списки подставляются как подсказки при заполнении полей «роль служения» и «направление» у
        пользователя — удобно держать единый словарь.
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
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="h-56 animate-pulse rounded-xl bg-stone-200/50" />
          <div className="h-56 animate-pulse rounded-xl bg-stone-200/50" />
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-xl border border-[#F0E9EA] bg-white p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold text-stone-900">Роли служений</h3>
                <p className="mt-0.5 text-xs text-stone-400">Должности для участников служения</p>
              </div>
              <span className="shrink-0 rounded-[10px] bg-[#F3EEF0] px-2 py-0.5 text-xs font-semibold text-[#7B2D3F]">
                {(roles.data ?? []).length}
              </span>
            </div>
            <div className="mb-3 max-h-[300px] overflow-y-auto">
              {(roles.data ?? []).map((t) => (
                <div
                  key={t.id}
                  className="group mb-0.5 flex items-center gap-2 rounded-md px-2.5 py-2 transition hover:bg-stone-50"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-stone-300" aria-hidden />
                  <span className="flex-1 text-sm text-stone-800">{t.title}</span>
                  <button
                    type="button"
                    className="flex h-5 w-5 items-center justify-center rounded text-base text-stone-400 opacity-0 transition group-hover:opacity-100 hover:text-red-500"
                    onClick={() => {
                      setNote(null);
                      delRole.mutate(t.id);
                    }}
                    aria-label="Удалить роль"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 border-t border-stone-100 pt-3">
              <input
                className="h-9 flex-1 rounded-lg border border-stone-200 px-3 text-sm outline-none focus:border-[#7B2D3F]"
                placeholder="Добавить роль..."
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
              />
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#7B2D3F] text-xl leading-none text-white"
                disabled={!roleTitle.trim() || addRole.isPending}
                onClick={() => {
                  setNote(null);
                  addRole.mutate();
                }}
                aria-label="Добавить роль"
              >
                +
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-[#F0E9EA] bg-white p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold text-stone-900">Направления</h3>
                <p className="mt-0.5 text-xs text-stone-400">Группы служений и связанные роли</p>
              </div>
              <span className="shrink-0 rounded-[10px] bg-[#F3EEF0] px-2 py-0.5 text-xs font-semibold text-[#7B2D3F]">
                {allDirs.length}
              </span>
            </div>
            <div className="mb-3 max-h-[300px] overflow-y-auto">
              {allDirs.map((t) => (
                <div
                  key={t.id}
                  className="group mb-0.5 flex items-center gap-2 rounded-md px-2.5 py-2 transition hover:bg-stone-50"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-stone-300" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-stone-800">{t.title}</div>
                    <div className="truncate text-[11px] text-stone-400">Ролей: {(t.roles ?? []).length}</div>
                  </div>
                  <button
                    type="button"
                    className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-stone-600 hover:bg-stone-100"
                    onClick={() => {
                      setNote(null);
                      setEditingDirId(t.id);
                      setEditingRoleIds((t.roles ?? []).map((r) => r.id));
                    }}
                  >
                    Роли
                  </button>
                  <button
                    type="button"
                    className="flex h-5 w-5 items-center justify-center rounded text-base text-stone-400 opacity-0 transition group-hover:opacity-100 hover:text-red-500"
                    onClick={() => {
                      setNote(null);
                      delDir.mutate(t.id);
                    }}
                    aria-label="Удалить направление"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 border-t border-stone-100 pt-3">
              <input
                className="h-9 flex-1 rounded-lg border border-stone-200 px-3 text-sm outline-none focus:border-[#7B2D3F]"
                placeholder="Добавить направление..."
                value={dirTitle}
                onChange={(e) => setDirTitle(e.target.value)}
              />
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#7B2D3F] text-xl leading-none text-white"
                disabled={!dirTitle.trim() || addDir.isPending}
                onClick={() => {
                  setNote(null);
                  addDir.mutate();
                }}
                aria-label="Добавить направление"
              >
                +
              </button>
            </div>
          </section>
        </div>
      )}

      {editingDir ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-extrabold text-stone-900 truncate">
                  Роли для: {editingDir.title}
                </h3>
                <p className="mt-1 text-xs text-stone-500">
                  Отметь роли, которые будут доступны при выборе этого направления.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-stone-500 hover:bg-black/5"
                onClick={() => {
                  setEditingDirId(null);
                  setEditingRoleIds([]);
                }}
                aria-label="Закрыть"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 max-h-[55dvh] overflow-y-auto rounded-xl border border-stone-200/80 p-3">
              {(allRoles.length === 0) ? (
                <p className="py-6 text-center text-sm text-stone-500">Список ролей пуст.</p>
              ) : (
                <div className="space-y-2">
                  {allRoles.map((r) => {
                    const checked = editingRoleIds.includes(r.id);
                    return (
                      <label
                        key={r.id}
                        className="flex min-w-0 cursor-pointer items-center gap-2 rounded-xl border border-stone-100 bg-stone-50/40 px-3 py-2 text-sm text-stone-800 hover:bg-stone-50"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 rounded border-stone-300 text-primary"
                          checked={checked}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setEditingRoleIds((prev) => {
                              if (on) return prev.includes(r.id) ? prev : [...prev, r.id];
                              return prev.filter((x) => x !== r.id);
                            });
                          }}
                        />
                        <span className="min-w-0 flex-1 truncate">{r.title}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className={btnPrimary('flex-1')}
                disabled={saveDirRoles.isPending}
                onClick={() => {
                  setNote(null);
                  saveDirRoles.mutate();
                }}
              >
                {saveDirRoles.isPending ? 'Сохранение…' : 'Сохранить'}
              </button>
              <button
                type="button"
                className={btnSecondary('flex-1')}
                disabled={saveDirRoles.isPending}
                onClick={() => {
                  setEditingDirId(null);
                  setEditingRoleIds([]);
                }}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SmsSection() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: Q_SMS,
    queryFn: fetchSmsSettings,
  });
  const [form, setForm] = useState({
    enabled: false,
    api_id: '',
    sender_name: '',
    reset_secret: '',
  });
  const [note, setNote] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setForm({
      enabled: data.enabled,
      api_id: '',
      sender_name: data.sender_name ?? '',
      reset_secret: '',
    });
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () =>
      patchSmsSettings({
        enabled: form.enabled,
        api_id: normalizeUiOptionalUpdateString(form.api_id),
        sender_name: normalizeUiString(form.sender_name),
        reset_secret: normalizeUiOptionalUpdateString(form.reset_secret),
      }),
    onSuccess: (next) => {
      setNote({ type: 'ok', text: 'SMS.ru настройки сохранены.' });
      qc.setQueryData(Q_SMS, next);
      setForm((prev) => ({ ...prev, api_id: '', reset_secret: '' }));
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось сохранить SMS.ru настройки.') }),
  });

  if (isLoading) {
    return <div className="h-44 animate-pulse rounded-2xl bg-stone-200/50" />;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/80 p-6 text-center">
        <p className="font-semibold text-red-900">Не удалось загрузить SMS.ru настройки</p>
        <p className="mt-2 text-sm text-red-800">{apiErrorMessage(error, 'Ошибка сети или сервера.')}</p>
        <button
          type="button"
          className={`${btnPrimary('mt-4')}`}
          onClick={() => void qc.invalidateQueries({ queryKey: Q_SMS })}
        >
          Обновить
        </button>
      </div>
    );
  }

  const settings = (data ?? {
    enabled: false,
    api_id_masked: null,
    sender_name: null,
    has_api_id: false,
    has_reset_secret: false,
  }) satisfies SmsSettingsResponse;

  return (
    <div className="max-w-3xl space-y-5">
      {note ? (
        <div
          className={
            note.type === 'ok'
              ? 'rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900'
              : 'rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900'
          }
        >
          {note.text}
        </div>
      ) : null}

      <section className="rounded-xl border border-[#F0E9EA] bg-white p-5">
        <div className="mb-5 flex items-center gap-3">
          <span
            className={`h-2.5 w-2.5 rounded-full ${form.enabled ? 'bg-emerald-500' : 'bg-stone-400'}`}
            aria-hidden
          />
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-stone-900">SMS.ru</h3>
            <p className="mt-0.5 text-xs text-stone-500">Восстановление пароля по SMS-коду</p>
          </div>
          <label className="relative ml-auto inline-block h-5 w-9 shrink-0">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={form.enabled}
              onChange={(e) => setForm((s) => ({ ...s, enabled: e.target.checked }))}
            />
            <span className="absolute inset-0 cursor-pointer rounded-[10px] bg-stone-200 transition-colors peer-checked:bg-[#7B2D3F]" />
            <span className="absolute left-[3px] top-[3px] h-[14px] w-[14px] rounded-full bg-white transition-transform peer-checked:translate-x-4" />
          </label>
        </div>

        <div className="grid gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-600">SMS.ru API ID</label>
            <input
              className={fieldClass()}
              value={form.api_id}
              onChange={(e) => setForm((s) => ({ ...s, api_id: e.target.value }))}
              placeholder={settings.api_id_masked ? `Текущий: ${settings.api_id_masked}` : 'Введите API ID'}
            />
            <p className="mt-1 text-xs text-stone-500">
              Оставьте пустым, чтобы не менять. Также можно задать через `SMS_RU_API_ID` в окружении.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-600">Имя отправителя (опционально)</label>
            <input
              className={fieldClass()}
              value={form.sender_name}
              onChange={(e) => setForm((s) => ({ ...s, sender_name: e.target.value }))}
              placeholder="ISTOCHNIK"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-600">Секрет reset-кодов</label>
            <input
              className={fieldClass()}
              value={form.reset_secret}
              onChange={(e) => setForm((s) => ({ ...s, reset_secret: e.target.value }))}
              placeholder={settings.has_reset_secret ? 'Текущий секрет скрыт' : 'Введите длинный секрет'}
            />
            <p className="mt-1 text-xs text-stone-500">
              Используется для хеширования SMS-кодов и токенов восстановления.
            </p>
          </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-stone-600">
          <span className={`h-1.5 w-1.5 rounded-full ${settings.has_api_id ? 'bg-emerald-500' : 'bg-red-500'}`} aria-hidden />
          API ID: {settings.has_api_id ? 'задан' : 'не задан'}
          <span className="mx-1 text-stone-300">·</span>
          <span className={`h-1.5 w-1.5 rounded-full ${settings.has_reset_secret ? 'bg-emerald-500' : 'bg-red-500'}`} aria-hidden />
          Reset secret: {settings.has_reset_secret ? 'задан' : 'не задан'}
        </div>

        <button
          type="button"
          className={`${btnPrimary('mt-4')}`}
          disabled={saveMut.isPending}
          onClick={() => {
            setNote(null);
            saveMut.mutate();
          }}
        >
          {saveMut.isPending ? 'Сохранение…' : 'Сохранить настройки'}
        </button>
      </section>
    </div>
  );
}

function normalizeUiString(value: string): string | null {
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function normalizeUiOptionalUpdateString(value: string): string | undefined {
  const t = value.trim();
  return t.length > 0 ? t : undefined;
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
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800">
          ⚠ Настройки хранятся в браузере (localStorage) и не синхронизируются между устройствами.
        </div>

        <div className="mt-5 rounded-[10px] bg-[#F3EEF0] px-5 py-4 text-center">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.5px] text-[#9B5466]">
            Предпросмотр шапки
          </div>
          <div className="text-[20px] font-bold text-[#7B2D3F]">{localName.trim() || appName}</div>
          <div className="mt-0.5 text-[13px] text-[#9B5466]">{localDesc.trim() || description}</div>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-stone-700">Название церкви</label>
            <input
              className="h-[42px] w-full rounded-lg border border-stone-200 px-3.5 text-[15px] outline-none focus:border-[#7B2D3F]"
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-stone-700">Подзаголовок</label>
            <input
              className="h-[42px] w-full rounded-lg border border-stone-200 px-3.5 text-[15px] outline-none focus:border-[#7B2D3F]"
              value={localDesc}
              onChange={(e) => setLocalDesc(e.target.value)}
            />
          </div>
          <button
            type="button"
            className={btnPrimary('bg-[#7B2D3F]')}
            onClick={() =>
              updateBranding({
                appName: localName.trim() || appName,
                description: localDesc.trim() || description,
              })
            }
          >
            Сохранить оформление
          </button>
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
        <label className="mt-4 flex min-w-0 items-start gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0 rounded border-stone-300"
            checked={removeLightBackground}
            onChange={(e) => updateBranding({ removeLightBackground: e.target.checked })}
          />
          <span className="min-w-0 flex-1">Убирать светлый фон при загрузке PNG/JPEG</span>
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-[1rem] border border-stone-200 bg-stone-50 p-1.5 focus:border-primary">
            {customLogoDataUrl ? (
              <img
                src={customLogoDataUrl}
                alt=""
                className="max-h-full max-w-full object-contain"
                style={{ transform: `scale(${logoScalePercent / 100})` }}
              />
            ) : (
              <img src="/assets/logo.svg" alt="" className="h-full w-full object-contain drop-shadow-sm opacity-60 grayscale-[1]" />
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
