import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addMinutes, format, parse } from 'date-fns';
import {
  FaBookBible,
  FaBullhorn,
  FaCakeCandles,
  FaFeatherPointed,
  FaHandHoldingDollar,
  FaHandsPraying,
  FaMicrophoneLines,
  FaMusic,
  FaPuzzlePiece,
  FaWineGlass,
} from 'react-icons/fa6';
import {
  LuCalendarDays,
  LuClock3,
  LuEye,
  LuEyeOff,
  LuLink,
  LuLoaderCircle,
  LuPencil,
  LuSave,
  LuUsers,
} from 'react-icons/lu';
import type { IconType } from 'react-icons';
import { Navigate, useParams } from 'react-router-dom';
import { emitAppToast } from '@/lib/uiFeedback';

import { meaningfulNoteLinesFromRaw } from '../plannerNoteText';
import {
  fetchEditableServicePlan,
  fetchEditableServicePlanMeta,
  patchEditableServicePlanBlockByToken,
  type EditableServicePlanPayload,
  type EditableServicePlanMetaPayload,
} from '../api';

type EditableBlock = EditableServicePlanPayload['blocks'][number];
type EditableMember = EditableServicePlanMetaPayload['members'][number];

const ICON_BY_CODE: Record<string, { Icon: IconType; wrapClass: string; iconClass: string }> = {
  prayer: { Icon: FaHandsPraying, wrapClass: 'bg-violet-100', iconClass: 'text-violet-700' },
  song: { Icon: FaMusic, wrapClass: 'bg-sky-100', iconClass: 'text-sky-700' },
  scripture: { Icon: FaBookBible, wrapClass: 'bg-amber-100', iconClass: 'text-amber-700' },
  sermon: { Icon: FaMicrophoneLines, wrapClass: 'bg-rose-100', iconClass: 'text-rose-700' },
  announcements: { Icon: FaBullhorn, wrapClass: 'bg-emerald-100', iconClass: 'text-emerald-700' },
  offering: { Icon: FaHandHoldingDollar, wrapClass: 'bg-lime-100', iconClass: 'text-lime-700' },
  birthdays: { Icon: FaCakeCandles, wrapClass: 'bg-pink-100', iconClass: 'text-pink-700' },
  schedule: { Icon: LuCalendarDays, wrapClass: 'bg-indigo-100', iconClass: 'text-indigo-700' },
  communion: { Icon: FaWineGlass, wrapClass: 'bg-purple-100', iconClass: 'text-purple-700' },
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

function isSeparator(content: Record<string, unknown>): boolean {
  return content.is_separator === true;
}

function isHiddenFromPublic(content: Record<string, unknown>): boolean {
  return content.hide_in_public === true;
}

function getCategoryIcon(block: EditableBlock): { Icon: IconType; wrapClass: string; iconClass: string } | null {
  const codeKey = (block.block_type_code ?? '').trim().toLowerCase();
  if (codeKey && ICON_BY_CODE[codeKey]) return ICON_BY_CODE[codeKey];
  return null;
}

function getBlockMark(block: EditableBlock): string | null {
  const fromContent = block.content_json?.block_mark;
  if (typeof fromContent === 'string' && fromContent.trim()) return fromContent.trim();
  return null;
}

function getBlockMarkIcon(block: EditableBlock): { Icon: IconType; wrapClass: string; iconClass: string } | null {
  const keyRaw = block.content_json?.block_mark_icon;
  if (typeof keyRaw !== 'string') return null;
  const key = keyRaw.trim().toLowerCase();
  if (!key) return null;
  return BLOCK_MARK_ICON_BY_KEY[key] ?? null;
}

function getBlockLogoUrl(block: EditableBlock): string | null {
  const raw = block.content_json?.block_logo_url;
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/')) {
    return value;
  }
  return null;
}

function parseStartClock(dateIso: string, time: string): Date {
  return parse(`${dateIso} ${time}`, 'yyyy-MM-dd HH:mm', new Date());
}

function birthdayRows(content: Record<string, unknown>): string[] {
  const raw = content.birthday_people;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      if (!x || typeof x !== 'object') return null;
      const row = x as Record<string, unknown>;
      const name = typeof row.name === 'string' ? row.name.trim() : '';
      if (!name) return null;
      const weekDate = typeof row.week_date === 'string' ? row.week_date.trim() : '';
      if (!weekDate) return name;
      const dt = new Date(`${weekDate}T12:00:00`);
      if (Number.isNaN(dt.getTime())) return name;
      const dateText = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }).format(dt);
      return `${name} — ${dateText}`;
    })
    .filter((x): x is string => Boolean(x));
}

function scheduleRows(content: Record<string, unknown>): string[] {
  const raw = content.schedule_events;
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

function blockNote(content: Record<string, unknown>): string {
  if (typeof content.notes === 'string') return content.notes;
  if (typeof content.text === 'string') return content.text;
  return '';
}

function songBlockTitle(song: { title: string; default_key: string | null }): string {
  const key = String(song.default_key ?? '').trim();
  return key ? `${song.title} [${key}]` : song.title;
}

function userLabel(u: { first_name: string | null; last_name: string | null; name: string; id: number }): string {
  const full = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim();
  return full || u.name || `Пользователь #${u.id}`;
}

function normalizeText(v: string): string {
  return v.trim().toLowerCase().replace(/ё/g, 'е');
}

function roleLabel(u: EditableMember): string {
  const ministryRoles = String(u.ministry_role ?? '')
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter((s, idx, arr) => s.length > 0 && arr.indexOf(s) === idx);
  if (ministryRoles.length > 0) return ministryRoles.join(', ');
  if (u.app_role === 'admin') return 'Админ';
  if (u.app_role === 'minister') return 'Служитель';
  if (u.app_role === 'pastor') return 'Пастор';
  if (u.app_role === 'editor') return 'Редактор';
  if (u.app_role === 'musician') return 'Музыкант';
  return 'Участник';
}

function hasMinistryRole(u: EditableMember, roleName: string): boolean {
  const target = normalizeText(roleName);
  if (!target) return false;
  return String(u.ministry_role ?? '')
    .split(/[;,]/)
    .map((s) => normalizeText(s))
    .some((s) => s === target || s.includes(target));
}

function hasMinistryDirection(u: EditableMember, directionName: string): boolean {
  const target = normalizeText(directionName);
  if (!target) return false;
  return String(u.ministry_direction ?? '')
    .split(/[;,]/)
    .map((s) => normalizeText(s))
    .some((s) => s === target || s.includes(target));
}

function isPreacherCandidate(u: EditableMember): boolean {
  return hasMinistryRole(u, 'Проповедник');
}

function isPrayerCandidate(u: EditableMember): boolean {
  return hasMinistryRole(u, 'Дьякон') || hasMinistryRole(u, 'Пастор') || u.app_role === 'pastor';
}

function isBirthdaysBlock(block: { block_type_code: string | null; block_type_name: string | null }): boolean {
  return block.block_type_code === 'birthdays' || normalizeText(block.block_type_name ?? '').includes('дни рождения');
}

function isPoemBlockType(block: { block_type_code: string | null; block_type_name: string | null }): boolean {
  return block.block_type_code === 'poem' || normalizeText(block.block_type_name ?? '').includes('стих');
}

function isSermonBlockType(block: { block_type_code: string | null; block_type_name: string | null }): boolean {
  return block.block_type_code === 'sermon' || normalizeText(block.block_type_name ?? '').includes('проповед');
}

function sermonTopicText(content: Record<string, unknown>): string {
  const raw = content.sermon_topic;
  return typeof raw === 'string' ? raw.trim() : '';
}

/** Служебные / уже обрабатываемые поля — не выводим как «доп. поля» и не показываем в UI. */
const CONTENT_JSON_EXCLUDED_FOR_GENERIC: Set<string> = new Set([
  'is_separator',
  'separator_text',
  'block_mark',
  'block_mark_icon',
  'block_logo_url',
  'birthday_people',
  'schedule_events',
  'birthday_week_start',
  'birthday_week_end',
  'schedule_week_start',
  'schedule_week_end',
  'hide_in_public',
  'poem_author',
  'poem_theme',
  'sermon_topic',
  'sermon_scripture',
  'direction',
  'notes',
  'text',
]);

function isInternalContentStringKey(key: string): boolean {
  if (CONTENT_JSON_EXCLUDED_FOR_GENERIC.has(key)) return true;
  if (/^birthday_week_/i.test(key)) return true;
  if (/^schedule_week_/i.test(key)) return true;
  return false;
}

const GENERIC_STRING_LABELS: Record<string, string> = {
  default_assigned_member_id: 'ID ответственного',
};

type ExtraDisplayRow = { label: string; value: string };

function getBlockExtraDisplayRows(b: EditableBlock): ExtraDisplayRow[] {
  const cj = b.content_json;
  const rows: ExtraDisplayRow[] = [];
  if (isSermonBlockType(b)) {
    const topic = typeof cj.sermon_topic === 'string' ? cj.sermon_topic.trim() : '';
    const scripture = typeof cj.sermon_scripture === 'string' ? cj.sermon_scripture.trim() : '';
    if (topic) rows.push({ label: 'Тема проповеди', value: topic });
    if (scripture) rows.push({ label: 'Писание', value: scripture });
  }
  const direction = typeof cj.direction === 'string' ? cj.direction.trim() : '';
  if (direction) rows.push({ label: 'Направление', value: direction });
  for (const [key, v] of Object.entries(cj)) {
    if (isInternalContentStringKey(key)) continue;
    if (typeof v !== 'string' || !v.trim()) continue;
    rows.push({ label: GENERIC_STRING_LABELS[key] ?? key, value: v.trim() });
  }
  const noteSource = isPoemBlockType(b) ? (typeof cj.notes === 'string' ? cj.notes : '') : blockNote(cj);
  const note = meaningfulNoteLinesFromRaw(noteSource, cj);
  if (note) rows.push({ label: 'Заметка', value: note });
  return rows;
}

/** В форме редактирования: направление и прочие строки без дублирования полей стиха/проповеди/заметки. */
function getEditFormAuxiliaryRows(b: EditableBlock): ExtraDisplayRow[] {
  const cj = b.content_json;
  const rows: ExtraDisplayRow[] = [];
  const direction = typeof cj.direction === 'string' ? cj.direction.trim() : '';
  if (direction) rows.push({ label: 'Направление', value: direction });
  for (const [key, v] of Object.entries(cj)) {
    if (isInternalContentStringKey(key)) continue;
    if (typeof v !== 'string' || !v.trim()) continue;
    rows.push({ label: GENERIC_STRING_LABELS[key] ?? key, value: v.trim() });
  }
  return rows;
}

function BlockExtraInfoPanel({ rows, variant }: { rows: ExtraDisplayRow[]; variant: 'card' | 'edit' }) {
  if (rows.length === 0) return null;
  return (
    <div
      className={
        variant === 'card'
          ? 'mt-2 space-y-1.5 rounded-lg border border-stone-200/90 bg-stone-50/90 px-2.5 py-2'
          : 'col-span-1 w-full min-w-0 sm:col-span-2 space-y-1.5 rounded-lg border border-stone-200/90 bg-stone-50/90 px-2.5 py-2'
      }
    >
      {variant === 'edit' ? (
        <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">Дополнительно</p>
      ) : null}
      <dl className="space-y-1.5 text-stone-700">
        {rows.map((r, i) => (
          <div key={`${variant}-extra-${i}-${r.label}`} className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
            <dt className="shrink-0 text-xs font-semibold text-stone-600 sm:min-w-[7.5rem]">{r.label}</dt>
            <dd
              className={
                r.label === 'Заметка'
                  ? 'min-w-0 whitespace-pre-wrap text-sm leading-relaxed text-stone-800 sm:text-[15px]'
                  : 'min-w-0 whitespace-pre-wrap text-xs leading-snug text-stone-800 sm:text-sm'
              }
            >
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function PoemInlineDetails({ contentJson }: { contentJson: Record<string, unknown> }) {
  const author = typeof contentJson.poem_author === 'string' ? contentJson.poem_author.trim() : '';
  const theme = typeof contentJson.poem_theme === 'string' ? contentJson.poem_theme.trim() : '';
  if (!author && !theme) return null;
  return (
    <div className="mt-1 space-y-0.5 text-xs leading-snug text-stone-600 sm:mt-0.5 sm:text-sm">
      {author ? (
        <p>
          <span className="font-semibold text-stone-700">Автор:</span>{' '}
          <span className="font-bold text-stone-900">{author}</span>
        </p>
      ) : null}
      {theme ? (
        <p>
          <span className="font-semibold text-stone-700">Тема:</span>{' '}
          <span className="font-bold text-stone-900">{theme}</span>
        </p>
      ) : null}
    </div>
  );
}

export function EditableServicePlanPage() {
  const { token } = useParams<{ token: string }>();
  const qc = useQueryClient();
  const [draftBlocks, setDraftBlocks] = useState<EditableBlock[]>([]);
  const [editingBlockId, setEditingBlockId] = useState<number | null>(null);

  const planQ = useQuery({
    queryKey: ['editable-service-plan', token],
    queryFn: () => fetchEditableServicePlan(token ?? ''),
    enabled: Boolean(token && token.length > 20),
    refetchInterval: editingBlockId == null ? 2500 : false,
    refetchIntervalInBackground: true,
    retry: false,
  });
  const metaQ = useQuery({
    queryKey: ['editable-service-plan-meta', token],
    queryFn: () => fetchEditableServicePlanMeta(token ?? ''),
    enabled: Boolean(token && token.length > 20),
    retry: false,
  });
  const planPreacherId = planQ.data?.plan.preacher_member_id ?? null;
  const planPreacherName = planQ.data?.plan.preacher_name ?? null;

  useEffect(() => {
    if (!planQ.data) return;
    if (editingBlockId != null) return;
    const preacherId = planQ.data.plan.preacher_member_id ?? null;
    const preacherRaw = preacherId
      ? (metaQ.data?.members ?? []).find((m) => m.id === preacherId) ?? null
      : null;
    const preacherLabel = preacherRaw ? userLabel(preacherRaw) : (planQ.data.plan.preacher_name ?? '').trim();
    setDraftBlocks(
      planQ.data.blocks
        .slice()
        .sort((a, b) => a.order_index - b.order_index)
        .map((block) => {
          if (!isSermonBlockType(block)) return block;
          const preacherName = preacherLabel || 'Проповедник';
          const topic = sermonTopicText(block.content_json);
          return {
            ...block,
            assigned_member_id: preacherId,
            assigned_member_name: preacherLabel || null,
            title: topic ? `${preacherName} - ${topic}` : preacherName,
          };
        }),
    );
  }, [planQ.data, metaQ.data, editingBlockId]);

  const rows = useMemo(() => {
    if (!planQ.data) return [];
    let cursor = parseStartClock(planQ.data.plan.service_date, planQ.data.plan.start_time);
    return draftBlocks.map((b) => {
      const startsAt = format(cursor, 'HH:mm');
      const separator = isSeparator(b.content_json);
      const duration = separator ? 0 : Math.max(0, Number(b.duration_minutes) || 0);
      cursor = addMinutes(cursor, duration);
      return { ...b, startsAt, separator };
    });
  }, [draftBlocks, planQ.data]);

  const editingBlock = useMemo(
    () => draftBlocks.find((b) => b.id === editingBlockId) ?? null,
    [draftBlocks, editingBlockId],
  );

  const saveBlockMut = useMutation({
    mutationFn: async (block: EditableBlock) => {
      if (!token) return;
      const isSermon = isSermonBlockType(block);
      const preacherName = (planPreacherName ?? '').trim() || 'Проповедник';
      const topic = sermonTopicText(block.content_json);
      const normalizedBlock = isSermon
        ? {
            ...block,
            assigned_member_id: planPreacherId,
            assigned_member_name: planPreacherName,
            title: topic ? `${preacherName} - ${topic}` : preacherName,
          }
        : block;
      await patchEditableServicePlanBlockByToken(token, block.id, {
        title: normalizedBlock.title,
        duration_minutes: Math.max(1, Number(normalizedBlock.duration_minutes) || 1),
        assigned_member_id: normalizedBlock.assigned_member_id,
        song_id: normalizedBlock.song_id,
        content_json: normalizedBlock.content_json,
      });
      return normalizedBlock;
    },
  });

  async function handleSaveBlock(block: EditableBlock): Promise<void> {
    try {
      const savedBlock = await saveBlockMut.mutateAsync(block);
      if (savedBlock) {
        setDraftBlocks((prev) => prev.map((x) => (x.id === savedBlock.id ? savedBlock : x)));
      }
      emitAppToast({ kind: 'success', message: 'Изменения сохранены' });
      setEditingBlockId(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['editable-service-plan', token] }),
        qc.invalidateQueries({ queryKey: ['editable-service-plan-meta', token] }),
        qc.invalidateQueries({ queryKey: ['public', 'service-plan', token] }),
      ]);
    } catch {
      emitAppToast({
        kind: 'error',
        message: 'Не удалось сохранить изменения. Проверьте подключение и попробуйте снова.',
      });
    }
  }

  if (!token) {
    return <p className="p-6 text-red-600">Некорректная ссылка</p>;
  }
  if (planQ.isLoading || metaQ.isLoading) {
    return (
      <div className="flex min-h-[40dvh] items-center justify-center gap-2 text-stone-500">
        <LuLoaderCircle className="h-4 w-4 animate-spin" />
        Загружаю программу...
      </div>
    );
  }
  if (planQ.isError || !planQ.data) {
    return <Navigate to={`/service-plan/share/${token}`} replace />;
  }
  if (metaQ.isError || !metaQ.data) {
    return <p className="p-6 text-red-600">Не удалось загрузить данные для редактирования</p>;
  }

  const { plan } = planQ.data;
  const { block_types: blockTypes, members, songs } = metaQ.data;
  const dateText = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${plan.service_date}T12:00:00`));
  const preacherCandidates = members.filter((u) => isPreacherCandidate(u));
  const musicianDirectionCandidates = members.filter((u) => hasMinistryDirection(u, 'Музыкальное служение'));
  const prayerCandidates = members.filter((u) => isPrayerCandidate(u));
  const editingBlockTypeMeta = blockTypes.find((t) => t.id === editingBlock?.block_type_id) ?? null;
  const isEditingSongBlock = (editingBlockTypeMeta?.kind ?? 'custom') === 'song';
  const isEditingPoemBlock =
    editingBlockTypeMeta?.code === 'poem' || normalizeText(editingBlockTypeMeta?.name ?? '').includes('стих');
  const isEditingSermonBlock =
    editingBlockTypeMeta?.code === 'sermon' || normalizeText(editingBlockTypeMeta?.name ?? '').includes('проповед');
  const isEditingPrayerBlock =
    editingBlockTypeMeta?.code === 'prayer' || normalizeText(editingBlockTypeMeta?.name ?? '').includes('молитв');
  const responsibleCandidates = isEditingSermonBlock
    ? preacherCandidates
    : isEditingSongBlock
      ? musicianDirectionCandidates
      : isEditingPrayerBlock
        ? prayerCandidates
        : members;

  return (
    <div className="h-[100dvh] overflow-y-auto overflow-x-hidden overscroll-y-contain bg-[var(--surface)]">
      <div className="mx-auto max-w-3xl space-y-4 px-3 py-5 sm:space-y-6 sm:px-4 sm:py-8">
        <header className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm sm:p-4">
          <h1 className="text-xl font-extrabold text-stone-900 sm:text-2xl">План собрания на {dateText}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-600 sm:text-sm">
            <span className="rounded-full bg-stone-100 px-2 py-0.5">Старт: {plan.start_time}</span>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">Черновик · редактирование</span>
            <span className="rounded-full bg-stone-100 px-2 py-0.5">
              Ведущий: {plan.leader_name ?? 'Не назначен'}
            </span>
            <span className="rounded-full bg-stone-100 px-2 py-0.5">
              Проповедник: {plan.preacher_name ?? 'Не назначен'}
            </span>
          </div>
        </header>

        <section className="space-y-2.5">
          {rows.map((b) => {
            if (b.separator) {
              const sepText = String(b.content_json.separator_text ?? b.title ?? 'Раздел');
              return (
                <div
                  key={b.id}
                  className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-3 py-2.5"
                >
                  <p className="text-center text-sm font-bold leading-snug text-stone-700 sm:text-base">{sepText}</p>
                </div>
              );
            }
            const blockLogoUrl = getBlockLogoUrl(b);
            const customIcon = getBlockMarkIcon(b);
            const customMark = getBlockMark(b);
            const categoryIcon = getCategoryIcon(b);
            const birthdays = birthdayRows(b.content_json);
            const birthdaysBlock = isBirthdaysBlock(b);
            const schedule = scheduleRows(b.content_json);
            const hiddenFromPublic = isHiddenFromPublic(b.content_json);
            return (
              <article
                key={b.id}
                className={`max-w-full overflow-x-hidden rounded-xl border bg-white shadow-sm ${
                  hiddenFromPublic
                    ? 'border-stone-300 bg-stone-100/80 opacity-70'
                    : editingBlockId === b.id
                      ? 'border-primary/60'
                      : 'border-stone-200'
                } p-2.5 sm:p-4 ${editingBlockId === b.id ? 'max-sm:pb-[var(--app-safe-bottom)]' : ''}`}
              >
                <div className="flex min-w-0 items-start gap-2 sm:gap-3">
                  <div className="w-11 shrink-0 rounded-md bg-stone-100 px-1.5 py-1 text-center text-[11px] font-bold text-stone-700 sm:w-12 sm:bg-transparent sm:px-0 sm:py-0 sm:text-xs">
                    {b.startsAt}
                  </div>
                  {blockLogoUrl ? (
                    <img src={blockLogoUrl} alt="Лого блока" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                  ) : customIcon ? (
                    (() => {
                      const Icon = customIcon.Icon;
                      return (
                        <span
                          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${customIcon.wrapClass}`}
                        >
                          <Icon className={`h-4 w-4 ${customIcon.iconClass}`} />
                        </span>
                      );
                    })()
                  ) : customMark ? (
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-sm">
                      {customMark}
                    </span>
                  ) : categoryIcon ? (
                    (() => {
                      const Icon = categoryIcon.Icon;
                      return (
                        <span
                          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${categoryIcon.wrapClass}`}
                        >
                          <Icon className={`h-4 w-4 ${categoryIcon.iconClass}`} />
                        </span>
                      );
                    })()
                  ) : (
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-sm">
                      •
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-start justify-between gap-1.5 sm:gap-2">
                      <div className="min-w-0 flex-1 pr-0.5">
                        <h2 className="break-words text-[15px] font-bold leading-snug text-stone-900 sm:text-base">
                          {b.title}
                        </h2>
                        <p className="text-xs text-stone-500">
                          {b.block_type_name ?? 'Блок'} • {b.duration_minutes} мин
                          {b.assigned_member_name ? ` • ${b.assigned_member_name}` : ''}
                        </p>
                        {hiddenFromPublic ? (
                          <p className="mt-1 text-[11px] font-semibold text-stone-500">Скрыт в опубликованной версии</p>
                        ) : null}
                        {birthdaysBlock ? (
                          <p className="mt-1 text-xs leading-snug text-stone-600">
                            Именинники: {birthdays.length > 0 ? birthdays.join(' • ') : 'На этой неделе именинников нет'}
                          </p>
                        ) : null}
                        {schedule.length > 0 ? (
                          <div className="mt-1 text-xs leading-snug text-stone-600">
                            <p className="font-semibold">Расписание:</p>
                            <ul className="mt-0.5 space-y-0.5">
                              {schedule.map((line) => (
                                <li key={line}>{line}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {isPoemBlockType(b) ? <PoemInlineDetails contentJson={b.content_json} /> : null}
                        <BlockExtraInfoPanel rows={getBlockExtraDisplayRows(b)} variant="card" />
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setDraftBlocks((prev) =>
                              prev.map((x) =>
                                x.id === b.id
                                  ? {
                                      ...x,
                                      content_json: { ...x.content_json, hide_in_public: !hiddenFromPublic },
                                    }
                                  : x,
                              ),
                            );
                            if (!hiddenFromPublic && editingBlockId === b.id) setEditingBlockId(null);
                          }}
                          aria-label={hiddenFromPublic ? 'Показать в публикации' : 'Скрыть из публикации'}
                          title={hiddenFromPublic ? 'Показать в публикации' : 'Скрыть из публикации'}
                          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border text-stone-700 hover:border-primary hover:text-primary ${
                            hiddenFromPublic ? 'border-stone-400 bg-stone-200/80' : 'border-stone-300'
                          }`}
                        >
                          {hiddenFromPublic ? <LuEyeOff className="h-4 w-4" /> : <LuEye className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingBlockId((prev) => (prev === b.id ? null : b.id));
                          }}
                          aria-label={editingBlockId === b.id ? 'Скрыть редактирование' : 'Редактировать блок'}
                          title={editingBlockId === b.id ? 'Скрыть' : 'Редактировать'}
                          className="inline-flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center gap-1 rounded-lg border border-stone-300 text-stone-700 hover:border-primary hover:text-primary sm:h-auto sm:w-auto sm:px-2.5 sm:py-1 sm:text-xs sm:font-semibold"
                        >
                          <LuPencil className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                          <span className="hidden sm:inline">
                            {editingBlockId === b.id ? 'Скрыть' : 'Редактировать'}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                {editingBlockId === b.id && editingBlock ? (
                  <div className="mt-3 grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-2">
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_7rem] items-end gap-2 sm:col-span-2">
                      <div className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-2 text-sm font-medium text-stone-700 sm:py-1.5">
                        {editingBlock.block_type_name ?? 'Блок'}
                      </div>
                      <div className="min-w-0">
                      <label className="mb-1 block text-xs font-medium text-stone-600" htmlFor={`block-duration-${editingBlock.id}`}>
                        Длительность, мин
                      </label>
                      <input
                        id={`block-duration-${editingBlock.id}`}
                        type="number"
                        min={1}
                        max={180}
                        value={editingBlock.duration_minutes}
                        onChange={(e) =>
                          setDraftBlocks((prev) =>
                            prev.map((x) =>
                              x.id === editingBlock.id
                                ? { ...x, duration_minutes: Math.max(1, Number(e.target.value) || 1) }
                                : x,
                            ),
                          )
                        }
                        className="min-h-11 w-full min-w-0 max-w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 touch-manipulation sm:min-h-0 sm:px-2 sm:py-1.5 sm:text-sm"
                        inputMode="numeric"
                      />
                    </div>
                    </div>
                    <div className="min-w-0 sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-stone-600" htmlFor={`block-title-${editingBlock.id}`}>
                        Заголовок
                      </label>
                      <input
                        id={`block-title-${editingBlock.id}`}
                        value={editingBlock.title}
                        onChange={(e) =>
                          setDraftBlocks((prev) =>
                            prev.map((x) => (x.id === editingBlock.id ? { ...x, title: e.target.value } : x)),
                          )
                        }
                        className="min-h-11 w-full min-w-0 max-w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 placeholder:text-stone-500 touch-manipulation sm:min-h-0 sm:px-2 sm:py-1.5 sm:text-sm"
                        placeholder="Заголовок блока"
                        autoComplete="off"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="mb-1 block text-xs font-medium text-stone-600" htmlFor={`block-responsible-${editingBlock.id}`}>
                        {isEditingSermonBlock ? 'Проповедник' : isEditingPrayerBlock ? 'Молитва' : 'Ответственный'}
                      </label>
                      <select
                        id={`block-responsible-${editingBlock.id}`}
                            value={isEditingSermonBlock ? (planPreacherId ?? '') : (editingBlock.assigned_member_id ?? '')}
                        onChange={(e) => {
                              if (isEditingSermonBlock) return;
                          const memberId = e.target.value ? Number(e.target.value) : null;
                          const member = memberId ? members.find((u) => u.id === memberId) : null;
                          setDraftBlocks((prev) =>
                            prev.map((x) =>
                              x.id === editingBlock.id
                                ? {
                                    ...x,
                                    title: isEditingPoemBlock
                                      ? member
                                        ? `СТИХ - ${userLabel(member)}`
                                        : 'СТИХ - Чтец'
                                      : isEditingSermonBlock
                                        ? (() => {
                                            const topicRaw = x.content_json?.sermon_topic;
                                            const topic = typeof topicRaw === 'string' ? topicRaw.trim() : '';
                                            const preacherName = member ? userLabel(member) : 'Проповедник';
                                            return topic ? `${preacherName} - ${topic}` : preacherName;
                                          })()
                                        : x.title,
                                    assigned_member_id: memberId,
                                    assigned_member_name: member ? userLabel(member) : null,
                                  }
                                : x,
                            ),
                          );
                        }}
                        className="min-h-11 w-full min-w-0 max-w-full rounded-lg border border-stone-300 bg-white px-2 py-2 text-base text-stone-900 touch-manipulation sm:min-h-0 sm:py-1.5 sm:text-sm"
                            disabled={isEditingSermonBlock}
                      >
                            {isEditingSermonBlock ? (
                              <option value={planPreacherId ?? ''}>
                                {planPreacherId ? (planPreacherName ?? 'Проповедник') : 'В настройках программы не выбран проповедник'}
                              </option>
                            ) : (
                              <>
                                <option value="">
                                  {isEditingPrayerBlock ? 'Служитель молитвы не назначен' : 'Ответственный не назначен'}
                                </option>
                                {responsibleCandidates.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {userLabel(u)} ({roleLabel(u)})
                                  </option>
                                ))}
                              </>
                            )}
                      </select>
                    </div>
                    {isEditingSongBlock ? (
                      <div className="min-w-0">
                        <label className="mb-1 block text-xs font-medium text-stone-600" htmlFor={`block-song-${editingBlock.id}`}>
                          Песня
                        </label>
                        <select
                          id={`block-song-${editingBlock.id}`}
                          value={editingBlock.song_id ?? ''}
                          onChange={(e) => {
                            const songId = e.target.value ? Number(e.target.value) : null;
                            const song = songId ? songs.find((s) => s.id === songId) : null;
                            setDraftBlocks((prev) =>
                              prev.map((x) =>
                                x.id === editingBlock.id
                                  ? {
                                      ...x,
                                      song_id: songId,
                                      song_title: song?.title ?? null,
                                      song_key: song?.default_key ?? null,
                                      title: song ? songBlockTitle(song) : x.title,
                                    }
                                  : x,
                              ),
                            );
                          }}
                          className="min-h-11 w-full min-w-0 max-w-full rounded-lg border border-stone-300 bg-white px-2 py-2 text-base text-stone-900 touch-manipulation sm:min-h-0 sm:py-1.5 sm:text-sm"
                        >
                          <option value="">Песня не назначена</option>
                          {songs.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.default_key ? `${s.title} [${s.default_key}]` : s.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-2.5 py-2 text-xs leading-snug text-stone-500 sm:col-span-2 sm:py-1.5">
                        Для этого типа блока выбор песни не используется.
                      </div>
                    )}
                    {isEditingPoemBlock ? (
                      <div className="col-span-1 w-full min-w-0 space-y-2 rounded-xl border border-fuchsia-200/90 bg-fuchsia-50/50 p-3 sm:col-span-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-fuchsia-800/90">Стих</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-stone-600" htmlFor={`poem-author-${editingBlock.id}`}>
                              Автор
                            </label>
                            <input
                              id={`poem-author-${editingBlock.id}`}
                              value={String((editingBlock.content_json?.poem_author as string | undefined) ?? '')}
                              onChange={(e) =>
                                setDraftBlocks((prev) =>
                                  prev.map((x) =>
                                    x.id === editingBlock.id
                                      ? { ...x, content_json: { ...x.content_json, poem_author: e.target.value } }
                                      : x,
                                  ),
                                )
                              }
                              className="min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 placeholder:text-stone-500 touch-manipulation sm:min-h-0 sm:px-2.5 sm:py-1.5 sm:text-sm"
                              placeholder="Автор стиха"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-stone-600" htmlFor={`poem-theme-${editingBlock.id}`}>
                              Тема
                            </label>
                            <input
                              id={`poem-theme-${editingBlock.id}`}
                              value={String((editingBlock.content_json?.poem_theme as string | undefined) ?? '')}
                              onChange={(e) =>
                                setDraftBlocks((prev) =>
                                  prev.map((x) =>
                                    x.id === editingBlock.id
                                      ? { ...x, content_json: { ...x.content_json, poem_theme: e.target.value } }
                                      : x,
                                  ),
                                )
                              }
                              className="min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 placeholder:text-stone-500 touch-manipulation sm:min-h-0 sm:px-2.5 sm:py-1.5 sm:text-sm"
                              placeholder="Тема стиха"
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}
                    {isEditingSermonBlock ? (
                      <div className="col-span-1 w-full min-w-0 space-y-2 rounded-xl border border-rose-200/90 bg-rose-50/50 p-3 sm:col-span-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-800/90">Проповедь</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-stone-600" htmlFor={`sermon-topic-${editingBlock.id}`}>
                              Тема
                            </label>
                            <input
                              id={`sermon-topic-${editingBlock.id}`}
                              value={String((editingBlock.content_json?.sermon_topic as string | undefined) ?? '')}
                              onChange={(e) =>
                                setDraftBlocks((prev) =>
                                  prev.map((x) => {
                                    if (x.id !== editingBlock.id) return x;
                                    const nextTopic = e.target.value;
                                    const preacherName = (planPreacherName ?? '').trim() || 'Проповедник';
                                    const topicTrim = nextTopic.trim();
                                    return {
                                      ...x,
                                      assigned_member_id: planPreacherId,
                                      assigned_member_name: planPreacherName,
                                      title: topicTrim ? `${preacherName} - ${topicTrim}` : preacherName,
                                      content_json: { ...x.content_json, sermon_topic: nextTopic },
                                    };
                                  }),
                                )
                              }
                              className="min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 placeholder:text-stone-500 touch-manipulation sm:min-h-0 sm:px-2.5 sm:py-1.5 sm:text-sm"
                              placeholder="Тема проповеди"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-stone-600" htmlFor={`sermon-scripture-${editingBlock.id}`}>
                              Писание
                            </label>
                            <input
                              id={`sermon-scripture-${editingBlock.id}`}
                              value={String((editingBlock.content_json?.sermon_scripture as string | undefined) ?? '')}
                              onChange={(e) =>
                                setDraftBlocks((prev) =>
                                  prev.map((x) =>
                                    x.id === editingBlock.id
                                      ? { ...x, content_json: { ...x.content_json, sermon_scripture: e.target.value } }
                                      : x,
                                  ),
                                )
                              }
                              className="min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 placeholder:text-stone-500 touch-manipulation sm:min-h-0 sm:px-2.5 sm:py-1.5 sm:text-sm"
                              placeholder="Стихи из Библии"
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}
                    <BlockExtraInfoPanel rows={getEditFormAuxiliaryRows(editingBlock)} variant="edit" />
                    <div className="col-span-1 w-full min-w-0 sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-stone-600" htmlFor={`block-note-${editingBlock.id}`}>
                        Заметка
                      </label>
                      <textarea
                        id={`block-note-${editingBlock.id}`}
                        value={blockNote(editingBlock.content_json)}
                        onChange={(e) =>
                          setDraftBlocks((prev) =>
                            prev.map((x) => {
                              if (x.id !== editingBlock.id) return x;
                              const hasNotes = typeof x.content_json?.notes === 'string';
                              const hasText = typeof x.content_json?.text === 'string';
                              if (hasNotes) return { ...x, content_json: { ...x.content_json, notes: e.target.value } };
                              if (hasText) return { ...x, content_json: { ...x.content_json, text: e.target.value } };
                              return { ...x, content_json: { ...x.content_json, notes: e.target.value } };
                            }),
                          )
                        }
                        className="min-h-[100px] w-full min-w-0 max-w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 placeholder:text-stone-500 touch-manipulation sm:min-h-[84px] sm:px-2 sm:py-1.5 sm:text-sm"
                        placeholder="Заметка блока"
                        rows={4}
                      />
                    </div>
                    {isBirthdaysBlock(editingBlock) ? (
                      <div className="col-span-1 w-full min-w-0 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-2 text-xs text-stone-600 sm:col-span-2 sm:px-2">
                        <p className="font-semibold">Именинники недели:</p>
                        <p className="mt-1">
                          {birthdayRows(editingBlock.content_json).length > 0
                            ? birthdayRows(editingBlock.content_json).join(' • ')
                            : 'На этой неделе именинников нет'}
                        </p>
                      </div>
                    ) : null}
                    {scheduleRows(editingBlock.content_json).length > 0 ? (
                      <div className="col-span-1 w-full min-w-0 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-2 text-xs text-stone-600 sm:col-span-2 sm:px-2">
                        <p className="font-semibold">Расписание:</p>
                        <ul className="mt-1 space-y-0.5">
                          {scheduleRows(editingBlock.content_json).map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <div className="save-bar mt-1 flex w-full min-w-0 justify-center sm:col-span-2 sm:mt-0 sm:justify-end">
                      <button
                        type="button"
                        onClick={() => void handleSaveBlock(editingBlock)}
                        disabled={saveBlockMut.isPending}
                        className="flex w-full max-w-md min-h-12 items-center justify-center gap-2 self-center rounded-lg bg-primary px-4 text-base font-semibold text-white touch-manipulation hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-70 max-sm:mx-auto sm:inline-flex sm:max-w-none sm:self-auto sm:px-3 sm:py-1.5 sm:text-sm"
                      >
                        {saveBlockMut.isPending ? (
                          <LuLoaderCircle className="h-5 w-5 shrink-0 animate-spin sm:h-4 sm:w-4" />
                        ) : (
                          <LuSave className="h-5 w-5 shrink-0 sm:h-4 sm:w-4" />
                        )}
                        Сохранить блок
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
}
