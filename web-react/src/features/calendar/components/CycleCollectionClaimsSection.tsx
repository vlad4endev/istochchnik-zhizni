import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LuHandCoins, LuLoader } from 'react-icons/lu';

import { getCycleCollectionClaims, patchCycleCollectionClaim } from '../api';
import { loadErrorDescription } from '../prayerPageUtils';

type Props = { currentUserId: number | null };

/** Сбор нужд по текущему молитвенному циклу: галочка — вы закрепляете участника; другой не может взять того же. */
export function CycleCollectionClaimsSection({ currentUserId }: Props) {
  const qc = useQueryClient();
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['calendar', 'cycle', 'collection-claims'],
    queryFn: getCycleCollectionClaims,
    staleTime: 30_000,
  });

  const mut = useMutation({
    mutationFn: ({ memberId, claim }: { memberId: number; claim: boolean }) =>
      patchCycleCollectionClaim(memberId, claim),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['calendar', 'cycle', 'collection-claims'] });
      void qc.invalidateQueries({ queryKey: ['calendar', 'next-week', 'members'] });
    },
  });

  if (isPending) {
    return (
      <section className="mb-6" aria-busy="true" aria-label="Загрузка списка для сбора">
        <div className="mb-3 flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-[10px] bg-stone-200/90" />
          <div className="h-4 w-48 animate-pulse rounded bg-stone-200/90" />
        </div>
        <div className="h-40 animate-pulse rounded-2xl bg-stone-100/90" />
      </section>
    );
  }

  if (isError) {
    return (
      <section className="mb-6 rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-[14px] text-amber-950">
        <p className="font-semibold">Сбор нужд по циклу</p>
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

  const cycleLabel = data ? `Цикл №${data.cycle_number}` : '';

  return (
    <section className="mb-6" aria-labelledby="cycle-collection-heading">
      <div className="mb-3 flex items-center gap-3 pl-0.5">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-amber-500/10 text-amber-800"
          aria-hidden
        >
          <LuHandCoins className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 id="cycle-collection-heading" className="text-xs font-extrabold uppercase tracking-[0.12em] text-stone-900">
            Сбор молитвенных нужд
          </h2>
          <p className="mt-0.5 text-[13px] text-stone-500">
            {cycleLabel}. Отметьте, за кого вы собираете нужды в этом цикле. Участник может быть только у одного
            ответственного.
          </p>
        </div>
      </div>

      {mut.isError ? (
        <p className="mb-2 text-[13px] text-red-600">
          {loadErrorDescription(mut.error) ?? 'Не удалось сохранить'}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] shadow-[var(--shadow)]">
        <ul className="max-h-[min(70vh,28rem)] divide-y divide-stone-100 overflow-y-auto overscroll-contain">
          {data?.members.map((row) => {
            const mine = currentUserId != null && row.claimed_by?.id === currentUserId;
            const disabled = mut.isPending || !row.can_toggle;
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:justify-between shell:px-5"
              >
                <label
                  className={`flex min-w-0 flex-1 cursor-pointer items-center gap-3 sm:flex-[1_1_auto] ${!row.can_toggle && !mine ? 'cursor-default opacity-90' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="h-5 w-5 shrink-0 rounded border-stone-300 text-primary focus:ring-primary/30 disabled:cursor-not-allowed"
                    checked={mine}
                    disabled={disabled}
                    onChange={(e) => {
                      if (!row.can_toggle && !mine) return;
                      mut.mutate({ memberId: row.id, claim: e.target.checked });
                    }}
                  />
                  <span className="min-w-0 text-[15px] font-semibold text-stone-900">{row.name}</span>
                </label>
                {row.claimed_by ? (
                  <span className="inline-flex max-w-full items-center rounded-full bg-amber-500/12 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-950 sm:shrink-0">
                    {mine ? 'Вы' : row.claimed_by.name}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      {mut.isPending ? (
        <p className="mt-2 flex items-center gap-2 text-[13px] text-stone-500">
          <LuLoader className="h-4 w-4 animate-spin" aria-hidden />
          Сохранение…
        </p>
      ) : null}
    </section>
  );
}
