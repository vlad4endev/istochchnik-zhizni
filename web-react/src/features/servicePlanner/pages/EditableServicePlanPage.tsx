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
  FaWineGlass,
} from 'react-icons/fa6';
import { LuCalendarDays, LuLoaderCircle, LuPencil, LuSave } from 'react-icons/lu';
import type { IconType } from 'react-icons';
import { useParams } from 'react-router-dom';

import {
  fetchEditableServicePlan,
  fetchEditableServicePlanMeta,
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
  communion: { Icon: FaWineGlass, wrapClass: 'bg-purple-100', iconClass: 'text-purple-700' },
  custom: { Icon: FaPuzzlePiece, wrapClass: 'bg-stone-200', iconClass: 'text-stone-700' },
};

function isSeparator(content: Record<string, unknown>): boolean {
  return content.is_separator === true;
}

function parseStartClock(dateIso: string, time: string): Date {
  return parse(`${dateIso} ${time}`, 'yyyy-MM-dd HH:mm', new Date());
}

function blockNote(content: Record<string, unknown>): string {
  if (typeof content.notes === 'string') return content.notes;
  if (typeof content.text === 'string') return content.text;
  return '';
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

function songBlockTitle(song: { title: string; default_key: string | null }): string {
  const key = String(song.default_key ?? '').trim();
  return key ? `${song.title} [${key}]` : song.title;
}

function userLabel(u: { first_name: string | null; last_name: string | null; name: string; id: number }): string {
  const full = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim();
  return full || u.name || `Пользователь #${u.id}`;
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
    retry: false,
  });
  const metaQ = useQuery({
    queryKey: ['editable-service-plan-meta', token],
    queryFn: () => fetchEditableServicePlanMeta(token ?? ''),
    enabled: Boolean(token && token.length > 20),
    retry: false,
  });

  useEffect(() => {
    if (!planQ.data) return;
    setDraftBlocks(planQ.data.blocks.slice().sort((a, b) => a.order_index - b.order_index));
  }, [planQ.data]);

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
      await patchEditableServicePlanBlockByToken(token, block.id, {
        title: block.title,
        duration_minutes: Math.max(1, Number(block.duration_minutes) || 1),
        block_type_id: block.block_type_id,
        assigned_member_id: block.assigned_member_id,
        song_id: block.song_id,
        content_json: block.content_json,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['editable-service-plan', token] }),
        qc.invalidateQueries({ queryKey: ['editable-service-plan-meta', token] }),
      ]);
      setEditingBlockId(null);
    },
  });

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
  if (planQ.isError || !planQ.data || metaQ.isError || !metaQ.data) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <p className="text-red-600">
          Ссылка недействительна или редактирование недоступно. Для опубликованных программ доступен только просмотр.
        </p>
      </div>
    );
  }

  const { plan } = planQ.data;
  const { block_types: blockTypes, members, songs } = metaQ.data;
  const dateText = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${plan.service_date}T12:00:00`));

  return (
    <div className="min-h-[100dvh] bg-[var(--surface)]">
      <div className="mx-auto max-w-3xl space-y-4 px-3 py-5 pb-[calc(96px+env(safe-area-inset-bottom))] sm:space-y-6 sm:px-4 sm:py-8 sm:pb-24">
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
            const iconMeta = ICON_BY_CODE[(b.block_type_code ?? '').toLowerCase()] ?? ICON_BY_CODE.custom;
            const Icon = iconMeta.Icon;
            const birthdays = birthdayRows(b.content_json);
            const schedule = scheduleRows(b.content_json);
            return (
              <article
                key={b.id}
                className={`rounded-xl border bg-white shadow-sm ${
                  editingBlockId === b.id ? 'border-primary/60' : 'border-stone-200'
                } p-3 sm:p-4`}
              >
                <div className="flex items-start gap-2.5 sm:gap-3">
                  <div className="w-11 shrink-0 rounded-md bg-stone-100 px-1.5 py-1 text-center text-[11px] font-bold text-stone-700 sm:w-12 sm:bg-transparent sm:px-0 sm:py-0 sm:text-xs">
                    {b.startsAt}
                  </div>
                  <div className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconMeta.wrapClass}`}>
                    <Icon className={`h-4 w-4 ${iconMeta.iconClass}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="text-[15px] font-bold leading-snug text-stone-900 sm:text-base">{b.title}</h2>
                        <p className="text-xs text-stone-500">
                          {b.block_type_name ?? 'Блок'} • {b.duration_minutes} мин
                          {b.assigned_member_name ? ` • ${b.assigned_member_name}` : ''}
                        </p>
                        {birthdays.length > 0 ? (
                          <p className="mt-1 text-xs leading-snug text-stone-600">
                            Именинники: {birthdays.join(' • ')}
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
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingBlockId((prev) => (prev === b.id ? null : b.id))}
                        className="inline-flex items-center gap-1 rounded-lg border border-stone-300 px-2.5 py-1 text-xs font-semibold text-stone-700 hover:border-primary hover:text-primary"
                      >
                        <LuPencil className="h-3.5 w-3.5" />
                        {editingBlockId === b.id ? 'Скрыть' : 'Редактировать'}
                      </button>
                    </div>

                    {editingBlockId === b.id && editingBlock ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <select
                          value={editingBlock.block_type_id}
                          onChange={(e) => {
                            const nextTypeId = Number(e.target.value) || editingBlock.block_type_id;
                            const nextType = blockTypes.find((x) => x.id === nextTypeId);
                            setDraftBlocks((prev) =>
                              prev.map((x) =>
                                x.id === editingBlock.id
                                  ? {
                                      ...x,
                                      block_type_id: nextTypeId,
                                      block_type_code: nextType?.code ?? x.block_type_code,
                                      block_type_name: nextType?.name ?? x.block_type_name,
                                      song_id: nextType?.kind === 'song' ? x.song_id : null,
                                    }
                                  : x,
                              ),
                            );
                          }}
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
                            setDraftBlocks((prev) =>
                              prev.map((x) =>
                                x.id === editingBlock.id
                                  ? { ...x, duration_minutes: Math.max(1, Number(e.target.value) || 1) }
                                  : x,
                              ),
                            )
                          }
                          className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
                        />
                        <input
                          value={editingBlock.title}
                          onChange={(e) =>
                            setDraftBlocks((prev) =>
                              prev.map((x) => (x.id === editingBlock.id ? { ...x, title: e.target.value } : x)),
                            )
                          }
                          className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm sm:col-span-2"
                          placeholder="Заголовок блока"
                        />
                        <select
                          value={editingBlock.assigned_member_id ?? ''}
                          onChange={(e) => {
                            const memberId = e.target.value ? Number(e.target.value) : null;
                            const member = memberId ? members.find((u) => u.id === memberId) : null;
                            setDraftBlocks((prev) =>
                              prev.map((x) =>
                                x.id === editingBlock.id
                                  ? {
                                      ...x,
                                      assigned_member_id: memberId,
                                      assigned_member_name: member ? userLabel(member) : null,
                                    }
                                  : x,
                              ),
                            );
                          }}
                          className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
                        >
                          <option value="">Ответственный не назначен</option>
                          {members.map((u) => (
                            <option key={u.id} value={u.id}>
                              {userLabel(u)}
                            </option>
                          ))}
                        </select>
                        {(blockTypes.find((t) => t.id === editingBlock.block_type_id)?.kind ?? 'custom') === 'song' ? (
                          <select
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
                            className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
                          >
                            <option value="">Песня не назначена</option>
                            {songs.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.default_key ? `${s.title} [${s.default_key}]` : s.title}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-2 py-1.5 text-xs text-stone-500">
                            Для этого типа блока выбор песни не используется.
                          </div>
                        )}
                        <textarea
                          value={blockNote(editingBlock.content_json)}
                          onChange={(e) =>
                            setDraftBlocks((prev) =>
                              prev.map((x) =>
                                x.id === editingBlock.id
                                  ? { ...x, content_json: { ...x.content_json, notes: e.target.value } }
                                  : x,
                              ),
                            )
                          }
                          className="min-h-[84px] rounded-lg border border-stone-300 px-2 py-1.5 text-sm sm:col-span-2"
                          placeholder="Заметка блока"
                        />
                        {birthdayRows(editingBlock.content_json).length > 0 ? (
                          <div className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-2 text-xs text-stone-600 sm:col-span-2">
                            <p className="font-semibold">Именинники недели:</p>
                            <p className="mt-1">{birthdayRows(editingBlock.content_json).join(' • ')}</p>
                          </div>
                        ) : null}
                        {scheduleRows(editingBlock.content_json).length > 0 ? (
                          <div className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-2 text-xs text-stone-600 sm:col-span-2">
                            <p className="font-semibold">Расписание:</p>
                            <ul className="mt-1 space-y-0.5">
                              {scheduleRows(editingBlock.content_json).map((line) => (
                                <li key={line}>{line}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        <div className="sm:col-span-2 flex justify-end">
                          <button
                            type="button"
                            onClick={() => void saveBlockMut.mutateAsync(editingBlock)}
                            disabled={saveBlockMut.isPending}
                            className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {saveBlockMut.isPending ? (
                              <LuLoaderCircle className="h-4 w-4 animate-spin" />
                            ) : (
                              <LuSave className="h-4 w-4" />
                            )}
                            Сохранить блок
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
}
