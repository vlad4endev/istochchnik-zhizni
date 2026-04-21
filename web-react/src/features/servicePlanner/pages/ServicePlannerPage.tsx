import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { addMinutes, format, parse } from 'date-fns';
import {
  LuClock3,
  LuCopy,
  LuGripVertical,
  LuLink,
  LuLoaderCircle,
  LuPencil,
  LuPlus,
  LuSave,
  LuTrash2,
  LuUsers,
} from 'react-icons/lu';

import { fetchSongs, type SongListItem } from '../../songbook/api';
import { fetchAdminMembers } from '../../admin/api';
import type { AppUser } from '../../admin/types';
import { useAuthStore } from '../../auth/authStore';
import {
  createServiceBlock,
  createServiceTemplate,
  createServicePlan,
  deleteServiceBlock,
  fetchServiceBlockTypes,
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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function tmpId(): number {
  return -Math.floor(Math.random() * 1_000_000_000);
}

function parseStartClock(dateIso: string, time: string): Date {
  return parse(`${dateIso} ${time}`, 'yyyy-MM-dd HH:mm', new Date());
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

function roleLabel(u: AppUser): string {
  if (u.app_role === 'admin') return 'Админ';
  if (u.app_role === 'pastor') return 'Пастор';
  if (u.app_role === 'editor') return 'Редактор';
  if (u.app_role === 'musician') return 'Музыкант';
  return 'Участник';
}

function userLabel(u: AppUser): string {
  const full = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim();
  return full || u.name || `Пользователь #${u.id}`;
}

function songBlockTitle(song: SongListItem): string {
  const key = (song.default_key ?? '').trim();
  return key ? `${song.title} [${key}]` : song.title;
}

function isSeparatorBlock(block: ServicePlanBlock): boolean {
  return block.content_json?.is_separator === true;
}

function separatorLabel(block: ServicePlanBlock): string {
  const fromJson = block.content_json?.separator_text;
  if (typeof fromJson === 'string' && fromJson.trim()) return fromJson.trim();
  return block.title.trim() || 'Раздел';
}

const CATEGORY_MARK_BY_CODE: Record<string, string> = {
  prayer: '🙏',
  song: '🎵',
  scripture: '📖',
  sermon: '🎙️',
  announcements: '📢',
  offering: '🤲',
  custom: '🧩',
};

const CATEGORY_MARK_BY_ICON: Record<string, string> = {
  'hands-praying': '🙏',
  music: '🎵',
  'book-bible': '📖',
  'person-chalkboard': '🎙️',
  bullhorn: '📢',
  'hand-holding-dollar': '🤲',
  'puzzle-piece': '🧩',
};

export function ServicePlannerPage() {
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.role);
  const isAdmin = (role ?? 'member').toLowerCase() === 'admin';
  const [activePlanId, setActivePlanId] = useState<number | null>(null);
  const [draft, setDraft] = useState<ServicePlanDetails | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<number | null>(null);
  const [templateDraft, setTemplateDraft] = useState<ServiceTemplateDetails | null>(null);
  const [recurrenceRuleInput, setRecurrenceRuleInput] = useState<string>('{"frequency":"weekly","byWeekday":0}');
  const [editingBlockId, setEditingBlockId] = useState<number | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  const songsQ = useQuery<SongListItem[]>({
    queryKey: ['songs', 'service-planner'],
    queryFn: () => fetchSongs(),
    staleTime: 60_000,
  });

  const membersQ = useQuery<AppUser[]>({
    queryKey: ['admin', 'members', 'service-planner'],
    queryFn: fetchAdminMembers,
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
    queryKey: ['service-planner', 'plans'],
    queryFn: () => fetchServicePlans(),
    staleTime: 20_000,
  });

  const planQ = useQuery({
    queryKey: ['service-planner', 'plan', activePlanId],
    queryFn: () => fetchServicePlan(activePlanId as number),
    enabled: activePlanId != null,
  });

  useEffect(() => {
    if (!activePlanId && (plansQ.data?.length ?? 0) > 0) {
      setActivePlanId(plansQ.data![0].id);
    }
  }, [activePlanId, plansQ.data]);

  useEffect(() => {
    if (planQ.data) {
      setDraft(planQ.data);
      if (planQ.data.template_id) {
        setActiveTemplateId(planQ.data.template_id);
      }
    }
  }, [planQ.data]);

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

  const updatePlanMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Parameters<typeof patchServicePlan>[1] }) =>
      patchServicePlan(id, body),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['service-planner', 'plans'] }),
        qc.invalidateQueries({ queryKey: ['service-planner', 'plan', activePlanId] }),
      ]);
    },
  });

  const updateBlockMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Parameters<typeof patchServiceBlock>[1] }) =>
      patchServiceBlock(id, body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['service-planner', 'plan', activePlanId] });
    },
  });

  const reorderMut = useMutation({
    mutationFn: (body: Parameters<typeof reorderServiceBlocks>[0]) => reorderServiceBlocks(body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['service-planner', 'plan', activePlanId] });
    },
  });

  const createPlanMut = useMutation({
    mutationFn: (body: Parameters<typeof createServicePlan>[0]) => createServicePlan(body),
    onSuccess: async (data) => {
      await qc.invalidateQueries({ queryKey: ['service-planner', 'plans'] });
      setActivePlanId(data.id);
    },
  });

  const createTemplateMut = useMutation({
    mutationFn: (body: Parameters<typeof createServiceTemplate>[0]) => createServiceTemplate(body),
    onSuccess: async (data) => {
      await qc.invalidateQueries({ queryKey: ['service-planner', 'templates'] });
      setActiveTemplateId(data.id);
    },
  });

  const createBlockMut = useMutation({
    mutationFn: (body: Parameters<typeof createServiceBlock>[0]) => createServiceBlock(body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['service-planner', 'plan', activePlanId] });
    },
  });

  const deleteBlockMut = useMutation({
    mutationFn: (id: number) => deleteServiceBlock(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['service-planner', 'plan', activePlanId] });
    },
  });

  const saveProgramMut = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      await patchServicePlan(draft.id, {
        service_date: draft.service_date,
        start_time: draft.start_time,
        leader_member_id: draft.leader_member_id,
        preacher_member_id: draft.preacher_member_id,
        current_block_id: draft.current_block_id,
        status: draft.status,
      });
      const ordered = [...draft.blocks].sort((a, b) => a.order_index - b.order_index);
      for (const b of ordered) {
        await patchServiceBlock(b.id, {
          title: b.title,
          block_type_id: b.block_type_id,
          duration_minutes: b.duration_minutes,
          assigned_member_id: b.assigned_member_id,
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
    },
  });

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

  const activeTemplate = useMemo(() => {
    const targetId = activeTemplateId ?? draft?.template_id ?? null;
    if (!targetId) return null;
    return templates.find((t) => t.id === targetId) ?? null;
  }, [activeTemplateId, draft?.template_id, templates]);

  const editingBlock = useMemo(
    () => draft?.blocks.find((b) => b.id === editingBlockId) ?? null,
    [draft, editingBlockId],
  );

  function getBlockTypeMeta(block: ServicePlanBlock) {
    return blockTypes.find((t) => t.id === block.block_type_id) ?? null;
  }

  function getResponsibleLabel(block: ServicePlanBlock): string | null {
    if (!draft) return null;
    const meta = getBlockTypeMeta(block);
    const isSermon =
      meta?.code === 'sermon' || (meta?.name ?? '').toLowerCase().includes('проповед');
    if (isSermon) {
      const preacher = draft.preacher_member_id ? usersById.get(draft.preacher_member_id) : null;
      return preacher ? userLabel(preacher) : null;
    }
    const assigned = block.assigned_member_id ? usersById.get(block.assigned_member_id) : null;
    return assigned ? userLabel(assigned) : null;
  }

  function getDirectionLabel(block: ServicePlanBlock): string | null {
    const fromContent = block.content_json?.direction;
    if (typeof fromContent === 'string' && fromContent.trim()) return fromContent.trim();
    const responsibleId = block.assigned_member_id;
    if (!responsibleId) return null;
    const member = usersById.get(responsibleId);
    if (!member?.ministry_direction) return null;
    const direction = member.ministry_direction.trim();
    return direction || null;
  }

  function getCategoryMark(block: ServicePlanBlock): string | null {
    const meta = getBlockTypeMeta(block);
    if (!meta) return null;
    const iconKey = (meta.icon ?? '').trim().toLowerCase();
    if (iconKey && CATEGORY_MARK_BY_ICON[iconKey]) return CATEGORY_MARK_BY_ICON[iconKey];
    const codeKey = (meta.code ?? '').trim().toLowerCase();
    if (codeKey && CATEGORY_MARK_BY_CODE[codeKey]) return CATEGORY_MARK_BY_CODE[codeKey];
    return null;
  }

  function getBlockMark(block: ServicePlanBlock): string | null {
    const fromContent = block.content_json?.block_mark;
    if (typeof fromContent === 'string' && fromContent.trim()) return fromContent.trim();
    return getCategoryMark(block);
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

  function onDragEnd(result: DropResult): void {
    const destination = result.destination;
    if (!destination || !draft) return;
    if (destination.index === result.source.index) return;
    const reordered = reorderBlocks(draft.blocks, result.source.index, destination.index);
    setDraft({ ...draft, blocks: reordered });
    void reorderMut.mutateAsync({
      service_plan_id: draft.id,
      ordered_block_ids: reordered.map((b) => b.id),
    });
  }

  function generateFromTemplate(date: string): void {
    if (!activeTemplate) return;
    void createPlanMut.mutateAsync({
      template_id: activeTemplate.id,
      service_date: date,
      start_time: activeTemplate.default_start_time,
      leader_member_id: draft?.leader_member_id ?? null,
      preacher_member_id: draft?.preacher_member_id ?? null,
    });
  }

  function addPlanBlock(): void {
    if (!draft) return;
    const defaultType = blockTypes[0]?.id;
    if (!defaultType) return;
    void createBlockMut.mutateAsync({
      service_plan_id: draft.id,
      block_type_id: defaultType,
      title: 'Новый блок',
      duration_minutes: 5,
      content_json: {},
    });
  }

  function addSeparatorBlock(): void {
    if (!draft) return;
    const separatorType = blockTypes.find((t) => t.code === 'custom')?.id ?? blockTypes[0]?.id;
    if (!separatorType) return;
    void createBlockMut.mutateAsync({
      service_plan_id: draft.id,
      block_type_id: separatorType,
      title: 'Раздел',
      duration_minutes: 1,
      content_json: {
        is_separator: true,
        separator_text: 'Новый раздел',
      },
    });
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

  async function saveTemplateDraft(): Promise<void> {
    if (!templateDraft) return;
    try {
      const parsedRecurrence = JSON.parse(
        recurrenceRuleInput && recurrenceRuleInput.trim() ? recurrenceRuleInput : '{}',
      ) as Record<string, unknown>;
      await updateTemplateMut.mutateAsync({
        id: templateDraft.id,
        body: {
          name: templateDraft.name,
          description: templateDraft.description,
          default_start_time: templateDraft.default_start_time,
          is_active: templateDraft.is_active,
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
        },
      });
    } catch {
      window.alert('Проверьте recurrence_rule: это должен быть корректный JSON.');
    }
  }

  async function createTemplateFromDraft(): Promise<void> {
    const fallbackType = blockTypes[0]?.id;
    if (!fallbackType) return;
    const name = window.prompt('Название шаблона', 'Новое служение')?.trim();
    if (!name) return;
    try {
      await createTemplateMut.mutateAsync({
        name,
        description: '',
        default_start_time: '10:00',
        recurrence_rule: { frequency: 'weekly', byWeekday: 0 },
        blocks: [
          {
            block_type_id: fallbackType,
            title: 'Открытие',
            order_index: 0,
            duration_minutes: 5,
            default_song_id: null,
            default_content_json: {},
          },
        ],
      });
    } catch {
      window.alert('Не удалось создать шаблон');
    }
  }

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

  if (!draft) {
    return (
      <section className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-6">
        <h1 className="text-xl font-extrabold text-stone-900">Планировщик служений</h1>
        <p className="text-sm text-stone-600">
          Планы ещё не созданы. Сначала создайте шаблон, затем сгенерируйте план.
        </p>
        <div className="rounded-xl border border-stone-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <label className="block text-xs font-semibold text-stone-600">Шаблон</label>
            <button
              type="button"
              onClick={() => void createTemplateFromDraft()}
              className="inline-flex items-center gap-1 rounded-lg border border-stone-300 px-2 py-1 text-xs font-semibold text-stone-700 hover:border-primary hover:text-primary"
            >
              <LuPlus className="h-3.5 w-3.5" />
              Создать шаблон
            </button>
          </div>
          {templates.length > 0 ? (
            <select
              value={activeTemplateId ?? ''}
              onChange={(e) => setActiveTemplateId(e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
            >
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-3 py-2 text-xs text-stone-600">
              Пока нет ни одного шаблона. Нажмите «Создать шаблон».
            </p>
          )}
          <button
            type="button"
            disabled={!activeTemplate}
            onClick={() => generateFromTemplate(todayIso())}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-stone-300"
          >
            <LuPlus className="h-4 w-4" />
            Сгенерировать план на сегодня
          </button>
        </div>
      </section>
    );
  }

  const dateText = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${draft.service_date}T12:00:00`));

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-3 py-4 pb-24 sm:px-4 md:px-6 md:pb-6">
      <header className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <h1 className="text-xl font-extrabold text-stone-900">План служения</h1>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-stone-600">
          <span className="capitalize">{dateText}</span>
          <span className="inline-flex items-center gap-1">
            <LuClock3 className="h-4 w-4" /> {draft.start_time}
          </span>
          <span className="inline-flex items-center gap-1">
            <LuUsers className="h-4 w-4" /> {timedBlocks.length} блоков / {totalDuration} мин
          </span>
        </div>
      </header>

      <section className="mx-auto w-full max-w-3xl rounded-2xl border border-stone-200 bg-white p-2 shadow-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
          Шаг 1: выберите шаблон и сгенерируйте программу
        </p>
        <div className="grid gap-2 md:grid-cols-3">
          <select
            value={activeTemplateId ?? ''}
            onChange={(e) => setActiveTemplateId(e.target.value ? Number(e.target.value) : null)}
            className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
          >
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => generateFromTemplate(todayIso())}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700 hover:border-primary hover:text-primary"
          >
            <LuPlus className="h-4 w-4" />
            Сгенерировать программу
          </button>
          <select
            value={activePlanId ?? ''}
            onChange={(e) => setActivePlanId(e.target.value ? Number(e.target.value) : null)}
            className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
          >
            {(plansQ.data ?? []).map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.service_date} • {plan.status === 'published' ? 'Опубликован' : 'Черновик'}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
          Шаг 2: отредактируйте и расставьте блоки
        </p>
        <div className="grid gap-2 md:grid-cols-5">
          <button
            type="button"
            onClick={addPlanBlock}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700 hover:border-primary hover:text-primary"
          >
            <LuPlus className="h-4 w-4" />
            Добавить блок
          </button>
          <button
            type="button"
            onClick={addSeparatorBlock}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700 hover:border-primary hover:text-primary"
          >
            <LuPlus className="h-4 w-4" />
            Разделитель
          </button>
          <input
            type="time"
            value={draft.start_time}
            onChange={(e) => setDraft({ ...draft, start_time: e.target.value || '10:00' })}
            className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => {
              const status = draft.status === 'draft' ? 'published' : 'draft';
              setDraft({ ...draft, status });
              void updatePlanMut.mutateAsync({ id: draft.id, body: { status } });
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700 hover:border-primary hover:text-primary"
          >
            {draft.status === 'draft' ? 'Черновик' : 'Опубликован'}
          </button>
          <button
            type="button"
            onClick={() => void saveProgramMut.mutateAsync()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            <LuSave className="h-4 w-4" />
            Сохранить программу
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="service-planner-blocks">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                {timedBlocks.map((block, index) => (
                  <Draggable key={block.id} draggableId={String(block.id)} index={index}>
                    {(dragProvided, dragSnapshot) => (
                      <article
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        className={[
                          isSeparatorBlock(block)
                            ? 'rounded-xl border border-dashed border-stone-300 bg-stone-50 p-2'
                            : 'rounded-xl border border-stone-200 p-2',
                          dragSnapshot.isDragging ? 'bg-stone-50 shadow' : 'bg-white',
                          draft.current_block_id === block.id ? 'ring-2 ring-primary/30' : '',
                        ].join(' ')}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            {...dragProvided.dragHandleProps}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-stone-200 text-stone-500"
                            aria-label="Перетащить блок"
                          >
                            <LuGripVertical className="h-4 w-4" />
                          </button>
                          <span className="w-12 text-xs font-bold text-stone-900">
                            {isSeparatorBlock(block) ? '---' : block.startsAt}
                          </span>
                          {!isSeparatorBlock(block) ? (
                            getBlockLogoUrl(block) ? (
                              <img
                                src={getBlockLogoUrl(block) ?? ''}
                                alt="Лого блока"
                                className="h-5 w-5 shrink-0 rounded object-cover"
                              />
                            ) : (
                              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-stone-100 text-xs">
                                {getBlockMark(block) ?? '•'}
                              </span>
                            )
                          ) : null}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-stone-900">
                              {isSeparatorBlock(block) ? separatorLabel(block) : block.title}
                            </p>
                            <p className="text-xs text-stone-500">
                              {isSeparatorBlock(block)
                                ? 'Текстовый разделитель'
                                : `${blockTypes.find((t) => t.id === block.block_type_id)?.name ?? 'Блок'} • ${block.duration_minutes} мин`}
                            </p>
                            {!isSeparatorBlock(block) &&
                            (getResponsibleLabel(block) || getDirectionLabel(block)) ? (
                              <p className="truncate text-[11px] text-stone-500">
                                {getResponsibleLabel(block) ? `Ответственный: ${getResponsibleLabel(block)}` : ''}
                                {getResponsibleLabel(block) && getDirectionLabel(block) ? ' • ' : ''}
                                {getDirectionLabel(block) ? `Направление: ${getDirectionLabel(block)}` : ''}
                              </p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => setEditingBlockId(block.id)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-50"
                            aria-label="Редактировать блок"
                          >
                            <LuPencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDraft({
                                ...draft,
                                blocks: draft.blocks.filter((b) => b.id !== block.id),
                              });
                              void deleteBlockMut.mutateAsync(block.id);
                            }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50"
                            aria-label="Удалить блок"
                          >
                            <LuTrash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </article>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </section>

      <details className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
        <summary className="cursor-pointer text-sm font-bold text-stone-700">Настройки плана</summary>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <input
            type="date"
            value={draft.service_date}
            onChange={(e) => setDraft({ ...draft, service_date: e.target.value || todayIso() })}
            className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
          />
          <input
            type="time"
            value={draft.start_time}
            onChange={(e) => setDraft({ ...draft, start_time: e.target.value || '10:00' })}
            className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
          />
          <select
            value={draft.leader_member_id ?? ''}
            onChange={(e) => setDraft({ ...draft, leader_member_id: e.target.value ? Number(e.target.value) : null })}
            className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
          >
            <option value="">Ведущий</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {userLabel(u)}
              </option>
            ))}
          </select>
          <select
            value={draft.preacher_member_id ?? ''}
            onChange={(e) =>
              setDraft({ ...draft, preacher_member_id: e.target.value ? Number(e.target.value) : null })
            }
            className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
          >
            <option value="">Проповедник</option>
            {users
              .filter((u) => u.app_role === 'pastor' || u.app_role === 'admin')
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {userLabel(u)}
                </option>
              ))}
          </select>
          <div className="md:col-span-2 rounded-lg bg-stone-50 px-2 py-1.5 text-xs text-stone-600">
            <LuLink className="mr-1 inline h-3.5 w-3.5" /> /service-plan/share/{draft.share_token}
          </div>
          <button
            type="button"
            onClick={() =>
              void updatePlanMut.mutateAsync({
                id: draft.id,
                body: {
                  service_date: draft.service_date,
                  start_time: draft.start_time,
                  leader_member_id: draft.leader_member_id,
                  preacher_member_id: draft.preacher_member_id,
                },
              })
            }
            className="inline-flex items-center justify-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark md:col-span-2"
          >
            <LuSave className="h-4 w-4" />
            Сохранить настройки плана
          </button>
        </div>
      </details>

      <section className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
          Шаг 3: поделитесь ссылкой
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
      </section>

      {isAdmin ? (
        <details className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
          <summary className="cursor-pointer text-sm font-bold text-stone-700">Шаблоны (админ)</summary>
          <div className="mt-3 grid gap-2">
          <div className="grid gap-2 md:grid-cols-3">
            <select
              value={activeTemplateId ?? ''}
              onChange={(e) => setActiveTemplateId(e.target.value ? Number(e.target.value) : null)}
              className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
            >
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void createTemplateFromDraft()}
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-stone-300 px-2 py-1.5 text-sm font-semibold text-stone-700 hover:border-primary hover:text-primary"
            >
              <LuPlus className="h-4 w-4" />
              Новый шаблон
            </button>
            <button
              type="button"
              onClick={() => generateFromTemplate(todayIso())}
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-stone-300 px-2 py-1.5 text-sm font-semibold text-stone-700 hover:border-primary hover:text-primary"
            >
              <LuPlus className="h-4 w-4" />
              Сгенерировать план
            </button>
          </div>
          {templateDraft ? (
            <>
              <input
                value={templateDraft.name}
                onChange={(e) => setTemplateDraft({ ...templateDraft, name: e.target.value })}
                className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
                placeholder="Название шаблона"
              />
              <textarea
                value={templateDraft.description ?? ''}
                onChange={(e) => setTemplateDraft({ ...templateDraft, description: e.target.value })}
                className="min-h-[52px] rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
                placeholder="Описание"
              />
              <textarea
                value={recurrenceRuleInput}
                onChange={(e) => setRecurrenceRuleInput(e.target.value)}
                className="min-h-[78px] rounded-lg border border-stone-300 px-2 py-1.5 font-mono text-xs"
              />
              <div className="rounded-lg border border-stone-200 p-2">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-stone-500">Блоки шаблона</p>
                  <button
                    type="button"
                    onClick={addTemplateBlock}
                    className="inline-flex items-center gap-1 rounded border border-stone-300 px-2 py-1 text-xs font-semibold text-stone-700"
                  >
                    <LuPlus className="h-3.5 w-3.5" />
                    Блок
                  </button>
                </div>
                <div className="space-y-2">
                  {templateDraft.blocks
                    .slice()
                    .sort((a, b) => a.order_index - b.order_index)
                    .map((b, idx) => (
                      <div key={b.id} className="grid gap-1 rounded border border-stone-200 p-2 md:grid-cols-4">
                        <input
                          value={b.title}
                          onChange={(e) =>
                            setTemplateDraft({
                              ...templateDraft,
                              blocks: templateDraft.blocks.map((x) =>
                                x.id === b.id ? { ...x, title: e.target.value } : x,
                              ),
                            })
                          }
                          className="rounded border border-stone-300 px-2 py-1 text-xs md:col-span-2"
                        />
                        <select
                          value={b.block_type_id}
                          onChange={(e) =>
                            setTemplateDraft({
                              ...templateDraft,
                              blocks: templateDraft.blocks.map((x) =>
                                x.id === b.id ? { ...x, block_type_id: Number(e.target.value) || x.block_type_id } : x,
                              ),
                            })
                          }
                          className="rounded border border-stone-300 px-2 py-1 text-xs"
                        >
                          {blockTypes.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={1}
                          value={b.duration_minutes}
                          onChange={(e) =>
                            setTemplateDraft({
                              ...templateDraft,
                              blocks: templateDraft.blocks.map((x) =>
                                x.id === b.id
                                  ? { ...x, duration_minutes: Math.max(1, Number(e.target.value) || 1) }
                                  : x,
                              ),
                            })
                          }
                          className="rounded border border-stone-300 px-2 py-1 text-xs"
                        />
                        <div className="md:col-span-4 flex gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() =>
                              setTemplateDraft({
                                ...templateDraft,
                                blocks: reorderTemplateBlocks(templateDraft.blocks, idx, idx - 1),
                              })
                            }
                            className="rounded border border-stone-300 px-2 py-0.5 text-[10px] font-semibold"
                          >
                            Вверх
                          </button>
                          <button
                            type="button"
                            disabled={idx === templateDraft.blocks.length - 1}
                            onClick={() =>
                              setTemplateDraft({
                                ...templateDraft,
                                blocks: reorderTemplateBlocks(templateDraft.blocks, idx, idx + 1),
                              })
                            }
                            className="rounded border border-stone-300 px-2 py-0.5 text-[10px] font-semibold"
                          >
                            Вниз
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setTemplateDraft({
                                ...templateDraft,
                                blocks: templateDraft.blocks
                                  .filter((x) => x.id !== b.id)
                                  .map((x, i) => ({ ...x, order_index: i })),
                              })
                            }
                            className="rounded border border-rose-200 px-2 py-0.5 text-[10px] font-semibold text-rose-700"
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void saveTemplateDraft()}
                className="inline-flex items-center justify-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
              >
                <LuSave className="h-4 w-4" />
                Сохранить шаблон
              </button>
            </>
          ) : null}
          </div>
        </details>
      ) : null}

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
        saveProgramMut.isPending) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs font-semibold text-amber-800">
          Сохраняю изменения...
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-stone-200 bg-white/95 px-3 py-2 backdrop-blur md:hidden">
        <button
          type="button"
          onClick={() => void saveProgramMut.mutateAsync()}
          className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-white"
        >
          <LuSave className="h-4 w-4" />
          Сохранить программу
        </button>
      </div>

      {editingBlock ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/35 p-3 sm:items-center">
          <div className="w-full max-w-xl rounded-2xl border border-stone-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-extrabold text-stone-900">Редактирование блока</h3>
              <button
                type="button"
                onClick={() => setEditingBlockId(null)}
                className="rounded-lg border border-stone-300 px-2 py-1 text-xs font-semibold text-stone-700"
              >
                Закрыть
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
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
                className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm sm:col-span-2"
                placeholder={isSeparatorBlock(editingBlock) ? 'Текст разделителя' : 'Название блока'}
              />
              <input
                value={String((editingBlock.content_json?.block_mark as string | undefined) ?? '')}
                onChange={(e) =>
                  updateDraftBlock(editingBlock.id, {
                    content_json: { ...editingBlock.content_json, block_mark: e.target.value },
                  })
                }
                className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
                placeholder="Эмоджи/маркер (например 🎵)"
              />
              <input
                value={String((editingBlock.content_json?.block_logo_url as string | undefined) ?? '')}
                onChange={(e) =>
                  updateDraftBlock(editingBlock.id, {
                    content_json: { ...editingBlock.content_json, block_logo_url: e.target.value },
                  })
                }
                className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
                placeholder="URL лого (опционально)"
              />
              <div className="flex flex-wrap gap-1 sm:col-span-2">
                {['🙏', '🎵', '📖', '🎙️', '📢', '🤲', '🧩'].map((mark) => (
                  <button
                    key={mark}
                    type="button"
                    onClick={() =>
                      updateDraftBlock(editingBlock.id, {
                        content_json: { ...editingBlock.content_json, block_mark: mark },
                      })
                    }
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-stone-300 text-sm hover:border-primary"
                    title={`Поставить ${mark}`}
                  >
                    {mark}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    updateDraftBlock(editingBlock.id, {
                      content_json: {
                        ...editingBlock.content_json,
                        block_mark: '',
                        block_logo_url: '',
                      },
                    })
                  }
                  className="rounded-md border border-stone-300 px-2 text-xs font-semibold text-stone-700 hover:border-primary hover:text-primary"
                >
                  Сброс
                </button>
              </div>
              {!isSeparatorBlock(editingBlock) ? (
                <>
                  <select
                    value={editingBlock.block_type_id}
                    onChange={(e) =>
                      updateDraftBlock(editingBlock.id, {
                        block_type_id: Number(e.target.value) || editingBlock.block_type_id,
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
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={editingBlock.duration_minutes}
                    onChange={(e) =>
                      updateDraftBlock(editingBlock.id, {
                        duration_minutes: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                    className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
                  />
                  <select
                    value={editingBlock.assigned_member_id ?? ''}
                    onChange={(e) =>
                      updateDraftBlock(editingBlock.id, {
                        assigned_member_id: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm sm:col-span-2"
                  >
                    <option value="">Ответственный не назначен</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {userLabel(u)} ({roleLabel(u)})
                      </option>
                    ))}
                  </select>
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
                  <textarea
                    value={String((editingBlock.content_json?.text as string | undefined) ?? '')}
                    onChange={(e) =>
                      updateDraftBlock(editingBlock.id, {
                        content_json: { ...editingBlock.content_json, text: e.target.value },
                      })
                    }
                    className="min-h-[84px] rounded-lg border border-stone-300 px-2 py-1.5 text-sm sm:col-span-2"
                    placeholder="Данные блока (текст/заметки)"
                  />
                </>
              ) : (
                <p className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-2 py-2 text-xs text-stone-600 sm:col-span-2">
                  Разделитель делит программу на части и не добавляет длительность в расчет сверху.
                </p>
              )}
            </div>
            <div className="mt-3 flex justify-end gap-2">
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
                  setEditingBlockId(null);
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-dark"
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
