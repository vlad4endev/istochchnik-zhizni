import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addMinutes, format, parse } from 'date-fns';
import {
  FaBookBible,
  FaBullhorn,
  FaCakeCandles,
  FaHandHoldingDollar,
  FaHandsPraying,
  FaMicrophoneLines,
  FaMusic,
  FaPuzzlePiece,
} from 'react-icons/fa6';
import { LuCalendarDays, LuLoaderCircle, LuSave } from 'react-icons/lu';
import type { IconType } from 'react-icons';
import { useParams } from 'react-router-dom';

import {
  fetchEditableServicePlan,
  patchEditableServicePlanBlockByToken,
  type EditableServicePlanPayload,
} from '../api';

type EditableBlock = EditableServicePlanPayload['blocks'][number];

const ICON_BY_CODE: Record<string, { Icon: IconType; wrapClass: string; iconClass: string }> = {
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

function isSeparator(content: Record<string, unknown>): boolean {
  return content.is_separator === true;
}

function parseStartClock(dateIso: string, time: string): Date {
  return parse(`${dateIso} ${time}`, 'yyyy-MM-dd HH:mm', new Date());
}

function blockNotes(content: Record<string, unknown>): string {
  if (typeof content.notes === 'string') return content.notes;
  if (typeof content.text === 'string') return content.text;
  return '';
}

export function EditableServicePlanPage() {
  const { token } = useParams<{ token: string }>();
  const qc = useQueryClient();
  const planQ = useQuery({
    queryKey: ['editable-service-plan', token],
    queryFn: () => fetchEditableServicePlan(token ?? ''),
    enabled: Boolean(token && token.length > 20),
    retry: false,
  });
  const [draftBlocks, setDraftBlocks] = useState<EditableBlock[]>([]);

  useEffect(() => {
    if (!planQ.data) return;
    setDraftBlocks(planQ.data.blocks.slice().sort((a, b) => a.order_index - b.order_index));
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
        const changedNotes = blockNotes(block.content_json) !== blockNotes(original.content_json);
        const changedSeparatorText =
          String(block.content_json.separator_text ?? '') !== String(original.content_json.separator_text ?? '');
        if (!changedTitle && !changedDuration && !changedNotes && !changedSeparatorText) continue;

        await patchEditableServicePlanBlockByToken(token, block.id, {
          title: block.title,
          duration_minutes: Math.max(1, Number(block.duration_minutes) || 1),
          content_json: {
            ...original.content_json,
            ...block.content_json,
          },
        });
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['editable-service-plan', token] });
    },
  });

  const rows = useMemo(() => {
    if (!planQ.data) return [];
    const { plan } = planQ.data;
    let cursor = parseStartClock(plan.service_date, plan.start_time);
    return draftBlocks.map((b) => {
      const startsAt = format(cursor, 'HH:mm');
      const separator = isSeparator(b.content_json);
      const duration = separator ? 0 : Math.max(0, b.duration_minutes);
      cursor = addMinutes(cursor, duration);
      return { ...b, startsAt, separator };
    });
  }, [draftBlocks, planQ.data]);

  if (!token) return <p className="p-6 text-red-600">Некорректная ссылка</p>;
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
        <p className="text-red-600">
          Ссылка недействительна или редактирование недоступно. Для опубликованной программы доступен только просмотр.
        </p>
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
      <div className="mx-auto max-w-3xl space-y-4 px-3 py-5 pb-[calc(92px+env(safe-area-inset-bottom))] sm:space-y-6 sm:px-4 sm:py-8 sm:pb-24">
        <header className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm sm:p-4">
          <h1 className="text-xl font-extrabold text-stone-900 sm:text-2xl">{plan.template_name ?? 'Программа служения'}</h1>
          <p className="mt-1 text-sm text-stone-600 sm:text-base">
            На собрание: <span className="font-semibold text-stone-800">{dateText}</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-600 sm:text-sm">
            <span className="rounded-full bg-stone-100 px-2 py-0.5">Старт: {plan.start_time}</span>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">Черновик · редактирование</span>
          </div>
        </header>

        <section className="space-y-2.5">
          {rows.map((b) => {
            if (b.separator) {
              return (
                <div key={b.id} className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-3 py-2.5">
                  <input
                    value={String(b.content_json.separator_text ?? b.title ?? '')}
                    onChange={(e) =>
                      setDraftBlocks((prev) =>
                        prev.map((x) =>
                          x.id === b.id
                            ? {
                                ...x,
                                title: e.target.value,
                                content_json: { ...x.content_json, separator_text: e.target.value },
                              }
                            : x,
                        ),
                      )
                    }
                    className="w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-center text-sm font-bold text-stone-800"
                  />
                </div>
              );
            }
            const iconMeta = ICON_BY_CODE[(b.block_type_code ?? '').toLowerCase()] ?? ICON_BY_CODE.custom;
            const Icon = iconMeta.Icon;
            return (
              <article key={b.id} className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm sm:p-4">
                <div className="flex items-start gap-2.5 sm:gap-3">
                  <div className="w-11 shrink-0 rounded-md bg-stone-100 px-1.5 py-1 text-center text-[11px] font-bold text-stone-700 sm:w-12 sm:bg-transparent sm:px-0 sm:py-0 sm:text-xs">
                    {b.startsAt}
                  </div>
                  <div className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconMeta.wrapClass}`}>
                    <Icon className={`h-4 w-4 ${iconMeta.iconClass}`} />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="grid gap-2 sm:grid-cols-[1fr_92px]">
                      <input
                        value={b.title}
                        onChange={(e) =>
                          setDraftBlocks((prev) =>
                            prev.map((x) => (x.id === b.id ? { ...x, title: e.target.value } : x)),
                          )
                        }
                        className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-900"
                      />
                      <input
                        type="number"
                        min={1}
                        max={180}
                        value={b.duration_minutes}
                        onChange={(e) =>
                          setDraftBlocks((prev) =>
                            prev.map((x) =>
                              x.id === b.id ? { ...x, duration_minutes: Math.max(1, Number(e.target.value) || 1) } : x,
                            ),
                          )
                        }
                        className="rounded-lg border border-stone-300 px-2 py-2 text-sm"
                      />
                    </div>
                    <p className="text-xs leading-snug text-stone-500">
                      {b.block_type_name ?? 'Блок'}
                      {b.assigned_member_name ? ` • ${b.assigned_member_name}` : ''}
                    </p>
                    <textarea
                      value={blockNotes(b.content_json)}
                      onChange={(e) =>
                        setDraftBlocks((prev) =>
                          prev.map((x) =>
                            x.id === b.id
                              ? { ...x, content_json: { ...x.content_json, notes: e.target.value } }
                              : x,
                          ),
                        )
                      }
                      className="min-h-[84px] w-full rounded-lg border border-stone-300 px-3 py-2 text-sm leading-relaxed text-stone-700"
                      placeholder="Заметка блока"
                    />
                  </div>
                </div>
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
