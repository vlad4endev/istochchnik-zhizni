import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  LuChevronDown,
  LuChevronUp,
  LuCircleAlert,
  LuInfo,
  LuRefreshCw,
  LuTriangleAlert,
} from 'react-icons/lu';

import { resolvePublicUrl } from '../../lib/resolvePublicUrl';
import { humanizeCallErrorMessage } from '../calls/callJournal';
import {
  apiErrorMessage,
  fetchCallJournal,
  fetchCallLogDetail,
  type CallIssue,
  type CallJournalItem,
  type CallLogDetail,
  type CallLogEvent,
} from './api';
import {
  btnSecondary,
  fieldClass,
  formatDuration,
  formatWhen,
  PersonAvatar,
  qualityBadge,
} from './callsAdminUi';

const Q_JOURNAL = ['admin', 'calls', 'journal'] as const;

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Все статусы' },
  { value: 'ringing', label: 'Входящий вызов' },
  { value: 'waiting', label: 'Ожидание участников' },
  { value: 'active', label: 'Активный' },
  { value: 'ended', label: 'Завершён' },
  { value: 'missed', label: 'Пропущен' },
  { value: 'declined', label: 'Отклонён' },
  { value: 'cancelled', label: 'Отменён' },
  { value: 'failed', label: 'Ошибка' },
];

const ISSUE_STYLES: Record<CallIssue['severity'], string> = {
  error: 'border-red-200 bg-red-50 text-red-900',
  warn: 'border-amber-200 bg-amber-50 text-amber-900',
  info: 'border-sky-200 bg-sky-50 text-sky-900',
};

const ISSUE_CHIP_STYLES: Record<CallIssue['severity'], string> = {
  error: 'bg-red-100 text-red-800',
  warn: 'bg-amber-100 text-amber-900',
  info: 'bg-sky-100 text-sky-900',
};

const EVENT_DOT: Record<CallLogEvent['severity'], string> = {
  error: 'bg-red-500',
  warn: 'bg-amber-500',
  info: 'bg-emerald-500',
};

const EVENT_KIND_LABELS: Record<string, string> = {
  call_created: 'Звонок создан',
  accepted: 'Звонок принят',
  declined: 'Звонок отклонён',
  cancelled: 'Звонок отменён',
  call_finished: 'Звонок завершён',
  token_issued: 'Выдан токен подключения',
  participant_joined: 'Участник подключился',
  participant_left: 'Участник вышел',
  invitation_joined: 'Вход по приглашению',
  quality_reported: 'Отчёт о качестве',
  ghost_cleared: '«Призрачный» участник удалён',
  connecting: 'Подключение к комнате…',
  connected: 'Подключено к комнате',
  reconnecting: 'Потеря связи, переподключение…',
  reconnected: 'Связь восстановлена',
  signal_reconnecting: 'Повторное подключение сигналинга…',
  disconnected: 'Отключено от комнаты',
  rejoin_attempt: 'Попытка перезахода в звонок',
  rejoin_abandoned: 'Перезаход прекращён (не удалось)',
  quality_changed: 'Изменилось качество связи',
  stats_sample: 'Замер WebRTC',
  device_error: 'Ошибка микрофона/камеры',
  room_error: 'Ошибка комнаты LiveKit',
  media_toggle: 'Переключение микрофона/камеры',
  network_changed: 'Изменение сети',
  audio_playback_blocked: 'Браузер заблокировал звук',
};

function eventKindLabel(kind: string): string {
  return EVENT_KIND_LABELS[kind] ?? kind.replace(/_/g, ' ');
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(n) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function callTypeLabel(c: Pick<CallJournalItem, 'type' | 'accessMode'>): string {
  if (c.type === 'direct') return 'личный';
  return c.accessMode === 'link' ? 'по ссылке' : 'групповой';
}

function IssueIcon({ severity }: { severity: CallIssue['severity'] }) {
  const cls = 'mt-0.5 h-4 w-4 shrink-0';
  if (severity === 'error') return <LuCircleAlert className={`${cls} text-red-600`} aria-hidden />;
  if (severity === 'warn') return <LuTriangleAlert className={`${cls} text-amber-600`} aria-hidden />;
  return <LuInfo className={`${cls} text-sky-600`} aria-hidden />;
}

function EventPayloadView({ event }: { event: CallLogEvent }) {
  const p = event.payload;
  const line = (text: string) => <p className="mt-0.5 text-[11px] text-stone-500">{text}</p>;

  if (event.kind === 'stats_sample') {
    const parts: string[] = [];
    const rtt = num(p.rttMs);
    const jitter = num(p.jitterMs);
    const lost = num(p.packetsLost);
    if (rtt != null) parts.push(`RTT ${Math.round(rtt)} мс`);
    if (jitter != null) parts.push(`джиттер ${Math.round(jitter)} мс`);
    if (lost != null) parts.push(`потери ${lost} пак.`);
    if (parts.length === 0) return null;
    return line(parts.join(' · '));
  }
  if (event.kind === 'call_finished') {
    const parts = [str(p.toStatus), str(p.endReason)].filter(Boolean) as string[];
    const dur = num(p.durationSeconds);
    if (dur != null) parts.push(formatDuration(dur));
    return parts.length > 0 ? line(parts.join(' · ')) : null;
  }
  if (event.kind === 'quality_reported') {
    const score = num(p.score);
    const parts: string[] = score != null ? [`оценка ${score}/5`] : [];
    const cq = str(p.connectionQuality);
    if (cq) parts.push(cq);
    const rtt = num(p.rttMs);
    if (rtt != null) parts.push(`RTT ${Math.round(rtt)} мс`);
    return parts.length > 0 ? line(parts.join(' · ')) : null;
  }
  if (event.kind === 'media_toggle') {
    const source = str(p.source) ?? '';
    const what =
      source === 'microphone' ? 'Микрофон' : source === 'camera' ? 'Камера' : source || 'Устройство';
    return line(`${what}: ${p.muted === true ? 'выкл' : 'вкл'}`);
  }
  if (event.kind === 'network_changed') {
    if (p.online === true) return line('сеть появилась');
    if (p.online === false) return line('сеть пропала');
    const et = str(p.effectiveType);
    const rtt = num(p.rtt);
    const flips = num(p.flips);
    const parts = [et ? `тип ${et}` : null, rtt != null ? `RTT ${Math.round(rtt)} мс` : null].filter(
      Boolean,
    ) as string[];
    if (flips != null && flips > 0) {
      parts.push(`ещё ${flips} ${pluralRu(flips, 'изменение', 'изменения', 'изменений')} подряд`);
    }
    return parts.length > 0 ? line(parts.join(' · ')) : null;
  }
  if (event.kind === 'participant_joined' || event.kind === 'participant_left') {
    const name = str(p.name);
    return name ? line(name) : null;
  }
  if (event.kind === 'device_error' || event.kind === 'room_error') {
    const message = str(p.message);
    const device = str(p.device);
    const repeat = num(p.repeat);
    const friendly = message ? humanizeCallErrorMessage(message) : null;
    const text = [device ? `устройство: ${device}` : null, friendly ?? message]
      .filter(Boolean)
      .join(' · ');
    return (
      <>
        {text ? (
          <p className="mt-0.5 text-[11px] font-medium text-red-700">
            {text}
            {repeat != null && repeat > 1
              ? ` · повторялась ${repeat} ${pluralRu(repeat, 'раз', 'раза', 'раз')} подряд`
              : ''}
          </p>
        ) : null}
        {friendly != null && message != null && friendly !== message ? (
          <p className="mt-0.5 text-[11px] text-stone-400">{message}</p>
        ) : null}
      </>
    );
  }
  if (event.kind === 'disconnected') {
    const reason = str(p.reason);
    return reason ? line(`причина: ${reason}`) : null;
  }
  if (event.kind === 'rejoin_attempt') {
    const attempt = num(p.attempt);
    return line(attempt != null ? `попытка №${attempt}` : 'повторный заход');
  }
  if (event.kind === 'ghost_cleared') {
    const remaining = num(p.remaining);
    const ids = Array.isArray(p.userIds) ? p.userIds.filter((x) => typeof x === 'number') : [];
    return line(
      `удалено: ${ids.length > 0 ? ids.join(', ') : '—'}${remaining != null ? ` · осталось в комнате: ${remaining}` : ''}`,
    );
  }

  const keys = Object.keys(p);
  if (keys.length === 0) return null;
  return (
    <details className="mt-0.5">
      <summary className="cursor-pointer text-[11px] text-stone-400 hover:text-stone-600">
        детали
      </summary>
      <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-stone-100 p-2 text-[11px] leading-relaxed text-stone-700">
        {JSON.stringify(p, null, 2)}
      </pre>
    </details>
  );
}

function EventTimelineRow({ event }: { event: CallLogEvent }) {
  let time = event.createdAt;
  try {
    time = new Date(event.createdAt).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    /* keep raw */
  }
  return (
    <li className="relative flex gap-3 pb-3 pl-1">
      <span
        className={`relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${EVENT_DOT[event.severity] ?? EVENT_DOT.info}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-stone-800">
          <span className="mr-2 font-mono text-[11px] text-stone-400">{time}</span>
          <span className="font-medium">{eventKindLabel(event.kind)}</span>
          {event.memberName ? <span className="text-stone-500"> — {event.memberName}</span> : null}
          <span
            className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              event.source === 'client'
                ? 'bg-violet-100 text-violet-700'
                : 'bg-stone-200 text-stone-600'
            }`}
          >
            {event.source === 'client' ? 'клиент' : 'сервер'}
          </span>
        </p>
        <EventPayloadView event={event} />
      </div>
    </li>
  );
}

function CallLogDetailView({ callId }: { callId: string }) {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: [...Q_JOURNAL, 'detail', callId],
    queryFn: () => fetchCallLogDetail(callId),
    staleTime: 15_000,
  });

  if (isLoading) {
    return <div className="h-32 animate-pulse rounded-xl bg-stone-200/60" />;
  }
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50/80 p-3 text-sm text-red-800">
        <p className="font-semibold">Не удалось загрузить лог звонка</p>
        <p className="mt-1">{apiErrorMessage(error, 'Ошибка сети или сервера.')}</p>
        <button type="button" className={`${btnSecondary()} mt-2`} onClick={() => void refetch()}>
          Повторить
        </button>
      </div>
    );
  }
  if (!data) return null;

  const d: CallLogDetail = data;
  return (
    <div className="space-y-4 text-xs text-stone-700">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-stone-500">
        <span>
          ID: <span className="font-mono">{d.call.id}</span>
        </span>
        <span>
          Комната: <span className="font-mono">{d.call.livekitRoomName}</span>
        </span>
        {d.call.startedAt ? <span>Начат: {formatWhen(d.call.startedAt)}</span> : null}
        {d.call.endedAt ? <span>Завершён: {formatWhen(d.call.endedAt)}</span> : null}
        <span>Событий: {d.call.eventsCount}</span>
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2 py-1 font-semibold text-stone-600 hover:bg-stone-100 disabled:opacity-50"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          <LuRefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} aria-hidden />
          Обновить
        </button>
      </div>

      {d.issues.length > 0 ? (
        <div>
          <p className="mb-2 font-semibold text-stone-900">Проблемы и наблюдения</p>
          <ul className="space-y-2">
            {d.issues.map((issue) => (
              <li
                key={issue.code}
                className={`flex gap-2 rounded-xl border p-2.5 ${ISSUE_STYLES[issue.severity]}`}
              >
                <IssueIcon severity={issue.severity} />
                <div>
                  <p className="font-semibold">{issue.title}</p>
                  <p className="mt-0.5 opacity-90">{issue.hint}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-emerald-900">
          Проблем не обнаружено — звонок выглядит штатным.
        </p>
      )}

      <div>
        <p className="mb-1 font-semibold text-stone-900">Участники ({d.participants.length})</p>
        <ul className="space-y-1">
          {d.participants.map((p) => (
            <li key={p.userId} className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2">
                <PersonAvatar
                  name={p.name}
                  src={p.avatarUrl ? resolvePublicUrl(p.avatarUrl) : null}
                  size={22}
                />
                <span className="font-medium text-stone-800">{p.name}</span>
                <span className="text-stone-400">
                  ({p.role === 'initiator' ? 'организатор' : p.role})
                </span>
              </span>
              <span className="text-[11px] text-stone-500">
                {p.status}
                {p.joinedAt ? ` · вошёл ${formatWhen(p.joinedAt)}` : ''}
                {p.leftAt ? ` · вышел ${formatWhen(p.leftAt)}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {d.qualityReports.length > 0 ? (
        <div>
          <p className="mb-1 font-semibold text-stone-900">Отчёты качества</p>
          <ul className="space-y-1">
            {d.qualityReports.map((r) => (
              <li key={`${r.userId}-${r.at}`} className="text-[11px] text-stone-600">
                {d.participants.find((p) => p.userId === r.userId)?.name ?? `user #${r.userId}`}:{' '}
                <span className="font-semibold">{r.score}/5</span>
                {r.connectionQuality ? ` · ${r.connectionQuality}` : ''}
                {r.rttMs != null ? ` · RTT ${Math.round(r.rttMs)} мс` : ''}
                {r.packetLoss != null ? ` · потери ${(r.packetLoss * 100).toFixed(1)}%` : ''}
                {r.jitterMs != null ? ` · джиттер ${Math.round(r.jitterMs)} мс` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <p className="mb-1 font-semibold text-stone-900">Хронология ({d.events.length})</p>
        {d.events.length === 0 ? (
          <p className="text-stone-500">
            Событий нет — журнал ведётся с момента обновления сервера; для этого звонка доступна
            только сводка.
          </p>
        ) : (
          <ul className="relative ml-1 border-l border-stone-200 pl-3">
            {d.events.map((e) => (
              <EventTimelineRow key={e.id} event={e} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function JournalRow({
  call,
  open,
  onToggle,
}: {
  call: CallJournalItem;
  open: boolean;
  onToggle: () => void;
}) {
  const shownIssues = call.issues.slice(0, 3);
  const hiddenIssues = call.issues.length - shownIssues.length;
  return (
    <li className="rounded-xl border border-stone-100 bg-stone-50/50">
      <button
        type="button"
        className="flex w-full flex-wrap items-center gap-3 px-3 py-3 text-left"
        onClick={onToggle}
      >
        <PersonAvatar
          name={call.initiatorName}
          src={call.initiatorAvatar ? resolvePublicUrl(call.initiatorAvatar) : null}
          size={32}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-stone-900">
            {call.title || call.initiatorName}
            <span className="ml-2 font-normal text-stone-500">
              · {call.mediaType === 'video' ? 'видео' : 'аудио'} · {callTypeLabel(call)} ·{' '}
              {call.participantsCount} уч.
            </span>
          </p>
          <p className="text-xs text-stone-500">
            {formatWhen(call.createdAt)} · {call.statusLabel}
            {call.endReasonLabel ? ` · ${call.endReasonLabel}` : ''} ·{' '}
            {formatDuration(call.durationSeconds)}
          </p>
          {call.issues.length > 0 ? (
            <p className="mt-1 flex flex-wrap gap-1">
              {shownIssues.map((issue) => (
                <span
                  key={issue.code}
                  className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${ISSUE_CHIP_STYLES[issue.severity]}`}
                >
                  {issue.title}
                </span>
              ))}
              {hiddenIssues > 0 ? (
                <span className="inline-flex items-center rounded-md bg-stone-200 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600">
                  +{hiddenIssues}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {call.errorCount > 0 ? (
            <span className="rounded-lg bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
              {call.errorCount} ошиб.
            </span>
          ) : null}
          {call.warnCount > 0 ? (
            <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
              {call.warnCount} предп.
            </span>
          ) : null}
          {call.reconnects > 0 ? (
            <span className="rounded-lg bg-stone-200 px-2 py-0.5 text-xs font-semibold text-stone-700">
              ↻ {call.reconnects}
            </span>
          ) : null}
          {qualityBadge(call.qualityScore)}
          {open ? (
            <LuChevronUp className="h-4 w-4 text-stone-400" aria-hidden />
          ) : (
            <LuChevronDown className="h-4 w-4 text-stone-400" aria-hidden />
          )}
        </div>
      </button>
      {open ? (
        <div className="border-t border-stone-100 px-3 py-3">
          <CallLogDetailView callId={call.id} />
        </div>
      ) : null}
    </li>
  );
}

export function CallsJournalPanel() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState('');
  const [memberInput, setMemberInput] = useState('');
  const [member, setMember] = useState('');
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setMember(memberInput.trim()), 350);
    return () => window.clearTimeout(t);
  }, [memberInput]);

  const query = useInfiniteQuery({
    queryKey: [...Q_JOURNAL, from, to, status, member, onlyIssues],
    queryFn: ({ pageParam }) =>
      fetchCallJournal({
        from: new Date(`${from}T00:00:00`).toISOString(),
        to: new Date(`${to}T23:59:59`).toISOString(),
        status: status || undefined,
        member: member || undefined,
        onlyIssues,
        cursor: pageParam ?? undefined,
        limit: 30,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-stone-900">Журнал звонков</h3>
        <span className="text-xs text-stone-500">
          подробные события по каждому звонку: подключения, ошибки, качество
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-stone-600">
          С
          <input
            type="date"
            className={`${fieldClass()} mt-1`}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-xs font-medium text-stone-600">
          По
          <input
            type="date"
            className={`${fieldClass()} mt-1`}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label className="text-xs font-medium text-stone-600">
          Статус
          <select
            className={`${fieldClass()} mt-1`}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[180px] flex-1 text-xs font-medium text-stone-600">
          Участник
          <input
            type="search"
            className={`${fieldClass()} mt-1`}
            placeholder="Имя или фамилия…"
            value={memberInput}
            onChange={(e) => setMemberInput(e.target.value)}
          />
        </label>
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-stone-200 px-3 py-2.5 text-xs font-semibold text-stone-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-stone-300 text-primary focus:ring-primary/30"
            checked={onlyIssues}
            onChange={(e) => setOnlyIssues(e.target.checked)}
          />
          Только проблемные
        </label>
        <button
          type="button"
          className={btnSecondary()}
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          <span className="inline-flex items-center gap-2">
            <LuRefreshCw
              className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`}
              aria-hidden
            />
            Обновить
          </span>
        </button>
      </div>

      {query.isLoading ? (
        <div className="h-56 animate-pulse rounded-2xl bg-stone-200/50" />
      ) : query.error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50/80 p-6 text-center">
          <p className="font-semibold text-red-900">Не удалось загрузить журнал</p>
          <p className="mt-2 text-sm text-red-800">
            {apiErrorMessage(query.error, 'Ошибка сети или сервера.')}
          </p>
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-stone-500">
          {onlyIssues ? 'Проблемных звонков за период нет.' : 'За период звонков нет.'}
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {items.map((call) => (
              <JournalRow
                key={call.id}
                call={call}
                open={openId === call.id}
                onToggle={() => setOpenId(openId === call.id ? null : call.id)}
              />
            ))}
          </ul>
          {query.hasNextPage ? (
            <div className="mt-3 text-center">
              <button
                type="button"
                className={btnSecondary()}
                onClick={() => void query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
              >
                {query.isFetchingNextPage ? 'Загрузка…' : 'Показать ещё'}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
