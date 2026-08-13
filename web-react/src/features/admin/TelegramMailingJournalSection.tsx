import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

import {
  apiErrorMessage,
  fetchTelegramSendLogsAdmin,
  type TelegramSendLogBatchItem,
  type TelegramSendLogChannel,
  type TelegramSendLogStatus,
} from './api';

const Q_TG_LOGS = ['admin', 'journal', 'telegram-sends'] as const;

function prettyDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return format(d, 'dd.MM.yyyy HH:mm:ss', { locale: ru });
}

function channelLabel(channel: TelegramSendLogChannel): string {
  switch (channel) {
    case 'prayer_dispatch':
      return 'Личная рассылка молитвы';
    case 'service_plan_mailing':
      return 'Плановая рассылка программы';
    case 'service_plan_published':
      return 'Публикация программы';
    case 'coordinator_scenario':
      return 'Сценарий координаторов';
    case 'manual':
      return 'Ручная отправка';
    case 'password_reset':
      return 'Восстановление пароля';
    default:
      return channel;
  }
}

function triggerLabel(trigger: TelegramSendLogBatchItem['trigger_source']): string {
  switch (trigger) {
    case 'cron':
      return 'Автоматически по расписанию';
    case 'run_now':
      return 'Запуск вручную («сейчас»)';
    case 'api':
      return 'Через API';
    case 'event':
      return 'По событию';
    default:
      return trigger;
  }
}

function statusLabel(status: TelegramSendLogStatus): string {
  switch (status) {
    case 'ok':
      return 'Доставлено';
    case 'failed':
      return 'Ошибка';
    case 'blocked':
      return 'Заблокирован';
    case 'skipped':
      return 'Пропущено';
    default:
      return status;
  }
}

function statusClass(status: TelegramSendLogStatus): string {
  switch (status) {
    case 'ok':
      return 'bg-emerald-100 text-emerald-700';
    case 'failed':
      return 'bg-red-100 text-red-700';
    case 'blocked':
      return 'bg-amber-100 text-amber-800';
    case 'skipped':
      return 'bg-stone-100 text-stone-600';
    default:
      return 'bg-stone-100 text-stone-600';
  }
}

function recipientTitle(r: TelegramSendLogBatchItem['recipients'][number]): string {
  if (r.member_name?.trim()) return r.member_name.trim();
  if (r.chat_title?.trim()) return r.chat_title.trim();
  if (r.telegram_chat_id?.trim()) return `Чат ${r.telegram_chat_id.trim()}`;
  return 'Получатель';
}

function batchMetaLine(batch: TelegramSendLogBatchItem): string {
  const parts: string[] = [triggerLabel(batch.trigger_source)];
  if (batch.kind?.trim()) parts.push(batch.kind.trim());
  if (batch.scenario_id?.trim()) parts.push(`сценарий: ${batch.scenario_id.trim()}`);
  return parts.join(' · ');
}

export function TelegramMailingJournalSection() {
  const [channel, setChannel] = useState<TelegramSendLogChannel | 'all'>('all');
  const [status, setStatus] = useState<TelegramSendLogStatus | 'all'>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [expandedRecipientId, setExpandedRecipientId] = useState<number | null>(null);

  const q = useQuery({
    queryKey: [...Q_TG_LOGS, channel, status, search],
    queryFn: () =>
      fetchTelegramSendLogsAdmin({
        channel,
        status,
        search,
        limit: 50,
      }),
    refetchInterval: 15000,
  });

  const items = q.data ?? [];
  const stats = useMemo(() => {
    const s = { batches: items.length, ok: 0, failed: 0, blocked: 0 };
    for (const b of items) {
      s.ok += b.ok_count;
      s.failed += b.failed_count;
      s.blocked += b.blocked_count;
    }
    return s;
  }, [items]);

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm text-stone-600">
          Здесь видно каждую авторассылку в Telegram: кому ушло сообщение, какой текст и удалось ли
          доставить.
        </p>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-[14px] bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">
              Рассылок: {stats.batches}
            </span>
            <span className="rounded-[14px] bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
              Доставлено: {stats.ok}
            </span>
            <span className="rounded-[14px] bg-red-100 px-3 py-1 text-xs font-medium text-red-600">
              Ошибки: {stats.failed}
            </span>
            <span className="rounded-[14px] bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
              Блок: {stats.blocked}
            </span>
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-2 sm:flex-none">
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as typeof channel)}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800"
            >
              <option value="all">Все типы</option>
              <option value="prayer_dispatch">Личная рассылка молитвы</option>
              <option value="service_plan_mailing">Плановая рассылка программы</option>
              <option value="service_plan_published">Публикация программы</option>
              <option value="coordinator_scenario">Сценарии координаторов</option>
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800"
            >
              <option value="all">Все статусы</option>
              <option value="ok">Доставлено</option>
              <option value="failed">Ошибка</option>
              <option value="blocked">Заблокирован</option>
              <option value="skipped">Пропущено</option>
            </select>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setSearch(searchInput.trim());
              }}
              placeholder="Поиск: имя, чат, текст сообщения..."
              className="min-w-[260px] flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800"
            />
            <button
              type="button"
              onClick={() => setSearch(searchInput.trim())}
              className="rounded-lg bg-stone-100 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-200"
            >
              Применить
            </button>
            <button
              type="button"
              onClick={() => q.refetch()}
              className="rounded-lg bg-[#7B2D3F] px-4 py-2 text-sm font-medium text-white hover:opacity-95"
            >
              ↺ Обновить
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        {q.isLoading ? (
          <div className="p-5 text-sm text-stone-500">Загружаю журнал авторассылки...</div>
        ) : q.isError ? (
          <div className="p-5 text-sm text-red-700">
            {apiErrorMessage(q.error, 'Не удалось загрузить журнал авторассылки.')}
          </div>
        ) : items.length === 0 ? (
          <div className="p-5 text-sm text-stone-500">
            Пока нет записей. Они появятся после ближайшей авторассылки или ручного запуска.
          </div>
        ) : (
          <ul className="divide-y divide-stone-100">
            {items.map((batch) => {
              const open = expandedBatchId === batch.batch_id;
              return (
                <li key={batch.batch_id}>
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedBatchId((prev) => (prev === batch.batch_id ? null : batch.batch_id));
                      setExpandedRecipientId(null);
                    }}
                    className="grid w-full grid-cols-[1fr_auto] items-start gap-3 px-4 py-3 text-left hover:bg-stone-50 sm:grid-cols-[220px_1fr_160px]"
                  >
                    <div>
                      <p className="text-sm font-semibold text-stone-900">{channelLabel(batch.channel)}</p>
                      <p className="mt-0.5 text-[11px] text-stone-500">{batchMetaLine(batch)}</p>
                    </div>
                    <div className="hidden min-w-0 sm:block">
                      <p className="truncate text-sm text-stone-700">
                        {batch.preview_text || 'Текст сообщения пуст'}
                      </p>
                      <p className="mt-1 text-[11px] text-stone-500">
                        Получателей: {batch.total}
                        {batch.ok_count > 0 ? ` · доставлено ${batch.ok_count}` : ''}
                        {batch.failed_count > 0 ? ` · ошибок ${batch.failed_count}` : ''}
                        {batch.blocked_count > 0 ? ` · блок ${batch.blocked_count}` : ''}
                      </p>
                    </div>
                    <div className="text-right text-[11px] text-stone-400">{prettyDate(batch.created_at)}</div>
                  </button>

                  {open ? (
                    <div className="border-t border-stone-100 bg-stone-50/70 px-4 py-3">
                      <div className="mb-3 flex flex-wrap gap-2 text-xs text-stone-600 sm:hidden">
                        <span>Получателей: {batch.total}</span>
                        <span>Доставлено: {batch.ok_count}</span>
                        <span>Ошибки: {batch.failed_count}</span>
                      </div>
                      <ul className="space-y-2">
                        {batch.recipients.map((r) => {
                          const recipOpen = expandedRecipientId === r.id;
                          return (
                            <li
                              key={r.id}
                              className="overflow-hidden rounded-xl border border-stone-200 bg-white"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedRecipientId((prev) => (prev === r.id ? null : r.id))
                                }
                                className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left hover:bg-stone-50"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-stone-900">
                                    {recipientTitle(r)}
                                  </p>
                                  <p className="mt-0.5 truncate text-[11px] text-stone-500">
                                    {r.telegram_chat_id
                                      ? `Telegram ID: ${r.telegram_chat_id}`
                                      : 'Без chat id'}
                                    {r.member_id != null ? ` · участник #${r.member_id}` : ''}
                                    {r.chat_title && r.member_name ? ` · ${r.chat_title}` : ''}
                                  </p>
                                  {r.error_description ? (
                                    <p className="mt-1 text-[11px] text-red-600">{r.error_description}</p>
                                  ) : null}
                                </div>
                                <span
                                  className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold tracking-wide ${statusClass(r.status)}`}
                                >
                                  {statusLabel(r.status).toUpperCase()}
                                </span>
                              </button>
                              {recipOpen ? (
                                <div className="border-t border-stone-100 px-3 py-3">
                                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                                    Текст сообщения
                                  </p>
                                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-stone-50 p-3 text-xs leading-relaxed text-stone-800">
                                    {r.message_text?.trim() || '—'}
                                  </pre>
                                  <p className="mt-2 text-[11px] text-stone-400">
                                    Отправлено: {prettyDate(r.created_at)}
                                  </p>
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
