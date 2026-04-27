import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  type FormEvent,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react';

import {
  LuCalendarDays,
  LuChevronDown,
  LuClipboardList,
  LuGripVertical,
  LuHistory,
  LuImage,
  LuMessageSquare,
  LuPenLine,
  LuSend,
  LuTable2,
  LuX,
} from 'react-icons/lu';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

import { ADMIN_TABS, type AdminTabId } from '../adminTabs';
import { AccessRequestsSection } from '../AccessRequestsSection';
import { AiSettingsSection } from '../AiSettingsSection';
import { AppSectionsAccessSection } from '../AppSectionsAccessSection';
import { NotificationsSettingsSection } from '../NotificationsSettingsSection';
import { ProjectJournalSection } from '../ProjectJournalSection';
import { DiagnosticsDashboardSection } from '../DiagnosticsDashboardSection';
import { useBrandingStore } from '../../branding/brandingStore';
import {
  addAdminPrayerRequestHistory,
  anchorPrayerCycleMember,
  apiErrorMessage,
  bulkCreateAdminMembers,
  createAdminMember,
  createBacksliderApi,
  createAdminEvent,
  createDirectionTemplate,
  createGlobalThemeApi,
  createMinistryApi,
  createRoleTemplate,
  deleteAdminMember,
  deleteBacksliderApi,
  deleteAdminEvent,
  deleteAllAdminEvents,
  deleteDirectionTemplate,
  deleteGlobalThemeApi,
  deleteMinistryApi,
  deleteRoleTemplate,
  fetchAdminMembers,
  fetchPrayerCycleRoster,
  savePrayerCycleRosterOrder,
  fetchDirectionTemplates,
  fetchAdminEvents,
  fetchChurchEventCategoryOptions,
  uploadChurchEventPoster,
  fetchGlobalBacksliders,
  fetchGlobalMinistries,
  fetchGlobalThemes,
  fetchRoleTemplates,
  fetchTelegramSettings,
  fetchSmsSettings,
  mergeDuplicateMembers,
  swapAllMembersFirstLastNames,
  patchTelegramSettings,
  patchSmsSettings,
  sendTelegramMessage,
  setDirectionTemplateRoles,
  setMemberAppRoles,
  setOneTimeMemberDate,
  startPrayerCycle,
  updateAdminEvent,
  updateAdminMember,
  updateBacksliderApi,
  updateGlobalThemeApi,
  updateMinistryApi,
  type MinistryDirectionTemplate,
  type ChurchEventItem,
  type TelegramSettingsResponse,
  type SmsSettingsResponse,
} from '../api';
import { NextWeekPrayerPlanSection } from '../../calendar/components/NextWeekPrayerPlanSection';
import { CHURCH_EVENT_CATEGORY_OPTIONS_FALLBACK } from '../churchEventCategoryOptions';
import { dateInputValueFromApi } from '../../../lib/dateInputValueFromApi';
import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { nextOccurrenceLocalYmd } from '../../../lib/weekdayAnchor';
import {
  compareMembersByPrayerCycleOrder,
  memberRosterName,
  splitMemberNameParts,
} from '../../../lib/memberRosterName';
import type { AppUser } from '../types';
import { fetchMe, fetchPrayerRequestHistory, type PrayerHistoryItem } from '../../profile/api';

function appRoleLabel(role: string): string {
  switch (role) {
    case 'admin':
      return 'Администратор';
    case 'minister':
      return 'Служитель';
    case 'pastor':
      return 'Пастор';
    case 'editor':
      return 'Редактор каталога';
    case 'musician':
      return 'Музыкант';
    default:
      return 'Член церкви';
  }
}

function appRoleBadgeClass(role: string): string {
  if (role === 'admin') {
    return 'rounded-full bg-primary/12 px-2.5 py-0.5 text-xs font-bold text-primary';
  }
  if (role === 'pastor') {
    return 'rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-900';
  }
  if (role === 'minister') {
    return 'rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900';
  }
  if (role === 'editor') {
    return 'rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-800';
  }
  if (role === 'musician') {
    return 'rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-900';
  }
  return 'rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-600';
}

const Q_MEMBERS = ['admin', 'members'] as const;
const Q_ROLES = ['admin', 'templates', 'roles'] as const;
const Q_DIRS = ['admin', 'templates', 'directions'] as const;
const Q_GT = ['admin', 'global', 'themes'] as const;
const Q_GM = ['admin', 'global', 'ministries'] as const;
const Q_GB = ['admin', 'global', 'backsliders'] as const;
const Q_EVENTS = ['admin', 'events'] as const;
const Q_EVENT_CATEGORY_OPTIONS = ['admin', 'church-event-category-options'] as const;
const Q_TG = ['admin', 'telegram', 'settings'] as const;
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
          ? 'inline-flex items-center gap-1 rounded-full border border-emerald-200/90 bg-gradient-to-r from-emerald-50 to-teal-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-900 shadow-sm shadow-emerald-900/5'
          : 'inline-flex items-center gap-1 rounded-full border border-amber-200/90 bg-gradient-to-r from-amber-50 to-orange-50/80 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-950 shadow-sm shadow-amber-900/5'
      }
      title={
        ok
          ? 'Пароль задан — можно войти в приложение по телефону'
          : 'В списке пользователей, но вход в приложение ещё не оформлен'
      }
    >
      {ok ? (
        <>
          <span className="text-emerald-600" aria-hidden>
            ✓
          </span>
          В приложении
        </>
      ) : (
        <>
          <span className="text-amber-700/90" aria-hidden>
            ○
          </span>
          Нет входа
        </>
      )}
    </span>
  );
}

function splitNameForEditForm(u: AppUser): { first_name: string; last_name: string } {
  const p = splitMemberNameParts(u);
  return { first_name: p.first, last_name: p.last };
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
    <div className="mx-auto w-full min-w-0 max-w-6xl px-3 py-3 sm:px-4 sm:py-4 shell:px-6 shell:py-6">
      <header className="mb-4 overflow-hidden rounded-3xl border border-stone-200/80 bg-gradient-to-br from-primary/[0.07] via-[var(--surface-elevated)] to-stone-50/90 p-5 shadow-[var(--shadow)] sm:mb-5">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-primary/85">Настройки</p>
        <h1 className="mt-2 text-[22px] font-extrabold tracking-tight text-stone-900 shell:text-2xl">
          Админ-панель
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">{meta.description}</p>
      </header>

      {/* Разделы — горизонтальная полоса: на узком экране прокрутка, на шире — перенос строк */}
      <nav
        className="sticky top-0 z-20 -mx-3 mb-5 rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] px-2 py-2.5 shadow-[var(--shadow)] backdrop-blur-sm supports-[backdrop-filter]:bg-[var(--surface-elevated)]/95 sm:-mx-4 sm:mb-6 sm:px-3 md:mx-0"
        aria-label="Разделы панели"
      >
        <p className="px-1.5 pb-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-stone-400">
          Разделы панели
        </p>
        <div className="flex max-md:snap-x max-md:snap-mandatory max-md:flex-nowrap max-md:gap-2 max-md:overflow-x-auto max-md:pb-1 max-md:[-ms-overflow-style:none] max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden md:flex-wrap md:gap-2">
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
                    ? 'touch-manipulation group flex min-h-[44px] min-w-[min(100%,11rem)] shrink-0 snap-start items-center gap-2 rounded-xl bg-primary px-3 py-2 text-left text-sm font-bold text-white shadow-md shadow-primary/20 max-md:max-w-[85vw] active:scale-[0.99] md:min-w-0 md:flex-1 md:basis-[calc(50%-0.25rem)] lg:flex-none lg:basis-auto'
                    : 'touch-manipulation group flex min-h-[44px] min-w-[min(100%,11rem)] shrink-0 snap-start items-center gap-2 rounded-xl border border-stone-200/90 bg-white/80 px-3 py-2 text-left text-sm font-semibold text-stone-800 transition hover:border-stone-300 hover:bg-stone-50 max-md:max-w-[85vw] active:scale-[0.99] md:min-w-0 md:flex-1 md:basis-[calc(50%-0.25rem)] lg:flex-none lg:basis-auto'
                }
              >
                <span
                  className={
                    active
                      ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/20'
                      : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-100 group-hover:bg-stone-200/80'
                  }
                  aria-hidden
                >
                  <TabIcon
                    className={`h-5 w-5 transition-colors ${active ? 'text-white' : 'text-stone-600 group-hover:text-primary'}`}
                  />
                </span>
                <span className="min-w-0 leading-tight">
                  <span className="block sm:hidden">{t.short}</span>
                  <span className="hidden sm:block">{t.label}</span>
                  <span
                    className={
                      active
                        ? 'mt-0.5 hidden text-[10px] font-medium text-white/85 sm:block'
                        : 'mt-0.5 hidden text-[10px] font-medium text-stone-500 sm:block'
                    }
                  >
                    {t.short}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className="mb-3 flex items-center gap-3 sm:mb-4">
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
      {tab === 'requests' && <AccessRequestsSection />}
      {tab === 'calendar' && <CalendarSection />}
      {tab === 'events' && <EventsSection />}
      {tab === 'templates' && <TemplatesSection />}
      {tab === 'project' && <ProjectSection />}
      {tab === 'sections' && <AppSectionsAccessSection />}
      {tab === 'journal' && <ProjectJournalSection />}
      {tab === 'notifications' && <NotificationsSettingsSection />}
      {tab === 'telegram' && <TelegramSection />}
      {tab === 'diagnostics' && <DiagnosticsDashboardSection />}
      {tab === 'integrations' && <IntegrationsSection />}
    </div>
  );
}

function IntegrationsSection() {
  const [subTab, setSubTab] = useState<'sms' | 'ai'>('sms');
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-3 shadow-[var(--shadow)]">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={
              subTab === 'sms'
                ? 'rounded-xl bg-primary px-3 py-2 text-sm font-bold text-white shadow-md shadow-primary/20'
                : 'rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50'
            }
            onClick={() => setSubTab('sms')}
          >
            SMS.ru
          </button>
          <button
            type="button"
            className={
              subTab === 'ai'
                ? 'rounded-xl bg-primary px-3 py-2 text-sm font-bold text-white shadow-md shadow-primary/20'
                : 'rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50'
            }
            onClick={() => setSubTab('ai')}
          >
            ИИ интеграции
          </button>
        </div>
      </section>

      {subTab === 'sms' ? <SmsSection /> : <AiSettingsSection />}
    </div>
  );
}

function MembersSection() {
  const qc = useQueryClient();
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: Q_MEMBERS,
    queryFn: fetchAdminMembers,
  });
  const dirsQ = useQuery({ queryKey: Q_DIRS, queryFn: fetchDirectionTemplates, staleTime: 30_000 });

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
    in_prayer_cycle: false,
  });
  const [oneTimeId, setOneTimeId] = useState<number | null>(null);
  const [oneTimeDate, setOneTimeDate] = useState('');
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

  const filtered = useMemo(() => {
    const list = data ?? [];
    const q = search.trim().toLowerCase();
    const matched = !q
      ? list
      : list.filter((u) => {
          const blob =
            `${memberRosterName(u)} ${displayName(u)} ${u.phone_number ?? ''} ${u.email ?? ''}`.toLowerCase();
          return blob.includes(q);
        });
    return [...matched].sort(compareMembersByPrayerCycleOrder);
  }, [data, search]);

  const dirs = (dirsQ.data ?? []) as MinistryDirectionTemplate[];
  const rolesForDirection = (directionTitle: string) => {
    const fromDirection = (dirs.find((d) => d.title === directionTitle)?.roles ?? []).map((r) => r.title);
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
      active: list.filter((u) => u.is_active).length,
      admins: list.filter((u) => u.app_role === 'admin').length,
      registered,
      withoutApp: Math.max(0, list.length - registered),
    };
  }, [data]);

  const createPayload = () => ({
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim(),
    phone_number: form.phone_number.trim(),
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
        birth_date: '',
        ministry_role: '',
        ministry_direction: '',
      });
      invalidate();
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

  const roleMut = useMutation({
    mutationFn: ({
      id,
      roles,
    }: {
      id: number;
      roles: Array<'member' | 'minister' | 'pastor' | 'musician' | 'editor' | 'admin'>;
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
    const { first_name: ef, last_name: el } = splitNameForEditForm(u);
    setEditForm({
      first_name: ef,
      last_name: el,
      phone_number: (u.phone_number ?? '').trim(),
      birth_date: dateInputValueFromApi(u.birth_date),
      ministry_role: normalizeMinistryRoles((u.ministry_role ?? '').trim()),
      ministry_direction: (u.ministry_direction ?? '').trim(),
      prayer_request: (u.prayer_request ?? '').trim(),
      is_active: u.is_active,
      in_prayer_cycle: u.in_prayer_cycle,
    });
  }

  function onCreate(e: FormEvent) {
    e.preventDefault();
    setBanner(null);
    createMut.mutate();
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

      <div className="rounded-2xl border border-sky-200/50 bg-gradient-to-br from-sky-50/95 via-white to-indigo-50/40 px-4 py-3.5 shadow-[var(--shadow)]">
        <p className="text-xs font-extrabold uppercase tracking-wide text-sky-900/80">Вход в приложение</p>
        <p className="mt-1.5 text-sm leading-relaxed text-stone-600">
          Не все в списке уже заходят в приложение: плашка{' '}
          <span className="whitespace-nowrap font-semibold text-emerald-800">«В приложении»</span> — пароль
          задан; <span className="whitespace-nowrap font-semibold text-amber-900">«Нет входа»</span> — карточка
          есть, регистрация ещё не пройдена.
        </p>
      </div>

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
            <span className="font-extrabold text-teal-700">{stats.registered}</span>
            <span className="text-stone-500"> в приложении</span>
          </span>
          <span>
            <span className="font-extrabold text-amber-800">{stats.withoutApp}</span>
            <span className="text-stone-500"> без входа</span>
          </span>
          <span>
            <span className="font-extrabold text-primary">{stats.admins}</span>
            <span className="text-stone-500"> админов</span>
          </span>
        </div>
        {isFetching && !isLoading ? (
          <span className="text-xs text-stone-400">Обновление…</span>
        ) : null}
        <button
          type="button"
          className={btnSecondary('shrink-0 text-xs')}
          disabled={mergeDupesMut.isPending || swapAllNamesMut.isPending}
          title="Слить в одну карточку записи с одинаковым именем и фамилией (безопаснее, если создавались дубликаты)"
          onClick={() => {
            if (
              !window.confirm(
                'Объединить дубликаты пользователей? Останется одна карточка с меньшим номером (старая запись), пароль и данные перенесутся.',
              )
            ) {
              return;
            }
            setBanner(null);
            mergeDupesMut.mutate();
          }}
        >
          {mergeDupesMut.isPending ? 'Объединение…' : 'Объединить дубликаты'}
        </button>
        <button
          type="button"
          className={btnSecondary('shrink-0 border-amber-200 text-xs text-amber-950 hover:bg-amber-50/80')}
          disabled={mergeDupesMut.isPending || swapAllNamesMut.isPending}
          title="Одно действие для всех: поменять местами колонки имени и фамилии. Повторное нажатие отменит эффект."
          onClick={() => {
            if (
              !window.confirm(
                'Поменять местами поля «имя» и «фамилия» у ВСЕХ пользователей сразу? Используйте только если данные были занесены в перепутанные колонки. Повторный запуск снова меняет местами всё (откат).',
              )
            ) {
              return;
            }
            setBanner(null);
            swapAllNamesMut.mutate();
          }}
        >
          {swapAllNamesMut.isPending ? 'Обновление…' : 'Поменять имя/фамилию у всех'}
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          className={`${fieldClass()} sm:max-w-xs`}
          placeholder="Поиск по имени или телефону…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Поиск пользователей"
        />
        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <button
            type="button"
            className={btnSecondary('')}
            onClick={() => setShowCreate((v) => !v)}
          >
            {showCreate ? 'Скрыть форму добавления' : 'Добавить пользователя'}
          </button>
          <button
            type="button"
            className={
              showBulkCreate
                ? `${btnPrimary('')} inline-flex items-center gap-2`
                : `${btnSecondary('')} inline-flex items-center gap-2`
            }
            onClick={() => setShowBulkCreate((v) => !v)}
          >
            <LuTable2 className="h-4 w-4 shrink-0" aria-hidden />
            Массово из таблицы
          </button>
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
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-stone-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-stone-300 text-primary focus:ring-primary/30"
                checked={bulkMergeDupes}
                onChange={(e) => setBulkMergeDupes(e.target.checked)}
              />
              При совпадении имени и фамилии — объединить с существующей карточкой
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
                      <input
                        className={`${fieldClass()} py-1.5 text-xs`}
                        type="date"
                        value={row.birth_date}
                        onChange={(e) => {
                          const v = e.target.value;
                          setBulkRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, birth_date: v } : r)));
                        }}
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

      {showCreate ? (
        <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow)] shell:p-5">
          <h3 className="text-sm font-extrabold text-stone-900">Новый пользователь</h3>
          <p className="mt-1 text-xs text-stone-500">
            Обязательны имя, фамилия, телефон и дата рождения. Служение можно указать позже в карточке.
          </p>
          <form onSubmit={onCreate} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
              <label className="mb-1 block text-xs font-semibold text-stone-600">Направление</label>
              <select
                className={fieldClass()}
                value={form.ministry_direction}
                onChange={(e) => {
                  const nextDir = e.target.value;
                  setForm((s) => {
                    return { ...s, ministry_direction: nextDir };
                  });
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
            <div className="sm:col-span-2 lg:col-span-3">
              <button
                type="submit"
                disabled={createMut.isPending || mergeOnCreateMut.isPending}
                className={btnPrimary()}
              >
                {createMut.isPending || mergeOnCreateMut.isPending
                  ? 'Сохранение…'
                  : 'Создать пользователя'}
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
              className="cursor-pointer rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow)] transition hover:border-primary/40 hover:shadow-md"
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
                <div>
                  <p className="font-bold text-stone-900">{memberRosterName(u)}</p>
                  <p className="mt-0.5 text-sm text-stone-600">{u.phone_number ?? '—'}</p>
                </div>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                  Карточка
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <MemberRegistrationBadge u={u} />
                <span className={appRoleBadgeClass(u.app_role)}>{appRoleLabel(u.app_role)}</span>
                <span
                  className={
                    u.is_active
                      ? 'rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800'
                      : 'rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-500'
                  }
                >
                  {u.is_active ? 'Активен' : 'Неактивен'}
                </span>
                {u.is_collection_coordinator ? (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                    Сбор
                  </span>
                ) : null}
                {u.in_prayer_cycle ? (
                  <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-900">
                    В цикле
                  </span>
                ) : (
                  <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-500">
                    Вне цикла
                  </span>
                )}
              </div>
            </article>
          ))
        )}
      </div>

      {/* Таблица — shell+; горизонтальный скролл без обрезки выпадающих меню по вертикали */}
      <div className="hidden rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] shadow-[var(--shadow)] shell:block">
        <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] scroll-smooth">
          <table className="min-w-[720px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50/90 text-xs font-extrabold uppercase tracking-wider text-stone-500">
                <th className="px-4 py-3">Пользователь</th>
                <th className="px-4 py-3 whitespace-nowrap">Вход</th>
                <th className="px-4 py-3">Телефон</th>
                <th className="px-4 py-3">Роль в приложении</th>
                <th className="px-4 py-3">Статус</th>
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
                  <tr
                    key={u.id}
                    className="cursor-pointer border-b border-stone-100/90 transition hover:bg-primary/[0.04] last:border-0"
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
                    <td className="px-4 py-3 font-semibold text-stone-900">{memberRosterName(u)}</td>
                    <td className="px-4 py-3 align-middle">
                      <MemberRegistrationBadge u={u} />
                    </td>
                    <td className="px-4 py-3 text-stone-600">{u.phone_number ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={appRoleBadgeClass(u.app_role)}>{appRoleLabel(u.app_role)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {u.is_active ? (
                          <span className="text-emerald-700">Активен</span>
                        ) : (
                          <span className="text-stone-500">Неактивен</span>
                        )}
                        {u.in_prayer_cycle ? (
                          <span className="text-xs font-semibold text-sky-800">В молитвенном цикле</span>
                        ) : (
                          <span className="text-xs font-semibold text-stone-400">Вне цикла</span>
                        )}
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
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="one-time-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 id="one-time-title" className="text-lg font-extrabold text-stone-900">
              Разовая дата в цикле
            </h3>
            <p className="mt-1 text-sm text-stone-600">
              Член церкви:{' '}
              <strong>{oneTimeSubject ? memberRosterName(oneTimeSubject) : `#${oneTimeId}`}</strong>
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
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditing(null);
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby={memberEditTitleId}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 border-b border-stone-100 bg-gradient-to-r from-primary/[0.06] via-white to-stone-50/80 px-5 py-4 backdrop-blur-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <LuPenLine className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 id={memberEditTitleId} className="text-lg font-extrabold tracking-tight text-stone-900">
                    {memberRosterName(editing)}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <MemberRegistrationBadge u={editing} />
                    <span
                      className={`${appRoleBadgeClass(editing.app_role)} text-[10px] font-bold uppercase tracking-wide`}
                    >
                      {appRoleLabel(editing.app_role)}
                    </span>
                    <span
                      className={
                        editing.is_active
                          ? 'rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800'
                          : 'rounded-full bg-stone-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-stone-500'
                      }
                    >
                      {editing.is_active ? 'Активен' : 'Неактивен'}
                    </span>
                    {editing.is_collection_coordinator ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                        Сбор
                      </span>
                    ) : null}
                  </div>
                </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-stone-500 transition hover:bg-stone-100 hover:text-stone-800"
                  aria-label="Закрыть карточку"
                  title="Закрыть"
                >
                  <LuX className="h-6 w-6" strokeWidth={2} aria-hidden />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {/* Personal info */}
              <section>
                <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.15em] text-stone-400">Личные данные</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-stone-600">Фамилия</label>
                    <input
                      className={fieldClass()}
                      value={editForm.last_name}
                      onChange={(e) => setEditForm((s) => ({ ...s, last_name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-stone-600">Имя</label>
                    <input
                      className={fieldClass()}
                      value={editForm.first_name}
                      onChange={(e) => setEditForm((s) => ({ ...s, first_name: e.target.value }))}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      className={btnSecondary('text-xs')}
                      disabled={swapNameFieldsMut.isPending}
                      onClick={() => {
                        if (
                          !window.confirm(
                            'Поменять в базе местами поля «имя» и «фамилия» у этого пользователя? Используйте, если данные оказались в неправильных колонках.',
                          )
                        ) {
                          return;
                        }
                        setBanner(null);
                        swapNameFieldsMut.mutate();
                      }}
                    >
                      {swapNameFieldsMut.isPending ? 'Меняем…' : 'Поменять имя и фамилию местами в базе'}
                    </button>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-stone-600">Телефон</label>
                    <input
                      className={fieldClass()}
                      inputMode="tel"
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
                </div>
              </section>

              {/* Ministry */}
              <section>
                <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.15em] text-stone-400">Служение</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-stone-600">Направление</label>
                    <select
                      className={fieldClass()}
                      value={editForm.ministry_direction}
                      onChange={(e) => {
                        const nextDir = e.target.value;
                        setEditForm((s) => {
                          return { ...s, ministry_direction: nextDir };
                        });
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
                      size={Math.min(7, Math.max(3, roleOptionsForDirection(editForm.ministry_direction).length))}
                      className={fieldClass()}
                      value={roleArray(editForm.ministry_role)}
                      onChange={(e) => {
                        const selected = Array.from(e.currentTarget.selectedOptions).map((opt) => opt.value);
                        setEditForm((s) => ({ ...s, ministry_role: normalizeMinistryRoles(selected.join(', ')) }));
                      }}
                    >
                      {roleOptionsForDirection(editForm.ministry_direction).map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              {/* Status */}
              <section className="space-y-3">
                <label className="flex items-center gap-2 text-sm text-stone-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-stone-300 text-primary"
                    checked={editForm.is_active}
                    onChange={(e) => setEditForm((s) => ({ ...s, is_active: e.target.checked }))}
                  />
                  Активен (может войти в приложение)
                </label>
                <label className="flex cursor-pointer items-start gap-2 text-sm text-stone-700">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-stone-300 text-primary"
                    checked={editForm.in_prayer_cycle}
                    onChange={(e) => setEditForm((s) => ({ ...s, in_prayer_cycle: e.target.checked }))}
                  />
                  <span>
                    <span className="font-semibold text-stone-900">В молитвенном цикле</span>
                    <span className="mt-0.5 block text-xs font-normal text-stone-500">
                      Включите вручную: новый пользователь по умолчанию не попадает в очередь «день за днём».
                    </span>
                  </span>
                </label>
              </section>

              {/* Admin controls */}
              <section>
                <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.15em] text-stone-400">
                  Действия администратора
                </p>
                <div className="flex flex-wrap gap-2">
                  <label className="flex flex-col gap-1 text-sm text-stone-700">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-stone-400">
                      Роль приложения
                    </span>
                    <select
                      multiple
                      size={6}
                      className="max-w-xs rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                      value={Array.isArray(editing.app_roles) && editing.app_roles.length > 0
                        ? editing.app_roles
                        : [editing.app_role]}
                      disabled={roleMut.isPending}
                      onChange={(e) => {
                        setBanner(null);
                        const roles = Array.from(e.currentTarget.selectedOptions).map(
                          (opt) => opt.value as AppUser['app_role'],
                        );
                        roleMut.mutate({ id: editing.id, roles: roles.length > 0 ? roles : ['member'] });
                      }}
                    >
                      <option value="member">Член церкви</option>
                      <option value="minister">Служитель</option>
                      <option value="pastor">Пастор</option>
                      <option value="musician">Музыкант (студия)</option>
                      <option value="editor">Редактор каталога</option>
                      <option value="admin">Администратор</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className={btnSecondary()}
                    onClick={() => {
                      setBanner(null);
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
                  >
                    {editing.is_collection_coordinator
                      ? 'Снять ответственного за сбор'
                      : 'Назначить ответственным за сбор'}
                  </button>
                  <button
                    type="button"
                    className={btnSecondary()}
                    onClick={() => {
                      setBanner(null);
                      void updateAdminMember(editing.id, { is_active: !editing.is_active }).then(
                        (updated) => {
                          setEditing(updated);
                          setEditForm((s) => ({ ...s, is_active: updated.is_active }));
                          setBanner({ type: 'ok', text: 'Статус обновлён.' });
                          invalidate();
                        },
                        (e) => setBanner({ type: 'err', text: apiErrorMessage(e, 'Ошибка.') }),
                      );
                    }}
                  >
                    {editing.is_active ? 'Деактивировать' : 'Активировать'}
                  </button>
                  <button
                    type="button"
                    className={btnSecondary()}
                    onClick={() => {
                      setOneTimeId(editing.id);
                      setOneTimeDate('');
                      setBanner(null);
                    }}
                  >
                    Разовая дата в цикле
                  </button>
                  <button
                    type="button"
                    className={btnDangerOutline()}
                    disabled={deleteMut.isPending}
                    onClick={() => {
                      if (!window.confirm(`Удалить ${memberRosterName(editing)}?`)) return;
                      setBanner(null);
                      deleteMut.mutate(editing.id);
                    }}
                  >
                    {deleteMut.isPending ? 'Удаление…' : 'Удалить пользователя'}
                  </button>
                </div>
              </section>

              {/* Access transparency */}
              <section className="rounded-2xl border border-sky-200/60 bg-gradient-to-br from-sky-50 to-indigo-50/40 p-4">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-sky-900/70">
                  Прозрачность входа
                </p>
                <div className="mt-2 space-y-1.5 text-sm text-stone-700">
                  <p>
                    Статус входа:{' '}
                    <strong>{editing.has_registered ? 'пароль создан, вход доступен' : 'вход не оформлен'}</strong>
                  </p>
                  <p>
                    Логин: <strong>{editing.phone_number?.trim() || '—'}</strong>
                  </p>
                  <p className="text-xs text-stone-500">
                    Открытый пароль система не хранит, поэтому показать «придуманный пароль» невозможно.
                    Для безопасности доступен только факт регистрации и управление доступом.
                  </p>
                </div>
              </section>

              {/* Prayer request */}
              <section>
                <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.15em] text-stone-400">Молитвенная нужда</p>
                <textarea
                  className={`${fieldClass()} min-h-[100px] resize-y`}
                  value={editForm.prayer_request}
                  onChange={(e) => setEditForm((s) => ({ ...s, prayer_request: e.target.value }))}
                  placeholder="Текст молитвенной нужды…"
                />
              </section>

              {/* Prayer history */}
              <AdminPrayerHistory memberId={editing.id} />

              {/* Actions */}
              <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-4">
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
        </div>
      )}
    </div>
  );
}

/** Сворачиваемый/разворачиваемый блок с историей молитвенных нужд пользователя. */
function AdminPrayerHistory({ memberId }: { memberId: number }) {
  const [open, setOpen] = useState(false);
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
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[40px] w-full items-center gap-2 rounded-xl border border-stone-200/80 bg-stone-50/60 px-3.5 py-2.5 text-left text-[13px] font-bold text-stone-600 transition-colors hover:bg-stone-100/70 hover:text-stone-800"
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
          <div className="pt-3 pb-1">
            <div className="mb-4 rounded-xl border border-dashed border-primary/30 bg-primary/[0.04] p-3">
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
                  className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-[13px] text-stone-800 outline-none ring-primary/15 focus:border-primary focus:ring-1"
                />
              </label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="block min-w-0 sm:max-w-[11rem]">
                  <span className="mb-0.5 block text-[11px] font-semibold text-stone-500">
                    № цикла (необязательно)
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={cycleInput}
                    onChange={(e) => setCycleInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="Как в списке: 5"
                    className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[13px] text-stone-800 outline-none focus:border-primary focus:ring-1"
                  />
                </label>
                <button
                  type="button"
                  disabled={addHistoryMut.isPending || !manualText.trim()}
                  onClick={() => void addHistoryMut.mutateAsync()}
                  className="min-h-[40px] shrink-0 rounded-lg bg-primary px-4 text-[13px] font-bold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
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
                  <div key={i} className="flex gap-3 animate-pulse">
                    <div className="h-2 w-2 mt-1.5 shrink-0 rounded-full bg-stone-200" />
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
              <p className="py-4 text-center text-[13px] italic text-stone-400">
                Пока нет записей
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function AdminPrayerHistoryRow({ item, isLast }: { item: PrayerHistoryItem; isLast: boolean }) {
  const prayedDate = item.prayed_on_date
    ? formatAdminDate(item.prayed_on_date)
    : null;
  const createdDate = formatAdminDate(item.created_at);

  return (
    <div className={`relative flex gap-3 py-2.5 ${!isLast ? 'border-b border-stone-100' : ''}`}>
      {/* Timeline dot */}
      <div className="flex flex-col items-center pt-1.5">
        <div className="h-2 w-2 shrink-0 rounded-full bg-primary/40" />
        {!isLast ? (
          <div className="mt-1 flex-1 w-px bg-stone-100" />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {prayedDate ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-primary">
              <LuCalendarDays className="h-3 w-3" aria-hidden />
              Цикл {item.cycle_index != null ? item.cycle_index + 1 : '—'} · {prayedDate}
            </span>
          ) : (
            <span className="text-[11px] font-semibold text-stone-400">
              {createdDate}
            </span>
          )}
        </div>
        <p className="mt-1 text-[13px] leading-snug text-stone-600 whitespace-pre-wrap break-words">
          {item.prayer_request}
        </p>
      </div>
    </div>
  );
}

/** Форматирование даты для истории: «25 марта 2026» или «25 мар» если текущий год. */
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

function reorderArray<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

/**
 * Очередь молитвенного цикла: флаг `in_prayer_cycle` (как в карточке пользователя).
 * Две колонки: текущий состав и добавление из активных вне цикла.
 */
function CalendarPrayerCycleRoster() {
  const qc = useQueryClient();
  const rosterAnchorYmd = format(new Date(), 'yyyy-MM-dd');
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: Q_MEMBERS,
    queryFn: fetchAdminMembers,
  });
  const [listSearch, setListSearch] = useState('');
  const [addSearch, setAddSearch] = useState('');
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

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
          `${memberRosterName(u)} ${displayName(u)} ${u.phone_number ?? ''} ${u.email ?? ''}`.toLowerCase();
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
          `${memberRosterName(u)} ${displayName(u)} ${u.phone_number ?? ''} ${u.email ?? ''}`.toLowerCase();
        return blob.includes(q);
      });
    }
    return [...rows].sort(compareMembersByPrayerCycleOrder);
  }, [data, addSearch]);

  const rosterDnDEnabled =
    Boolean(data?.length) &&
    !listSearch.trim() &&
    Boolean(rosterSnapQ.data?.roster?.length) &&
    !rosterSnapQ.isLoading &&
    !rosterSnapQ.isFetching &&
    (rosterSnapQ.data?.roster ?? []).every((e) => (data ?? []).some((u) => u.id === e.id));

  const inactiveOnlyInCycle = useMemo(() => {
    const list = data ?? [];
    const q = listSearch.trim().toLowerCase();
    let rows = list.filter((u) => u.in_prayer_cycle && !u.is_active);
    if (q) {
      rows = rows.filter((u) => {
        const blob =
          `${memberRosterName(u)} ${displayName(u)} ${u.phone_number ?? ''} ${u.email ?? ''}`.toLowerCase();
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
    return <p className="text-sm text-stone-600">Загрузка членов церкви…</p>;
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

      <p className="border-b border-stone-100 px-4 py-3 text-sm leading-relaxed text-stone-600">
        В приложении «Молитва» по дням показываются только <strong>активные</strong> члены церкви с флагом «в цикле» (как
        в карточке в разделе «Пользователи»). Без поиска слева показывается <strong>очередь цикла</strong> (по умолчанию
        А–Я; если для этого цикла сохраняли порядок — он). Перетаскивание за иконку слева действует только на{' '}
        <strong>текущий молитвенный цикл</strong>; на новом цикле снова сортировка по фамилии. «Первым сегодня» сдвигает
        дату старта так, чтобы выбранный человек пришёлся на сегодня по этой очереди.
      </p>

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

      <div className="grid lg:grid-cols-2 lg:divide-x lg:divide-stone-200">
        <div className="p-4 sm:p-5">
          <h4 className="text-xs font-extrabold uppercase tracking-wide text-stone-500">Сейчас в цикле</h4>
          <p className="mt-1 text-xs text-stone-500">
            Неактивные с флагом в календарь не попадают, пока карточку не активируют.
          </p>
          <label className="mt-3 block text-xs font-semibold text-stone-600">Поиск</label>
          <input
            type="search"
            className={`${fieldClass()} mt-1`}
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            placeholder="Имя, телефон…"
            autoComplete="off"
          />
          <div className="mt-3 max-h-[min(28rem,55vh)] overflow-auto rounded-xl border border-stone-200/80">
            {inCycleRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-stone-500">
                {listSearch.trim()
                  ? 'Никого не найдено.'
                  : 'Список пуст — добавьте людей справа.'}
              </p>
            ) : rosterDnDEnabled && rosterSnapQ.data ? (
              <DragDropContext onDragEnd={handleRosterDragEnd}>
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="sticky top-0 z-[1] border-b border-stone-200 bg-stone-50/95 text-xs font-semibold uppercase tracking-wide text-stone-600 backdrop-blur-sm">
                      <th className="w-9 px-1 py-2.5 text-center" scope="col">
                        <span className="sr-only">Перетаскивание</span>
                      </th>
                      <th className="whitespace-nowrap px-3 py-2.5">№</th>
                      <th className="min-w-[10rem] px-3 py-2.5">Член церкви</th>
                      <th className="hidden px-3 py-2.5 sm:table-cell">Телефон</th>
                      <th className="whitespace-nowrap px-3 py-2.5">Статус</th>
                      <th className="min-w-[11rem] px-3 py-2.5 text-right">Действия</th>
                    </tr>
                  </thead>
                  <Droppable droppableId="prayer-cycle-in-roster">
                    {(droppableProvided) => (
                      <tbody
                        ref={droppableProvided.innerRef}
                        {...droppableProvided.droppableProps}
                        className="divide-y divide-stone-100 bg-white/90"
                      >
                        {rosterSnapQ.data.roster.map((e, qIdx) => {
                          const u = data!.find((x) => x.id === e.id)!;
                          const isFormulaToday = rosterSnapQ.data!.today_member_id === u.id;
                          const canAnchor = u.is_active && activeCycleMemberIds.has(u.id);
                          return (
                            <Draggable
                              key={u.id}
                              draggableId={`pc-roster-${u.id}`}
                              index={qIdx}
                              isDragDisabled={
                                saveOrderMut.isPending || patchMut.isPending || anchorQueueMut.isPending
                              }
                            >
                              {(dragProvided, dragSnapshot) => (
                                <tr
                                  ref={dragProvided.innerRef}
                                  {...dragProvided.draggableProps}
                                  className={[
                                    isFormulaToday ? 'bg-primary/[0.04]' : '',
                                    dragSnapshot.isDragging ? 'bg-stone-100 shadow-sm ring-1 ring-stone-200' : '',
                                  ]
                                    .filter(Boolean)
                                    .join(' ')}
                                >
                                  <td
                                    {...dragProvided.dragHandleProps}
                                    className="w-9 cursor-grab px-1 py-2.5 text-center text-stone-400 hover:text-stone-600 active:cursor-grabbing"
                                    title="Перетащите выше или ниже"
                                  >
                                    <LuGripVertical className="mx-auto inline-block h-4 w-4" aria-hidden />
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-stone-600">
                                    {qIdx + 1}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <span className="font-semibold text-stone-900">{memberRosterName(u)}</span>
                                    {isFormulaToday ? (
                                      <span className="ml-2 inline-block rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-bold text-primary">
                                        сегодня
                                      </span>
                                    ) : null}
                                    <p className="mt-0.5 text-xs text-stone-500 sm:hidden">{u.phone_number ?? '—'}</p>
                                  </td>
                                  <td className="hidden px-3 py-2.5 text-stone-600 sm:table-cell">
                                    {u.phone_number ?? '—'}
                                  </td>
                                  <td className="px-3 py-2.5">
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
                                  <td className="px-3 py-2.5">
                                    <div className="flex flex-col items-stretch gap-1.5 sm:flex-row sm:justify-end sm:gap-2">
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
                                        disabled={
                                          patchMut.isPending || anchorQueueMut.isPending || saveOrderMut.isPending
                                        }
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
                              )}
                            </Draggable>
                          );
                        })}
                        {droppableProvided.placeholder}
                        {inactiveOnlyInCycle.map((u) => {
                          const isFormulaToday = rosterSnapQ.data?.today_member_id === u.id;
                          const canAnchor = u.is_active && activeCycleMemberIds.has(u.id);
                          return (
                            <tr key={u.id} className="bg-stone-50/90">
                              <td className="w-9 px-1 py-2.5" aria-hidden />
                              <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-stone-400">—</td>
                              <td className="px-3 py-2.5">
                                <span className="font-semibold text-stone-900">{memberRosterName(u)}</span>
                                {isFormulaToday ? (
                                  <span className="ml-2 inline-block rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-bold text-primary">
                                    сегодня
                                  </span>
                                ) : null}
                                <p className="mt-0.5 text-xs text-stone-500 sm:hidden">{u.phone_number ?? '—'}</p>
                              </td>
                              <td className="hidden px-3 py-2.5 text-stone-600 sm:table-cell">{u.phone_number ?? '—'}</td>
                              <td className="px-3 py-2.5">
                                <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                                  Неактивен
                                </span>
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="flex flex-col items-stretch gap-1.5 sm:flex-row sm:justify-end sm:gap-2">
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
                                    disabled={
                                      patchMut.isPending || anchorQueueMut.isPending || saveOrderMut.isPending
                                    }
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
                    )}
                  </Droppable>
                </table>
              </DragDropContext>
            ) : (
              <table className="min-w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="sticky top-0 z-[1] border-b border-stone-200 bg-stone-50/95 text-xs font-semibold uppercase tracking-wide text-stone-600 backdrop-blur-sm">
                    <th className="whitespace-nowrap px-3 py-2.5">№</th>
                    <th className="min-w-[10rem] px-3 py-2.5">Член церкви</th>
                    <th className="hidden px-3 py-2.5 sm:table-cell">Телефон</th>
                    <th className="whitespace-nowrap px-3 py-2.5">Статус</th>
                    <th className="min-w-[11rem] px-3 py-2.5 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 bg-white/90">
                  {inCycleRows.map((u, alphaIdx) => {
                    const isFormulaToday = rosterSnapQ.data?.today_member_id === u.id;
                    const canAnchor = u.is_active && activeCycleMemberIds.has(u.id);
                    return (
                      <tr key={u.id} className={isFormulaToday ? 'bg-primary/[0.04]' : undefined}>
                        <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-stone-600">
                          {alphaIdx + 1}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="font-semibold text-stone-900">{memberRosterName(u)}</span>
                          {isFormulaToday ? (
                            <span className="ml-2 inline-block rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-bold text-primary">
                              сегодня
                            </span>
                          ) : null}
                          <p className="mt-0.5 text-xs text-stone-500 sm:hidden">{u.phone_number ?? '—'}</p>
                        </td>
                        <td className="hidden px-3 py-2.5 text-stone-600 sm:table-cell">{u.phone_number ?? '—'}</td>
                        <td className="px-3 py-2.5">
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
                        <td className="px-3 py-2.5">
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

        <div className="bg-stone-50/50 p-4 sm:p-5 lg:min-h-[12rem]">
          <h4 className="text-xs font-extrabold uppercase tracking-wide text-stone-500">Добавить в цикл</h4>
          <p className="mt-1 text-xs text-stone-500">Активные без флага «в цикле», сортировка А–Я как слева.</p>
          <label className="mt-3 block text-xs font-semibold text-stone-600">Поиск</label>
          <input
            type="search"
            className={`${fieldClass()} mt-1`}
            value={addSearch}
            onChange={(e) => setAddSearch(e.target.value)}
            placeholder="Имя или телефон…"
            autoComplete="off"
          />
          <div className="mt-3 max-h-[min(28rem,55vh)] overflow-auto rounded-xl border border-stone-200/80 bg-white/90">
            {candidates.length === 0 ? (
              <p className="py-8 text-center text-sm text-stone-500">
                {addSearch.trim()
                  ? 'Никого не найдено.'
                  : 'Все активные уже в цикле или нет карточек.'}
              </p>
            ) : (
              <table className="min-w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="sticky top-0 z-[1] border-b border-stone-200 bg-stone-50/95 text-xs font-semibold uppercase tracking-wide text-stone-600 backdrop-blur-sm">
                    <th className="min-w-[10rem] px-3 py-2.5">Член церкви</th>
                    <th className="hidden px-3 py-2.5 sm:table-cell">Телефон</th>
                    <th className="w-[1%] whitespace-nowrap px-3 py-2.5 text-right">Действие</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {candidates.map((u) => (
                    <tr key={u.id}>
                      <td className="px-3 py-2.5">
                        <span className="font-semibold text-stone-900">{memberRosterName(u)}</span>
                        <p className="mt-0.5 text-xs text-stone-500 sm:hidden">{u.phone_number ?? '—'}</p>
                      </td>
                      <td className="hidden px-3 py-2.5 text-stone-600 sm:table-cell">{u.phone_number ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right">
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
  );
}

function CalendarSection() {
  const qc = useQueryClient();
  const meQ = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: fetchMe,
    staleTime: 60_000,
  });
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

  const navClass =
    'rounded-lg border border-stone-200/90 bg-white/80 px-2.5 py-1 text-stone-700 transition hover:border-primary/30 hover:bg-primary/[0.04] hover:text-stone-900';

  return (
    <div className="space-y-6">
      <section
        className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.07] via-[var(--surface-elevated)] to-stone-50/90 p-5 shadow-[var(--shadow)]"
        aria-labelledby="calendar-intro-heading"
      >
        <h2 id="calendar-intro-heading" className="text-lg font-extrabold tracking-tight text-stone-900">
          Молитвенный календарь
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">
          Настройка экрана «Молитва»: с какой даты считать цикл, состав очереди членов церкви, план сбора нужд и
          дополнительные блоки (темы, служения, отступники).
        </p>
        <nav
          className="mt-4 flex flex-wrap gap-2 border-t border-stone-200/60 pt-4 text-sm"
          aria-label="Подразделы молитвенного календаря"
        >
          <a className={navClass} href="#cal-anchor">
            1. Дата старта
          </a>
          <a className={navClass} href="#cal-roster">
            2. Очередь членов церкви
          </a>
          <a className={navClass} href="#cal-collection">
            3. Сбор нужд
          </a>
          <a className={navClass} href="#cal-content">
            4. Контент «Молитва»
          </a>
        </nav>
      </section>

      <section
        id="cal-anchor"
        className="scroll-mt-6 rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-extrabold text-primary"
              aria-hidden
            >
              1
            </span>
            <div className="min-w-0">
              <h3 className="font-extrabold text-stone-900">Дата начала отсчёта цикла</h3>
              <p className="mt-1 text-sm text-stone-600">
                Глобальная «нулевая» дата: от неё считается, кто попадает на какой календарный день в ротации. Чтобы{' '}
                <strong>сегодня</strong> первым шёл конкретный человек без смены этой даты, нажмите «Первым сегодня» в
                блоке{' '}
                <a href="#cal-roster" className="font-semibold text-primary underline-offset-2 hover:underline">
                  очереди членов церкви
                </a>
                .
              </p>
            </div>
          </div>
        </div>
        <div className="mt-5 max-w-md rounded-xl border border-stone-200/80 bg-stone-50/60 p-4">
          <label className="block text-xs font-semibold text-stone-600">Дата старта</label>
          <input
            type="date"
            className={`${fieldClass()} mt-1 w-full max-w-xs`}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button
            type="button"
            className={`${btnPrimary('mt-4 w-full max-w-xs')}`}
            disabled={mut.isPending}
            onClick={() => {
              setMsg(null);
              mut.mutate();
            }}
          >
            {mut.isPending ? 'Сохранение…' : 'Сохранить дату старта'}
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
        </div>
      </section>

      <section
        id="cal-roster"
        className="scroll-mt-6 rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]"
      >
        <div className="flex items-start gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-extrabold text-primary"
            aria-hidden
          >
            2
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-extrabold text-stone-900">Очередь членов церкви</h3>
            <p className="mt-1 text-sm text-stone-600">
              Состав цикла и добавление людей. Здесь же — сдвиг очереди на сегодня («Первым сегодня»).
            </p>
          </div>
        </div>
        <div className="mt-5">
          <CalendarPrayerCycleRoster />
        </div>
      </section>

      <section
        id="cal-collection"
        className="scroll-mt-6 rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]"
      >
        <div className="flex items-start gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
            aria-hidden
          >
            <LuClipboardList className="h-5 w-5" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h3 className="font-extrabold text-stone-900">Сбор нужд: эта и следующая неделя</h3>
            <p className="mt-1 text-sm text-stone-600">
              Как на экране «Молитва»: дни цикла, кто отвечает за сбор, прошлые нужды — для администратора и
              координаторов.
            </p>
          </div>
        </div>
        <div className="mt-4 max-w-2xl">
          <NextWeekPrayerPlanSection
            canView
            currentUserId={meQ.data?.id ?? null}
            currentUserRole={meQ.data?.app_role ?? null}
            isAdmin={meQ.data?.app_role?.trim().toLowerCase() === 'admin'}
          />
        </div>
      </section>

      <section
        id="cal-content"
        className="scroll-mt-6 rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]"
      >
        <div className="mb-4 flex items-start gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-extrabold text-primary"
            aria-hidden
          >
            4
          </span>
          <div className="min-w-0">
            <h3 className="font-extrabold text-stone-900">Контент на экране «Молитва»</h3>
            <p className="mt-1 text-sm text-stone-600">
              Темы, служения и отступники — три колонки под календарём в приложении.
            </p>
          </div>
        </div>
        <GlobalNeedsSection />
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
  const weekDays = [
    { value: 0, label: 'Воскресенье' },
    { value: 1, label: 'Понедельник' },
    { value: 2, label: 'Вторник' },
    { value: 3, label: 'Среда' },
    { value: 4, label: 'Четверг' },
    { value: 5, label: 'Пятница' },
    { value: 6, label: 'Суббота' },
  ] as const;
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
  const [openId, setOpenId] = useState<number | null>(null);
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [listPanelOpen, setListPanelOpen] = useState(false);
  const [createExtrasOpen, setCreateExtrasOpen] = useState(false);

  const invalidate = () => void qc.invalidateQueries({ queryKey: Q_EVENTS });
  const eventCount = (eventsQ.data ?? []).length;
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

  useEffect(() => {
    if (!editing) return;
    setOpenId(editing.id);
  }, [editing]);

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
      setCreateExtrasOpen(false);
      setAddPanelOpen(false);
      setListPanelOpen(true);
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

  const deleteAllMut = useMutation({
    mutationFn: () => deleteAllAdminEvents(),
    onSuccess: (res) => {
      setEditing(null);
      setNote({ type: 'ok', text: `Удалено событий: ${res.deleted}` });
      invalidate();
    },
    onError: (e) =>
      setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось удалить все события.') }),
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

      <section
        className="rounded-2xl border border-stone-200/80 bg-gradient-to-br from-amber-50/40 via-[var(--surface-elevated)] to-stone-50/60 p-4 shadow-[var(--shadow)] sm:p-5"
        aria-labelledby="admin-events-heading"
      >
        <div className="flex items-start gap-3">
          <div
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-100/90 text-amber-800"
            aria-hidden
          >
            <LuCalendarDays className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 id="admin-events-heading" className="text-base font-extrabold text-stone-900">
              События
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-stone-600">
              Расписание для дашборда: дата и время, повтор, категория. Описание и постер — по желанию.
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-stone-400">В базе</p>
            <p className="text-xl font-extrabold tabular-nums text-stone-900">{eventCount}</p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] shadow-[var(--shadow)]">
        <button
          type="button"
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-stone-50/80 sm:px-5"
          onClick={() => setAddPanelOpen((v) => !v)}
          aria-expanded={addPanelOpen}
        >
          <span className="text-sm font-extrabold text-stone-900">Добавить событие</span>
          <span className="hidden text-xs text-stone-500 sm:inline">Название, расписание, категория</span>
          <LuChevronDown
            className={`ml-auto h-4 w-4 shrink-0 text-stone-400 transition-transform duration-200 ${addPanelOpen ? 'rotate-180' : ''}`}
            strokeWidth={2}
            aria-hidden
          />
        </button>
        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none ${addPanelOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        >
          <div className="overflow-hidden">
            <div className="border-t border-stone-100 px-4 pb-4 pt-1 sm:px-5">
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-stone-600">Название</label>
                  <input
                    className={fieldClass()}
                    value={form.title}
                    onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                    placeholder="Например: Воскресное служение"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-600">Повтор</label>
                  <select
                    className={fieldClass()}
                    value={form.recurrence_type}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, recurrence_type: e.target.value as 'once' | 'weekly' }))
                    }
                  >
                    <option value="once">Один раз</option>
                    <option value="weekly">Каждую неделю</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-600">Время</label>
                  <input
                    className={fieldClass()}
                    type="time"
                    value={form.event_time}
                    onChange={(e) => setForm((s) => ({ ...s, event_time: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-600">
                    {form.recurrence_type === 'weekly' ? 'Дата (ориентир)' : 'Дата'}
                  </label>
                  <input
                    className={fieldClass()}
                    type="date"
                    value={form.event_date}
                    onChange={(e) => setForm((s) => ({ ...s, event_date: e.target.value }))}
                  />
                  {form.recurrence_type === 'weekly' ? (
                    <p className="mt-1 text-xs text-stone-500">Подстраивается под выбранный день недели.</p>
                  ) : null}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-600">День недели</label>
                  <select
                    className={fieldClass()}
                    value={String(form.weekly_day)}
                    disabled={form.recurrence_type !== 'weekly'}
                    onChange={(e) => setForm((s) => ({ ...s, weekly_day: Number(e.target.value) }))}
                  >
                    {weekDays.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-600">Категория</label>
                  <select
                    className={fieldClass()}
                    value={
                      categoryOptions.some((o) => o.id === form.category) ? form.category : categoryOptions[0].id
                    }
                    onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))}
                  >
                    {categoryOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col justify-end pb-0.5">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-stone-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-stone-300 text-primary"
                      checked={form.is_active}
                      onChange={(e) => setForm((s) => ({ ...s, is_active: e.target.checked }))}
                    />
                    Показывать в дашборде
                  </label>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-stone-200/80 bg-stone-50/60">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-bold text-stone-700 transition-colors hover:bg-stone-100/60"
                  onClick={() => setCreateExtrasOpen((v) => !v)}
                  aria-expanded={createExtrasOpen}
                >
                  <LuImage className="h-4 w-4 shrink-0 text-primary/80" strokeWidth={2} aria-hidden />
                  <span className="flex-1">Описание и постер</span>
                  <span className="text-xs font-normal text-stone-500">необязательно</span>
                  <LuChevronDown
                    className={`h-4 w-4 shrink-0 text-stone-400 transition-transform duration-200 ${createExtrasOpen ? 'rotate-180' : ''}`}
                    strokeWidth={2}
                    aria-hidden
                  />
                </button>
                <div
                  className={`grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none ${createExtrasOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                >
                  <div className="overflow-hidden">
                    <div className="space-y-3 border-t border-stone-200/60 px-3 pb-3 pt-3">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-stone-600">Описание</label>
                        <textarea
                          className={`${fieldClass()} min-h-[88px] resize-y`}
                          value={form.description}
                          onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                          placeholder="Текст в карточке и в окне на дашборде"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-stone-600">Постер</label>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                          <input
                            type="file"
                            accept="image/*"
                            className={fieldClass()}
                            onChange={(e) => {
                              const f = e.target.files?.[0] ?? null;
                              setPosterFile(f);
                              setForm((s) => ({ ...s, poster_url: null }));
                            }}
                          />
                          <button
                            type="button"
                            className={btnSecondary()}
                            disabled={!posterFile || uploadPosterMut.isPending}
                            onClick={() => {
                              setNote(null);
                              uploadPosterMut.mutate();
                            }}
                          >
                            {uploadPosterMut.isPending ? 'Загрузка…' : form.poster_url ? 'Перезагрузить' : 'Загрузить'}
                          </button>
                          {form.poster_url ? (
                            <span className="text-xs font-semibold text-emerald-700">Загружено</span>
                          ) : null}
                        </div>
                        {posterPreviewUrl || uploadedPosterSrc ? (
                          <div className="mt-3 overflow-hidden rounded-2xl border border-stone-200/70 bg-white">
                            <img
                              src={posterPreviewUrl ?? uploadedPosterSrc ?? ''}
                              alt=""
                              className="h-[120px] w-full object-cover sm:h-[160px]"
                              loading="lazy"
                            />
                          </div>
                        ) : null}
                        <p className="mt-1 text-xs text-stone-500">Картинка в модалке события на дашборде.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className={`${btnPrimary('mt-4 w-full sm:w-auto')}`}
                disabled={
                  !form.title.trim() ||
                  !form.event_time ||
                  (form.recurrence_type === 'once' && !form.event_date) ||
                  createMut.isPending
                }
                onClick={() => {
                  setNote(null);
                  createMut.mutate();
                }}
              >
                {createMut.isPending ? 'Сохранение…' : 'Сохранить событие'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] shadow-[var(--shadow)]">
        <button
          type="button"
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-stone-50/80 sm:px-5"
          onClick={() => setListPanelOpen((v) => !v)}
          aria-expanded={listPanelOpen}
        >
          <span className="text-sm font-extrabold text-stone-900">Все события</span>
          <span className="text-xs tabular-nums text-stone-500">
            {eventsQ.isLoading ? '…' : `${eventCount} шт.`}
          </span>
          <LuChevronDown
            className={`ml-auto h-4 w-4 shrink-0 text-stone-400 transition-transform duration-200 ${listPanelOpen ? 'rotate-180' : ''}`}
            strokeWidth={2}
            aria-hidden
          />
        </button>
        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none ${listPanelOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        >
          <div className="overflow-hidden">
            <div className="border-t border-stone-100 px-4 pb-4 pt-3 sm:px-5">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  className={btnDangerOutline()}
                  disabled={deleteAllMut.isPending || deleteMut.isPending || updateMut.isPending}
                  onClick={() => {
                    if (eventCount === 0) {
                      setNote({ type: 'err', text: 'Список уже пуст.' });
                      return;
                    }
                    if (!window.confirm(`Удалить все события (${eventCount})? Действие нельзя отменить.`)) return;
                    setNote(null);
                    deleteAllMut.mutate();
                  }}
                >
                  {deleteAllMut.isPending ? 'Удаление…' : 'Удалить все'}
                </button>
              </div>
              {eventsQ.isLoading ? (
                <div className="mt-3 h-40 animate-pulse rounded-2xl bg-stone-100" />
              ) : eventsQ.isError ? (
                <p className="mt-3 text-sm text-red-600">
                  {apiErrorMessage(eventsQ.error, 'Не удалось загрузить список событий.')}
                </p>
              ) : (eventsQ.data ?? []).length === 0 ? (
                <p className="mt-3 text-sm text-stone-500">Событий пока нет.</p>
              ) : (
                <div className="mt-3 space-y-3">
            {(eventsQ.data ?? []).map((ev) => {
              const isEdit = editing?.id === ev.id;
              const row = isEdit ? editing : ev;
              const isOpen = isEdit || openId === ev.id;
              const catId = typeof row.category === 'string' ? row.category : '';
              const catLabel = catId ? categoryLabelById.get(catId) ?? catId : '';
              return (
                <article key={ev.id} className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-stone-50"
                    onClick={() => {
                      if (isEdit) return;
                      setOpenId((cur) => (cur === ev.id ? null : ev.id));
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate text-[13px] font-extrabold text-stone-900">
                          {row.title || '—'}
                        </span>
                        <span className="text-[11px] font-semibold text-stone-500">
                          {row.event_date} · {row.event_time}
                        </span>
                        {row.recurrence_type === 'weekly' ? (
                          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-indigo-700">
                            weekly
                          </span>
                        ) : (
                          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-stone-600">
                            once
                          </span>
                        )}
                        {catLabel ? (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold text-primary">
                            {catLabel}
                          </span>
                        ) : null}
                        {!row.is_active ? (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-extrabold text-red-700">
                            off
                          </span>
                        ) : null}
                      </div>
                      {row.description ? (
                        <p className="mt-1 line-clamp-1 text-[12px] text-stone-500">{row.description}</p>
                      ) : null}
                    </div>
                    <span
                      className={`shrink-0 text-stone-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                      aria-hidden
                    >
                      ▾
                    </span>
                  </button>

                  <div
                    className={`grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                  >
                    <div className="overflow-hidden">
                      <div className="border-t border-stone-100 px-4 py-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="sm:col-span-2">
                            <label className="mb-1 block text-xs font-semibold text-stone-600">Название</label>
                            <input
                              className={fieldClass()}
                              value={row.title}
                              disabled={!isEdit}
                              onChange={(e) =>
                                setEditing((s) => (s ? { ...s, title: e.target.value } : s))
                              }
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-stone-600">Повтор</label>
                            <select
                              className={fieldClass()}
                              value={row.recurrence_type}
                              disabled={!isEdit}
                              onChange={(e) =>
                                setEditing((s) => {
                                  if (!s) return s;
                                  const rt = e.target.value as 'once' | 'weekly';
                                  if (rt === 'weekly') {
                                    const wd = s.weekly_day ?? 0;
                                    return {
                                      ...s,
                                      recurrence_type: rt,
                                      weekly_day: wd,
                                      event_date: nextOccurrenceLocalYmd(wd),
                                    };
                                  }
                                  return { ...s, recurrence_type: rt, weekly_day: null };
                                })
                              }
                            >
                              <option value="once">Один раз</option>
                              <option value="weekly">Каждую неделю</option>
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-stone-600">
                              {row.recurrence_type === 'weekly' ? 'Дата-ориентир' : 'Дата'}
                            </label>
                            <input
                              type="date"
                              className={fieldClass()}
                              value={row.event_date}
                              disabled={!isEdit}
                              onChange={(e) =>
                                setEditing((s) => (s ? { ...s, event_date: e.target.value } : s))
                              }
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-stone-600">День недели</label>
                            <select
                              className={fieldClass()}
                              value={String(row.weekly_day ?? 0)}
                              disabled={!isEdit || row.recurrence_type !== 'weekly'}
                              onChange={(e) =>
                                setEditing((s) => {
                                  if (!s) return s;
                                  const wd = Number(e.target.value);
                                  return {
                                    ...s,
                                    weekly_day: wd,
                                    event_date:
                                      s.recurrence_type === 'weekly'
                                        ? nextOccurrenceLocalYmd(wd)
                                        : s.event_date,
                                  };
                                })
                              }
                            >
                              {weekDays.map((d) => (
                                <option key={d.value} value={d.value}>
                                  {d.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-stone-600">Время</label>
                            <input
                              type="time"
                              className={fieldClass()}
                              value={row.event_time}
                              disabled={!isEdit}
                              onChange={(e) =>
                                setEditing((s) => (s ? { ...s, event_time: e.target.value } : s))
                              }
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-stone-600">Категория</label>
                            <select
                              className={fieldClass()}
                              disabled={!isEdit}
                              value={
                                categoryOptions.some((o) => o.id === (row.category ?? ''))
                                  ? (row.category ?? categoryOptions[0].id)
                                  : categoryOptions[0].id
                              }
                              onChange={(e) =>
                                setEditing((s) => (s ? { ...s, category: e.target.value } : s))
                              }
                            >
                              {categoryOptions.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="mb-1 block text-xs font-semibold text-stone-600">Описание</label>
                            <textarea
                              className={`${fieldClass()} min-h-[84px] resize-y`}
                              value={row.description ?? ''}
                              disabled={!isEdit}
                              onChange={(e) =>
                                setEditing((s) => (s ? { ...s, description: e.target.value } : s))
                              }
                            />
                          </div>
                          <label className="sm:col-span-2 flex items-center gap-2 text-sm font-semibold text-stone-700">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-stone-300 text-primary"
                              checked={row.is_active}
                              disabled={!isEdit}
                              onChange={(e) =>
                                setEditing((s) => (s ? { ...s, is_active: e.target.checked } : s))
                              }
                            />
                            Активно
                          </label>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {!isEdit ? (
                            <button
                              type="button"
                              className={btnSecondary()}
                              onClick={() => {
                                const raw = ev.category ?? '';
                                const category = categoryOptions.some((o) => o.id === raw)
                                  ? raw
                                  : categoryOptions[0].id;
                                setEditing({
                                  ...ev,
                                  event_date: dateInputValueFromApi(ev.event_date),
                                  category,
                                });
                              }}
                            >
                              Изменить
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                className={btnPrimary()}
                                disabled={updateMut.isPending || !row.title.trim()}
                                onClick={() => {
                                  setNote(null);
                                  updateMut.mutate(row);
                                }}
                              >
                                {updateMut.isPending ? 'Сохранение…' : 'Сохранить'}
                              </button>
                              <button
                                type="button"
                                className={btnSecondary()}
                                disabled={updateMut.isPending}
                                onClick={() => setEditing(null)}
                              >
                                Отмена
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            className={btnDangerOutline()}
                            disabled={deleteMut.isPending}
                            onClick={() => {
                              if (!window.confirm(`Удалить событие «${ev.title}»?`)) return;
                              setNote(null);
                              if (isEdit) setEditing(null);
                              deleteMut.mutate(ev.id);
                            }}
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
                })}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
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
  const [tEdit, setTEdit] = useState<{
    id: number;
    title: string;
    bible_verse: string;
    prayer_points: string;
  } | null>(null);
  const [mEdit, setMEdit] = useState<{ id: number; title: string; prayer_points: string } | null>(null);
  const [bEdit, setBEdit] = useState<{ id: number; name: string } | null>(null);

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

  const updT = useMutation({
    mutationFn: (draft: { id: number; title: string; bible_verse: string; prayer_points: string }) =>
      updateGlobalThemeApi(draft.id, {
        title: draft.title.trim(),
        bible_verse: draft.bible_verse.trim() || null,
        prayer_points: draft.prayer_points.trim() || null,
      }),
    onSuccess: () => {
      setTEdit(null);
      setNote({ type: 'ok', text: 'Тема обновлена.' });
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

  const updM = useMutation({
    mutationFn: (draft: { id: number; title: string; prayer_points: string }) =>
      updateMinistryApi(draft.id, {
        title: draft.title.trim(),
        prayer_points: draft.prayer_points.trim() || null,
      }),
    onSuccess: () => {
      setMEdit(null);
      setNote({ type: 'ok', text: 'Служение обновлено.' });
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

  const updB = useMutation({
    mutationFn: (draft: { id: number; name: string }) => updateBacksliderApi(draft.id, draft.name.trim()),
    onSuccess: () => {
      setBEdit(null);
      setNote({ type: 'ok', text: 'Запись обновлена.' });
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
                (themes.data ?? []).map((x) =>
                  tEdit?.id === x.id ? (
                    <li
                      key={x.id}
                      className="space-y-2 rounded-xl border border-amber-200/80 bg-amber-50/50 px-3 py-2.5"
                    >
                      <input
                        className={fieldClass()}
                        placeholder="Заголовок *"
                        value={tEdit.title}
                        onChange={(e) => setTEdit((s) => (s ? { ...s, title: e.target.value } : s))}
                      />
                      <input
                        className={fieldClass()}
                        placeholder="Стих"
                        value={tEdit.bible_verse}
                        onChange={(e) => setTEdit((s) => (s ? { ...s, bible_verse: e.target.value } : s))}
                      />
                      <textarea
                        className={`${fieldClass()} min-h-[64px]`}
                        placeholder="Акценты молитвы"
                        value={tEdit.prayer_points}
                        onChange={(e) => setTEdit((s) => (s ? { ...s, prayer_points: e.target.value } : s))}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className={btnPrimary('flex-1')}
                          disabled={!tEdit.title.trim() || updT.isPending}
                          onClick={() => {
                            setNote(null);
                            updT.mutate(tEdit);
                          }}
                        >
                          Сохранить
                        </button>
                        <button
                          type="button"
                          className={btnSecondary('flex-1')}
                          disabled={updT.isPending}
                          onClick={() => setTEdit(null)}
                        >
                          Отмена
                        </button>
                      </div>
                    </li>
                  ) : (
                    <li
                      key={x.id}
                      className="flex items-start justify-between gap-2 rounded-xl border border-stone-100 bg-white px-3 py-2"
                    >
                      <span className="min-w-0 font-medium text-stone-800">{x.title}</span>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          className="text-xs font-semibold text-stone-600 hover:underline"
                          onClick={() => {
                            setNote(null);
                            setTEdit({
                              id: x.id,
                              title: x.title,
                              bible_verse: x.bible_verse ?? '',
                              prayer_points: x.prayer_points ?? '',
                            });
                          }}
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          className="text-xs font-semibold text-red-600 hover:underline"
                          onClick={() => {
                            setNote(null);
                            setTEdit(null);
                            delT.mutate(x.id);
                          }}
                        >
                          Удалить
                        </button>
                      </div>
                    </li>
                  ),
                )
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
                (ministries.data ?? []).map((x) =>
                  mEdit?.id === x.id ? (
                    <li
                      key={x.id}
                      className="space-y-2 rounded-xl border border-amber-200/80 bg-amber-50/50 px-3 py-2.5"
                    >
                      <input
                        className={fieldClass()}
                        placeholder="Название *"
                        value={mEdit.title}
                        onChange={(e) => setMEdit((s) => (s ? { ...s, title: e.target.value } : s))}
                      />
                      <textarea
                        className={`${fieldClass()} min-h-[64px]`}
                        placeholder="Акценты молитвы"
                        value={mEdit.prayer_points}
                        onChange={(e) => setMEdit((s) => (s ? { ...s, prayer_points: e.target.value } : s))}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className={btnPrimary('flex-1')}
                          disabled={!mEdit.title.trim() || updM.isPending}
                          onClick={() => {
                            setNote(null);
                            updM.mutate(mEdit);
                          }}
                        >
                          Сохранить
                        </button>
                        <button
                          type="button"
                          className={btnSecondary('flex-1')}
                          disabled={updM.isPending}
                          onClick={() => setMEdit(null)}
                        >
                          Отмена
                        </button>
                      </div>
                    </li>
                  ) : (
                    <li
                      key={x.id}
                      className="flex items-start justify-between gap-2 rounded-xl border border-stone-100 bg-white px-3 py-2"
                    >
                      <span className="min-w-0 font-medium text-stone-800">{x.title}</span>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          className="text-xs font-semibold text-stone-600 hover:underline"
                          onClick={() => {
                            setNote(null);
                            setMEdit({
                              id: x.id,
                              title: x.title,
                              prayer_points: x.prayer_points ?? '',
                            });
                          }}
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          className="text-xs font-semibold text-red-600 hover:underline"
                          onClick={() => {
                            setNote(null);
                            setMEdit(null);
                            delM.mutate(x.id);
                          }}
                        >
                          Удалить
                        </button>
                      </div>
                    </li>
                  ),
                )
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
                (backsliders.data ?? []).map((x) =>
                  bEdit?.id === x.id ? (
                    <li
                      key={x.id}
                      className="space-y-2 rounded-xl border border-amber-200/80 bg-amber-50/50 px-3 py-2.5"
                    >
                      <input
                        className={fieldClass()}
                        placeholder="Имя *"
                        value={bEdit.name}
                        onChange={(e) => setBEdit((s) => (s ? { ...s, name: e.target.value } : s))}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className={btnPrimary('flex-1')}
                          disabled={!bEdit.name.trim() || updB.isPending}
                          onClick={() => {
                            setNote(null);
                            updB.mutate(bEdit);
                          }}
                        >
                          Сохранить
                        </button>
                        <button
                          type="button"
                          className={btnSecondary('flex-1')}
                          disabled={updB.isPending}
                          onClick={() => setBEdit(null)}
                        >
                          Отмена
                        </button>
                      </div>
                    </li>
                  ) : (
                    <li
                      key={x.id}
                      className="flex items-start justify-between gap-2 rounded-xl border border-stone-100 bg-white px-3 py-2"
                    >
                      <span className="min-w-0 font-medium text-stone-800">{x.name}</span>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          className="text-xs font-semibold text-stone-600 hover:underline"
                          onClick={() => {
                            setNote(null);
                            setBEdit({ id: x.id, name: x.name });
                          }}
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          className="text-xs font-semibold text-red-600 hover:underline"
                          onClick={() => {
                            setNote(null);
                            setBEdit(null);
                            delB.mutate(x.id);
                          }}
                        >
                          Удалить
                        </button>
                      </div>
                    </li>
                  ),
                )
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
              {allDirs.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-stone-100 bg-white px-3 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-stone-900">{t.title}</div>
                    <div className="mt-0.5 truncate text-[11px] text-stone-500">
                      Ролей: {(t.roles ?? []).length}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-xs font-semibold text-stone-700 hover:underline"
                    onClick={() => {
                      setNote(null);
                      setEditingDirId(t.id);
                      setEditingRoleIds((t.roles ?? []).map((r) => r.id));
                    }}
                  >
                    Роли…
                  </button>
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

            <div className="mt-4 max-h-[55vh] overflow-y-auto rounded-xl border border-stone-200/80 p-3">
              {(allRoles.length === 0) ? (
                <p className="py-6 text-center text-sm text-stone-500">Список ролей пуст.</p>
              ) : (
                <div className="space-y-2">
                  {allRoles.map((r) => {
                    const checked = editingRoleIds.includes(r.id);
                    return (
                      <label
                        key={r.id}
                        className="flex cursor-pointer items-center gap-2 rounded-xl border border-stone-100 bg-stone-50/40 px-3 py-2 text-sm text-stone-800 hover:bg-stone-50"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-stone-300 text-primary"
                          checked={checked}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setEditingRoleIds((prev) => {
                              if (on) return prev.includes(r.id) ? prev : [...prev, r.id];
                              return prev.filter((x) => x !== r.id);
                            });
                          }}
                        />
                        <span className="min-w-0 truncate">{r.title}</span>
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

function TelegramSection() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: Q_TG,
    queryFn: fetchTelegramSettings,
  });
  const [form, setForm] = useState({
    enabled: false,
    bot_token: '',
    prayer_chat_id: '',
    coordinator_chat_id: '',
    default_chat_id: '',
    prayer_template: '',
  });
  const [customText, setCustomText] = useState('');
  const [customChatId, setCustomChatId] = useState('');
  const [note, setNote] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setForm({
      enabled: data.enabled,
      bot_token: '',
      prayer_chat_id: data.prayer_chat_id ?? '',
      coordinator_chat_id: data.coordinator_chat_id ?? '',
      default_chat_id: data.default_chat_id ?? '',
      prayer_template: data.prayer_template ?? '',
    });
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () =>
      patchTelegramSettings({
        enabled: form.enabled,
        bot_token: normalizeUiOptionalUpdateString(form.bot_token),
        prayer_chat_id: normalizeUiString(form.prayer_chat_id),
        coordinator_chat_id: normalizeUiString(form.coordinator_chat_id),
        default_chat_id: normalizeUiString(form.default_chat_id),
        prayer_template: normalizeUiString(form.prayer_template),
      }),
    onSuccess: (next) => {
      setNote({ type: 'ok', text: 'Telegram настройки сохранены.' });
      qc.setQueryData(Q_TG, next);
      setForm((prev) => ({ ...prev, bot_token: '' }));
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось сохранить Telegram настройки.') }),
  });

  const sendMut = useMutation({
    mutationFn: (payload: { kind: 'prayer_today' | 'next_week' | 'custom'; text?: string; chat_id?: string }) =>
      sendTelegramMessage(payload),
    onSuccess: (r) => {
      setNote({ type: 'ok', text: `Сообщение отправлено в чат ${r.chat_id}.` });
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Ошибка отправки в Telegram.') }),
  });

  if (isLoading) {
    return <div className="h-44 animate-pulse rounded-2xl bg-stone-200/50" />;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/80 p-6 text-center">
        <p className="font-semibold text-red-900">Не удалось загрузить Telegram настройки</p>
        <p className="mt-2 text-sm text-red-800">{apiErrorMessage(error, 'Ошибка сети или сервера.')}</p>
        <button
          type="button"
          className={`${btnPrimary('mt-4')}`}
          onClick={() => void qc.invalidateQueries({ queryKey: Q_TG })}
        >
          Обновить
        </button>
      </div>
    );
  }

  const settings = (data ?? {
    enabled: false,
    bot_token_masked: null,
    prayer_chat_id: null,
    coordinator_chat_id: null,
    default_chat_id: null,
    prayer_template: null,
    has_bot_token: false,
  }) satisfies TelegramSettingsResponse;

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

      <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
        <h3 className="flex items-center gap-2 text-base font-extrabold text-stone-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LuSend className="h-5 w-5" />
          </span>
          Telegram интеграция
        </h3>
        <p className="mt-2 text-sm text-stone-600">
          Раздел доступен только администраторам. Отправка идёт через Telegram Bot API в указанные chat_id.
        </p>

        <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-stone-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-stone-300 text-primary"
            checked={form.enabled}
            onChange={(e) => setForm((s) => ({ ...s, enabled: e.target.checked }))}
          />
          Включить Telegram-модуль
        </label>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-stone-600">Bot Token</label>
            <input
              className={fieldClass()}
              value={form.bot_token}
              onChange={(e) => setForm((s) => ({ ...s, bot_token: e.target.value }))}
              placeholder={settings.bot_token_masked ? `Текущий: ${settings.bot_token_masked}` : '123456:ABC...'}
            />
            <p className="mt-1 text-xs text-stone-500">
              Оставьте пустым, чтобы не менять токен. Токен можно также хранить в `TELEGRAM_BOT_TOKEN`.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-600">chat_id для молитв</label>
            <input
              className={fieldClass()}
              value={form.prayer_chat_id}
              onChange={(e) => setForm((s) => ({ ...s, prayer_chat_id: e.target.value }))}
              placeholder="-1001234567890"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-600">chat_id для координаторов</label>
            <input
              className={fieldClass()}
              value={form.coordinator_chat_id}
              onChange={(e) => setForm((s) => ({ ...s, coordinator_chat_id: e.target.value }))}
              placeholder="-1001234567890"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-600">chat_id по умолчанию</label>
            <input
              className={fieldClass()}
              value={form.default_chat_id}
              onChange={(e) => setForm((s) => ({ ...s, default_chat_id: e.target.value }))}
              placeholder="-1001234567890"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-stone-600">
              Шаблон «Молитва на сегодня»
            </label>
            <textarea
              className={`${fieldClass()} min-h-[170px]`}
              value={form.prayer_template}
              onChange={(e) => setForm((s) => ({ ...s, prayer_template: e.target.value }))}
              placeholder={'Молитва на {{date}}\n\nЧлен церкви: {{member_name}}\nНужда: {{member_prayer_request}}'}
            />
            <p className="mt-1 text-xs text-stone-500">
              Переменные: {'{{date}}'}, {'{{member_name}}'}, {'{{member_prayer_request}}'}, {'{{theme_title}}'},{' '}
              {'{{theme_bible_verse}}'}, {'{{theme_prayer_points}}'}, {'{{ministry_title}}'}, {'{{ministry_prayer_points}}'},
              {' {{backslider_name}}'}.
            </p>
          </div>
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

      <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
        <h3 className="text-base font-extrabold text-stone-900">Быстрые отправки</h3>
        <p className="mt-1 text-sm text-stone-600">
          Можно отправить сегодняшнюю молитву, план на следующую неделю или произвольное уведомление.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={btnSecondary()}
            disabled={sendMut.isPending}
            onClick={() => {
              setNote(null);
              sendMut.mutate({ kind: 'prayer_today' });
            }}
          >
            Сегодняшняя молитва
          </button>
          <button
            type="button"
            className={btnSecondary()}
            disabled={sendMut.isPending}
            onClick={() => {
              setNote(null);
              sendMut.mutate({ kind: 'next_week' });
            }}
          >
            Список на следующую неделю
          </button>
        </div>

        <div className="mt-4 space-y-3 rounded-xl border border-stone-200/80 bg-white p-3">
          <label className="block text-xs font-semibold text-stone-600">Произвольное уведомление</label>
          <textarea
            className={`${fieldClass()} min-h-[110px]`}
            placeholder="Текст уведомления для Telegram…"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
          />
          <input
            className={fieldClass()}
            placeholder="chat_id (необязательно, если есть чат по умолчанию)"
            value={customChatId}
            onChange={(e) => setCustomChatId(e.target.value)}
          />
          <button
            type="button"
            className={btnPrimary('w-full sm:w-auto')}
            disabled={sendMut.isPending || customText.trim().length === 0}
            onClick={() => {
              setNote(null);
              sendMut.mutate({
                kind: 'custom',
                text: customText,
                chat_id: customChatId.trim() || undefined,
              });
            }}
          >
            {sendMut.isPending ? 'Отправка…' : 'Отправить уведомление'}
          </button>
        </div>
      </section>
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

      <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
        <h3 className="flex items-center gap-2 text-base font-extrabold text-stone-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LuMessageSquare className="h-5 w-5" />
          </span>
          SMS.ru интеграция
        </h3>
        <p className="mt-2 text-sm text-stone-600">
          Используется для восстановления пароля по SMS-коду. Настройки доступны только администраторам.
        </p>

        <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-stone-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-stone-300 text-primary"
            checked={form.enabled}
            onChange={(e) => setForm((s) => ({ ...s, enabled: e.target.checked }))}
          />
          Включить восстановление пароля через SMS.ru
        </label>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
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

        <div className="mt-4 rounded-xl border border-stone-200/80 bg-white p-3 text-xs text-stone-600">
          <div>API ID: {settings.has_api_id ? 'задан' : 'не задан'}</div>
          <div>Reset secret: {settings.has_reset_secret ? 'задан' : 'не задан'}</div>
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
