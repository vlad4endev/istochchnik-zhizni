import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { LuCalendarPlus, LuLoaderCircle, LuX } from 'react-icons/lu';

import {
  apiErrorMessage,
  createAdminEvent,
  fetchChurchEventCategoryOptions,
  uploadChurchEventPoster,
} from '@/features/admin/api';
import { CHURCH_EVENT_CATEGORY_OPTIONS_FALLBACK } from '@/features/admin/churchEventCategoryOptions';
import { nextOccurrenceLocalYmd } from '@/lib/weekdayAnchor';

const WEEKDAY_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Воскресенье' },
  { value: 1, label: 'Понедельник' },
  { value: 2, label: 'Вторник' },
  { value: 3, label: 'Среда' },
  { value: 4, label: 'Четверг' },
  { value: 5, label: 'Пятница' },
  { value: 6, label: 'Суббота' },
];

function todayYmd(): string {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, '0');
  const d = String(t.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

export function CreateChurchEventModal({ open, onClose, onCreated }: Props) {
  const categoryOptsQ = useQuery({
    queryKey: ['calendar', 'event-category-options', 'create-modal'],
    queryFn: fetchChurchEventCategoryOptions,
    enabled: open,
    staleTime: 300_000,
  });

  const categoryOptions =
    categoryOptsQ.data && categoryOptsQ.data.length > 0
      ? categoryOptsQ.data
      : CHURCH_EVENT_CATEGORY_OPTIONS_FALLBACK;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState(todayYmd);
  const [eventTime, setEventTime] = useState('11:00');
  const [recurrenceType, setRecurrenceType] = useState<'once' | 'weekly'>('once');
  const [weeklyDay, setWeeklyDay] = useState(0);
  const [activeFrom, setActiveFrom] = useState('');
  const [activeTo, setActiveTo] = useState('');
  const [skipSummerBreak, setSkipSummerBreak] = useState(false);
  const [category, setCategory] = useState(categoryOptions[0]?.id ?? 'service');
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setDescription('');
    const d = todayYmd();
    setEventDate(d);
    setEventTime('11:00');
    setRecurrenceType('once');
    setWeeklyDay(0);
    setActiveFrom('');
    setActiveTo('');
    setSkipSummerBreak(false);
    setPosterFile(null);
    setLocalError(null);
    setCategory(CHURCH_EVENT_CATEGORY_OPTIONS_FALLBACK[0]?.id ?? 'service');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const opts =
      categoryOptsQ.data && categoryOptsQ.data.length > 0
        ? categoryOptsQ.data
        : CHURCH_EVENT_CATEGORY_OPTIONS_FALLBACK;
    const ids = new Set(opts.map((o) => o.id));
    setCategory((c) => (ids.has(c) ? c : opts[0]?.id ?? 'service'));
  }, [open, categoryOptsQ.data]);

  useEffect(() => {
    if (recurrenceType !== 'weekly') return;
    setEventDate(nextOccurrenceLocalYmd(weeklyDay));
  }, [recurrenceType, weeklyDay]);

  const posterPreviewUrl = useMemo(
    () => (posterFile ? URL.createObjectURL(posterFile) : null),
    [posterFile],
  );
  useEffect(() => {
    return () => {
      if (posterPreviewUrl) URL.revokeObjectURL(posterPreviewUrl);
    };
  }, [posterPreviewUrl]);

  const createMut = useMutation({
    mutationFn: async () => {
      let poster_url: string | null | undefined;
      if (posterFile) {
        const up = await uploadChurchEventPoster(posterFile);
        poster_url = up.poster_url;
      }
      const fromYmd = activeFrom.trim() || undefined;
      const toYmd = activeTo.trim();
      return createAdminEvent({
        title: title.trim(),
        description: description.trim(),
        event_date: eventDate,
        event_time: eventTime,
        recurrence_type: recurrenceType,
        weekly_day: recurrenceType === 'weekly' ? weeklyDay : null,
        is_active: true,
        category: category.trim() || undefined,
        poster_url: poster_url ?? null,
        active_from: fromYmd,
        active_to: toYmd.length > 0 ? toYmd : null,
        skip_summer_break: recurrenceType === 'weekly' ? skipSummerBreak : false,
      });
    },
    onSuccess: () => {
      onCreated();
      onClose();
    },
    onError: (e) => setLocalError(apiErrorMessage(e, 'Не удалось создать событие.')),
  });

  if (!open) return null;

  function validate(): boolean {
    if (!title.trim()) {
      setLocalError('Укажите название события.');
      return false;
    }
    const fromEff = activeFrom.trim() || eventDate;
    const toEff = activeTo.trim();
    if (toEff.length > 0 && toEff.localeCompare(fromEff) < 0) {
      setLocalError('Дата окончания не может быть раньше начала показа.');
      return false;
    }
    setLocalError(null);
    return true;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    createMut.mutate();
  }

  return (
    <div
      className="fixed inset-0 z-[160] flex min-h-[100dvh] flex-col justify-end bg-black/50 sm:items-center sm:justify-center sm:p-4"
      role="presentation"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) onClose();
      }}
    >
      <div
        className="max-h-[min(92dvh,920px)] w-full max-w-lg overflow-y-auto rounded-t-[1.75rem] border border-stone-200/80 bg-white shadow-[0_-8px_40px_rgba(0,0,0,0.18)] sm:rounded-2xl sm:shadow-2xl"
        role="dialog"
        aria-labelledby="create-event-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-[1] flex items-center justify-between border-b border-stone-100 bg-white/95 px-4 py-3 backdrop-blur-sm sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#1A9A55] text-white">
              <LuCalendarPlus className="h-5 w-5" aria-hidden />
            </span>
            <h2 id="create-event-title" className="truncate text-lg font-extrabold text-stone-900">
              Новое событие
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="tap-highlight-transparent grid h-10 w-10 place-items-center rounded-xl text-stone-500 hover:bg-stone-100"
            aria-label="Закрыть"
          >
            <LuX className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 sm:px-5 sm:pb-6">
          {localError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900">
              {localError}
            </div>
          ) : null}

          <div>
            <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-stone-500">
              Название
            </label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-base font-semibold text-stone-900 outline-none ring-stone-200 focus:ring-2"
              placeholder="Например: Вечер поклонения"
              autoComplete="off"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-stone-500">
              Описание
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full resize-y rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-medium text-stone-800 outline-none ring-stone-200 focus:ring-2"
              placeholder="Кратко: что, для кого, что взять с собой…"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-stone-500">
                Повторяемость
              </label>
              <select
                value={recurrenceType}
                onChange={(e) => setRecurrenceType(e.target.value === 'weekly' ? 'weekly' : 'once')}
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-semibold text-stone-900 outline-none ring-stone-200 focus:ring-2"
              >
                <option value="once">Разовое</option>
                <option value="weekly">Каждую неделю</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-stone-500">
                Категория
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-semibold text-stone-900 outline-none ring-stone-200 focus:ring-2"
              >
                {categoryOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {recurrenceType === 'weekly' ? (
            <div>
              <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-stone-500">
                День недели
              </label>
              <select
                value={weeklyDay}
                onChange={(e) => setWeeklyDay(Number(e.target.value))}
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-semibold text-stone-900 outline-none ring-stone-200 focus:ring-2"
              >
                {WEEKDAY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[12px] font-medium leading-snug text-stone-500">
                Якорная дата ниже подстраивается под выбранный день (можно не менять).
              </p>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-stone-500">
                {recurrenceType === 'weekly' ? 'Якорная дата' : 'Дата'}
              </label>
              <input
                type="date"
                required
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-semibold text-stone-900 outline-none ring-stone-200 focus:ring-2"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-stone-500">
                Время
              </label>
              <input
                type="time"
                required
                value={eventTime}
                onChange={(e) => setEventTime(e.target.value)}
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-semibold text-stone-900 outline-none ring-stone-200 focus:ring-2"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200/90 bg-stone-50/80 p-3 sm:p-4">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-stone-500">
              Период в календаре
            </p>
            <p className="mt-1 text-[12px] font-medium leading-snug text-stone-600">
              Укажите, в каком диапазоне дат событие показывается участникам. Если не трогать «С начала», по умолчанию
              используется дата события.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-bold text-stone-600">Показывать с</label>
                <input
                  type="date"
                  value={activeFrom}
                  onChange={(e) => setActiveFrom(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-900 outline-none ring-stone-200 focus:ring-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold text-stone-600">По (необязательно)</label>
                <input
                  type="date"
                  value={activeTo}
                  onChange={(e) => setActiveTo(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-900 outline-none ring-stone-200 focus:ring-2"
                />
              </div>
            </div>
          </div>

          {recurrenceType === 'weekly' ? (
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50/60 px-3 py-3 sm:px-4">
              <input
                type="checkbox"
                checked={skipSummerBreak}
                onChange={(e) => setSkipSummerBreak(e.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 rounded border-stone-300 text-[#1A9A55] focus:ring-[#1A9A55]"
              />
              <span>
                <span className="block text-sm font-extrabold text-stone-900">Летний перерыв (июнь–август)</span>
                <span className="mt-0.5 block text-[12px] font-medium leading-snug text-stone-600">
                  Для еженедельных событий: не показывать в июне, июле и августе (например, когда расписание сезона не
                  действует).
                </span>
              </span>
            </label>
          ) : null}

          <div>
            <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-stone-500">
              Постер (необязательно)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPosterFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm font-medium text-stone-700 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-2 file:text-sm file:font-bold file:text-stone-800"
            />
            {posterPreviewUrl ? (
              <div className="mt-2 overflow-hidden rounded-xl border border-stone-200">
                <img src={posterPreviewUrl} alt="" className="max-h-40 w-full object-cover" />
              </div>
            ) : null}
          </div>

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="tap-highlight-transparent min-h-[48px] rounded-xl border border-stone-200 bg-white px-5 text-sm font-extrabold text-stone-700 hover:bg-stone-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={createMut.isPending}
              className="tap-highlight-transparent inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#1A9A55] px-5 text-sm font-extrabold text-white hover:bg-[#158a4d] disabled:opacity-60"
            >
              {createMut.isPending ? <LuLoaderCircle className="h-5 w-5 animate-spin" aria-hidden /> : null}
              Создать
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
