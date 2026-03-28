import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parse } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useEffect, useState } from 'react';
import { LuHandCoins, LuLoader } from 'react-icons/lu';

import { getNextWeekCollection, patchNextWeekCollection } from '../api';
import type { CoordinatorCollectionRow } from '../collectionTypes';
import { loadErrorDescription } from '../prayerPageUtils';

function formatDayLabel(dateStr: string): string {
  const d = parse(dateStr, 'yyyy-MM-dd', new Date());
  return format(d, 'EEEE, d MMMM', { locale: ru });
}

function CoordinatorRowView({
  row,
  members,
}: {
  row: CoordinatorCollectionRow;
  members: { id: number; name: string }[];
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, number | null>>({});
  const [saveErr, setSaveErr] = useState<string | null>(null);

  useEffect(() => {
    const init: Record<string, number | null> = {};
    for (const d of row.days) {
      init[d.date] = d.selected_member?.id ?? null;
    }
    setDraft(init);
    setSaveErr(null);
  }, [row]);

  const saveMut = useMutation({
    mutationFn: patchNextWeekCollection,
    onSuccess: () => {
      setSaveErr(null);
      void qc.invalidateQueries({ queryKey: ['calendar', 'next-week', 'collection'] });
      void qc.invalidateQueries({ queryKey: ['calendar', 'next-week', 'members'] });
    },
    onError: (e) => {
      setSaveErr(loadErrorDescription(e) ?? 'Не удалось сохранить');
    },
  });

  function setMember(date: string, memberId: string) {
    if (memberId === '') {
      setDraft((prev) => ({ ...prev, [date]: null }));
      return;
    }
    const id = Number(memberId);
    if (!Number.isFinite(id)) return;
    setDraft((prev) => ({ ...prev, [date]: id }));
  }

  const dirty = row.days.some((d) => (draft[d.date] ?? null) !== (d.selected_member?.id ?? null));

  return (
    <div className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow)] shell:p-5">
      <p className="mb-3 text-[13px] font-semibold text-stone-700">
        Ответственный:{' '}
        <span className="font-bold text-stone-900">{row.coordinator.name}</span>
      </p>
      <ul className="divide-y divide-stone-100">
        {row.days.map((d) => (
          <li
            key={d.date}
            className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <span className="min-w-0 shrink text-[13px] font-medium text-stone-600">
              {formatDayLabel(d.date)}
            </span>
            {row.can_edit ? (
              <select
                value={draft[d.date] != null ? String(draft[d.date]) : ''}
                onChange={(e) => setMember(d.date, e.target.value)}
                className="min-w-0 max-w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[15px] font-medium text-stone-900 outline-none ring-primary/20 focus:border-primary focus:ring-2 sm:max-w-[min(100%,280px)] sm:flex-1"
              >
                <option value="">— не выбрано —</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-[15px] font-semibold text-stone-900 sm:min-w-[12rem] sm:text-right">
                {d.selected_member?.name ?? '—'}
              </span>
            )}
          </li>
        ))}
      </ul>
      {row.can_edit ? (
        <div className="mt-4 flex flex-col gap-2 border-t border-stone-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          {saveErr ? <p className="text-sm text-red-600">{saveErr}</p> : <span />}
          <button
            type="button"
            disabled={saveMut.isPending || !dirty}
            onClick={() => saveMut.mutate(draft)}
            className="inline-flex items-center justify-center gap-2 self-end rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/20 disabled:opacity-50 sm:self-auto"
          >
            {saveMut.isPending ? (
              <>
                <LuLoader className="h-4 w-4 animate-spin" aria-hidden />
                Сохранение…
              </>
            ) : (
              'Сохранить назначения'
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function NextWeekCollectionBlock() {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['calendar', 'next-week', 'collection'],
    queryFn: getNextWeekCollection,
    staleTime: 60_000,
  });

  if (isPending) {
    return (
      <section className="mb-6" aria-busy="true" aria-label="Загрузка назначений для сбора">
        <div className="mb-3 flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-[10px] bg-stone-200/90" />
          <div className="h-4 w-56 animate-pulse rounded bg-stone-200/90" />
        </div>
        <div className="h-32 animate-pulse rounded-2xl bg-stone-100/90" />
      </section>
    );
  }

  if (isError) {
    return (
      <section className="mb-6 rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-[14px] text-amber-950">
        <p className="font-semibold">Назначения для сбора</p>
        <p className="mt-1 text-[13px] text-amber-900/90">{loadErrorDescription(error) ?? 'Ошибка загрузки'}</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-2 text-[13px] font-bold text-primary underline"
        >
          Повторить
        </button>
      </section>
    );
  }

  if (!data.coordinator_rows.length) {
    return (
      <section className="mb-6 rounded-2xl border border-dashed border-stone-200 bg-stone-50/80 px-4 py-4 text-[14px] text-stone-600">
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-amber-500/10 text-amber-800">
            <LuHandCoins className="h-5 w-5" aria-hidden />
          </div>
          <h2 className="text-xs font-extrabold uppercase tracking-[0.12em] text-stone-800">
            Назначения для сбора
          </h2>
        </div>
        <p>
          Ответственные за сбор не назначены. Администратор может отметить их в разделе «Админка» → участники.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-6" aria-labelledby="next-week-collection-heading">
      <div className="mb-3 flex items-center gap-3 pl-0.5">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-amber-500/10 text-amber-800"
          aria-hidden
        >
          <LuHandCoins className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 id="next-week-collection-heading" className="text-xs font-extrabold uppercase tracking-[0.12em] text-stone-900">
            Назначения для сбора
          </h2>
          <p className="mt-0.5 text-[13px] text-stone-500">
            Кто отвечает за сбор в какой день следующей недели. Редактировать может только отмеченный
            ответственный (для своего списка).
          </p>
        </div>
      </div>
      <div className="space-y-4">
        {data.coordinator_rows.map((row) => (
          <CoordinatorRowView key={row.coordinator.id} row={row} members={data.members_for_select} />
        ))}
      </div>
    </section>
  );
}
