import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { LuMail } from 'react-icons/lu';

import {
  apiErrorMessage,
  approveAccessRequest,
  fetchAccessRequests,
  rejectAccessRequest,
  type AccessRequestItem,
} from './api';

const Q_ACCESS = ['admin', 'access-requests'] as const;

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function AccessRequestsSection() {
  const qc = useQueryClient();
  const [noteById, setNoteById] = useState<Record<number, string>>({});
  const [filter, setFilter] = useState<'all' | 'registration' | 'password_reset'>('all');

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: Q_ACCESS,
    queryFn: () => fetchAccessRequests('pending'),
  });

  const approveMut = useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) => approveAccessRequest(id, note),
    onSuccess: () => void qc.invalidateQueries({ queryKey: Q_ACCESS }),
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) => rejectAccessRequest(id, note),
    onSuccess: () => void qc.invalidateQueries({ queryKey: Q_ACCESS }),
  });

  const pending = (data ?? []).filter((r) => r.status === 'pending');
  const registrationCount = pending.filter((r) => r.request_type !== 'password_reset').length;
  const passwordResetCount = pending.filter((r) => r.request_type === 'password_reset').length;
  const filteredPending =
    filter === 'all'
      ? pending
      : pending.filter((r) => (filter === 'password_reset' ? r.request_type === 'password_reset' : r.request_type !== 'password_reset'));

  return (
    <div className="space-y-6">
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterTab
          active={filter === 'all'}
          label="Все"
          count={pending.length}
          onClick={() => setFilter('all')}
        />
        <FilterTab
          active={filter === 'registration'}
          label="Регистрация"
          count={registrationCount}
          onClick={() => setFilter('registration')}
        />
        <FilterTab
          active={filter === 'password_reset'}
          label="Сброс пароля"
          count={passwordResetCount}
          onClick={() => setFilter('password_reset')}
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-stone-500">Загрузка заявок…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{apiErrorMessage(error, 'Не удалось загрузить заявки')}</p>
      ) : pending.length === 0 ? (
        <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-[#F0E9EA] bg-white px-6 py-14 text-center">
          <div className="flex flex-col items-center">
            <LuMail className="h-10 w-10 text-[#7B2D3F]" aria-hidden />
            <p className="mt-4 text-[18px] font-medium text-stone-900">Нет заявок</p>
            <p className="mt-1 text-sm text-stone-500">Здесь появятся заявки на регистрацию и сброс пароля</p>
          </div>
        </div>
      ) : filteredPending.length === 0 ? (
        <div className="flex min-h-[160px] items-center justify-center rounded-2xl border border-stone-200 bg-stone-50/40 px-6 py-10 text-center">
          <p className="text-sm text-stone-500">По выбранному фильтру заявок нет</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {isFetching && !isLoading ? (
            <p className="text-xs text-stone-400">Обновление…</p>
          ) : null}
          {filteredPending.map((r) => (
            <AccessRequestRow
              key={r.id}
              item={r}
              note={noteById[r.id] ?? ''}
              onNoteChange={(v) => setNoteById((s) => ({ ...s, [r.id]: v }))}
              busy={approveMut.isPending || rejectMut.isPending}
              onApprove={() =>
                approveMut.mutate({ id: r.id, note: (noteById[r.id] ?? '').trim() || undefined })
              }
              onReject={() =>
                rejectMut.mutate({ id: r.id, note: (noteById[r.id] ?? '').trim() || undefined })
              }
            />
          ))}
        </ul>
      )}

      {(approveMut.error || rejectMut.error) && (
        <p className="text-sm text-red-600">
          {apiErrorMessage(approveMut.error ?? rejectMut.error, 'Ошибка операции')}
        </p>
      )}
    </div>
  );
}

function AccessRequestRow(props: {
  item: AccessRequestItem;
  note: string;
  onNoteChange: (v: string) => void;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const { item, note, onNoteChange, busy, onApprove, onReject } = props;
  const initials = `${item.first_name?.trim().charAt(0) ?? ''}${item.last_name?.trim().charAt(0) ?? ''}`.toUpperCase() || '??';

  return (
    <li className="rounded-[10px] border border-[#F0E9EA] bg-white px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F3EEF0] text-sm font-semibold text-[#7B2D3F]">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-stone-900">
              {item.first_name} {item.last_name}
            </p>
            <p className="mt-0.5 truncate text-xs text-stone-500">{item.phone_number}</p>
          </div>
        </div>
        <div className="min-w-[140px]">
          <span
            className={
              item.request_type === 'password_reset'
                ? 'inline-flex rounded-[10px] bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700'
                : 'inline-flex rounded-[10px] bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700'
            }
          >
            {item.request_type === 'password_reset' ? 'Сброс пароля' : 'Регистрация'}
          </span>
          <p className="mt-1 text-xs text-stone-400">{formatWhen(item.created_at)}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={onApprove}
            className="rounded-md bg-[#7B2D3F] px-3.5 py-1.5 text-[13px] font-medium text-white transition hover:opacity-95 disabled:opacity-50"
          >
            Принять
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onReject}
            className="rounded-md border border-stone-200 bg-transparent px-3.5 py-1.5 text-[13px] font-medium text-stone-500 transition hover:bg-stone-50 disabled:opacity-50"
          >
            Отклонить
          </button>
        </div>
      </div>
      <label className="sr-only">
        Комментарий для пользователя
        <textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          rows={1}
          className="sr-only"
        />
      </label>
    </li>
  );
}

function FilterTab(props: { active: boolean; label: string; count: number; onClick: () => void }) {
  const { active, label, count, onClick } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center rounded-[20px] border px-[14px] py-1.5 text-[13px] transition ${
        active
          ? 'border-[#7B2D3F] bg-[#7B2D3F] text-white'
          : 'border-stone-200 bg-transparent text-stone-500 hover:bg-stone-50'
      }`}
    >
      {label}
      <span
        className={`ml-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] px-1 text-[11px] font-semibold ${
          active ? 'bg-white/25 text-white' : 'bg-stone-100 text-stone-700'
        }`}
      >
        {count}
      </span>
    </button>
  );
}
