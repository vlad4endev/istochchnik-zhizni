import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useEffect, useMemo, useState } from 'react';
import {
  LuBookOpen,
  LuCalendarDays,
  LuGripVertical,
  LuListOrdered,
  LuPencil,
  LuPlus,
  LuTrash2,
  LuX,
} from 'react-icons/lu';

import { BodyPortal } from '../../components/BodyPortal';
import type { PrayerWatchTopic } from '../../types';
import {
  clearWatchTopicRosterOrderApi,
  createWatchTopicApi,
  deleteWatchTopicApi,
  fetchWatchTopicRoster,
  fetchWatchTopics,
  fetchWatchTopicWeek,
  saveWatchTopicRosterOrderApi,
  setWatchTopicDayOverrideApi,
  startWatchTopicCycleApi,
  updateWatchTopicApi,
} from '../calendar/watchTopicsApi';
import { apiErrorMessage } from './api';

const Q_TOPICS = ['admin', 'watch-topics'] as const;
const Q_ROSTER = ['admin', 'watch-topics', 'roster'] as const;
const Q_WEEK = ['admin', 'watch-topics', 'week'] as const;

type TopicDraft = {
  id: number | null;
  title: string;
  bible_verse: string;
  prayer_points: string;
  notes: string;
  is_active: boolean;
};

function fieldClass() {
  return (
    'w-full rounded-xl border border-stone-200/90 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none ' +
    'focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-stone-400'
  );
}

function btnPrimary(className = '') {
  return `inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:opacity-95 disabled:opacity-50 ${className}`;
}

function btnSecondary(className = '') {
  return `inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 disabled:opacity-50 ${className}`;
}

function emptyDraft(): TopicDraft {
  return {
    id: null,
    title: '',
    bible_verse: '',
    prayer_points: '',
    notes: '',
    is_active: true,
  };
}

function reorderArray<T>(list: T[], startIndex: number, endIndex: number): T[] {
  const result = Array.from(list);
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
}

function previewText(value: string | null | undefined, max = 120): string {
  const text = (value ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

type PanelTab = 'topics' | 'queue' | 'schedule';

/**
 * Раздел управления молитвенными темами страж:
 * каталог, дата старта цикла, очередь на цикл, расписание недели.
 */
export function WatchTopicsSection({ compact = false }: { compact?: boolean }) {
  const qc = useQueryClient();
  const todayYmd = format(new Date(), 'yyyy-MM-dd');
  const [panel, setPanel] = useState<PanelTab>('topics');
  const [startDate, setStartDate] = useState(todayYmd);
  const [weekKind, setWeekKind] = useState<'current' | 'next'>('current');
  const [editor, setEditor] = useState<TopicDraft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PrayerWatchTopic | null>(null);
  const [note, setNote] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const topicsQ = useQuery({ queryKey: Q_TOPICS, queryFn: () => fetchWatchTopics(true) });
  const rosterQ = useQuery({
    queryKey: [...Q_ROSTER, todayYmd] as const,
    queryFn: () => fetchWatchTopicRoster(todayYmd),
  });
  const weekQ = useQuery({
    queryKey: [...Q_WEEK, weekKind] as const,
    queryFn: () => fetchWatchTopicWeek(weekKind),
  });

  useEffect(() => {
    if (rosterQ.data?.start_date) {
      setStartDate(rosterQ.data.start_date);
    }
  }, [rosterQ.data?.start_date]);

  useEffect(() => {
    if (!editor && !pendingDelete) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditor(null);
        setPendingDelete(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor, pendingDelete]);

  const invalidateAll = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: Q_TOPICS }),
      qc.invalidateQueries({ queryKey: Q_ROSTER }),
      qc.invalidateQueries({ queryKey: Q_WEEK }),
      qc.invalidateQueries({ queryKey: ['calendar'] }),
    ]);
  };

  const startMut = useMutation({
    mutationFn: () => startWatchTopicCycleApi(startDate.trim()),
    onSuccess: async (d) => {
      setNote({ type: 'ok', text: `Цикл тем страж отсчитывается с ${d.start_date}.` });
      await invalidateAll();
    },
    onError: (e) =>
      setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось сохранить дату старта.') }),
  });

  const saveTopicMut = useMutation({
    mutationFn: async (draft: TopicDraft) => {
      const body = {
        title: draft.title.trim(),
        bible_verse: draft.bible_verse.trim() || null,
        prayer_points: draft.prayer_points.trim() || null,
        notes: draft.notes.trim() || null,
        is_active: draft.is_active,
      };
      if (draft.id == null) return createWatchTopicApi(body);
      return updateWatchTopicApi(draft.id, body);
    },
    onSuccess: async (_d, draft) => {
      setEditor(null);
      setNote({
        type: 'ok',
        text: draft.id == null ? 'Тема добавлена в каталог.' : 'Тема обновлена.',
      });
      await invalidateAll();
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось сохранить тему.') }),
  });

  const deleteMut = useMutation({
    mutationFn: (item: PrayerWatchTopic) => deleteWatchTopicApi(item.id),
    onSuccess: async () => {
      setPendingDelete(null);
      setNote({ type: 'ok', text: 'Тема удалена.' });
      await invalidateAll();
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось удалить тему.') }),
  });

  const saveOrderMut = useMutation({
    mutationFn: (orderedIds: number[]) =>
      saveWatchTopicRosterOrderApi({
        anchor_date: todayYmd,
        ordered_topic_ids: orderedIds,
      }),
    onSuccess: async () => {
      setNote({
        type: 'ok',
        text: 'Порядок очереди на этот цикл сохранён. На новом цикле снова действует порядок каталога.',
      });
      await invalidateAll();
    },
    onError: (e) =>
      setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось сохранить порядок.') }),
  });

  const clearOrderMut = useMutation({
    mutationFn: () => clearWatchTopicRosterOrderApi(todayYmd),
    onSuccess: async () => {
      setNote({ type: 'ok', text: 'Очередь сброшена к порядку каталога (sort_order).' });
      await invalidateAll();
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось сбросить порядок.') }),
  });

  const overrideMut = useMutation({
    mutationFn: (p: { date: string; topic_id: number | null }) =>
      setWatchTopicDayOverrideApi(p.date, p.topic_id),
    onSuccess: async () => {
      setNote({ type: 'ok', text: 'Назначение на день обновлено.' });
      await invalidateAll();
    },
    onError: (e) =>
      setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось изменить день.') }),
  });

  const activeTopics = useMemo(
    () => (topicsQ.data ?? []).filter((t) => t.is_active),
    [topicsQ.data],
  );

  const handleRosterDragEnd = (result: DropResult) => {
    const roster = rosterQ.data?.roster;
    if (!result.destination || !roster?.length) return;
    if (result.source.index === result.destination.index) return;
    const ids = roster.map((e) => e.id);
    const next = reorderArray(ids, result.source.index, result.destination.index);
    setNote(null);
    saveOrderMut.mutate(next);
  };

  const tabs: { id: PanelTab; label: string; Icon: typeof LuBookOpen }[] = [
    { id: 'topics', label: 'Каталог', Icon: LuBookOpen },
    { id: 'queue', label: 'Очередь цикла', Icon: LuListOrdered },
    { id: 'schedule', label: 'Расписание', Icon: LuCalendarDays },
  ];

  return (
    <div className="space-y-5">
      {!compact ? (
        <div>
          <h2 className="text-lg font-semibold text-stone-900">Темы молитвенных страж</h2>
          <p className="mt-1 text-sm text-stone-600">
            Ежедневные молитвенные темы для утренней и вечерней стражи. Добавляйте темы вручную,
            задайте дату старта цикла и распределите очередь — как в молитвенном календаре.
            Кто может редактировать — в «Права ролей» → «Темы молитвенных страж».
          </p>
        </div>
      ) : null}

      {note ? (
        <div
          className={
            note.type === 'ok'
              ? 'flex justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900'
              : 'flex justify-between gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900'
          }
          role="status"
        >
          <span>{note.text}</span>
          <button type="button" className="text-stone-500 hover:text-stone-800" onClick={() => setNote(null)}>
            <LuX className="h-4 w-4" aria-hidden />
            <span className="sr-only">Закрыть</span>
          </button>
        </div>
      ) : null}

      <section className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-stone-900">Дата старта цикла</h3>
        <p className="mt-1 text-xs text-stone-500">
          С этой даты темы идут по кругу: день 1 — первая в очереди, затем следующая, и снова с
          начала после полного прохода.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">Дата начала</span>
            <input
              type="date"
              className="h-[42px] w-[220px] rounded-lg border border-stone-200 bg-white px-3.5 text-[15px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <button
            type="button"
            className={btnPrimary('bg-[#7B2D3F]')}
            disabled={startMut.isPending}
            onClick={() => {
              setNote(null);
              startMut.mutate();
            }}
          >
            {startMut.isPending ? 'Сохранение…' : 'Сохранить дату'}
          </button>
          {rosterQ.data ? (
            <p className="text-xs text-stone-500">
              Цикл №{rosterQ.data.cycle_index + 1} · в очереди{' '}
              <span className="font-semibold text-stone-700">{rosterQ.data.total}</span>
              {rosterQ.data.has_custom_roster_order ? ' · свой порядок' : ''}
            </p>
          ) : null}
        </div>
      </section>

      <div
        className="inline-flex w-full max-w-xl rounded-xl border border-stone-200 bg-stone-50/80 p-1"
        role="tablist"
        aria-label="Разделы тем страж"
      >
        {tabs.map(({ id, label, Icon }) => {
          const active = panel === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              className={[
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition sm:text-sm',
                active ? 'bg-white text-[#7B2D3F] shadow-sm' : 'text-stone-500 hover:text-stone-800',
              ].join(' ')}
              onClick={() => setPanel(id)}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>

      {panel === 'topics' ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-stone-600">
              Активных: <span className="font-semibold text-stone-900">{activeTopics.length}</span>
              {' · '}всего: {topicsQ.data?.length ?? 0}
            </p>
            <button
              type="button"
              className={btnPrimary()}
              onClick={() => {
                setNote(null);
                setEditor(emptyDraft());
              }}
            >
              <LuPlus className="h-4 w-4" aria-hidden />
              Новая тема
            </button>
          </div>

          {topicsQ.isLoading ? (
            <p className="text-sm text-stone-500">Загрузка…</p>
          ) : topicsQ.isError ? (
            <p className="text-sm text-red-600">Не удалось загрузить темы.</p>
          ) : (topicsQ.data ?? []).length === 0 ? (
            <p className="rounded-xl border border-dashed border-stone-200 px-4 py-8 text-center text-sm text-stone-500">
              Пока нет тем. Добавьте первую — она сразу войдёт в ежедневный цикл страж.
            </p>
          ) : (
            <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200/80 bg-white">
              {(topicsQ.data ?? []).map((topic) => (
                <li key={topic.id} className="flex flex-wrap items-start gap-3 px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold text-stone-900">{topic.title}</h4>
                      {!topic.is_active ? (
                        <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-stone-500">
                          выкл
                        </span>
                      ) : null}
                    </div>
                    {topic.bible_verse ? (
                      <p className="mt-1 text-sm italic text-stone-600">
                        {previewText(topic.bible_verse)}
                      </p>
                    ) : null}
                    {topic.prayer_points ? (
                      <p className="mt-1 text-sm text-stone-500">
                        {previewText(topic.prayer_points)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      className={btnSecondary('!px-2.5')}
                      title="Редактировать"
                      onClick={() =>
                        setEditor({
                          id: topic.id,
                          title: topic.title,
                          bible_verse: topic.bible_verse ?? '',
                          prayer_points: topic.prayer_points ?? '',
                          notes: topic.notes ?? '',
                          is_active: topic.is_active,
                        })
                      }
                    >
                      <LuPencil className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={btnSecondary('!px-2.5 text-red-600 hover:bg-red-50')}
                      title="Удалить"
                      onClick={() => setPendingDelete(topic)}
                    >
                      <LuTrash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {panel === 'queue' ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-stone-600">
              Перетащите темы, чтобы задать порядок на текущий цикл. Неактивные в очередь не
              входят.
            </p>
            <button
              type="button"
              className={btnSecondary()}
              disabled={clearOrderMut.isPending || !rosterQ.data?.has_custom_roster_order}
              onClick={() => clearOrderMut.mutate()}
            >
              Сбросить к каталогу
            </button>
          </div>

          {rosterQ.isLoading ? (
            <p className="text-sm text-stone-500">Загрузка очереди…</p>
          ) : !rosterQ.data?.roster.length ? (
            <p className="rounded-xl border border-dashed border-stone-200 px-4 py-8 text-center text-sm text-stone-500">
              Нет активных тем — сначала добавьте темы в каталог.
            </p>
          ) : (
            <DragDropContext onDragEnd={handleRosterDragEnd}>
              <Droppable droppableId="watch-topics-roster">
                {(provided) => (
                  <ul
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200/80 bg-white"
                  >
                    {rosterQ.data!.roster.map((entry, index) => {
                      const isToday = entry.id === rosterQ.data?.today_topic_id;
                      return (
                        <Draggable key={entry.id} draggableId={String(entry.id)} index={index}>
                          {(drag) => (
                            <li
                              ref={drag.innerRef}
                              {...drag.draggableProps}
                              className={[
                                'flex items-center gap-3 px-3 py-3',
                                isToday ? 'bg-[#7B2D3F]/[0.06]' : '',
                              ].join(' ')}
                            >
                              <button
                                type="button"
                                className="cursor-grab touch-none text-stone-400 active:cursor-grabbing"
                                aria-label="Перетащить"
                                {...drag.dragHandleProps}
                              >
                                <LuGripVertical className="h-5 w-5" />
                              </button>
                              <span className="w-7 shrink-0 text-center text-xs font-bold tabular-nums text-stone-400">
                                {index + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-stone-900">
                                  {entry.title}
                                  {isToday ? (
                                    <span className="ml-2 text-xs font-bold text-[#7B2D3F]">
                                      сегодня
                                    </span>
                                  ) : null}
                                </p>
                              </div>
                            </li>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </ul>
                )}
              </Droppable>
            </DragDropContext>
          )}
          {saveOrderMut.isPending ? (
            <p className="text-xs text-stone-500">Сохраняем порядок…</p>
          ) : null}
        </section>
      ) : null}

      {panel === 'schedule' ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex rounded-xl border border-stone-200 bg-stone-50/80 p-1"
              role="group"
              aria-label="Неделя"
            >
              {(
                [
                  { id: 'current' as const, label: 'Эта неделя' },
                  { id: 'next' as const, label: 'Следующая' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={[
                    'rounded-lg px-3 py-1.5 text-xs font-semibold transition sm:text-sm',
                    weekKind === opt.id
                      ? 'bg-white text-[#7B2D3F] shadow-sm'
                      : 'text-stone-500 hover:text-stone-800',
                  ].join(' ')}
                  onClick={() => setWeekKind(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-stone-500">
              Можно вручную назначить тему на день (оверрайд цикла).
            </p>
          </div>

          {weekQ.isLoading ? (
            <p className="text-sm text-stone-500">Загрузка расписания…</p>
          ) : (
            <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200/80 bg-white">
              {(weekQ.data?.days ?? []).map((day) => {
                const label = format(new Date(`${day.date}T12:00:00`), 'EEEE, d MMMM', {
                  locale: ru,
                });
                return (
                  <li
                    key={day.date}
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold capitalize text-stone-900">{label}</p>
                      <p className="text-xs text-stone-500">
                        {day.is_override ? 'Ручное назначение' : 'По циклу'}
                        {day.cycle ? ` · день ${day.cycle.day_index + 1}/${day.cycle.topic_count}` : ''}
                      </p>
                    </div>
                    <label className="block w-full sm:max-w-xs">
                      <span className="sr-only">Тема на {day.date}</span>
                      <select
                        className={fieldClass()}
                        value={day.topic?.id ?? ''}
                        disabled={overrideMut.isPending}
                        onChange={(e) => {
                          const v = e.target.value;
                          overrideMut.mutate({
                            date: day.date,
                            topic_id: v === '' ? null : Number(v),
                          });
                        }}
                      >
                        <option value="">— по циклу / нет —</option>
                        {activeTopics.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {editor ? (
        <BodyPortal>
          <div
            className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="watch-topic-editor-title"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setEditor(null);
            }}
          >
            <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
              <div className="mb-4 flex items-start justify-between gap-3">
                <h3 id="watch-topic-editor-title" className="text-base font-semibold text-stone-900">
                  {editor.id == null ? 'Новая тема стражи' : 'Редактирование темы'}
                </h3>
                <button type="button" className={btnSecondary('!px-2.5')} onClick={() => setEditor(null)}>
                  <LuX className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <div className="space-y-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-stone-700">Название *</span>
                  <input
                    className={fieldClass()}
                    value={editor.title}
                    onChange={(e) => setEditor({ ...editor, title: e.target.value })}
                    placeholder="Например: Молитва о пробуждении"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-stone-700">Стих / основание</span>
                  <textarea
                    className={`${fieldClass()} min-h-[72px] resize-y`}
                    value={editor.bible_verse}
                    onChange={(e) => setEditor({ ...editor, bible_verse: e.target.value })}
                    placeholder="Библейский стих или основание…"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-stone-700">Пункты молитвы</span>
                  <textarea
                    className={`${fieldClass()} min-h-[100px] resize-y`}
                    value={editor.prayer_points}
                    onChange={(e) => setEditor({ ...editor, prayer_points: e.target.value })}
                    placeholder="За что молимся на страже…"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-stone-700">Заметки ведущему</span>
                  <textarea
                    className={`${fieldClass()} min-h-[64px] resize-y`}
                    value={editor.notes}
                    onChange={(e) => setEditor({ ...editor, notes: e.target.value })}
                    placeholder="Внутренние подсказки (необязательно)…"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
                  <input
                    type="checkbox"
                    checked={editor.is_active}
                    onChange={(e) => setEditor({ ...editor, is_active: e.target.checked })}
                    className="h-4 w-4 rounded border-stone-300 text-primary focus:ring-primary/30"
                  />
                  Участвует в ежедневном цикле
                </label>
              </div>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button type="button" className={btnSecondary()} onClick={() => setEditor(null)}>
                  Отмена
                </button>
                <button
                  type="button"
                  className={btnPrimary()}
                  disabled={saveTopicMut.isPending || !editor.title.trim()}
                  onClick={() => saveTopicMut.mutate(editor)}
                >
                  {saveTopicMut.isPending ? 'Сохранение…' : 'Сохранить'}
                </button>
              </div>
            </div>
          </div>
        </BodyPortal>
      ) : null}

      {pendingDelete ? (
        <BodyPortal>
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setPendingDelete(null);
            }}
          >
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
              <h3 className="text-base font-semibold text-stone-900">Удалить тему?</h3>
              <p className="mt-2 text-sm text-stone-600">
                «{pendingDelete.title}» будет удалена из каталога и расписания. Это нельзя отменить.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" className={btnSecondary()} onClick={() => setPendingDelete(null)}>
                  Отмена
                </button>
                <button
                  type="button"
                  className={btnPrimary('bg-red-600 shadow-red-600/20')}
                  disabled={deleteMut.isPending}
                  onClick={() => deleteMut.mutate(pendingDelete)}
                >
                  {deleteMut.isPending ? 'Удаление…' : 'Удалить'}
                </button>
              </div>
            </div>
          </div>
        </BodyPortal>
      ) : null}
    </div>
  );
}
