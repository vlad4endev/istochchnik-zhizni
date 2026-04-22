import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LuLoaderCircle, LuSave } from 'react-icons/lu';
import { useParams } from 'react-router-dom';

import {
  fetchEditableServicePlan,
  patchEditableServicePlanBlockByToken,
  type EditableServicePlanPayload,
} from '../api';

type EditableBlock = EditableServicePlanPayload['blocks'][number];

function isSeparator(content: Record<string, unknown>): boolean {
  return content.is_separator === true;
}

function normalizeNotes(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function EditableServicePlanPage() {
  const { token } = useParams<{ token: string }>();
  const qc = useQueryClient();
  const planQ = useQuery({
    queryKey: ['editable-service-plan', token],
    queryFn: () => fetchEditableServicePlan(token ?? ''),
    enabled: Boolean(token && token.length > 20),
  });
  const [draftBlocks, setDraftBlocks] = useState<EditableBlock[]>([]);

  useEffect(() => {
    if (planQ.data) {
      setDraftBlocks(planQ.data.blocks.slice().sort((a, b) => a.order_index - b.order_index));
    }
  }, [planQ.data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!token || !planQ.data) return;
      const originalById = new Map(planQ.data.blocks.map((b) => [b.id, b] as const));
      for (const block of draftBlocks) {
        const original = originalById.get(block.id);
        if (!original) continue;
        const changedTitle = block.title !== original.title;
        const changedDuration = block.duration_minutes !== original.duration_minutes;
        const nextNotes = normalizeNotes(block.content_json.notes);
        const prevNotes = normalizeNotes(original.content_json.notes);
        const changedNotes = nextNotes !== prevNotes;
        if (!changedTitle && !changedDuration && !changedNotes) continue;

        await patchEditableServicePlanBlockByToken(token, block.id, {
          title: block.title,
          duration_minutes: block.duration_minutes,
          content_json: {
            ...original.content_json,
            ...block.content_json,
            notes: nextNotes,
          },
        });
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['editable-service-plan', token] });
    },
  });

  const totalDuration = useMemo(
    () =>
      draftBlocks.reduce((sum, b) => {
        if (isSeparator(b.content_json)) return sum;
        return sum + Math.max(0, Number(b.duration_minutes) || 0);
      }, 0),
    [draftBlocks],
  );

  if (!token) {
    return <p className="p-6 text-red-600">Некорректная ссылка</p>;
  }
  if (planQ.isLoading) {
    return (
      <div className="flex min-h-[40dvh] items-center justify-center text-stone-500">
        Загрузка программы...
      </div>
    );
  }
  if (planQ.isError || !planQ.data) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <p className="text-red-600">Ссылка недействительна или программа не найдена.</p>
      </div>
    );
  }

  const { plan } = planQ.data;
  const dateText = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${plan.service_date}T12:00:00`));

  return (
    <div className="min-h-[100dvh] bg-[var(--surface)]">
      <div className="mx-auto max-w-3xl space-y-4 px-3 py-5 pb-[calc(88px+env(safe-area-inset-bottom))] sm:px-4 sm:py-8">
        <header className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <h1 className="text-xl font-extrabold text-stone-900 sm:text-2xl">{plan.template_name ?? 'Программа служения'}</h1>
          <p className="mt-1 text-sm text-stone-600">
            {dateText} · Старт {plan.start_time} · {totalDuration} мин
          </p>
          <p className="mt-2 text-xs text-stone-500">Режим совместного редактирования: только блоки программы.</p>
        </header>

        <section className="space-y-2.5">
          {draftBlocks.map((block) => {
            const separator = isSeparator(block.content_json);
            const notes = normalizeNotes(block.content_json.notes);
            return (
              <article key={block.id} className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm sm:p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    {block.block_type_name ?? 'Блок'}
                  </p>
                  <p className="text-xs text-stone-500">#{block.order_index + 1}</p>
                </div>

                {separator ? (
                  <input
                    value={String(block.content_json.separator_text ?? block.title ?? '')}
                    onChange={(e) =>
                      setDraftBlocks((prev) =>
                        prev.map((x) =>
                          x.id === block.id
                            ? {
                                ...x,
                                title: e.target.value,
                                content_json: { ...x.content_json, separator_text: e.target.value },
                              }
                            : x,
                        ),
                      )
                    }
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                    placeholder="Название разделителя"
                  />
                ) : (
                  <div className="grid gap-2 sm:grid-cols-4">
                    <input
                      value={block.title}
                      onChange={(e) =>
                        setDraftBlocks((prev) =>
                          prev.map((x) => (x.id === block.id ? { ...x, title: e.target.value } : x)),
                        )
                      }
                      className="rounded-lg border border-stone-300 px-3 py-2 text-sm sm:col-span-3"
                      placeholder="Название блока"
                    />
                    <input
                      type="number"
                      min={1}
                      max={180}
                      value={block.duration_minutes}
                      onChange={(e) =>
                        setDraftBlocks((prev) =>
                          prev.map((x) =>
                            x.id === block.id
                              ? { ...x, duration_minutes: Math.max(1, Number(e.target.value) || 1) }
                              : x,
                          ),
                        )
                      }
                      className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
                      placeholder="Мин"
                    />
                    <textarea
                      value={notes}
                      onChange={(e) =>
                        setDraftBlocks((prev) =>
                          prev.map((x) =>
                            x.id === block.id
                              ? { ...x, content_json: { ...x.content_json, notes: e.target.value } }
                              : x,
                          ),
                        )
                      }
                      className="min-h-[84px] rounded-lg border border-stone-300 px-3 py-2 text-sm sm:col-span-4"
                      placeholder="Заметка блока"
                    />
                  </div>
                )}
              </article>
            );
          })}
        </section>

        <div className="sticky bottom-3 z-10 flex justify-end">
          <button
            type="button"
            onClick={() => void saveMut.mutateAsync()}
            disabled={saveMut.isPending}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saveMut.isPending ? <LuLoaderCircle className="h-4 w-4 animate-spin" /> : <LuSave className="h-4 w-4" />}
            {saveMut.isPending ? 'Сохраняю...' : 'Сохранить изменения'}
          </button>
        </div>
      </div>
    </div>
  );
}
