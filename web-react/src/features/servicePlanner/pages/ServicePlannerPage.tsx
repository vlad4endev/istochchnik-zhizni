import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { addMinutes, format, parse, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  LuArrowLeft,
  LuCalendarDays,
  LuChevronDown,
  LuChevronUp,
  LuClock3,
  LuCopy,
  LuDownload,
  LuEllipsis,
  LuEye,
  LuEyeOff,
  LuGripVertical,
  LuLink,
  LuListOrdered,
  LuLoaderCircle,
  LuPencil,
  LuPlus,
  LuSave,
  LuTrash2,
  LuUsers,
} from 'react-icons/lu';
import {
  FaBookBible,
  FaBullhorn,
  FaCakeCandles,
  FaHandHoldingDollar,
  FaHandsPraying,
  FaFeatherPointed,
  FaMicrophoneLines,
  FaMusic,
  FaPuzzlePiece,
  FaWineGlass,
} from 'react-icons/fa6';
import type { IconType } from 'react-icons';
import { useLocation } from 'react-router-dom';

import { SectionHeroChrome } from '@/components/SectionHeroChrome';
import { getAppScrollRoot, getAppScrollTop } from '@/lib/appScroll';
import { sectionHeroStickyClassNested } from '@/lib/sectionHeroChrome';

import { fetchSongs, type SongListItem } from '../../songbook/api';
import type { AppUser } from '../../admin/types';
import { useAuthStore } from '../../auth/authStore';
import {
  createServiceBlock,
  createServiceTemplate,
  createServicePlan,
  deleteServiceBlock,
  deleteServicePlan,
  deleteServiceTemplate,
  fetchServiceBlockTypes,
  fetchServicePlannerMembers,
  fetchServicePlan,
  fetchServiceTemplate,
  fetchServicePlans,
  fetchServiceTemplates,
  patchServiceBlock,
  patchServicePlan,
  patchServiceTemplate,
  reorderServiceBlocks,
  type ServicePlanBlock,
  type ServicePlanDetails,
  type ServiceTemplateDetails,
} from '../api';
import { MediaTeamBlock } from '../../mediaSchedule/components/MediaTeamBlock';
import { fetchMediaAssignmentsForPlan } from '../../mediaSchedule/api';
import { meaningfulNoteLinesFromRaw } from '../plannerNoteText';
import {
  downloadServicePlanPdf,
  resolveServicePlanPdfFontPx,
  type ServicePlanPrintRow,
} from '../servicePlanPrintSheet';
import { useServicePlanEditorsPresence } from '../useServicePlanEditorsPresence';
import { emitAppToast } from '@/lib/uiFeedback';
import { useScrollInputIntoView } from '@/hooks/useScrollInputIntoView';
import { BlockStageSetupFields, BlockStageSetupPreview } from '../components/BlockStageSetupFields';
import { DurationMinutesInput } from '../components/DurationMinutesInput';
import { stageSetupProgramLines } from '../stageSetupFlags';

function planEditorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase();
  }
  if (parts.length === 1 && parts[0]!.length > 0) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return '?';
}

/** Сегодня в локальном календаре (YYYY-MM-DD), без сдвига UTC как у toISOString(). */
function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function tmpId(): number {
  return -Math.floor(Math.random() * 1_000_000_000);
}

function parseStartClock(dateIso: string, time: string): Date {
  return parse(`${dateIso} ${time}`, 'yyyy-MM-dd HH:mm', new Date());
}

function formatRuDateLong(dateIso: string): string {
  if (!dateIso) return '';
  const dt = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return dateIso;
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(dt);
}

/** Подпись «кто / когда» для последнего сохранения плана (сервер: last_edited_*). */
function formatPlanLastEditedLine(
  iso: string | null | undefined,
  name: string | null | undefined,
  memberId: number | null | undefined,
): string | null {
  if (!iso) return null;
  try {
    const d = parseISO(iso);
    if (Number.isNaN(d.getTime())) return null;
    const who =
      name && name.trim()
        ? name.trim()
        : memberId != null
          ? `Участник #${memberId}`
          : 'Участник';
    const when = format(d, 'd MMM yyyy, HH:mm', { locale: ru });
    return `${who} · ${when}`;
  } catch {
    return null;
  }
}

function reorderBlocks(list: ServicePlanBlock[], from: number, to: number): ServicePlanBlock[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next.map((b, idx) => ({ ...b, order_index: idx }));
}

function reorderTemplateBlocks<
  T extends {
    order_index: number;
  },
>(list: T[], from: number, to: number): T[] {
  const next = [...list].sort((a, b) => a.order_index - b.order_index);
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next.map((b, idx) => ({ ...b, order_index: idx }));
}

function hasMinistryRole(u: AppUser, roleName: string): boolean {
  const normalize = (v: string) => v.trim().toLowerCase().replace(/ё/g, 'е');
  const target = normalize(roleName);
  if (!target) return false;
  return String(u.ministry_role ?? '')
    .split(/[;,]/)
    .map((s) => normalize(s))
    .some((s) => s === target || s.includes(target));
}

function hasMinistryDirection(u: AppUser, directionName: string): boolean {
  const normalize = (v: string) => v.trim().toLowerCase().replace(/ё/g, 'е');
  const target = normalize(directionName);
  if (!target) return false;
  return String(u.ministry_direction ?? '')
    .split(/[;,]/)
    .map((s) => normalize(s))
    .some((s) => s === target || s.includes(target));
}

function hasAppRole(u: AppUser, roleName: 'admin' | 'minister'): boolean {
  if (u.app_role === roleName) return true;
  if (!Array.isArray(u.app_roles)) return false;
  return u.app_roles.includes(roleName);
}

function isPreacherCandidate(u: AppUser): boolean {
  return hasMinistryRole(u, 'Проповедник');
}

/** Кандидаты в ответственные за музыку: роль «Музыкант» или направление «Музыкальное служение». */
function isMusicMinistryCandidate(u: AppUser): boolean {
  if (u.app_role === 'musician') return true;
  if (Array.isArray(u.app_roles) && u.app_roles.some((r) => String(r).toLowerCase() === 'musician')) {
    return true;
  }
  return hasMinistryDirection(u, 'Музыкальное служение');
}

function userLabel(u: AppUser): string {
  const full = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim();
  return full || u.name || `Пользователь #${u.id}`;
}

function songBlockTitle(song: SongListItem): string {
  const key = (song.default_key ?? '').trim();
  return key ? `${song.title} [${key}]` : song.title;
}

function splitHeadingAndKey(rawHeading: string): { title: string; key: string | null } {
  const heading = rawHeading.trim();
  const matched = heading.match(/^(.*)\s+\[([^\]]+)\]\s*$/);
  if (!matched) return { title: heading, key: null };
  const title = matched[1].trim();
  const key = matched[2].trim();
  return { title: title || heading, key: key || null };
}

function isSeparatorBlock(block: ServicePlanBlock): boolean {
  return block.content_json?.is_separator === true;
}

function isHiddenFromPublic(block: ServicePlanBlock): boolean {
  return block.content_json?.hide_in_public === true;
}

function separatorLabel(block: ServicePlanBlock): string {
  const fromJson = block.content_json?.separator_text;
  if (typeof fromJson === 'string' && fromJson.trim()) return fromJson.trim();
  return block.title.trim() || 'Раздел';
}

const CATEGORY_ICON_BY_CODE: Record<string, { Icon: IconType; wrapClass: string; iconClass: string }> = {
  prayer: { Icon: FaHandsPraying, wrapClass: 'bg-violet-100', iconClass: 'text-violet-700' },
  song: { Icon: FaMusic, wrapClass: 'bg-sky-100', iconClass: 'text-sky-700' },
  scripture: { Icon: FaBookBible, wrapClass: 'bg-amber-100', iconClass: 'text-amber-700' },
  sermon: { Icon: FaMicrophoneLines, wrapClass: 'bg-rose-100', iconClass: 'text-rose-700' },
  announcements: { Icon: FaBullhorn, wrapClass: 'bg-emerald-100', iconClass: 'text-emerald-700' },
  offering: { Icon: FaHandHoldingDollar, wrapClass: 'bg-lime-100', iconClass: 'text-lime-700' },
  birthdays: { Icon: FaCakeCandles, wrapClass: 'bg-pink-100', iconClass: 'text-pink-700' },
  schedule: { Icon: LuCalendarDays, wrapClass: 'bg-indigo-100', iconClass: 'text-indigo-700' },
  custom: { Icon: FaPuzzlePiece, wrapClass: 'bg-stone-200', iconClass: 'text-stone-700' },
};

const BLOCK_MARK_ICON_OPTIONS: Array<{
  key: string;
  label: string;
  Icon: IconType;
  wrapClass: string;
  iconClass: string;
}> = [
  { key: 'prayer', label: 'Молитва', Icon: FaHandsPraying, wrapClass: 'bg-violet-100', iconClass: 'text-violet-700' },
  { key: 'song', label: 'Песня', Icon: FaMusic, wrapClass: 'bg-sky-100', iconClass: 'text-sky-700' },
  { key: 'scripture', label: 'Писание', Icon: FaBookBible, wrapClass: 'bg-amber-100', iconClass: 'text-amber-700' },
  { key: 'sermon', label: 'Проповедь', Icon: FaMicrophoneLines, wrapClass: 'bg-rose-100', iconClass: 'text-rose-700' },
  { key: 'announcements', label: 'Объявления', Icon: FaBullhorn, wrapClass: 'bg-emerald-100', iconClass: 'text-emerald-700' },
  { key: 'offering', label: 'Пожертвование', Icon: FaHandHoldingDollar, wrapClass: 'bg-lime-100', iconClass: 'text-lime-700' },
  { key: 'birthdays', label: 'Дни рождения', Icon: FaCakeCandles, wrapClass: 'bg-pink-100', iconClass: 'text-pink-700' },
  { key: 'communion', label: 'Причастие', Icon: FaWineGlass, wrapClass: 'bg-purple-100', iconClass: 'text-purple-700' },
  { key: 'schedule', label: 'Расписание', Icon: LuCalendarDays, wrapClass: 'bg-indigo-100', iconClass: 'text-indigo-700' },
  { key: 'donation', label: 'Пожертвование+', Icon: FaHandHoldingDollar, wrapClass: 'bg-emerald-100', iconClass: 'text-emerald-700' },
  { key: 'poem', label: 'Стихи', Icon: FaFeatherPointed, wrapClass: 'bg-fuchsia-100', iconClass: 'text-fuchsia-700' },
  { key: 'custom', label: 'Произвольный', Icon: FaPuzzlePiece, wrapClass: 'bg-stone-200', iconClass: 'text-stone-700' },
  { key: 'users', label: 'Участники', Icon: LuUsers, wrapClass: 'bg-cyan-100', iconClass: 'text-cyan-700' },
  { key: 'clock', label: 'Время', Icon: LuClock3, wrapClass: 'bg-indigo-100', iconClass: 'text-indigo-700' },
  { key: 'note', label: 'Заметка', Icon: LuPencil, wrapClass: 'bg-orange-100', iconClass: 'text-orange-700' },
  { key: 'link', label: 'Ссылка', Icon: LuLink, wrapClass: 'bg-teal-100', iconClass: 'text-teal-700' },
];

const BLOCK_MARK_ICON_BY_KEY = Object.fromEntries(
  BLOCK_MARK_ICON_OPTIONS.map((x) => [x.key, x]),
) as Record<string, (typeof BLOCK_MARK_ICON_OPTIONS)[number]>;

export function ServicePlannerPage() {
  useScrollInputIntoView();
  const qc = useQueryClient();
  const location = useLocation();
  const role = useAuthStore((s) => s.role);
  const authMemberId = useAuthStore((s) => s.memberId);
  const normalizedRole = (role ?? 'member').toLowerCase();
  const isPlannerManagerBySession = normalizedRole === 'admin' || normalizedRole === 'minister';
  const [screen, setScreen] = useState<'home' | 'plan' | 'template'>('home');
  const [createPlanDate, setCreatePlanDate] = useState(todayIso());
  const [isTemplateDraftNew, setIsTemplateDraftNew] = useState(false);
  const [templateImportSourceId, setTemplateImportSourceId] = useState<number | null>(null);
  const [activePlanId, setActivePlanId] = useState<number | null>(null);
  const [draft, setDraft] = useState<ServicePlanDetails | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<number | null>(null);
  const [templateDraft, setTemplateDraft] = useState<ServiceTemplateDetails | null>(null);
  const [editingTemplateBlockId, setEditingTemplateBlockId] = useState<number | null>(null);
  const [recurrenceRuleInput, setRecurrenceRuleInput] = useState<string>('{"frequency":"weekly","byWeekday":0}');
  const [editingBlockId, setEditingBlockId] = useState<number | null>(null);
  /** Актуальный id блока в модалке — эффект синхронизации с planQ не подписан на editingBlockId и иначе затирал бы черновик при refetch. */
  const editingBlockIdRef = useRef<number | null>(null);
  useEffect(() => {
    editingBlockIdRef.current = editingBlockId;
  }, [editingBlockId]);
  const [shareCopied, setShareCopied] = useState(false);
  const [showArchivedPlans, setShowArchivedPlans] = useState(false);
  const [isPlanSettingsOpenMobile, setIsPlanSettingsOpenMobile] = useState(false);
  /** Мобильная панель: меню действий */
  const [mobilePlanBlockMenuId, setMobilePlanBlockMenuId] = useState<number | null>(null);
  const [mobileTemplateBlockMenuId, setMobileTemplateBlockMenuId] = useState<number | null>(null);
  const [mobileTemplateOrderOpenId, setMobileTemplateOrderOpenId] = useState<number | null>(null);
  /** Шапка плана: «⋯» с действиями шаблонов на узком экране */
  const [planHeaderMoreOpen, setPlanHeaderMoreOpen] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const autoArchivingPlanIdsRef = useRef<Set<number>>(new Set());
  /** Отложенное удаление блока программы: таймер API + снимок для отмены из toast */
  const pendingPlanBlockDeleteTimersRef = useRef<Map<number, number>>(new Map());
  const pendingPlanBlockDeleteSnapshotsRef = useRef<Map<number, ServicePlanBlock>>(new Map());
  /** Нужно чтобы автосохранение не запускалось на входящих данных с сервера */
  const suppressNextAutosaveRef = useRef(false);
  const autosaveTimerRef = useRef<number | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [autosaveSavedAt, setAutosaveSavedAt] = useState<number | null>(null);
  const plannerModalOpen = editingTemplateBlockId != null || editingBlockId != null;
  /** Совпадает с Tailwind `md:` — на мобильной весь блок — ручка перетаскивания */
  const [isNarrowViewport, setIsNarrowViewport] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsNarrowViewport(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!plannerModalOpen || typeof document === 'undefined') return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverscroll = document.body.style.overscrollBehavior;
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    document.documentElement.style.overscrollBehavior = 'none';
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overscrollBehavior = prevBodyOverscroll;
      document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;
    };
  }, [plannerModalOpen]);

  const [planStickyBackVisible, setPlanStickyBackVisible] = useState(false);
  useEffect(() => {
    if (screen !== 'plan' || !draft) {
      setPlanStickyBackVisible(false);
      return undefined;
    }
    const onScroll = () => {
      if (!window.matchMedia('(max-width: 767px)').matches) {
        setPlanStickyBackVisible(false);
        return;
      }
      setPlanStickyBackVisible(getAppScrollTop() > 56);
    };
    onScroll();
    const scrollEl = getAppScrollRoot() ?? window;
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', onScroll);
  }, [screen, draft]);

  useEffect(() => {
    setPlanHeaderMoreOpen(false);
  }, [draft?.id]);

  const coEditingPeers = useServicePlanEditorsPresence(
    screen === 'plan' && draft ? draft.id : null,
    authMemberId,
  );

  function toggleBlockPublicVisibility(blockId: number): void {
    if (!draft) return;
    const current = draft.blocks.find((b) => b.id === blockId);
    if (!current) return;
    const nextHidden = !isHiddenFromPublic(current);
    setDraft({
      ...draft,
      blocks: draft.blocks.map((b) =>
        b.id === blockId
          ? { ...b, content_json: { ...b.content_json, hide_in_public: nextHidden } }
          : b,
      ),
    });
    if (nextHidden && editingBlockId === blockId) setEditingBlockId(null);
  }

  const songsQ = useQuery<SongListItem[]>({
    queryKey: ['songs', 'service-planner'],
    queryFn: () => fetchSongs(),
    staleTime: 60_000,
  });

  const membersQ = useQuery<AppUser[]>({
    queryKey: ['service-planner', 'members'],
    queryFn: fetchServicePlannerMembers,
    staleTime: 60_000,
  });

  const templatesQ = useQuery({
    queryKey: ['service-planner', 'templates'],
    queryFn: fetchServiceTemplates,
    staleTime: 60_000,
  });

  const templateQ = useQuery({
    queryKey: ['service-planner', 'template', activeTemplateId],
    queryFn: () => fetchServiceTemplate(activeTemplateId as number),
    enabled: activeTemplateId != null,
  });

  const blockTypesQ = useQuery({
    queryKey: ['service-planner', 'block-types'],
    queryFn: fetchServiceBlockTypes,
    staleTime: 60_000,
  });

  const plansQ = useQuery({
    queryKey: ['service-planner', 'plans', 'all'],
    queryFn: () => fetchServicePlans({ include_archived: true }),
    staleTime: 20_000,
  });

  const planQ = useQuery({
    queryKey: ['service-planner', 'plan', activePlanId],
    queryFn: () => fetchServicePlan(activePlanId as number),
    enabled: activePlanId != null,
    /** Пока открыта модалка блока — не подтягивать план с сервера при фокусе окна (иначе гонка с локальным черновиком). */
    refetchOnWindowFocus: editingBlockId == null && editingTemplateBlockId == null,
  });

  const sharedEditPlanId = useMemo(() => {
    const state = location.state as { sharedEditPlanId?: unknown } | null;
    const raw = state?.sharedEditPlanId;
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isInteger(n) || n <= 0) return null;
    return n;
  }, [location.state]);

  useEffect(() => {
    if (!sharedEditPlanId) return;
    if (activePlanId !== sharedEditPlanId) {
      setActivePlanId(sharedEditPlanId);
    }
    setScreen('plan');
  }, [activePlanId, sharedEditPlanId]);

  useEffect(() => {
    if (sharedEditPlanId) return;
    if (!activePlanId && (plansQ.data?.length ?? 0) > 0) {
      const firstActive = plansQ.data!.find((p) => !p.is_archived) ?? plansQ.data![0];
      setActivePlanId(firstActive.id);
    }
  }, [activePlanId, plansQ.data, sharedEditPlanId]);

  useEffect(() => {
    if (planQ.data) {
      const sermonTypeIds = new Set(
        (blockTypesQ.data ?? [])
          .filter((t) => t.code === 'sermon' || (t.name ?? '').toLowerCase().includes('проповед'))
          .map((t) => t.id),
      );
      const songTypeIds = new Set(
        (blockTypesQ.data ?? [])
          .filter((t) => t.code === 'song' || t.kind === 'song')
          .map((t) => t.id),
      );
      const preacherId = planQ.data.preacher_member_id ?? null;
      const preacher = preacherId ? (membersQ.data ?? []).find((u) => u.id === preacherId) ?? null : null;
      const preacherName = preacher ? userLabel(preacher) : 'Проповедник';
      const musicId = planQ.data.music_ministry_member_id ?? null;
      const pendingDeletes = pendingPlanBlockDeleteTimersRef.current;
      const blocks = planQ.data.blocks
        .filter((b) => !pendingDeletes.has(b.id))
        .map((b) => {
          let x = b;
          if (sermonTypeIds.has(b.block_type_id)) {
            const topicRaw = b.content_json?.sermon_topic;
            const topic = typeof topicRaw === 'string' ? topicRaw.trim() : '';
            x = {
              ...x,
              assigned_member_id: preacherId,
              title: topic ? `${preacherName} - ${topic}` : preacherName,
            };
          }
          if (songTypeIds.has(b.block_type_id)) {
            x = { ...x, assigned_member_id: musicId };
          }
          return x;
        });
      const normalized = { ...planQ.data, blocks };
      suppressNextAutosaveRef.current = true;
      setDraft((prev) => {
        if (!prev || prev.id !== normalized.id) return normalized;
        const editId = editingBlockIdRef.current;
        const normalizedIds = new Set(normalized.blocks.map((b) => b.id));
        const extras = prev.blocks.filter((b) => !normalizedIds.has(b.id) && !pendingDeletes.has(b.id));
        let blocks = normalized.blocks.map((b) => {
          if (editId != null && b.id === editId) {
            const local = prev.blocks.find((x) => x.id === editId);
            return local ?? b;
          }
          return b;
        });
        if (extras.length > 0) {
          blocks = [...blocks, ...extras].sort((a, b) => a.order_index - b.order_index);
        }
        return { ...normalized, blocks };
      });
      if (planQ.data.template_id) {
        setActiveTemplateId(planQ.data.template_id);
      }
    }
  }, [planQ.data, blockTypesQ.data, membersQ.data]);

  useEffect(() => {
    if (
      mobilePlanBlockMenuId == null &&
      mobileTemplateBlockMenuId == null &&
      mobileTemplateOrderOpenId == null
    ) {
      return undefined;
    }
    const onPointerDown = (e: PointerEvent) => {
      const el = e.target;
      if (!(el instanceof Element)) return;
      if (el.closest('[data-planner-mobile-menu-root]')) return;
      if (el.closest('[data-planner-mobile-template-order-root]')) return;
      setMobilePlanBlockMenuId(null);
      setMobileTemplateBlockMenuId(null);
      setMobileTemplateOrderOpenId(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [
    mobilePlanBlockMenuId,
    mobileTemplateBlockMenuId,
    mobileTemplateOrderOpenId,
  ]);

  useEffect(() => {
    if (!activeTemplateId && (templatesQ.data?.length ?? 0) > 0) {
      setActiveTemplateId(templatesQ.data![0].id);
    }
  }, [activeTemplateId, templatesQ.data]);

  useEffect(() => {
    if (templateQ.data) {
      setTemplateDraft(templateQ.data);
      setRecurrenceRuleInput(JSON.stringify(templateQ.data.recurrence_rule ?? {}, null, 2));
    }
  }, [templateQ.data]);

  useEffect(() => {
    const plans = plansQ.data ?? [];
    if (plans.length === 0) return;
    const today = todayIso();
    const toArchive = plans.filter(
      (p) => !p.is_archived && p.service_date < today && !autoArchivingPlanIdsRef.current.has(p.id),
    );
    if (toArchive.length === 0) return;
    toArchive.forEach((p) => autoArchivingPlanIdsRef.current.add(p.id));
    void (async () => {
      try {
        for (const plan of toArchive) {
          await patchServicePlan(plan.id, { is_archived: true });
          if (activePlanId === plan.id) {
            setDraft((prev) => (prev ? { ...prev, is_archived: true } : prev));
            setScreen('home');
          }
        }
        await qc.invalidateQueries({ queryKey: ['service-planner', 'plans'] });
      } catch {
        for (const plan of toArchive) autoArchivingPlanIdsRef.current.delete(plan.id);
      }
    })();
  }, [plansQ.data, activePlanId, qc]);

  const updatePlanMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Parameters<typeof patchServicePlan>[1] }) =>
      patchServicePlan(id, body),
    onSuccess: async (_data, variables) => {
      await qc.invalidateQueries({ queryKey: ['service-planner', 'plans'] });
      await qc.invalidateQueries({ queryKey: ['service-planner', 'plan', variables.id] });
    },
  });

  const updateBlockMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Parameters<typeof patchServiceBlock>[1] }) =>
      patchServiceBlock(id, body),
  });

  const reorderMut = useMutation({
    mutationFn: (body: Parameters<typeof reorderServiceBlocks>[0]) => reorderServiceBlocks(body),
  });

  const createPlanMut = useMutation({
    mutationFn: (body: Parameters<typeof createServicePlan>[0]) => createServicePlan(body),
    onSuccess: async (data) => {
      await qc.invalidateQueries({ queryKey: ['service-planner', 'plans'] });
      setActivePlanId(data.id);
      setScreen('plan');
    },
  });

  const createTemplateMut = useMutation({
    mutationFn: (body: Parameters<typeof createServiceTemplate>[0]) => createServiceTemplate(body),
    onSuccess: async (data) => {
      await qc.invalidateQueries({ queryKey: ['service-planner', 'templates'] });
      setActiveTemplateId(data.id);
      setIsTemplateDraftNew(false);
    },
  });

  const createBlockMut = useMutation({
    mutationFn: (body: Parameters<typeof createServiceBlock>[0]) => createServiceBlock(body),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['service-planner', 'plans'] }),
        qc.invalidateQueries({ queryKey: ['service-planner', 'plans', 'all'] }),
        qc.invalidateQueries({ queryKey: ['service-planner', 'plan', activePlanId] }),
      ]);
    },
  });

  const deleteBlockMut = useMutation({
    mutationFn: (id: number) => deleteServiceBlock(id),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['service-planner', 'plans'] }),
        qc.invalidateQueries({ queryKey: ['service-planner', 'plans', 'all'] }),
        qc.invalidateQueries({ queryKey: ['service-planner', 'plan', activePlanId] }),
      ]);
    },
  });

  function flushPendingPlanBlockDelete(blockId: number): void {
    const t = pendingPlanBlockDeleteTimersRef.current.get(blockId);
    if (t != null) window.clearTimeout(t);
    pendingPlanBlockDeleteTimersRef.current.delete(blockId);
    pendingPlanBlockDeleteSnapshotsRef.current.delete(blockId);
  }

  /** Мгновенное удаление блока: оптимистично в UI + сразу API. */
  function scheduleDeletePlanBlock(block: ServicePlanBlock, planId: number): void {
    flushPendingPlanBlockDelete(block.id);

    const snapshot = { ...block };
    setDraft((prev) => {
      if (!prev || prev.id !== planId) return prev;
      return {
        ...prev,
        blocks: prev.blocks.filter((b) => b.id !== block.id),
      };
    });
    setMobilePlanBlockMenuId(null);
    setEditingBlockId((cur) => (cur === block.id ? null : cur));

    void (async () => {
      try {
        await deleteBlockMut.mutateAsync(block.id);
      } catch {
        // Если API не удалил — возвращаем блок обратно (без системных alert).
        setDraft((prev) => {
          if (!prev || prev.id !== planId) return prev;
          if (prev.blocks.some((b) => b.id === snapshot.id)) return prev;
          const blocks = [...prev.blocks, snapshot].sort((a, b) => a.order_index - b.order_index);
          return { ...prev, blocks };
        });
      }
    })();
  }

  // NOTE: типы useMutation в этом файле иногда ломают вывод TVariables для mutationFn без аргументов.
  // Для автосохранения нам нужны mutateAsync/isPending, поэтому фиксируем тип как any.
  const saveProgramMut = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      if (canManagePlanSettings) {
        await patchServicePlan(draft.id, {
          service_date: draft.service_date,
          start_time: draft.start_time,
          leader_member_id: draft.leader_member_id,
          preacher_member_id: draft.preacher_member_id,
          music_ministry_member_id: draft.music_ministry_member_id,
          current_block_id: draft.current_block_id,
          status: draft.status,
        });
      }
      const ordered = [...draft.blocks].sort((a, b) => a.order_index - b.order_index);
      for (const b of ordered) {
        const meta = blockTypes.find((t) => t.id === b.block_type_id);
        const isSongMeta = meta?.code === 'song' || meta?.kind === 'song';
        const isSermonMeta =
          meta?.code === 'sermon' || (meta?.name ?? '').toLowerCase().includes('проповед');
        let assigned_member_id = b.assigned_member_id;
        if (isSermonMeta) assigned_member_id = draft.preacher_member_id ?? null;
        else if (isSongMeta)
          assigned_member_id = draft.music_ministry_member_id ?? b.assigned_member_id ?? null;
        await patchServiceBlock(b.id, {
          title: b.title,
          block_type_id: b.block_type_id,
          duration_minutes: b.duration_minutes,
          assigned_member_id,
          song_id: b.song_id,
          content_json: b.content_json,
        });
      }
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['service-planner', 'plans'] }),
        qc.invalidateQueries({ queryKey: ['service-planner', 'plan', activePlanId] }),
      ]);
      setAutosaveSavedAt(Date.now());
      setAutosaveStatus('saved');
    },
    onError: () => {
      setAutosaveStatus('error');
    },
  }) as any;

  // Автосохранение: любое изменение draft → дебаунс 800мс → saveProgramMut
  useEffect(() => {
    if (!draft) return;
    if (screen !== 'plan') return;
    if (suppressNextAutosaveRef.current) {
      suppressNextAutosaveRef.current = false;
      return;
    }

    if (autosaveTimerRef.current != null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      if (saveProgramMut.isPending) {
        // если уже сохраняем — попробуем снова чуть позже
        autosaveTimerRef.current = window.setTimeout(() => {
          autosaveTimerRef.current = null;
          if (!saveProgramMut.isPending) {
            setAutosaveStatus('saving');
            void saveProgramMut.mutateAsync();
          }
        }, 600);
        return;
      }
      setAutosaveStatus('saving');
      void saveProgramMut.mutateAsync();
    }, 800);

    return () => {
      if (autosaveTimerRef.current != null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [draft, screen]);

  const updateTemplateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Parameters<typeof patchServiceTemplate>[1] }) =>
      patchServiceTemplate(id, body),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['service-planner', 'templates'] }),
        qc.invalidateQueries({ queryKey: ['service-planner', 'template', activeTemplateId] }),
      ]);
    },
  });

  const deleteTemplateMut = useMutation({
    mutationFn: (id: number) => deleteServiceTemplate(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['service-planner', 'templates'] });
      setTemplateDraft(null);
      setActiveTemplateId(null);
      setScreen('home');
    },
  });

  const deletePlanMut = useMutation({
    mutationFn: (id: number) => deleteServicePlan(id),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['service-planner', 'plans'] }),
        activePlanId != null
          ? qc.invalidateQueries({ queryKey: ['service-planner', 'plan', activePlanId] })
          : Promise.resolve(),
      ]);
      setDraft(null);
      setActivePlanId(null);
      setScreen('home');
    },
  });

  const totalDuration = useMemo(
    () =>
      draft?.blocks.reduce((acc, b) => acc + (isSeparatorBlock(b) ? 0 : Math.max(0, b.duration_minutes)), 0) ?? 0,
    [draft],
  );

  const timedBlocks = useMemo(() => {
    if (!draft) return [];
    let cursor = parseStartClock(draft.service_date, draft.start_time);
    return draft.blocks
      .slice()
      .sort((a, b) => a.order_index - b.order_index)
      .map((b) => {
        const startsAt = format(cursor, 'HH:mm');
        const duration = isSeparatorBlock(b) ? 0 : Math.max(0, b.duration_minutes);
        cursor = addMinutes(cursor, duration);
        return { ...b, startsAt };
      });
  }, [draft]);

  const users = membersQ.data ?? [];
  const songs = songsQ.data ?? [];
  const templates = templatesQ.data ?? [];
  const blockTypes = blockTypesQ.data ?? [];
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u] as const)), [users]);
  const authMember = authMemberId ? usersById.get(authMemberId) ?? null : null;
  const isPlannerManagerByProfile = authMember ? hasAppRole(authMember, 'admin') || hasAppRole(authMember, 'minister') : false;
  const canManagePlanSettings = isPlannerManagerBySession || isPlannerManagerByProfile;
  const isBlocksOnlyEditor = !canManagePlanSettings;
  const canManageTemplates =
    isPlannerManagerBySession ||
    isPlannerManagerByProfile ||
    (authMember ? hasMinistryRole(authMember, 'Ведущий') : false);
  const canCreateTemplateFromPlan =
    normalizedRole === 'admin' || (authMember ? hasAppRole(authMember, 'admin') : false);
  const leaderCandidates = useMemo(() => users.filter((u) => hasMinistryRole(u, 'Ведущий')), [users]);
  const preacherCandidates = useMemo(() => users.filter((u) => isPreacherCandidate(u)), [users]);
  const musicMinistryCandidates = useMemo(
    () => users.filter((u) => isMusicMinistryCandidate(u)),
    [users],
  );

  const activeTemplate = useMemo(() => {
    const targetId = activeTemplateId ?? draft?.template_id ?? null;
    if (!targetId) return null;
    return templates.find((t) => t.id === targetId) ?? null;
  }, [activeTemplateId, draft?.template_id, templates]);

  const editingBlock = useMemo(
    () => draft?.blocks.find((b) => b.id === editingBlockId) ?? null,
    [draft, editingBlockId],
  );
  const templateBlocksSorted = useMemo(
    () => (templateDraft ? templateDraft.blocks.slice().sort((a, b) => a.order_index - b.order_index) : []),
    [templateDraft],
  );
  const editingTemplateBlock = useMemo(
    () => templateDraft?.blocks.find((b) => b.id === editingTemplateBlockId) ?? null,
    [templateDraft, editingTemplateBlockId],
  );

  /** Уникальные id полей модалки «Редактирование блока» для связки с <label> (a11y). */
  const blockEditFieldsUid = useId();

  function getBlockTypeMeta(block: ServicePlanBlock) {
    return blockTypes.find((t) => t.id === block.block_type_id) ?? null;
  }

  function isPoemBlock(block: ServicePlanBlock): boolean {
    const meta = getBlockTypeMeta(block);
    if (!meta) return false;
    return meta.code === 'poem' || (meta.name ?? '').toLowerCase().includes('стих');
  }

  function isBirthdaysBlock(block: ServicePlanBlock): boolean {
    const meta = getBlockTypeMeta(block);
    if (!meta) return false;
    return meta.code === 'birthdays' || (meta.name ?? '').toLowerCase().includes('дни рождения');
  }

  function isSermonBlock(block: ServicePlanBlock): boolean {
    const meta = getBlockTypeMeta(block);
    if (!meta) return false;
    return meta.code === 'sermon' || (meta.name ?? '').toLowerCase().includes('проповед');
  }

  function isSongBlock(block: ServicePlanBlock): boolean {
    const meta = getBlockTypeMeta(block);
    if (!meta) return false;
    return meta.code === 'song' || meta.kind === 'song';
  }

  function poemHeading(block: ServicePlanBlock): string {
    const reader = block.assigned_member_id ? usersById.get(block.assigned_member_id) : null;
    return reader ? `СТИХ - ${userLabel(reader)}` : 'СТИХ - Чтец';
  }

  function poemSubline(block: ServicePlanBlock): string | null {
    const authorRaw = block.content_json?.poem_author;
    const themeRaw = block.content_json?.poem_theme;
    const author = typeof authorRaw === 'string' ? authorRaw.trim() : '';
    const theme = typeof themeRaw === 'string' ? themeRaw.trim() : '';
    if (!author && !theme) return null;
    if (author && theme) return `${author} • ${theme}`;
    return author || theme;
  }

  function sermonTopic(block: ServicePlanBlock): string {
    const raw = block.content_json?.sermon_topic;
    return typeof raw === 'string' ? raw.trim() : '';
  }

  function sermonScripture(block: ServicePlanBlock): string {
    const raw = block.content_json?.sermon_scripture;
    return typeof raw === 'string' ? raw.trim() : '';
  }

  function sermonPreacher(block: ServicePlanBlock): AppUser | null {
    if (block.assigned_member_id) return usersById.get(block.assigned_member_id) ?? null;
    if (draft?.preacher_member_id) return usersById.get(draft.preacher_member_id) ?? null;
    return null;
  }

  function sermonHeading(block: ServicePlanBlock): string {
    const preacher = sermonPreacher(block);
    const preacherName = preacher ? userLabel(preacher) : 'Проповедник';
    const topic = sermonTopic(block);
    return topic ? `${preacherName} - ${topic}` : preacherName;
  }

  function birthdayLines(block: ServicePlanBlock): string[] {
    const raw = block.content_json?.birthday_people;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((x) => {
        if (!x || typeof x !== 'object') return null;
        const row = x as Record<string, unknown>;
        const name = typeof row.name === 'string' ? row.name.trim() : '';
        if (!name) return null;
        const weekDate = typeof row.week_date === 'string' ? row.week_date : '';
        if (!weekDate) return name;
        const dt = new Date(`${weekDate}T12:00:00`);
        if (Number.isNaN(dt.getTime())) return name;
        const dateText = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }).format(dt);
        return `${name} — ${dateText}`;
      })
      .filter((x): x is string => Boolean(x));
  }

  function scheduleLines(block: ServicePlanBlock): string[] {
    const raw = block.content_json?.schedule_events;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((x) => {
        if (!x || typeof x !== 'object') return null;
        const row = x as Record<string, unknown>;
        const title = typeof row.title === 'string' ? row.title.trim() : '';
        if (!title) return null;
        const dateIso = typeof row.event_date === 'string' ? row.event_date.trim() : '';
        const time = typeof row.event_time === 'string' ? row.event_time.trim().slice(0, 5) : '';
        let datePart = '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
          const dt = new Date(`${dateIso}T12:00:00`);
          if (!Number.isNaN(dt.getTime())) {
            datePart = new Intl.DateTimeFormat('ru-RU', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            }).format(dt);
          }
        }
        const prefix = [datePart, time].filter((v) => v.length > 0).join(' ');
        return prefix ? `${prefix} — ${title}` : title;
      })
      .filter((x): x is string => Boolean(x));
  }

  function getResponsibleLabel(block: ServicePlanBlock): string | null {
    if (!draft) return null;
    if (isSermonBlock(block)) {
      const preacher = sermonPreacher(block);
      return preacher ? userLabel(preacher) : null;
    }
    if (isSongBlock(block)) {
      const id = draft.music_ministry_member_id;
      const m = id ? usersById.get(id) : null;
      return m ? userLabel(m) : null;
    }
    const assigned = block.assigned_member_id ? usersById.get(block.assigned_member_id) : null;
    return assigned ? userLabel(assigned) : null;
  }

  function getBlockNotePreview(block: ServicePlanBlock): string | null {
    const cj = block.content_json ?? {};
    const noteRaw = typeof cj.notes === 'string' ? cj.notes : '';
    const textRaw = typeof cj.text === 'string' ? cj.text : '';
    const raw = noteRaw.trim() ? noteRaw : textRaw;
    const cleaned = meaningfulNoteLinesFromRaw(raw, cj);
    return cleaned || null;
  }

  function getCategoryIcon(block: ServicePlanBlock): { Icon: IconType; wrapClass: string; iconClass: string } | null {
    const meta = getBlockTypeMeta(block);
    if (!meta) return null;
    const codeKey = (meta.code ?? '').trim().toLowerCase();
    if (codeKey && CATEGORY_ICON_BY_CODE[codeKey]) return CATEGORY_ICON_BY_CODE[codeKey];
    return null;
  }

  function getBlockMark(block: ServicePlanBlock): string | null {
    const fromContent = block.content_json?.block_mark;
    if (typeof fromContent === 'string' && fromContent.trim()) return fromContent.trim();
    return null;
  }

  function getBlockMarkIcon(block: ServicePlanBlock):
    | { Icon: IconType; wrapClass: string; iconClass: string }
    | null {
    const keyRaw = block.content_json?.block_mark_icon;
    if (typeof keyRaw !== 'string') return null;
    const key = keyRaw.trim().toLowerCase();
    if (!key) return null;
    return BLOCK_MARK_ICON_BY_KEY[key] ?? null;
  }

  function isScheduleBlock(block: ServicePlanBlock): boolean {
    const meta = getBlockTypeMeta(block);
    return meta?.code === 'schedule';
  }

  function getBlockLogoUrl(block: ServicePlanBlock): string | null {
    const raw = block.content_json?.block_logo_url;
    if (typeof raw !== 'string') return null;
    const value = raw.trim();
    if (!value) return null;
    if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/')) {
      return value;
    }
    return null;
  }

  async function handlePrintPlanSheet(): Promise<void> {
    if (!draft || pdfExporting) return;
    const rows: ServicePlanPrintRow[] = timedBlocks.map((block) => {
      if (isSeparatorBlock(block)) {
        return { type: 'separator', label: separatorLabel(block) };
      }
      const heading = isPoemBlock(block)
        ? poemHeading(block)
        : isSermonBlock(block)
          ? sermonHeading(block)
          : isBirthdaysBlock(block)
            ? 'Дни рождения недели'
            : block.title;
      const { title: blockTitle, key: blockKey } = splitHeadingAndKey(heading);
      const title = blockKey ? `${blockTitle} [${blockKey}]` : blockTitle;
      const blockTypeLabel = blockTypes.find((t) => t.id === block.block_type_id)?.name ?? 'Блок';
      const subtitle = blockTypeLabel;
      const details: string[] = [];
      if (isPoemBlock(block)) {
        const sub = poemSubline(block);
        if (sub) details.push(sub);
      }
      if (isBirthdaysBlock(block)) {
        const bl = birthdayLines(block);
        if (bl.length) details.push(`Именинники: ${bl.join(' · ')}`);
      }
      if (isScheduleBlock(block)) {
        const sl = scheduleLines(block);
        if (sl.length) {
          details.push('Расписание:');
          for (const line of sl.slice(0, 8)) details.push(`· ${line}`);
          if (sl.length > 8) details.push(`… ещё ${sl.length - 8}`);
        }
      }
      if (isSermonBlock(block) && sermonScripture(block)) {
        details.push(`Писание: ${sermonScripture(block)}`);
      }
      for (const line of stageSetupProgramLines(block.content_json)) {
        details.push(line);
      }
      const note = getBlockNotePreview(block);
      if (note) details.push(`Заметка: ${note}`);
      const responsible = getResponsibleLabel(block);
      return {
        type: 'block' as const,
        time: block.startsAt,
        title,
        subtitle,
        details,
        minutes: block.duration_minutes,
        responsible,
        hiddenFromPublic: isHiddenFromPublic(block),
      };
    });
    const dateLine = new Intl.DateTimeFormat('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(`${draft.service_date}T12:00:00`));
    const leader = draft.leader_member_id ? usersById.get(draft.leader_member_id) ?? null : null;
    const preacher = draft.preacher_member_id ? usersById.get(draft.preacher_member_id) ?? null : null;

    setPdfExporting(true);
    try {
      let broadcastAssignments: { role_name: string; member_name: string }[] = [];
      try {
        const mediaAssignments = await qc.fetchQuery({
          queryKey: ['media-schedule', 'plan-assignments', draft.id],
          queryFn: () => fetchMediaAssignmentsForPlan(draft.id),
        });
        broadcastAssignments = mediaAssignments.map((a) => ({
          role_name: a.role.name,
          member_name: a.member.name,
        }));
      } catch {
        broadcastAssignments = [];
      }

      const pdfFontPx = resolveServicePlanPdfFontPx(rows, broadcastAssignments.length);

      await downloadServicePlanPdf(
        {
          documentTitle: `Программа служения ${draft.service_date}`,
          heading: 'Программа служения',
          dateLine,
          startTime: draft.start_time,
          totalMinutes: totalDuration,
          leader: leader ? userLabel(leader) : null,
          preacher: preacher ? userLabel(preacher) : null,
          broadcastAssignments,
          baseFontPx: pdfFontPx,
          rows,
        },
        `programma-sluzheniya-${draft.service_date}.pdf`,
      );
      emitAppToast({
        kind: 'success',
        message: 'PDF сохранён на устройство',
      });
    } catch {
      emitAppToast({
        kind: 'error',
        message: 'Не удалось сформировать PDF. Попробуйте ещё раз.',
      });
    } finally {
      setPdfExporting(false);
    }
  }

  function onDragEnd(result: DropResult): void {
    const destination = result.destination;
    if (!destination || !draft) return;
    if (destination.index === result.source.index) return;
    const visible = timedBlocks.slice().sort((a, b) => a.order_index - b.order_index);
    const reorderedVisible = reorderBlocks(visible, result.source.index, destination.index);
    const nextById = new Map(reorderedVisible.map((b, idx) => [b.id, { ...b, order_index: idx }] as const));
    const nextBlocks = draft.blocks
      .map((b) => nextById.get(b.id) ?? b)
      .sort((a, b) => a.order_index - b.order_index);

    setDraft({ ...draft, blocks: nextBlocks });
    void reorderMut
      .mutateAsync({
        service_plan_id: draft.id,
        ordered_block_ids: reorderedVisible.map((b) => b.id),
      })
      .catch(() => {
        // Re-sync with backend order if optimistic reorder failed.
        void qc.invalidateQueries({ queryKey: ['service-planner', 'plan', draft.id] });
      });
  }

  function onTemplateDragEnd(result: DropResult): void {
    const destination = result.destination;
    if (!destination || !templateDraft) return;
    if (destination.index === result.source.index) return;
    const reordered = reorderTemplateBlocks(templateBlocksSorted, result.source.index, destination.index);
    setTemplateDraft({ ...templateDraft, blocks: reordered });
  }

  function generateFromTemplate(date: string): void {
    if (!activeTemplate) return;
    void createPlanMut.mutateAsync({
      template_id: activeTemplate.id,
      service_date: date,
      // Для новой программы по шаблону сохраняем только дату.
      // Остальные настройки должны стартовать пустыми/по умолчанию шаблона.
      leader_member_id: null,
      preacher_member_id: null,
    });
  }

  async function createTemplateFromCurrentPlan(): Promise<void> {
    if (!canCreateTemplateFromPlan) return;
    if (!draft) return;
    const fallbackType = blockTypes[0]?.id;
    if (!fallbackType) return;
    const suggestedName = `Шаблон из программы ${formatRuDateLong(draft.service_date)}`;
    const name = window.prompt('Название нового шаблона', suggestedName)?.trim();
    if (!name) return;
    const recurrence =
      templateDraft?.recurrence_rule && Object.keys(templateDraft.recurrence_rule).length > 0
        ? templateDraft.recurrence_rule
        : { frequency: 'weekly', byWeekday: 0 };
    try {
      await createTemplateMut.mutateAsync({
        name,
        description: `Создано из программы от ${formatRuDateLong(draft.service_date)}`,
        default_start_time: draft.start_time || '10:00',
        recurrence_rule: recurrence,
        blocks: draft.blocks
          .slice()
          .sort((a, b) => a.order_index - b.order_index)
          .map((b, idx) => ({
            block_type_id: b.block_type_id || fallbackType,
            title: b.title || `Блок ${idx + 1}`,
            order_index: idx,
            duration_minutes: Math.max(1, b.duration_minutes || 1),
            default_song_id: b.song_id ?? null,
            default_content_json: {
              ...(b.content_json ?? {}),
              default_assigned_member_id: b.assigned_member_id ?? null,
            },
          })),
      });
      setIsTemplateDraftNew(false);
      setScreen('template');
    } catch {
      window.alert('Не удалось создать шаблон из текущей программы');
    }
  }

  function addPlanBlock(): void {
    if (!draft) return;
    const defaultType = blockTypes[0]?.id;
    if (!defaultType) return;
    void (async () => {
      const created = await createBlockMut.mutateAsync({
        service_plan_id: draft.id,
        block_type_id: defaultType,
        title: 'Новый блок',
        duration_minutes: 5,
        content_json: {},
      });
      setDraft((prev) => {
        if (!prev || prev.id !== draft.id) return prev;
        const nextOrder = prev.blocks.length;
        return {
          ...prev,
          blocks: [
            ...prev.blocks,
            {
              id: created.id,
              service_plan_id: prev.id,
              block_type_id: defaultType,
              title: 'Новый блок',
              order_index: nextOrder,
              duration_minutes: 5,
              assigned_member_id: null,
              song_id: null,
              content_json: {},
            },
          ],
        };
      });
      setEditingBlockId(created.id);
    })();
  }

  function addSeparatorBlock(): void {
    if (!draft) return;
    const separatorType = blockTypes.find((t) => t.code === 'custom')?.id ?? blockTypes[0]?.id;
    if (!separatorType) return;
    void (async () => {
      const created = await createBlockMut.mutateAsync({
        service_plan_id: draft.id,
        block_type_id: separatorType,
        title: 'Раздел',
        duration_minutes: 1,
        content_json: {
          is_separator: true,
          separator_text: 'Новый раздел',
        },
      });
      setDraft((prev) => {
        if (!prev || prev.id !== draft.id) return prev;
        const nextOrder = prev.blocks.length;
        return {
          ...prev,
          blocks: [
            ...prev.blocks,
            {
              id: created.id,
              service_plan_id: prev.id,
              block_type_id: separatorType,
              title: 'Раздел',
              order_index: nextOrder,
              duration_minutes: 1,
              assigned_member_id: null,
              song_id: null,
              content_json: {
                is_separator: true,
                separator_text: 'Новый раздел',
              },
            },
          ],
        };
      });
      setEditingBlockId(created.id);
    })();
  }

  async function copyShareLink(): Promise<void> {
    if (!draft || typeof window === 'undefined') return;
    const url = `${window.location.origin}/service-plan/share/${draft.share_token}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1200);
    } catch {
      window.prompt('Скопируйте ссылку вручную:', url);
    }
  }

  async function toggleArchiveCurrentPlan(): Promise<void> {
    if (!draft) return;
    const nextArchived = !draft.is_archived;
    const ok = window.confirm(
      nextArchived
        ? 'Отправить эту программу в архив?'
        : 'Вернуть эту программу из архива в активные?',
    );
    if (!ok) return;
    await updatePlanMut.mutateAsync({
      id: draft.id,
      body: { is_archived: nextArchived },
    });
    setDraft({ ...draft, is_archived: nextArchived });
    if (nextArchived) {
      setShowArchivedPlans(true);
      setScreen('home');
    }
  }

  async function deleteCurrentPlan(): Promise<void> {
    if (!draft) return;
    const ok = window.confirm(
      'Удалить программу безвозвратно? Это действие нельзя отменить.',
    );
    if (!ok) return;
    await deletePlanMut.mutateAsync(draft.id);
  }

  function updateDraftBlock(blockId: number, patch: Partial<ServicePlanBlock>): void {
    if (!draft) return;
    setDraft({
      ...draft,
      blocks: draft.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)),
    });
  }

  function addTemplateBlock(): void {
    if (!templateDraft) return;
    const fallbackType = blockTypes[0]?.id;
    if (!fallbackType) return;
    setTemplateDraft({
      ...templateDraft,
      blocks: [
        ...templateDraft.blocks,
        {
          id: tmpId(),
          template_id: templateDraft.id,
          block_type_id: fallbackType,
          title: `Новый блок ${templateDraft.blocks.length + 1}`,
          order_index: templateDraft.blocks.length,
          duration_minutes: 5,
          default_song_id: null,
          default_content_json: {},
        },
      ],
    });
  }

  function addTemplateSeparatorBlock(): void {
    if (!templateDraft) return;
    const separatorType = blockTypes.find((t) => t.code === 'custom')?.id ?? blockTypes[0]?.id;
    if (!separatorType) return;
    setTemplateDraft({
      ...templateDraft,
      blocks: [
        ...templateDraft.blocks,
        {
          id: tmpId(),
          template_id: templateDraft.id,
          block_type_id: separatorType,
          title: 'Раздел',
          order_index: templateDraft.blocks.length,
          duration_minutes: 1,
          default_song_id: null,
          default_content_json: {
            is_separator: true,
            separator_text: 'Новый раздел',
          },
        },
      ],
    });
  }

  function isTemplateSeparatorBlock(
    b: ServiceTemplateDetails['blocks'][number],
  ): boolean {
    return b.default_content_json?.is_separator === true;
  }

  function templateSeparatorLabel(
    b: ServiceTemplateDetails['blocks'][number],
  ): string {
    const fromJson = b.default_content_json?.separator_text;
    if (typeof fromJson === 'string' && fromJson.trim()) return fromJson.trim();
    return b.title.trim() || 'Раздел';
  }

  function updateTemplateBlock(
    blockId: number,
    patch: Partial<ServiceTemplateDetails['blocks'][number]>,
  ): void {
    if (!templateDraft) return;
    setTemplateDraft({
      ...templateDraft,
      blocks: templateDraft.blocks.map((x) => (x.id === blockId ? { ...x, ...patch } : x)),
    });
  }

  async function saveTemplateDraft(): Promise<void> {
    if (!templateDraft) return;
    try {
      const parsedRecurrence = JSON.parse(
        recurrenceRuleInput && recurrenceRuleInput.trim() ? recurrenceRuleInput : '{}',
      ) as Record<string, unknown>;
      const payload = {
        name: templateDraft.name,
        description: templateDraft.description,
        default_start_time: templateDraft.default_start_time,
        recurrence_rule: parsedRecurrence,
        blocks: templateDraft.blocks
          .slice()
          .sort((a, b) => a.order_index - b.order_index)
          .map((b, idx) => ({
            block_type_id: b.block_type_id,
            title: b.title,
            order_index: idx,
            duration_minutes: b.duration_minutes,
            default_song_id: b.default_song_id,
            default_content_json: b.default_content_json,
          })),
      };
      if (isTemplateDraftNew) {
        await createTemplateMut.mutateAsync(payload);
      } else {
        await updateTemplateMut.mutateAsync({
          id: templateDraft.id,
          body: {
            ...payload,
            is_active: templateDraft.is_active,
          },
        });
      }
    } catch {
      window.alert('Проверьте recurrence_rule: это должен быть корректный JSON.');
    }
  }

  function startTemplateConstructorEmpty(): void {
    const fallbackType = blockTypes[0]?.id ?? 1;
    setTemplateDraft({
      id: 0,
      name: 'Новый шаблон',
      description: '',
      recurrence_rule: { frequency: 'weekly', byWeekday: 0 },
      default_start_time: '10:00',
      is_active: true,
      blocks: [
        {
          id: tmpId(),
          template_id: 0,
          block_type_id: fallbackType,
          title: 'Новый блок 1',
          order_index: 0,
          duration_minutes: 5,
          default_song_id: null,
          default_content_json: {},
        },
      ],
    });
    setRecurrenceRuleInput(JSON.stringify({ frequency: 'weekly', byWeekday: 0 }, null, 2));
    setTemplateImportSourceId(null);
    setIsTemplateDraftNew(true);
    setScreen('template');
  }

  async function importFromExistingTemplate(sourceTemplateId: number): Promise<void> {
    if (!templateDraft) return;
    const source = await fetchServiceTemplate(sourceTemplateId);
    const nextName = isTemplateDraftNew ? `${source.name} (копия)` : templateDraft.name;
    setTemplateDraft({
      ...templateDraft,
      name: nextName,
      description: source.description,
      default_start_time: source.default_start_time,
      recurrence_rule: source.recurrence_rule,
      blocks: source.blocks.map((b, idx) => ({
        ...b,
        id: isTemplateDraftNew ? tmpId() - idx : b.id,
        template_id: templateDraft.id,
        order_index: idx,
      })),
    });
    setRecurrenceRuleInput(JSON.stringify(source.recurrence_rule ?? {}, null, 2));
  }

  const plans = plansQ.data ?? [];
  const visiblePlans = useMemo(() => {
    const filtered = plans.filter((p) => Boolean(p.is_archived) === showArchivedPlans);
    return filtered.sort((a, b) =>
      showArchivedPlans
        ? b.service_date.localeCompare(a.service_date)
        : a.service_date.localeCompare(b.service_date),
    );
  }, [plans, showArchivedPlans]);
  const today = todayIso();
  const nearestFuturePlanId = visiblePlans
    .filter((p) => p.service_date >= today)
    .sort((a, b) => a.service_date.localeCompare(b.service_date))[0]?.id;
  const loadingPlanner = plansQ.isLoading || templatesQ.isLoading || (activePlanId != null && planQ.isLoading);
  if (loadingPlanner) {
    return (
      <div className="p-6 text-sm text-stone-600">
        <span className="inline-flex items-center gap-2">
          <LuLoaderCircle className="h-4 w-4 animate-spin" />
          Загружаю планировщик...
        </span>
      </div>
    );
  }

  if (screen === 'home') {
    return (
      <>
        <SectionHeroChrome title="Служение" stickyClassName={sectionHeroStickyClassNested} />
        <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-3 py-4 pb-6 sm:px-4 sm:py-5 md:px-6">
        <section className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Новый план</p>
            <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2">
              <select
                value={activeTemplateId ?? ''}
                onChange={(e) => setActiveTemplateId(e.target.value ? Number(e.target.value) : null)}
                className="min-h-[46px] w-full min-w-0 rounded-xl border border-stone-300 bg-white px-3 py-2 text-base sm:text-sm"
              >
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={createPlanDate}
                onChange={(e) => {
                  const next = e.target.value;
                  if (isIsoDate(next)) setCreatePlanDate(next);
                }}
                className="min-h-[46px] w-full min-w-0 rounded-xl border border-stone-300 bg-white px-3 py-2 text-base sm:text-sm"
              />
            </div>
            <p className="mt-2 text-xs leading-snug text-stone-600">
              <span className="block sm:inline">Дата служения:</span>{' '}
              <span className="block break-words font-semibold text-stone-800 sm:inline">
                {formatRuDateLong(createPlanDate)}
              </span>
            </p>
            <button
              type="button"
              disabled={!activeTemplate}
              onClick={() => generateFromTemplate(createPlanDate)}
              className="mt-3 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              <LuPlus className="h-4 w-4" />
              Создать программу
            </button>
          </div>

          {canManageTemplates ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Шаблоны</p>
              <p className="mt-1 text-sm text-stone-600">
                Создайте пустой шаблон и при необходимости подтяните блоки из существующего.
              </p>
              <button
                type="button"
                onClick={startTemplateConstructorEmpty}
                className="mt-3 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-stone-300 px-4 py-2 text-sm font-bold text-stone-800 hover:border-primary hover:text-primary"
              >
                <LuPlus className="h-4 w-4" />
                Создать шаблон
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-stone-200 bg-white p-4 text-sm text-stone-600 shadow-sm">
              Вы можете открывать и редактировать существующие планы из списка ниже.
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-extrabold text-stone-900">
              {showArchivedPlans ? 'Архив программ' : 'Созданные программы'}
            </h2>
            <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
              <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowArchivedPlans(false)}
                className={[
                  'min-h-[34px] rounded-lg border px-3 py-1 text-xs font-semibold',
                  !showArchivedPlans
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-stone-300 text-stone-600 hover:border-primary hover:text-primary',
                ].join(' ')}
              >
                Активные
              </button>
              <button
                type="button"
                onClick={() => setShowArchivedPlans(true)}
                className={[
                  'min-h-[34px] rounded-lg border px-3 py-1 text-xs font-semibold',
                  showArchivedPlans
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-stone-300 text-stone-600 hover:border-primary hover:text-primary',
                ].join(' ')}
              >
                Архив
              </button>
              </div>
              <span className="text-xs text-stone-500">{visiblePlans.length} шт.</span>
            </div>
          </div>
          {visiblePlans.length === 0 ? (
            <p className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-3 py-4 text-sm text-stone-600">
              {showArchivedPlans
                ? 'В архиве пока нет программ.'
                : 'Программ пока нет. Создайте первую кнопкой выше.'}
            </p>
          ) : (
            <div className="grid gap-2">
              {visiblePlans.map((plan) => {
                const leader = plan.leader_member_id ? usersById.get(plan.leader_member_id) : null;
                const isFuture = plan.service_date >= today;
                const isNearest = nearestFuturePlanId === plan.id;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => {
                      setActivePlanId(plan.id);
                      setScreen('plan');
                    }}
                    className={[
                      'w-full rounded-xl border px-3 py-2 text-left transition',
                      isNearest
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : isFuture
                          ? 'border-emerald-200 bg-emerald-50/40'
                          : 'border-stone-200 bg-white',
                    ].join(' ')}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-stone-900">{formatRuDateLong(plan.service_date)}</span>
                      <span className="text-xs text-stone-600">{plan.template_name ?? 'Без шаблона'}</span>
                      {isNearest ? (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">
                          Ближайшая
                        </span>
                      ) : null}
                      {plan.status === 'published' ? (
                        <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                          Опубликован
                        </span>
                      ) : (
                        <span className="rounded-full bg-stone-300 px-2 py-0.5 text-[10px] font-bold text-stone-700">
                          Черновик
                        </span>
                      )}
                      {plan.is_archived ? (
                        <span className="rounded-full bg-stone-800 px-2 py-0.5 text-[10px] font-bold text-white">
                          Архив
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-stone-600">
                      Ведущий: {leader ? userLabel(leader) : 'Не назначен'} • Блоков: {plan.blocks_count}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </section>
      </>
    );
  }

  if (screen === 'template') {
    if (!canManageTemplates) {
      return (
        <section className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-3 py-4 pb-6 sm:px-4 md:px-6">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 shadow-sm">
            Создание и редактирование шаблонов доступно только администраторам и ведущим.
          </div>
          <button
            type="button"
            onClick={() => setScreen('home')}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700 hover:border-primary hover:text-primary"
          >
            К списку программ
          </button>
        </section>
      );
    }
    return (
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-3 py-4 pb-6 sm:px-4 md:px-6">
        <header className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-xl font-extrabold text-stone-900">
              {isTemplateDraftNew ? 'Новый шаблон' : 'Конструктор шаблона'}
            </h1>
            <button
              type="button"
              onClick={() => setScreen('home')}
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold text-stone-700 hover:border-primary hover:text-primary"
            >
              К списку программ
            </button>
          </div>
          <p className="mt-1 text-sm text-stone-600">
            Соберите структуру блоков и сохраните шаблон для генерации программ.
          </p>
        </header>

        {templateDraft ? (
          <section className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
            <div className="mb-2 grid gap-2 md:grid-cols-4">
              <select
                value={isTemplateDraftNew ? '' : activeTemplateId ?? ''}
                onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : null;
                  setActiveTemplateId(id);
                  setIsTemplateDraftNew(false);
                }}
                className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm md:col-span-3"
              >
                <option value="">Выберите существующий шаблон...</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={startTemplateConstructorEmpty}
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold text-stone-700 hover:border-primary hover:text-primary"
              >
                Пустой шаблон
              </button>
            </div>
            {!isTemplateDraftNew && templateDraft?.id ? (
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (!templateDraft?.id) return;
                    const ok = window.confirm(`Удалить шаблон «${templateDraft.name}»? Это действие необратимо.`);
                    if (!ok) return;
                    void deleteTemplateMut.mutateAsync(templateDraft.id);
                  }}
                  className="rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50"
                >
                  Удалить шаблон
                </button>
              </div>
            ) : null}

            <div className="grid gap-2 md:grid-cols-3">
              <input
                value={templateDraft.name}
                onChange={(e) => setTemplateDraft({ ...templateDraft, name: e.target.value })}
                className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm md:col-span-2"
                placeholder="Название шаблона"
              />
              <input
                type="time"
                value={templateDraft.default_start_time}
                onChange={(e) =>
                  setTemplateDraft({ ...templateDraft, default_start_time: e.target.value || '10:00' })
                }
                className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
              />
              <textarea
                value={templateDraft.description ?? ''}
                onChange={(e) => setTemplateDraft({ ...templateDraft, description: e.target.value })}
                className="min-h-[56px] rounded-lg border border-stone-300 px-2 py-1.5 text-sm md:col-span-3"
                placeholder="Описание"
              />
              <textarea
                value={recurrenceRuleInput}
                onChange={(e) => setRecurrenceRuleInput(e.target.value)}
                className="min-h-[76px] rounded-lg border border-stone-300 px-2 py-1.5 font-mono text-xs md:col-span-3"
                placeholder='{"frequency":"weekly","byWeekday":0}'
              />
            </div>

            <div className="mt-3 rounded-xl border border-stone-200 p-2">
              <div className="mb-2 grid gap-2 md:grid-cols-4">
                <select
                  value={templateImportSourceId ?? ''}
                  onChange={(e) => setTemplateImportSourceId(e.target.value ? Number(e.target.value) : null)}
                  className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm md:col-span-3"
                >
                  <option value="">Подтянуть данные из другого шаблона...</option>
                  {templates
                    .filter((tpl) => (isTemplateDraftNew ? true : tpl.id !== templateDraft.id))
                    .map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  disabled={!templateImportSourceId}
                  onClick={() => void importFromExistingTemplate(templateImportSourceId as number)}
                  className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold text-stone-700 hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Подтянуть
                </button>
              </div>

              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-stone-500">Блоки шаблона</p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={addTemplateBlock}
                    className="inline-flex items-center gap-1 rounded border border-stone-300 px-2 py-1 text-xs font-semibold text-stone-700"
                  >
                    <LuPlus className="h-3.5 w-3.5" />
                    Блок
                  </button>
                  <button
                    type="button"
                    onClick={addTemplateSeparatorBlock}
                    className="inline-flex items-center gap-1 rounded border border-stone-300 px-2 py-1 text-xs font-semibold text-stone-700"
                  >
                    <LuPlus className="h-3.5 w-3.5" />
                    Разделитель
                  </button>
                </div>
              </div>

              <DragDropContext onDragEnd={onTemplateDragEnd}>
                <Droppable droppableId="template-blocks">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                      {templateBlocksSorted.map((b, idx) => (
                        <Draggable key={String(b.id)} draggableId={`tpl-${b.id}`} index={idx}>
                          {(dragProvided, dragSnapshot) => (
                            <article
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...(isNarrowViewport ? dragProvided.dragHandleProps : {})}
                              className={[
                                isTemplateSeparatorBlock(b)
                                  ? 'rounded-xl border border-dashed border-stone-300 bg-stone-50 p-2'
                                  : 'rounded-xl border border-stone-200 bg-white p-2',
                                dragSnapshot.isDragging ? 'shadow' : '',
                                isNarrowViewport ? 'max-md:cursor-grab max-md:active:cursor-grabbing' : '',
                              ].join(' ')}
                            >
                              {isTemplateSeparatorBlock(b) ? (
                                <div className="relative flex min-h-[2rem] items-center justify-center py-0.5 pr-12 md:pr-28">
                                  <p className="px-2 text-center text-xs font-bold leading-snug text-stone-800 sm:text-sm">
                                    {templateSeparatorLabel(b)}
                                  </p>
                                  <div className="absolute right-0 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 md:flex">
                                    <button
                                      type="button"
                                      onClick={() => setEditingTemplateBlockId(b.id)}
                                      className="inline-flex h-9 w-9 touch-manipulation items-center justify-center rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-50 sm:h-7 sm:w-7"
                                      aria-label="Редактировать блок шаблона"
                                    >
                                      <LuPencil className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setTemplateDraft({
                                          ...templateDraft,
                                          blocks: templateBlocksSorted
                                            .filter((x) => x.id !== b.id)
                                            .map((x, i) => ({ ...x, order_index: i })),
                                        })
                                      }
                                      className="inline-flex h-9 w-9 touch-manipulation items-center justify-center rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 sm:h-7 sm:w-7"
                                      aria-label="Удалить блок шаблона"
                                    >
                                      <LuTrash2 className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      {...(!isNarrowViewport ? dragProvided.dragHandleProps : {})}
                                      className="inline-flex h-9 w-9 touch-manipulation cursor-grab items-center justify-center rounded-lg border border-stone-200 text-stone-500 hover:bg-stone-50 active:cursor-grabbing sm:h-7 sm:w-7"
                                      aria-label="Перетащить блок шаблона"
                                    >
                                      <LuGripVertical className="h-4 w-4" />
                                    </button>
                                  </div>
                                  <div
                                    className="absolute right-0 top-1/2 flex -translate-y-1/2 lg:hidden"
                                    data-planner-mobile-menu-root
                                    onPointerDown={(e) => isNarrowViewport && e.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      className="inline-flex h-9 w-9 touch-manipulation items-center justify-center rounded-md border border-stone-200 text-stone-600 hover:bg-stone-50 sm:h-7 sm:w-7"
                                      aria-label="Меню блока шаблона"
                                      aria-expanded={mobileTemplateBlockMenuId === b.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setMobilePlanBlockMenuId(null);
                                        setMobileTemplateOrderOpenId(null);
                                        setMobileTemplateBlockMenuId((id) => (id === b.id ? null : b.id));
                                      }}
                                    >
                                      <LuEllipsis className="h-5 w-5" strokeWidth={2.25} />
                                    </button>
                                    {mobileTemplateBlockMenuId === b.id ? (
                                      <div
                                        className="absolute right-0 top-full z-[130] mt-1 w-44 overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-lg max-md:bottom-full max-md:top-auto max-md:mb-1"
                                        onPointerDown={(e) => e.stopPropagation()}
                                      >
                                        <button
                                          type="button"
                                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50"
                                          onClick={() => {
                                            setMobileTemplateBlockMenuId(null);
                                            setEditingTemplateBlockId(b.id);
                                          }}
                                        >
                                          <LuPencil className="h-4 w-4 shrink-0" />
                                          Редактировать
                                        </button>
                                        <button
                                          type="button"
                                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
                                          onClick={() => {
                                            setMobileTemplateBlockMenuId(null);
                                            setTemplateDraft({
                                              ...templateDraft,
                                              blocks: templateBlocksSorted
                                                .filter((x) => x.id !== b.id)
                                                .map((x, i) => ({ ...x, order_index: i })),
                                            });
                                          }}
                                        >
                                          <LuTrash2 className="h-4 w-4 shrink-0" />
                                          Удалить
                                        </button>
                                        {!isNarrowViewport ? (
                                          <button
                                            type="button"
                                            {...dragProvided.dragHandleProps}
                                            className="flex w-full cursor-grab items-center gap-2 px-3 py-2 text-left text-sm text-stone-600 hover:bg-stone-50 active:cursor-grabbing"
                                          >
                                            <LuGripVertical className="h-4 w-4 shrink-0" />
                                            Перетащить
                                          </button>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    {...(!isNarrowViewport ? dragProvided.dragHandleProps : {})}
                                    className="hidden h-9 w-9 touch-manipulation cursor-grab items-center justify-center rounded-lg border border-stone-200 text-stone-500 md:inline-flex md:h-7 md:w-7"
                                    aria-label="Перетащить блок шаблона"
                                  >
                                    <LuGripVertical className="h-4 w-4" />
                                  </button>
                                  <div
                                    className="relative shrink-0 lg:hidden"
                                    data-planner-mobile-template-order-root
                                    onPointerDown={(e) => isNarrowViewport && e.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50"
                                      aria-label="Номер блока в шаблоне"
                                      aria-expanded={mobileTemplateOrderOpenId === b.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setMobilePlanBlockMenuId(null);
                                        setMobileTemplateBlockMenuId(null);
                                        setMobileTemplateOrderOpenId((id) => (id === b.id ? null : b.id));
                                      }}
                                    >
                                      <LuListOrdered className="h-4 w-4" />
                                    </button>
                                    {mobileTemplateOrderOpenId === b.id ? (
                                      <div className="absolute left-0 top-full z-[130] mt-0.5 whitespace-nowrap rounded-md border border-stone-200 bg-white px-2 py-1 text-xs font-bold text-stone-900 shadow-md max-md:bottom-full max-md:top-auto max-md:mb-0.5">
                                        № {idx + 1}
                                      </div>
                                    ) : null}
                                  </div>
                                  <span className="hidden w-8 shrink-0 text-center text-xs font-bold text-stone-700 md:inline">
                                    {idx + 1}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-semibold text-stone-900">{b.title}</p>
                                    <p className="text-xs text-stone-500">
                                      {blockTypes.find((t) => t.id === b.block_type_id)?.name ?? 'Блок'} •{' '}
                                      {b.duration_minutes} мин
                                    </p>
                                  </div>
                                  <div
                                    className="relative shrink-0 lg:hidden"
                                    data-planner-mobile-menu-root
                                    onPointerDown={(e) => isNarrowViewport && e.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50"
                                      aria-label="Меню блока шаблона"
                                      aria-expanded={mobileTemplateBlockMenuId === b.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setMobilePlanBlockMenuId(null);
                                        setMobileTemplateOrderOpenId(null);
                                        setMobileTemplateBlockMenuId((id) => (id === b.id ? null : b.id));
                                      }}
                                    >
                                      <LuEllipsis className="h-5 w-5" strokeWidth={2.25} />
                                    </button>
                                    {mobileTemplateBlockMenuId === b.id ? (
                                      <div
                                        className="absolute right-0 top-full z-[130] mt-1 w-44 overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-lg max-md:bottom-full max-md:top-auto max-md:mb-1"
                                        onPointerDown={(e) => e.stopPropagation()}
                                      >
                                        <button
                                          type="button"
                                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50"
                                          onClick={() => {
                                            setMobileTemplateBlockMenuId(null);
                                            setEditingTemplateBlockId(b.id);
                                          }}
                                        >
                                          <LuPencil className="h-4 w-4 shrink-0" />
                                          Редактировать
                                        </button>
                                        <button
                                          type="button"
                                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
                                          onClick={() => {
                                            setMobileTemplateBlockMenuId(null);
                                            setTemplateDraft({
                                              ...templateDraft,
                                              blocks: templateBlocksSorted
                                                .filter((x) => x.id !== b.id)
                                                .map((x, i) => ({ ...x, order_index: i })),
                                            });
                                          }}
                                        >
                                          <LuTrash2 className="h-4 w-4 shrink-0" />
                                          Удалить
                                        </button>
                                        {!isNarrowViewport ? (
                                          <button
                                            type="button"
                                            {...dragProvided.dragHandleProps}
                                            className="flex w-full cursor-grab items-center gap-2 px-3 py-2 text-left text-sm text-stone-600 hover:bg-stone-50 active:cursor-grabbing"
                                          >
                                            <LuGripVertical className="h-4 w-4 shrink-0" />
                                            Перетащить
                                          </button>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>
                                  <div className="ml-auto hidden shrink-0 items-center gap-0.5 md:flex">
                                    <button
                                      type="button"
                                      onClick={() => setEditingTemplateBlockId(b.id)}
                                      className="inline-flex h-9 w-9 touch-manipulation items-center justify-center rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-50 sm:h-7 sm:w-7"
                                      aria-label="Редактировать блок шаблона"
                                    >
                                      <LuPencil className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setTemplateDraft({
                                          ...templateDraft,
                                          blocks: templateBlocksSorted
                                            .filter((x) => x.id !== b.id)
                                            .map((x, i) => ({ ...x, order_index: i })),
                                        })
                                      }
                                      className="inline-flex h-9 w-9 touch-manipulation items-center justify-center rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 sm:h-7 sm:w-7"
                                      aria-label="Удалить блок шаблона"
                                    >
                                      <LuTrash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                </div>
                              )}
                            </article>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </div>

            <div className="mt-3 flex flex-wrap justify-end gap-2">
              {!isTemplateDraftNew ? (
                <button
                  type="button"
                  onClick={startTemplateConstructorEmpty}
                  className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700 hover:border-primary hover:text-primary"
                >
                  Новый шаблон
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void saveTemplateDraft()}
                className="inline-flex items-center justify-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
              >
                <LuSave className="h-4 w-4" />
                {isTemplateDraftNew ? 'Создать шаблон' : 'Сохранить шаблон'}
              </button>
            </div>
          </section>
        ) : (
          <div className="rounded-xl border border-stone-200 bg-white p-3 text-sm text-stone-600 shadow-sm">
            Шаблон не выбран.
          </div>
        )}

        {editingTemplateBlock ? createPortal(
          <div className="fixed inset-0 z-[9999] isolate flex items-end justify-center overflow-hidden overscroll-y-contain bg-black/35 p-3 sm:items-center">
            <div className="flex h-[min(92dvh,calc(var(--viewport-height,100dvh)-1rem))] min-h-0 w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl sm:h-auto sm:max-h-[min(90dvh,calc(var(--viewport-height,100dvh)-2rem))]">
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-stone-100 px-3 py-3 sm:px-4">
                <h3 className="text-base font-extrabold text-stone-900">Редактирование блока шаблона</h3>
                <button
                  type="button"
                  onClick={() => setEditingTemplateBlockId(null)}
                  className="rounded-lg border border-stone-300 px-2 py-1 text-xs font-semibold text-stone-700"
                >
                  Закрыть
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 [-webkit-overflow-scrolling:touch] [touch-action:pan-y] sm:px-4">
                <div className="grid gap-2 rounded-xl bg-stone-50 p-3 sm:grid-cols-2">
                <input
                  value={isTemplateSeparatorBlock(editingTemplateBlock) ? templateSeparatorLabel(editingTemplateBlock) : editingTemplateBlock.title}
                  onChange={(e) => {
                    if (isTemplateSeparatorBlock(editingTemplateBlock)) {
                      updateTemplateBlock(editingTemplateBlock.id, {
                        title: e.target.value,
                        default_content_json: {
                          ...editingTemplateBlock.default_content_json,
                          separator_text: e.target.value,
                        },
                      });
                      return;
                    }
                    updateTemplateBlock(editingTemplateBlock.id, { title: e.target.value });
                  }}
                  className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm sm:col-span-2"
                  placeholder={isTemplateSeparatorBlock(editingTemplateBlock) ? 'Текст разделителя' : 'Название блока'}
                />

                {!isTemplateSeparatorBlock(editingTemplateBlock) ? (
                  <>
                    <select
                      value={editingTemplateBlock.block_type_id}
                      onChange={(e) =>
                        updateTemplateBlock(editingTemplateBlock.id, {
                          block_type_id: Number(e.target.value) || editingTemplateBlock.block_type_id,
                        })
                      }
                      className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
                    >
                      {blockTypes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <DurationMinutesInput
                      syncKey={editingTemplateBlock.id}
                      value={editingTemplateBlock.duration_minutes}
                      onChange={(duration_minutes) =>
                        updateTemplateBlock(editingTemplateBlock.id, { duration_minutes })
                      }
                      className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
                    />
                    {(blockTypes.find((t) => t.id === editingTemplateBlock.block_type_id)?.kind ?? 'custom') ===
                    'song' ? (
                      <select
                        value={editingTemplateBlock.default_song_id ?? ''}
                        onChange={(e) => {
                          const songId = e.target.value ? Number(e.target.value) : null;
                          const song = songId ? songs.find((s) => Number(s.id) === songId) : null;
                          updateTemplateBlock(editingTemplateBlock.id, {
                            default_song_id: songId,
                            title: song ? songBlockTitle(song) : editingTemplateBlock.title,
                          });
                        }}
                        className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm sm:col-span-2"
                      >
                        <option value="">Песня по умолчанию</option>
                        {songs.map((s: SongListItem) => (
                          <option key={s.id} value={Number(s.id)}>
                            {songBlockTitle(s)}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <select
                      value={String(
                        (editingTemplateBlock.default_content_json?.default_assigned_member_id as number | undefined) ??
                          '',
                      )}
                      onChange={(e) =>
                        updateTemplateBlock(editingTemplateBlock.id, {
                          default_content_json: {
                            ...editingTemplateBlock.default_content_json,
                            default_assigned_member_id: e.target.value ? Number(e.target.value) : null,
                          },
                        })
                      }
                      className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm sm:col-span-2"
                    >
                      <option value="">Ответственный по умолчанию</option>
                      {(
                        (blockTypes.find((t) => t.id === editingTemplateBlock.block_type_id)?.kind ?? 'custom') === 'song'
                          ? musicMinistryCandidates
                          : users
                      ).map((u) => (
                        <option key={u.id} value={u.id}>
                          {userLabel(u)}
                        </option>
                      ))}
                    </select>
                    <BlockStageSetupFields
                      className="sm:col-span-2"
                      contentJson={(editingTemplateBlock.default_content_json ?? {}) as Record<string, unknown>}
                      onChange={(default_content_json) =>
                        updateTemplateBlock(editingTemplateBlock.id, { default_content_json })
                      }
                    />
                    <textarea
                      value={String((editingTemplateBlock.default_content_json?.text as string | undefined) ?? '')}
                      onChange={(e) =>
                        updateTemplateBlock(editingTemplateBlock.id, {
                          default_content_json: {
                            ...editingTemplateBlock.default_content_json,
                            text: e.target.value,
                          },
                        })
                      }
                      className="min-h-[84px] rounded-lg border border-stone-300 px-2 py-1.5 text-sm sm:col-span-2"
                      placeholder="Данные блока по умолчанию (текст/заметки)"
                    />
                  </>
                ) : (
                  <p className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-2 py-2 text-xs text-stone-600 sm:col-span-2">
                    Разделитель делит программу на части в сгенерированном плане.
                  </p>
                )}
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-stone-100 bg-white px-3 py-3 sm:px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  onClick={() => setEditingTemplateBlockId(null)}
                  className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold text-stone-700"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={() => setEditingTemplateBlockId(null)}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-dark"
                >
                  Готово
                </button>
              </div>
            </div>
          </div>,
          document.body,
        ) : null}
      </section>
    );
  }

  if (!draft) {
    return (
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 py-6">
        <h1 className="text-xl font-extrabold text-stone-900">План не выбран</h1>
        <p className="text-sm text-stone-600">Вернитесь на главную страницу планировщика и выберите программу.</p>
        <button
          type="button"
          onClick={() => setScreen('home')}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700 hover:border-primary hover:text-primary"
        >
          К списку программ
        </button>
      </section>
    );
  }

  const dateText = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${draft.service_date}T12:00:00`));

  const lastEditedLine = formatPlanLastEditedLine(
    draft.last_edited_at,
    draft.last_edited_by_name,
    draft.last_edited_by_member_id,
  );

  return (
    <>
      {planStickyBackVisible ? (
        <div
          className="fixed inset-x-0 top-0 z-[45] flex items-center border-b border-stone-200/90 bg-white/90 px-2 py-1.5 pl-[max(0.5rem,env(safe-area-inset-left))] pt-[max(0.35rem,env(safe-area-inset-top))] pr-[max(0.5rem,env(safe-area-inset-right))] backdrop-blur-md lg:hidden"
          role="navigation"
          aria-label="Быстрый возврат"
        >
          <button
            type="button"
            onClick={() => setScreen('home')}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-800 shadow-sm active:bg-stone-50"
            aria-label="Назад к списку программ"
          >
            <LuArrowLeft className="h-5 w-5" aria-hidden />
          </button>
        </div>
      ) : null}
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-3 py-4 max-lg:pb-[calc(var(--app-bottom-nav-total-height)+6.5rem)] sm:px-4 md:px-6">
      <header className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setScreen('home')}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-50 sm:h-10 sm:w-10"
              aria-label="Назад к списку программ"
            >
              <LuArrowLeft className="h-5 w-5" aria-hidden />
            </button>
            <h1 className="min-w-0 text-xl font-extrabold leading-tight text-stone-900 sm:text-2xl">
              План служения
            </h1>
            {coEditingPeers.length > 0 ? (
              <div
                className="flex shrink-0 items-center gap-1"
                title={`Сейчас в программе: ${coEditingPeers.map((p) => p.memberName).join(', ')}`}
              >
                <span className="sr-only">Сейчас открыто у других участников</span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.95)] ring-2 ring-emerald-200/90" aria-hidden />
                <span className="-space-x-2 flex">
                  {coEditingPeers.slice(0, 4).map((p, idx) => (
                    <span
                      key={p.memberId}
                      className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-white bg-primary text-[10px] font-bold text-white shadow-[0_0_12px_rgba(59,130,246,0.45)]"
                      style={{ zIndex: 10 - idx }}
                      title={p.memberName}
                    >
                      {planEditorInitials(p.memberName)}
                    </span>
                  ))}
                </span>
                {coEditingPeers.length > 4 ? (
                  <span className="text-[10px] font-semibold text-stone-500">+{coEditingPeers.length - 4}</span>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <div className="hidden w-full flex-wrap items-center justify-end gap-1 overflow-x-auto pb-0.5 sm:flex sm:w-auto sm:overflow-visible sm:pb-0">
              {canManageTemplates ? (
                <>
                  {canCreateTemplateFromPlan ? (
                    <button
                      type="button"
                      onClick={() => void createTemplateFromCurrentPlan()}
                      className="shrink-0 whitespace-nowrap rounded-lg border border-stone-300 px-2.5 py-1 text-[11px] font-semibold text-stone-700 hover:border-primary hover:text-primary sm:px-3 sm:py-1.5 sm:text-xs"
                    >
                      Сделать шаблон из программы
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setIsTemplateDraftNew(false);
                      setScreen('template');
                    }}
                    className="shrink-0 whitespace-nowrap rounded-lg border border-stone-300 px-2.5 py-1 text-[11px] font-semibold text-stone-700 hover:border-primary hover:text-primary sm:px-3 sm:py-1.5 sm:text-xs"
                  >
                    Конструктор шаблона
                  </button>
                </>
              ) : null}
              <button
                type="button"
                onClick={() => void handlePrintPlanSheet()}
                disabled={pdfExporting}
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-800 hover:border-primary hover:text-primary disabled:cursor-wait disabled:opacity-60 sm:px-3 sm:py-1.5 sm:text-xs"
                title="Скачать программу в PDF"
              >
                <LuDownload className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {pdfExporting ? 'PDF…' : 'PDF'}
              </button>
              <button
                type="button"
                onClick={() => void toggleArchiveCurrentPlan()}
                className="shrink-0 whitespace-nowrap rounded-lg border border-amber-300 px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-50 sm:px-3 sm:py-1.5 sm:text-xs"
              >
                {draft.is_archived ? 'Вернуть из архива' : 'В архив'}
              </button>
              <button
                type="button"
                onClick={() => void deleteCurrentPlan()}
                className="shrink-0 whitespace-nowrap rounded-lg border border-rose-300 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 sm:px-3 sm:py-1.5 sm:text-xs"
              >
                Удалить программу
              </button>
            </div>

            <div className="flex w-full items-center justify-end gap-1 overflow-x-auto pb-0.5 sm:hidden [mask-image:linear-gradient(to_right,black_88%,transparent_100%)]">
              {/* UX #6: шаблоны — в «⋯», архив/удаление остаются на виду */}
              {canManageTemplates ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setPlanHeaderMoreOpen((v) => !v)}
                    aria-expanded={planHeaderMoreOpen}
                    aria-haspopup="menu"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-50"
                    aria-label="Другие действия с программой"
                  >
                    <LuEllipsis className="h-5 w-5" strokeWidth={2.25} aria-hidden />
                  </button>
                  {planHeaderMoreOpen ? (
                    <div
                      role="menu"
                      className="absolute right-0 top-full z-[55] mt-1 min-w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
                    >
                      {canCreateTemplateFromPlan ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full px-3 py-2 text-left text-xs font-semibold text-stone-800 hover:bg-stone-50"
                          onClick={() => {
                            setPlanHeaderMoreOpen(false);
                            void createTemplateFromCurrentPlan();
                          }}
                        >
                          Сделать шаблон из программы
                        </button>
                      ) : null}
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full px-3 py-2 text-left text-xs font-semibold text-stone-800 hover:bg-stone-50"
                        onClick={() => {
                          setPlanHeaderMoreOpen(false);
                          setIsTemplateDraftNew(false);
                          setScreen('template');
                        }}
                      >
                        Конструктор шаблона
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setPlanHeaderMoreOpen(false);
                  void handlePrintPlanSheet();
                }}
                disabled={pdfExporting}
                className="inline-flex min-h-[36px] shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-stone-300 px-2.5 py-1 text-[11px] font-semibold text-stone-800 hover:border-primary hover:text-primary disabled:cursor-wait disabled:opacity-60 sm:hidden"
                title="Скачать программу в PDF"
              >
                <LuDownload className="h-4 w-4 shrink-0" aria-hidden />
                {pdfExporting ? 'PDF…' : 'PDF'}
              </button>
              <button
                type="button"
                onClick={() => void toggleArchiveCurrentPlan()}
                className="min-h-[36px] shrink-0 whitespace-nowrap rounded-lg border border-amber-300 px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-50"
              >
                {draft.is_archived ? 'Вернуть из архива' : 'В архив'}
              </button>
              <button
                type="button"
                onClick={() => void deleteCurrentPlan()}
                className="min-h-[36px] shrink-0 whitespace-nowrap rounded-lg border border-rose-300 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
              >
                Удалить программу
              </button>
            </div>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-stone-600">
          <span className="capitalize">{dateText}</span>
          <span className="inline-flex items-center gap-1">
            <LuClock3 className="h-4 w-4" /> {draft.start_time}
          </span>
          <span
            className={[
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold',
              draft.status === 'published'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-amber-200 bg-amber-50 text-amber-800',
            ].join(' ')}
            aria-live="polite"
          >
            {draft.status === 'published' ? 'Опубликован' : 'Черновик'}
          </span>
          <span className="inline-flex items-center gap-1">
            <LuUsers className="h-4 w-4" /> {timedBlocks.length} блоков / {totalDuration} мин
          </span>
        </div>
        {lastEditedLine ? (
          <p className="mt-2 border-t border-stone-100 pt-2 text-xs leading-snug text-stone-500">
            <span className="font-semibold text-stone-600">Последнее изменение: </span>
            {lastEditedLine}
          </p>
        ) : null}
      </header>

      <section className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Настройки плана</p>
          <button
            type="button"
            onClick={() => setIsPlanSettingsOpenMobile((v) => !v)}
            className="inline-flex min-h-[36px] items-center justify-center gap-1 rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-semibold text-stone-700 lg:hidden"
          >
            {isPlanSettingsOpenMobile ? (
              <>
                <LuChevronUp className="h-3.5 w-3.5" />
                Скрыть
              </>
            ) : (
              <>
                <LuChevronDown className="h-3.5 w-3.5" />
                Показать
              </>
            )}
          </button>
        </div>
        <div className={isPlanSettingsOpenMobile ? 'block md:block' : 'hidden md:block'}>
        <p className="mb-2 text-xs text-stone-500">Укажите дату, время и ответственных служителей.</p>
        {isBlocksOnlyEditor ? (
          <div className="mb-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
            У вас доступ только к редактированию блоков. Настройки плана доступны служителю или администратору.
          </div>
        ) : null}
        <div className="grid min-w-0 gap-2 md:grid-cols-2 [&_input:not([type=checkbox])]:min-w-0 [&_input:not([type=checkbox])]:w-full [&_input]:bg-white [&_input]:text-stone-900 [&_select]:min-w-0 [&_select]:w-full [&_select]:bg-white [&_select]:text-stone-900">
          <input
            type="date"
            value={draft.service_date}
            disabled={isBlocksOnlyEditor}
            onChange={(e) => {
              const next = e.target.value;
              if (isIsoDate(next)) setDraft({ ...draft, service_date: next });
            }}
            className="w-full min-w-0 rounded-xl border border-stone-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <input
            type="time"
            value={draft.start_time}
            disabled={isBlocksOnlyEditor}
            onChange={(e) => setDraft({ ...draft, start_time: e.target.value || '10:00' })}
            className="w-full min-w-0 rounded-xl border border-stone-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <select
            value={draft.leader_member_id ?? ''}
            disabled={isBlocksOnlyEditor}
            onChange={(e) => setDraft({ ...draft, leader_member_id: e.target.value ? Number(e.target.value) : null })}
            className="w-full min-w-0 rounded-xl border border-stone-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">Ведущий</option>
            {leaderCandidates.map((u) => (
              <option key={u.id} value={u.id}>
                {userLabel(u)}
              </option>
            ))}
          </select>
          <select
            value={draft.preacher_member_id ?? ''}
            disabled={isBlocksOnlyEditor}
            onChange={(e) => {
              const preacherId = e.target.value ? Number(e.target.value) : null;
              const preacher = preacherId ? usersById.get(preacherId) ?? null : null;
              const preacherName = preacher ? userLabel(preacher) : 'Проповедник';
              setDraft((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  preacher_member_id: preacherId,
                  blocks: prev.blocks.map((b) => {
                    if (!isSermonBlock(b)) return b;
                    const topicRaw = b.content_json?.sermon_topic;
                    const topic = typeof topicRaw === 'string' ? topicRaw.trim() : '';
                    return {
                      ...b,
                      assigned_member_id: preacherId,
                      title: topic ? `${preacherName} - ${topic}` : preacherName,
                    };
                  }),
                };
              });
            }}
            className="w-full min-w-0 rounded-xl border border-stone-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">Проповедник</option>
            {preacherCandidates.map((u) => (
              <option key={u.id} value={u.id}>
                {userLabel(u)}
              </option>
            ))}
          </select>
          <select
            value={draft.music_ministry_member_id ?? ''}
            disabled={isBlocksOnlyEditor}
            onChange={(e) => {
              const musicId = e.target.value ? Number(e.target.value) : null;
              setDraft((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  music_ministry_member_id: musicId,
                  blocks: prev.blocks.map((b) => {
                    if (!isSongBlock(b)) return b;
                    return { ...b, assigned_member_id: musicId };
                  }),
                };
              });
            }}
            className="w-full min-w-0 rounded-xl border border-stone-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">Ответственный за музыкальное служение</option>
            {musicMinistryCandidates.map((u) => (
              <option key={u.id} value={u.id}>
                {userLabel(u)}
              </option>
            ))}
          </select>
          <div className="md:col-span-2 rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-600">
            <LuLink className="mr-1 inline h-3.5 w-3.5" /> /service-plan/share/{draft.share_token}
          </div>
        </div>
        <MediaTeamBlock planId={draft.id} embedded />
        <button
          type="button"
          disabled={isBlocksOnlyEditor}
          onClick={() =>
            void updatePlanMut.mutateAsync({
              id: draft.id,
              body: {
                service_date: draft.service_date,
                start_time: draft.start_time,
                leader_member_id: draft.leader_member_id,
                preacher_member_id: draft.preacher_member_id,
                music_ministry_member_id: draft.music_ministry_member_id,
              },
            })
          }
          className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LuSave className="h-4 w-4" />
          Сохранить настройки
        </button>
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Составление программы</p>
        <div className="relative">
          {/* UX #5: маска справа намекает на горизонтальный скролл кнопок на узком экране */}
          <div className="flex gap-2 overflow-x-auto pb-1 [mask-image:linear-gradient(to_right,black_85%,transparent_100%)] md:grid md:grid-cols-4 md:overflow-visible md:pb-0 md:[mask-image:none]">
          <button
            type="button"
            onClick={addPlanBlock}
            disabled={createBlockMut.isPending || blockTypes.length === 0}
            className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 rounded-xl border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700 enabled:hover:border-primary enabled:hover:text-primary disabled:cursor-not-allowed disabled:opacity-60 md:min-h-[44px] md:min-w-0"
          >
            <LuPlus className="h-4 w-4" />
            Добавить блок
          </button>
          <button
            type="button"
            onClick={addSeparatorBlock}
            disabled={createBlockMut.isPending || blockTypes.length === 0}
            className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 rounded-xl border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700 enabled:hover:border-primary enabled:hover:text-primary disabled:cursor-not-allowed disabled:opacity-60 md:min-h-[44px] md:min-w-0"
          >
            <LuPlus className="h-4 w-4" />
            Разделитель
          </button>
          <button
            type="button"
            onClick={() => {
              const status = draft.status === 'draft' ? 'published' : 'draft';
              setDraft({ ...draft, status });
              void updatePlanMut.mutateAsync({ id: draft.id, body: { status } });
            }}
            className={[
              'inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold md:min-h-[44px] md:min-w-0',
              draft.status === 'draft'
                ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                : 'border-amber-300 text-amber-700 hover:bg-amber-50',
            ].join(' ')}
          >
            {draft.status === 'draft' ? 'Опубликовать' : 'Вернуть в черновик'}
          </button>
          </div>
        </div>
        <div className="mt-2 hidden md:block">
          {isBlocksOnlyEditor ? (
            <p className="mb-2 text-xs text-stone-500">Сохраняются изменения в блоках (настройки плана недоступны).</p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setAutosaveStatus('saving');
              void saveProgramMut.mutateAsync();
            }}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-800 enabled:hover:border-primary enabled:hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
            disabled={saveProgramMut.isPending}
          >
            <LuSave className="h-4 w-4" />
            {isBlocksOnlyEditor ? 'Сохранить блоки' : 'Сохранить сейчас'}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="service-planner-blocks">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
                {timedBlocks.map((block, index) => {
                  const heading = isSeparatorBlock(block)
                    ? separatorLabel(block)
                    : isPoemBlock(block)
                      ? poemHeading(block)
                      : isSermonBlock(block)
                        ? sermonHeading(block)
                        : isBirthdaysBlock(block)
                          ? 'Дни рождения недели'
                          : block.title;
                  const { title: blockTitle, key: blockKey } = splitHeadingAndKey(heading);
                  const blockTypeLabel = blockTypes.find((t) => t.id === block.block_type_id)?.name ?? 'Блок';
                  const hiddenFromPublic = isHiddenFromPublic(block);

                  return (
                    <Draggable key={block.id} draggableId={String(block.id)} index={index}>
                      {(dragProvided, dragSnapshot) => (
                        <article
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          {...(isNarrowViewport ? dragProvided.dragHandleProps : {})}
                          className={[
                            isSeparatorBlock(block)
                              ? 'rounded-xl border border-dashed border-stone-300 bg-stone-50 p-2 sm:p-2.5'
                              : 'rounded-xl border border-stone-200 p-2 sm:p-2.5',
                            dragSnapshot.isDragging ? 'bg-stone-50 shadow' : 'bg-white',
                            draft.current_block_id === block.id ? 'ring-2 ring-primary/30' : '',
                            hiddenFromPublic ? 'border-stone-300 bg-stone-100/80 opacity-70' : '',
                            isNarrowViewport ? 'max-md:cursor-grab max-md:active:cursor-grabbing' : '',
                          ].join(' ')}
                        >
                          {isSeparatorBlock(block) ? (
                            <div className="relative flex min-h-[2.25rem] items-center justify-center py-0.5 pr-12 md:pr-28">
                              <p className="px-2 text-center text-sm font-bold leading-snug text-stone-800">
                                {blockTitle}
                                {blockKey ? (
                                  <span className="font-bold text-stone-700"> [{blockKey}]</span>
                                ) : null}
                              </p>
                              <div className="absolute right-0 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 sm:gap-1 md:flex">
                                <button
                                  type="button"
                                  onClick={() => toggleBlockPublicVisibility(block.id)}
                                  className="inline-flex h-9 w-9 touch-manipulation items-center justify-center rounded-md border border-stone-200 text-stone-600 hover:bg-stone-50 sm:h-7 sm:w-7 sm:rounded-lg"
                                  aria-label={hiddenFromPublic ? 'Показать в публикации' : 'Скрыть из публикации'}
                                  title={hiddenFromPublic ? 'Показать в публикации' : 'Скрыть из публикации'}
                                >
                                  {hiddenFromPublic ? <LuEyeOff className="h-3.5 w-3.5" /> : <LuEye className="h-3.5 w-3.5" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingBlockId(block.id)}
                                  className="inline-flex h-9 w-9 touch-manipulation items-center justify-center rounded-md border border-stone-200 text-stone-600 hover:bg-stone-50 sm:h-7 sm:w-7 sm:rounded-lg"
                                  aria-label="Редактировать блок"
                                >
                                  <LuPencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    scheduleDeletePlanBlock(block, draft.id);
                                  }}
                                  className="inline-flex h-9 w-9 touch-manipulation items-center justify-center rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50 sm:h-7 sm:w-7 sm:rounded-lg"
                                  aria-label="Удалить блок"
                                >
                                  <LuTrash2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  {...(!isNarrowViewport ? dragProvided.dragHandleProps : {})}
                                  className="inline-flex h-9 w-9 touch-manipulation cursor-grab items-center justify-center rounded-md border border-stone-200 text-stone-400 hover:text-stone-600 active:cursor-grabbing sm:h-7 sm:w-7 sm:rounded-lg"
                                  aria-label="Перетащить блок"
                                >
                                  <LuGripVertical className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              <div
                                className="absolute right-0 top-1/2 flex -translate-y-1/2 lg:hidden"
                                data-planner-mobile-menu-root
                                onPointerDown={(e) => isNarrowViewport && e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  className="inline-flex h-9 w-9 touch-manipulation items-center justify-center rounded-md border border-stone-200 text-stone-600 hover:bg-stone-50 sm:h-7 sm:w-7"
                                  aria-label="Меню блока"
                                  aria-expanded={mobilePlanBlockMenuId === block.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMobileTemplateBlockMenuId(null);
                                    setMobileTemplateOrderOpenId(null);
                                    setMobilePlanBlockMenuId((id) => (id === block.id ? null : block.id));
                                  }}
                                >
                                  <LuEllipsis className="h-5 w-5" strokeWidth={2.25} />
                                </button>
                                {mobilePlanBlockMenuId === block.id ? (
                                  <div
                                    className="absolute right-0 top-full z-[130] mt-1 w-44 overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-lg max-md:bottom-full max-md:top-auto max-md:mb-1"
                                    onPointerDown={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50"
                                      onClick={() => {
                                        setMobilePlanBlockMenuId(null);
                                        toggleBlockPublicVisibility(block.id);
                                      }}
                                    >
                                      {hiddenFromPublic ? (
                                        <LuEyeOff className="h-4 w-4 shrink-0" />
                                      ) : (
                                        <LuEye className="h-4 w-4 shrink-0" />
                                      )}
                                      {hiddenFromPublic ? 'Показать в публикации' : 'Скрыть из публикации'}
                                    </button>
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50"
                                      onClick={() => {
                                        setMobilePlanBlockMenuId(null);
                                        setEditingBlockId(block.id);
                                      }}
                                    >
                                      <LuPencil className="h-4 w-4 shrink-0" />
                                      Редактировать
                                    </button>
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
                                      onClick={() => {
                                        scheduleDeletePlanBlock(block, draft.id);
                                      }}
                                    >
                                      <LuTrash2 className="h-4 w-4 shrink-0" />
                                      Удалить
                                    </button>
                                    {!isNarrowViewport ? (
                                      <button
                                        type="button"
                                        {...dragProvided.dragHandleProps}
                                        className="flex w-full cursor-grab items-center gap-2 px-3 py-2 text-left text-sm text-stone-600 hover:bg-stone-50 active:cursor-grabbing"
                                      >
                                        <LuGripVertical className="h-4 w-4 shrink-0" />
                                        Перетащить
                                      </button>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ) : (
                          <div className="flex items-start gap-2 sm:gap-2.5">
                            <span className="mt-0.5 hidden min-w-[2.75rem] shrink-0 items-center justify-center rounded-md bg-stone-100 px-1.5 py-0.5 text-center text-[11px] font-extrabold leading-none text-stone-900 sm:min-w-[3rem] sm:inline-flex sm:px-2 sm:py-1 sm:text-xs">
                              {block.startsAt}
                            </span>
                            <span className="mt-0.5 inline-flex min-w-[2.9rem] shrink-0 items-center justify-center rounded-md bg-stone-100 px-1.5 py-1 text-center text-[11px] font-extrabold leading-none text-stone-900 sm:hidden">
                              {block.startsAt}
                            </span>

                            {getBlockLogoUrl(block) ? (
                                <img
                                  src={getBlockLogoUrl(block) ?? ''}
                                  alt="Лого блока"
                                  className="mt-0.5 h-7 w-7 shrink-0 rounded-md object-cover sm:h-8 sm:w-8"
                                />
                              ) : (
                                (() => {
                                  const customIcon = getBlockMarkIcon(block);
                                  const customMark = getBlockMark(block);
                                  const categoryIcon = getCategoryIcon(block);
                                  if (customIcon) {
                                    const Icon = customIcon.Icon;
                                    return (
                                      <span
                                        className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md sm:h-8 sm:w-8 sm:rounded-lg ${customIcon.wrapClass}`}
                                      >
                                        <Icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${customIcon.iconClass}`} />
                                      </span>
                                    );
                                  }
                                  if (customMark) {
                                    return (
                                      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-stone-100 text-sm sm:h-8 sm:w-8 sm:rounded-lg sm:text-base">
                                        {customMark}
                                      </span>
                                    );
                                  }
                                  if (categoryIcon) {
                                    const Icon = categoryIcon.Icon;
                                    return (
                                      <span
                                        className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md sm:h-8 sm:w-8 sm:rounded-lg ${categoryIcon.wrapClass}`}
                                      >
                                        <Icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${categoryIcon.iconClass}`} />
                                      </span>
                                    );
                                  }
                                  return (
                                    <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-stone-100 text-[10px] sm:h-8 sm:w-8 sm:rounded-lg sm:text-xs">
                                      •
                                    </span>
                                  );
                                })()
                              )}

                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <p
                                  className={[
                                    'text-sm font-semibold leading-snug normal-case',
                                    blockTitle === 'Новый блок' && !isSeparatorBlock(block)
                                      ? 'text-stone-500 italic'
                                      : 'text-stone-900',
                                  ].join(' ')}
                                >
                                  {blockTitle === 'Новый блок' && !isSeparatorBlock(block) ? (
                                    <>
                                      Новый блок
                                      <span className="ml-1 font-normal not-italic text-stone-400">
                                        (нажмите, чтобы назвать)
                                      </span>
                                    </>
                                  ) : (
                                    blockTitle
                                  )}
                                </p>
                                {blockKey ? (
                                  <span className="inline-flex items-center rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-700 sm:px-2 sm:text-[11px]">
                                    [{blockKey}]
                                  </span>
                                ) : null}
                              </div>
                              {!isSeparatorBlock(block) ? (
                                <p className="text-[11px] leading-snug text-stone-400 sm:text-xs">
                                  {`${blockTypeLabel} • ${block.duration_minutes} мин`}
                                </p>
                              ) : null}
                              {hiddenFromPublic ? (
                                <p className="text-[11px] font-semibold leading-snug text-stone-500 sm:text-xs">
                                  Скрыт в опубликованной версии
                                </p>
                              ) : null}
                              {!isSeparatorBlock(block) && isPoemBlock(block) && poemSubline(block) ? (
                                <p className="text-[11px] leading-snug text-stone-600 sm:text-xs">{poemSubline(block)}</p>
                              ) : null}
                              {!isSeparatorBlock(block) && isBirthdaysBlock(block) ? (
                                birthdayLines(block).length > 0 ? (
                                  <p className="text-[11px] leading-snug text-stone-600 sm:text-xs">
                                    Именинники: {birthdayLines(block).join(' • ')}
                                  </p>
                                ) : (
                                  <p className="text-[11px] leading-snug text-stone-500 sm:text-xs">
                                    На этой неделе именинников нет.
                                  </p>
                                )
                              ) : null}
                              {!isSeparatorBlock(block) && isScheduleBlock(block) ? (
                                scheduleLines(block).length > 0 ? (
                                  <div className="text-[11px] leading-snug text-stone-600 sm:text-xs">
                                    <p className="font-semibold">Расписание:</p>
                                    <ul className="mt-0.5 space-y-0.5">
                                      {scheduleLines(block).map((line) => (
                                        <li key={line}>{line}</li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : (
                                  <p className="text-[11px] leading-snug text-stone-500 sm:text-xs">
                                    На будущую неделю активных событий не найдено.
                                  </p>
                                )
                              ) : null}
                              {!isSeparatorBlock(block) && isSermonBlock(block) && sermonScripture(block) ? (
                                <p className="text-[11px] leading-snug text-stone-600 sm:text-xs">
                                  Писание: {sermonScripture(block)}
                                </p>
                              ) : null}
                              {!isSeparatorBlock(block) ? (
                                <BlockStageSetupPreview contentJson={block.content_json} />
                              ) : null}
                              {!isSeparatorBlock(block) && getResponsibleLabel(block) ? (
                                <p className="text-[11px] leading-snug text-stone-500 sm:text-xs">
                                  {isSermonBlock(block) ? 'Проповедник' : 'Ответственный'}: {getResponsibleLabel(block)}
                                </p>
                              ) : null}
                              {!isSeparatorBlock(block) && getBlockNotePreview(block) ? (
                                <p className="text-[11px] leading-snug text-stone-600 sm:text-xs">
                                  Заметка: {getBlockNotePreview(block)}
                                </p>
                              ) : null}
                            </div>

                            <div className="ml-auto flex shrink-0 items-start gap-0.5">
                              <div
                                className="relative lg:hidden"
                                data-planner-mobile-menu-root
                                onPointerDown={(e) => isNarrowViewport && e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  className="inline-flex h-9 w-9 touch-manipulation items-center justify-center rounded-md border border-stone-200 text-stone-600 hover:bg-stone-50 sm:h-7 sm:w-7"
                                  aria-label="Меню блока"
                                  aria-expanded={mobilePlanBlockMenuId === block.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMobileTemplateBlockMenuId(null);
                                    setMobileTemplateOrderOpenId(null);
                                    setMobilePlanBlockMenuId((id) => (id === block.id ? null : block.id));
                                  }}
                                >
                                  <LuEllipsis className="h-5 w-5" strokeWidth={2.25} />
                                </button>
                                {mobilePlanBlockMenuId === block.id ? (
                                  <div
                                    className="absolute right-0 top-full z-[130] mt-1 w-44 overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-lg max-md:bottom-full max-md:top-auto max-md:mb-1"
                                    onPointerDown={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50"
                                      onClick={() => {
                                        setMobilePlanBlockMenuId(null);
                                        toggleBlockPublicVisibility(block.id);
                                      }}
                                    >
                                      {hiddenFromPublic ? (
                                        <LuEyeOff className="h-4 w-4 shrink-0" />
                                      ) : (
                                        <LuEye className="h-4 w-4 shrink-0" />
                                      )}
                                      {hiddenFromPublic ? 'Показать в публикации' : 'Скрыть из публикации'}
                                    </button>
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50"
                                      onClick={() => {
                                        setMobilePlanBlockMenuId(null);
                                        setEditingBlockId(block.id);
                                      }}
                                    >
                                      <LuPencil className="h-4 w-4 shrink-0" />
                                      Редактировать
                                    </button>
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
                                      onClick={() => {
                                        scheduleDeletePlanBlock(block, draft.id);
                                      }}
                                    >
                                      <LuTrash2 className="h-4 w-4 shrink-0" />
                                      Удалить
                                    </button>
                                    {!isNarrowViewport ? (
                                      <button
                                        type="button"
                                        {...dragProvided.dragHandleProps}
                                        className="flex w-full cursor-grab items-center gap-2 px-3 py-2 text-left text-sm text-stone-600 hover:bg-stone-50 active:cursor-grabbing"
                                      >
                                        <LuGripVertical className="h-4 w-4 shrink-0" />
                                        Перетащить
                                      </button>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                              <div className="hidden items-center gap-0.5 self-start sm:gap-1 md:flex">
                                <button
                                  type="button"
                                  onClick={() => toggleBlockPublicVisibility(block.id)}
                                  className="inline-flex h-9 w-9 touch-manipulation items-center justify-center rounded-md border border-stone-200 text-stone-600 hover:bg-stone-50 sm:h-7 sm:w-7 sm:rounded-lg"
                                  aria-label={hiddenFromPublic ? 'Показать в публикации' : 'Скрыть из публикации'}
                                  title={hiddenFromPublic ? 'Показать в публикации' : 'Скрыть из публикации'}
                                >
                                  {hiddenFromPublic ? <LuEyeOff className="h-3.5 w-3.5" /> : <LuEye className="h-3.5 w-3.5" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingBlockId(block.id)}
                                  className="inline-flex h-9 w-9 touch-manipulation items-center justify-center rounded-md border border-stone-200 text-stone-600 hover:bg-stone-50 sm:h-7 sm:w-7 sm:rounded-lg"
                                  aria-label="Редактировать блок"
                                >
                                  <LuPencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    scheduleDeletePlanBlock(block, draft.id);
                                  }}
                                  className="inline-flex h-9 w-9 touch-manipulation items-center justify-center rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50 sm:h-7 sm:w-7 sm:rounded-lg"
                                  aria-label="Удалить блок"
                                >
                                  <LuTrash2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  {...(!isNarrowViewport ? dragProvided.dragHandleProps : {})}
                                  className="inline-flex h-9 w-9 touch-manipulation cursor-grab items-center justify-center rounded-md border border-stone-200 text-stone-400 hover:text-stone-600 active:cursor-grabbing sm:h-7 sm:w-7 sm:rounded-lg"
                                  aria-label="Перетащить блок"
                                >
                                  <LuGripVertical className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                          )}
                        </article>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-stone-500">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800 ring-1 ring-emerald-200/80">
            1 Настройки ✓
          </span>
          <span aria-hidden className="text-stone-400">
            →
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800 ring-1 ring-emerald-200/80">
            2 Программа ✓
          </span>
          <span aria-hidden className="text-stone-400">
            →
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-stone-800 ring-1 ring-stone-200/90">
            3 Ссылка
          </span>
        </div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
          Поделитесь ссылкой
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1 rounded-lg bg-stone-50 px-2 py-1.5 text-xs text-stone-700">
            <LuLink className="mr-1 inline h-3.5 w-3.5" />
            /service-plan/share/{draft.share_token}
          </div>
          <button
            type="button"
            onClick={() => void copyShareLink()}
            className="inline-flex items-center gap-1 rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold text-stone-700 hover:border-primary hover:text-primary"
          >
            <LuCopy className="h-4 w-4" />
            {shareCopied ? 'Скопировано' : 'Копировать'}
          </button>
        </div>
        <p className="mt-2 text-xs text-stone-500">
          Одна и та же ссылка: в статусе «Черновик» открывается редактирование, после публикации — только просмотр.
        </p>
      </section>

      {(songsQ.isLoading || membersQ.isLoading) && (
        <div className="rounded-xl border border-stone-200 bg-white p-2 text-xs text-stone-500">
          <span className="inline-flex items-center gap-2">
            <LuLoaderCircle className="h-4 w-4 animate-spin" />
            Загружаю песни и участников...
          </span>
        </div>
      )}
      {(updatePlanMut.isPending ||
        updateBlockMut.isPending ||
        reorderMut.isPending ||
        createPlanMut.isPending ||
        createTemplateMut.isPending ||
        updateTemplateMut.isPending ||
        createBlockMut.isPending ||
        deleteBlockMut.isPending ||
        deletePlanMut.isPending ||
        saveProgramMut.isPending) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs font-semibold text-amber-800">
          Сохраняю изменения...
        </div>
      )}
      {draft && screen === 'plan' ? (
        <div className="text-[11px] font-semibold text-stone-500">
          {autosaveStatus === 'saving'
            ? 'Автосохранение…'
            : autosaveStatus === 'error'
              ? 'Не удалось сохранить'
              : autosaveSavedAt
                ? `Сохранено ${new Date(autosaveSavedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
                : 'Автосохранение включено'}
        </div>
      ) : null}

      <div className="service-planner-mobile-save fixed inset-x-0 bottom-[var(--app-bottom-nav-total-height)] z-[60] border-t border-stone-200 bg-white/95 px-3 py-2 backdrop-blur lg:hidden [padding-bottom:max(0.5rem,var(--app-safe-bottom))]">
        {isBlocksOnlyEditor ? (
          <p className="mb-1 text-center text-[11px] font-medium text-stone-500">Режим: только редактирование блоков</p>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setAutosaveStatus('saving');
            void saveProgramMut.mutateAsync();
          }}
          className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-bold text-stone-800 enabled:hover:border-primary enabled:hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          disabled={saveProgramMut.isPending}
        >
          <LuSave className="h-4 w-4" />
          {isBlocksOnlyEditor ? 'Сохранить блоки' : 'Сохранить сейчас'}
        </button>
      </div>

      {editingBlock ? createPortal(
        <div
          className="fixed inset-0 z-[9999] isolate flex items-end justify-center overflow-hidden overscroll-y-contain bg-black/35 p-3 sm:items-center"
          role="presentation"
          onClick={() => setEditingBlockId(null)}
        >
          <div
            className="flex h-[min(92dvh,calc(var(--viewport-height,100dvh)-1rem))] min-h-0 w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl sm:h-auto sm:max-h-[min(92dvh,calc(var(--viewport-height,100dvh)-2rem))]"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${blockEditFieldsUid}-modal-title`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-stone-100 px-3 py-3 sm:px-4">
              <h3 id={`${blockEditFieldsUid}-modal-title`} className="text-base font-extrabold text-stone-900">
                Редактирование блока
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleBlockPublicVisibility(editingBlock.id)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-50"
                  aria-label={isHiddenFromPublic(editingBlock) ? 'Показать в публикации' : 'Скрыть из публикации'}
                  title={isHiddenFromPublic(editingBlock) ? 'Показать в публикации' : 'Скрыть из публикации'}
                >
                  {isHiddenFromPublic(editingBlock) ? <LuEyeOff className="h-4 w-4" /> : <LuEye className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingBlockId(null)}
                  className="rounded-lg border border-stone-300 px-2 py-1 text-xs font-semibold text-stone-700"
                >
                  Закрыть
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 [-webkit-overflow-scrolling:touch] [touch-action:pan-y] sm:px-4">
            <div className="grid min-w-0 gap-2 rounded-xl bg-stone-50 p-3 sm:grid-cols-2 [&_input:not([type=checkbox])]:w-full [&_input]:bg-white [&_input]:text-stone-900 [&_input]:placeholder:text-stone-400 [&_select]:w-full [&_select]:bg-white [&_select]:text-stone-900 [&_textarea]:w-full [&_textarea]:bg-white [&_textarea]:text-stone-900 [&_textarea]:placeholder:text-stone-400">
              <label className="flex flex-col gap-1 text-xs font-semibold text-stone-700 sm:col-span-2">
                {isSeparatorBlock(editingBlock) ? 'Текст разделителя' : 'Название блока'}
                <input
                  id={`${blockEditFieldsUid}-title`}
                  value={isSeparatorBlock(editingBlock) ? separatorLabel(editingBlock) : editingBlock.title}
                  onChange={(e) => {
                    if (isSeparatorBlock(editingBlock)) {
                      updateDraftBlock(editingBlock.id, {
                        title: e.target.value,
                        content_json: { ...editingBlock.content_json, separator_text: e.target.value },
                      });
                      return;
                    }
                    updateDraftBlock(editingBlock.id, { title: e.target.value });
                  }}
                  className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm font-normal"
                  placeholder={isSeparatorBlock(editingBlock) ? 'Текст разделителя' : 'Название блока'}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-stone-700">
                Текстовый маркер
                <input
                  id={`${blockEditFieldsUid}-mark`}
                  value={String((editingBlock.content_json?.block_mark as string | undefined) ?? '')}
                  onChange={(e) =>
                    updateDraftBlock(editingBlock.id, {
                      content_json: { ...editingBlock.content_json, block_mark: e.target.value },
                    })
                  }
                  className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm font-normal"
                  placeholder="Маркер"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-stone-700">
                URL лого
                <input
                  id={`${blockEditFieldsUid}-logo`}
                  value={String((editingBlock.content_json?.block_logo_url as string | undefined) ?? '')}
                  onChange={(e) =>
                    updateDraftBlock(editingBlock.id, {
                      content_json: { ...editingBlock.content_json, block_logo_url: e.target.value },
                    })
                  }
                  className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm font-normal"
                  placeholder="https://…"
                />
                <p className="mt-0.5 text-xs text-stone-500">Ссылка на изображение иконки (png/jpg)</p>
              </label>
              <div className="sm:col-span-2">
                <p className="mb-1 text-xs font-semibold text-stone-600">Иконка блока (React)</p>
                <div className="flex max-h-44 flex-wrap gap-1 overflow-y-auto pr-1">
                {BLOCK_MARK_ICON_OPTIONS.map((markIcon) => (
                  <button
                    key={markIcon.key}
                    type="button"
                    onClick={() =>
                      updateDraftBlock(editingBlock.id, {
                        content_json: {
                          ...editingBlock.content_json,
                          block_mark_icon: markIcon.key,
                          block_mark: '',
                        },
                      })
                    }
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-stone-300 bg-white hover:border-primary"
                    title={markIcon.label}
                  >
                    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${markIcon.wrapClass}`}>
                      <markIcon.Icon className={`h-4 w-4 ${markIcon.iconClass}`} />
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    updateDraftBlock(editingBlock.id, {
                      content_json: {
                        ...editingBlock.content_json,
                        block_mark: '',
                        block_mark_icon: '',
                        block_logo_url: '',
                      },
                    })
                  }
                  className="rounded-md border border-stone-300 bg-white px-2 text-xs font-semibold text-stone-700 hover:border-primary hover:text-primary"
                >
                  Сброс
                </button>
                </div>
              </div>
              {!isSeparatorBlock(editingBlock) ? (
                <>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-stone-700">
                    Тип блока
                    <select
                      id={`${blockEditFieldsUid}-type`}
                      value={editingBlock.block_type_id}
                      onChange={(e) => {
                        const nextTypeId = Number(e.target.value) || editingBlock.block_type_id;
                        const typeMeta = blockTypes.find((t) => t.id === nextTypeId);
                        const nextPatch: Partial<ServicePlanBlock> = {
                          block_type_id: nextTypeId,
                        };
                        if ((typeMeta?.code ?? '').toLowerCase() === 'birthdays') {
                          nextPatch.title = 'Дни рождения недели';
                        }
                        if ((typeMeta?.code ?? '').toLowerCase() === 'sermon') {
                          const preacher =
                            draft?.preacher_member_id != null
                              ? usersById.get(draft.preacher_member_id) ?? null
                              : null;
                          nextPatch.assigned_member_id = draft?.preacher_member_id ?? null;
                          const topicRaw = editingBlock.content_json?.sermon_topic;
                          const topic = typeof topicRaw === 'string' ? topicRaw.trim() : '';
                          const preacherName = preacher ? userLabel(preacher) : 'Проповедник';
                          nextPatch.title = topic ? `${preacherName} - ${topic}` : preacherName;
                        }
                        if ((typeMeta?.code ?? '').toLowerCase() === 'song' || typeMeta?.kind === 'song') {
                          nextPatch.assigned_member_id = draft?.music_ministry_member_id ?? null;
                        }
                        updateDraftBlock(editingBlock.id, nextPatch);
                      }}
                      className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm font-normal"
                    >
                      {blockTypes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-stone-700">
                    Длительность, мин
                    <DurationMinutesInput
                      id={`${blockEditFieldsUid}-duration`}
                      syncKey={editingBlock.id}
                      value={editingBlock.duration_minutes}
                      onChange={(duration_minutes) =>
                        updateDraftBlock(editingBlock.id, { duration_minutes })
                      }
                      className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm font-normal"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-stone-700 sm:col-span-2">
                    Ответственный
                    <select
                      id={`${blockEditFieldsUid}-responsible`}
                      value={
                        isSermonBlock(editingBlock)
                          ? (draft?.preacher_member_id ?? '')
                          : isSongBlock(editingBlock)
                            ? (draft?.music_ministry_member_id ?? '')
                            : (editingBlock.assigned_member_id ?? '')
                      }
                      onChange={(e) => {
                        if (isSermonBlock(editingBlock) || isSongBlock(editingBlock)) return;
                        const memberId = e.target.value ? Number(e.target.value) : null;
                        const nextPatch: Partial<ServicePlanBlock> = { assigned_member_id: memberId };
                        if (isPoemBlock(editingBlock)) {
                          const reader = memberId ? users.find((u) => u.id === memberId) : null;
                          nextPatch.title = reader ? `СТИХ - ${userLabel(reader)}` : 'СТИХ - Чтец';
                        }
                        if (isSermonBlock(editingBlock)) {
                          const preacher = memberId ? users.find((u) => u.id === memberId) : null;
                          const topicRaw = editingBlock.content_json?.sermon_topic;
                          const topic = typeof topicRaw === 'string' ? topicRaw.trim() : '';
                          const preacherName = preacher ? userLabel(preacher) : 'Проповедник';
                          nextPatch.title = topic ? `${preacherName} - ${topic}` : preacherName;
                        }
                        updateDraftBlock(editingBlock.id, nextPatch);
                      }}
                      className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm font-normal sm:col-span-2"
                      disabled={isSermonBlock(editingBlock) || isSongBlock(editingBlock)}
                    >
                    {isSermonBlock(editingBlock) ? (
                      <option value={draft?.preacher_member_id ?? ''}>
                        {draft?.preacher_member_id
                          ? (() => {
                              const preacher = usersById.get(draft.preacher_member_id) ?? null;
                              return preacher ? userLabel(preacher) : 'Проповедник';
                            })()
                          : 'В настройках программы не выбран проповедник'}
                      </option>
                    ) : isSongBlock(editingBlock) ? (
                      <option value={draft?.music_ministry_member_id ?? ''}>
                        {draft?.music_ministry_member_id
                          ? (() => {
                              const m = usersById.get(draft.music_ministry_member_id) ?? null;
                              return m ? userLabel(m) : 'Музыкальное служение';
                            })()
                          : 'В настройках программы не выбран ответственный за музыку'}
                      </option>
                    ) : (
                      <>
                        <option value="">
                          {isPoemBlock(editingBlock) ? 'Чтец не назначен' : 'Ответственный не назначен'}
                        </option>
                        {(users).map((u) => (
                          <option key={u.id} value={u.id}>
                            {userLabel(u)}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                  </label>
                  {isPoemBlock(editingBlock) ? (
                    <>
                      <input
                        value={String((editingBlock.content_json?.poem_author as string | undefined) ?? '')}
                        onChange={(e) =>
                          updateDraftBlock(editingBlock.id, {
                            content_json: { ...editingBlock.content_json, poem_author: e.target.value },
                          })
                        }
                        className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
                        placeholder="Автор стиха"
                      />
                      <input
                        value={String((editingBlock.content_json?.poem_theme as string | undefined) ?? '')}
                        onChange={(e) =>
                          updateDraftBlock(editingBlock.id, {
                            content_json: { ...editingBlock.content_json, poem_theme: e.target.value },
                          })
                        }
                        className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
                        placeholder="Тема стиха"
                      />
                    </>
                  ) : null}
                  {isSermonBlock(editingBlock) ? (
                    <>
                      <input
                        value={String((editingBlock.content_json?.sermon_topic as string | undefined) ?? '')}
                        onChange={(e) => {
                          const nextTopic = e.target.value;
                          const preacher = sermonPreacher(editingBlock);
                          const preacherName = preacher ? userLabel(preacher) : 'Проповедник';
                          const topicTrim = nextTopic.trim();
                          updateDraftBlock(editingBlock.id, {
                            title: topicTrim ? `${preacherName} - ${topicTrim}` : preacherName,
                            content_json: { ...editingBlock.content_json, sermon_topic: nextTopic },
                          });
                        }}
                        className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
                        placeholder="Тема проповеди"
                      />
                      <input
                        value={String((editingBlock.content_json?.sermon_scripture as string | undefined) ?? '')}
                        onChange={(e) =>
                          updateDraftBlock(editingBlock.id, {
                            content_json: { ...editingBlock.content_json, sermon_scripture: e.target.value },
                          })
                        }
                        className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
                        placeholder="Стихи из Библии"
                      />
                    </>
                  ) : null}
                  {(blockTypes.find((t) => t.id === editingBlock.block_type_id)?.kind ?? 'custom') === 'song' ? (
                    <select
                      value={editingBlock.song_id ?? ''}
                      onChange={(e) => {
                        const songId = e.target.value ? Number(e.target.value) : null;
                        if (!songId) {
                          updateDraftBlock(editingBlock.id, { song_id: null });
                          return;
                        }
                        const song = songs.find((s) => Number(s.id) === songId);
                        updateDraftBlock(editingBlock.id, {
                          song_id: songId,
                          title: song ? songBlockTitle(song) : editingBlock.title,
                        });
                      }}
                      className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm sm:col-span-2"
                    >
                      <option value="">Выберите песню</option>
                      {songs.map((s: SongListItem) => (
                        <option key={s.id} value={Number(s.id)}>
                          {songBlockTitle(s)}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  {isBirthdaysBlock(editingBlock) ? (
                    <p className="rounded-lg border border-dashed border-pink-300 bg-pink-50 px-2 py-2 text-xs text-pink-800 sm:col-span-2">
                      Этот блок автоматически показывает участников, у которых день рождения на неделе даты служения.
                    </p>
                  ) : null}
                  <BlockStageSetupFields
                    className="sm:col-span-2"
                    contentJson={editingBlock.content_json ?? {}}
                    onChange={(content_json) => updateDraftBlock(editingBlock.id, { content_json })}
                  />
                  <label className="flex flex-col gap-1 text-xs font-semibold text-stone-700 sm:col-span-2">
                    Заметки
                    <textarea
                      id={`${blockEditFieldsUid}-notes`}
                      value={String((editingBlock.content_json?.text as string | undefined) ?? '')}
                      onChange={(e) =>
                        updateDraftBlock(editingBlock.id, {
                          content_json: { ...editingBlock.content_json, text: e.target.value },
                        })
                      }
                      className="min-h-[84px] rounded-lg border border-stone-300 px-2 py-1.5 text-sm font-normal sm:col-span-2"
                      placeholder="Текст заметок"
                    />
                  </label>
                </>
              ) : (
                <p className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-2 py-2 text-xs text-stone-600 sm:col-span-2">
                  Разделитель делит программу на части и не добавляет длительность в расчет сверху.
                </p>
              )}
            </div>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-stone-100 bg-white px-3 py-3 sm:px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => setEditingBlockId(null)}
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold text-stone-700"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  const meta = blockTypes.find((t) => t.id === editingBlock.block_type_id);
                  const isSongMeta = meta?.code === 'song' || meta?.kind === 'song';
                  const isSermonMeta =
                    meta?.code === 'sermon' || (meta?.name ?? '').toLowerCase().includes('проповед');
                  let assigned_member_id = editingBlock.assigned_member_id;
                  if (isSermonMeta) assigned_member_id = draft?.preacher_member_id ?? null;
                  else if (isSongMeta)
                    assigned_member_id =
                      draft?.music_ministry_member_id ?? editingBlock.assigned_member_id ?? null;
                  void updateBlockMut.mutateAsync({
                    id: editingBlock.id,
                    body: {
                      title: editingBlock.title,
                      block_type_id: editingBlock.block_type_id,
                      duration_minutes: editingBlock.duration_minutes,
                      assigned_member_id,
                      song_id: editingBlock.song_id,
                      content_json: editingBlock.content_json,
                    },
                  });
                  setEditingBlockId(null);
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-dark"
              >
                Готово
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </section>
    </>
  );
}
