import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { LuInbox } from 'react-icons/lu';

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

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
        <p className="font-semibold">Заявки на регистрацию и сброс пароля</p>
        <p className="mt-1 text-amber-900/90">
          Здесь появляются две категории заявок: новая регистрация и «Забыл пароль». После одобрения регистрации
          пользователь получит доступ в приложение, а после одобрения сброса начнёт действовать новый пароль.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-stone-500">Загрузка заявок…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{apiErrorMessage(error, 'Не удалось загрузить заявки')}</p>
      ) : pending.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-stone-200 bg-stone-50/80 px-6 py-14 text-center">
          <LuInbox className="h-12 w-12 text-stone-300" strokeWidth={1.5} aria-hidden />
          <p className="mt-4 text-sm font-semibold text-stone-700">Нет ожидающих заявок</p>
          <p className="mt-1 text-xs text-stone-500">
            Новые заявки появятся здесь после регистрации или запроса на сброс пароля.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {isFetching && !isLoading ? (
            <p className="text-xs text-stone-400">Обновление…</p>
          ) : null}
          {pending.map((r) => (
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
  return (
    <li className="rounded-2xl border border-stone-200/90 bg-[var(--surface-elevated)] p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-extrabold text-stone-900">
            {item.first_name} {item.last_name}
          </p>
          <p className="mt-1 text-sm font-medium text-stone-600">{item.phone_number}</p>
          <p className="mt-2 text-xs text-stone-400">{formatWhen(item.created_at)}</p>
        </div>
        <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-amber-900">
          {item.request_type === 'password_reset' ? 'Сброс пароля' : 'Регистрация'}
        </span>
      </div>
      <label className="mt-4 block">
        <span className="text-xs font-semibold text-stone-500">Комментарий для пользователя (необязательно)</span>
        <textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          rows={2}
          className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          placeholder="Например, причина отказа или приветствие при одобрении"
        />
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onApprove}
          className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/20 disabled:opacity-50"
        >
          {item.request_type === 'password_reset' ? 'Подтвердить сброс' : 'Одобрить'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onReject}
          className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          Отклонить
        </button>
      </div>
    </li>
  );
}
