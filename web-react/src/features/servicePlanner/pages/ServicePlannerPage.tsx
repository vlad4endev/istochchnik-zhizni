import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { addMinutes, format, parse } from 'date-fns';
import {
  LuClock3,
  LuGripVertical,
  LuLink,
  LuLoaderCircle,
  LuPencil,
  LuPlay,
  LuPlus,
  LuSave,
  LuTrash2,
  LuUsers,
} from 'react-icons/lu';

import { fetchSongs, type SongListItem } from '../../songbook/api';
import { fetchAdminMembers } from '../../admin/api';
import type { AppUser } from '../../admin/types';
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

export function ServicePlannerPage() {
  const qc = useQueryClient();
  const [activePlanId, setActivePlanId] = useState<number | null>(null);
  const [draft, setDraft] = useState<ServicePlanDetails | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<number | null>(null);
  const [templateDraft, setTemplateDraft] = useState<ServiceTemplateDetails | null>(null);
  const [recurrenceRuleInput, setRecurrenceRuleInput] = useState<string>('{"frequency":"weekly","byWeekday":0}');
  const [editingBlockId, setEditingBlockId] = useState<number | null>(null);

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
    () => draft?.blocks.reduce((acc, b) => acc + Math.max(0, b.duration_minutes), 0) ?? 0,
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
        cursor = addMinutes(cursor, Math.max(0, b.duration_minutes));
        return { ...b, startsAt };
      });
  }, [draft]);

  const users = membersQ.data ?? [];
  const songs = songsQ.data ?? [];
  const templates = templatesQ.data ?? [];
  const blockTypes = blockTypesQ.data ?? [];

  const activeTemplate = useMemo(() => {
    const targetId = activeTemplateId ?? draft?.template_id ?? null;
    if (!targetId) return null;
    return templates.find((t) => t.id === targetId) ?? null;
  }, [activeTemplateId, draft?.template_id, templates]);

  const editingBlock = useMemo(
    () => draft?.blocks.find((b) => b.id === editingBlockId) ?? null,
    [draft, editingBlockId],
  );

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
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-3 py-4 sm:px-4 md:px-6">
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

      <section className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
        <div className="grid gap-2 md:grid-cols-3">
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
            onClick={() => {
              const status = draft.status === 'draft' ? 'published' : 'draft';
              setDraft({ ...draft, status });
              void updatePlanMut.mutateAsync({ id: draft.id, body: { status } });
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            <LuSave className="h-4 w-4" />
            {draft.status === 'draft' ? 'Опубликовать' : 'В черновик'}
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
                          'rounded-xl border border-stone-200 p-3',
                          dragSnapshot.isDragging ? 'bg-stone-50 shadow' : 'bg-white',
                          draft.current_block_id === block.id ? 'ring-2 ring-primary/30' : '',
                        ].join(' ')}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            {...dragProvided.dragHandleProps}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 text-stone-500"
                            aria-label="Перетащить блок"
                          >
                            <LuGripVertical className="h-4 w-4" />
                          </button>
                          <span className="w-14 text-sm font-bold text-stone-900">{block.startsAt}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-stone-900">{block.title}</p>
                            <p className="text-xs text-stone-500">
                              {blockTypes.find((t) => t.id === block.block_type_id)?.name ?? 'Блок'} •{' '}
                              {block.duration_minutes} мин
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setEditingBlockId(block.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-50"
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
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50"
                            aria-label="Удалить блок"
                          >
                            <LuTrash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => {
                              setDraft({ ...draft, current_block_id: block.id });
                              void updatePlanMut.mutateAsync({
                                id: draft.id,
                                body: { current_block_id: block.id },
                              });
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-stone-300 px-2 py-1 text-xs text-stone-700 hover:border-primary hover:text-primary"
                          >
                            <LuPlay className="h-3.5 w-3.5" />
                            Текущий
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
        deleteBlockMut.isPending) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs font-semibold text-amber-800">
          Сохраняю изменения...
        </div>
      )}

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
                value={editingBlock.title}
                onChange={(e) => updateDraftBlock(editingBlock.id, { title: e.target.value })}
                className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm sm:col-span-2"
                placeholder="Название блока"
              />
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
                  onChange={(e) =>
                    updateDraftBlock(editingBlock.id, { song_id: e.target.value ? Number(e.target.value) : null })
                  }
                  className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm sm:col-span-2"
                >
                  <option value="">Выберите песню</option>
                  {songs.map((s: SongListItem) => (
                    <option key={s.id} value={Number(s.id)}>
                      {s.title}
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
                  void updateBlockMut.mutateAsync({
                    id: editingBlock.id,
                    body: {
                      title: editingBlock.title,
                      block_type_id: editingBlock.block_type_id,
                      duration_minutes: editingBlock.duration_minutes,
                      assigned_member_id: editingBlock.assigned_member_id,
                      song_id: editingBlock.song_id,
                      content_json: editingBlock.content_json,
                    },
                  });
                  setEditingBlockId(null);
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-dark"
              >
                <LuSave className="h-4 w-4" />
                Сохранить блок
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
