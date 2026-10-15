import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  LuActivity,
  LuCheck,
  LuPhone,
  LuRefreshCw,
  LuServer,
  LuSignal,
  LuUsers,
} from 'react-icons/lu';

import { IntegerTextInput } from '@/components/IntegerTextInput';
import { AppAvatar } from '../../components/AppAvatar';
import { resolvePublicUrl } from '../../lib/resolvePublicUrl';
import {
  apiErrorMessage,
  fetchCallSettingsAdmin,
  fetchCallUsageStats,
  patchCallSettings,
  testLiveKitConnection,
  type CallFeatureFlags,
  type CallLiveKitRoutingMode,
  type CallSettingsAdminResponse,
  type CallUsageStatsResponse,
  type LiveKitConnectionTestResponse,
} from './api';

const Q_CALLS = ['admin', 'calls', 'settings'] as const;
const Q_STATS = ['admin', 'calls', 'stats'] as const;

function fieldClass() {
  return (
    'w-full rounded-xl border border-stone-200/90 bg-[var(--surface-elevated)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ' +
    'focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-[var(--text-muted)]'
  );
}

function btnPrimary(c = '') {
  return `rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:opacity-95 disabled:opacity-50 ${c}`;
}

function btnSecondary(c = '') {
  return `rounded-xl border border-stone-200 bg-[var(--surface-elevated)] px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface)] ${c}`;
}

function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return '—';
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}ч ${m}м`;
  if (m > 0) return `${m}м ${r}с`;
  return `${r}с`;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function qualityBadge(score: number | null | undefined) {
  if (score == null) return <span className="text-stone-400">нет данных</span>;
  const color =
    score >= 4
      ? 'bg-emerald-100 text-emerald-800'
      : score >= 2.5
        ? 'bg-amber-100 text-amber-900'
        : 'bg-red-100 text-red-800';
  return (
    <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-semibold ${color}`}>
      {score.toFixed(1)} / 5
    </span>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function PersonAvatar({ name, src, size = 28 }: { name: string; src?: string | null; size?: number }) {
  const initials = initialsOf(name);
  return (
    <AppAvatar
      src={src || null}
      fallback={<span className="text-[10px] font-semibold text-stone-600">{initials}</span>}
      initialsFallbackText={initials}
      initialsColorSeed={name}
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-stone-200"
      imgClassName="h-full w-full object-cover"
      style={{ width: size, height: size }}
      width={size}
      height={size}
    />
  );
}

function sourceHint(source: string) {
  if (source === 'db') return 'из админки';
  if (source === 'env') return 'из .env';
  return 'не задано';
}

type Panel = 'settings' | 'stats';

export function CallsSettingsSection() {
  const [panel, setPanel] = useState<Panel>('settings');

  return (
    <div className="space-y-6">
      <section className="rounded-[10px] bg-stone-100 p-1">
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            className={
              panel === 'settings'
                ? 'flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2.5 text-sm font-medium text-stone-900 shadow'
                : 'flex items-center justify-center gap-2 rounded-lg bg-transparent px-3 py-2.5 text-sm font-medium text-stone-500'
            }
            onClick={() => setPanel('settings')}
          >
            <LuServer className="h-4 w-4" aria-hidden />
            Настройки службы
          </button>
          <button
            type="button"
            className={
              panel === 'stats'
                ? 'flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2.5 text-sm font-medium text-stone-900 shadow'
                : 'flex items-center justify-center gap-2 rounded-lg bg-transparent px-3 py-2.5 text-sm font-medium text-stone-500'
            }
            onClick={() => setPanel('stats')}
          >
            <LuActivity className="h-4 w-4" aria-hidden />
            Статистика использования
          </button>
        </div>
      </section>

      {panel === 'settings' ? <CallsConfigPanel /> : <CallsStatsPanel />}
    </div>
  );
}

function CallsConfigPanel() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: Q_CALLS,
    queryFn: fetchCallSettingsAdmin,
  });

  const [enabledMode, setEnabledMode] = useState<'inherit' | 'on' | 'off'>('inherit');
  const [features, setFeatures] = useState<CallFeatureFlags>({
    direct_calls: true,
    group_calls: true,
    link_meetings: true,
    audio: true,
    video: true,
  });
  const [roles, setRoles] = useState<string[]>([]);
  const [ringTimeout, setRingTimeout] = useState(60);
  const [tokenTtl, setTokenTtl] = useState(14_400);
  const [inviteTtl, setInviteTtl] = useState(24);
  const [maxParticipants, setMaxParticipants] = useState(50);
  const [ghostGrace, setGhostGrace] = useState(180);
  const [ghostMiss, setGhostMiss] = useState(3);
  const [internalUrl, setInternalUrl] = useState('');
  const [publicUrl, setPublicUrl] = useState('');
  const [routingMode, setRoutingMode] = useState<CallLiveKitRoutingMode>('local_proxy');
  const [disableLocalFallbacks, setDisableLocalFallbacks] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [clearKey, setClearKey] = useState(false);
  const [clearSecret, setClearSecret] = useState(false);
  const [callLabels, setCallLabels] = useState<Record<string, string>>({});
  const [participantLabels, setParticipantLabels] = useState<Record<string, string>>({});
  const [endReasonLabels, setEndReasonLabels] = useState<Record<string, string>>({});
  const [note, setNote] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [testResult, setTestResult] = useState<LiveKitConnectionTestResponse | null>(null);

  useEffect(() => {
    if (!data) return;
    setEnabledMode(data.enabled === null ? 'inherit' : data.enabled ? 'on' : 'off');
    setFeatures({ ...data.features });
    setRoles([...data.allowed_roles]);
    setRingTimeout(data.ring_timeout_sec);
    setTokenTtl(data.token_ttl_sec);
    setInviteTtl(data.invite_ttl_hours);
    setMaxParticipants(data.max_group_participants);
    setGhostGrace(data.ghost_grace_sec);
    setGhostMiss(data.ghost_miss_ticks);
    setInternalUrl(data.overrides.livekit_internal_url ?? data.livekit.internal_url ?? '');
    setPublicUrl(data.overrides.livekit_public_url ?? data.livekit.public_url ?? '');
    setRoutingMode(data.livekit.routing_mode ?? 'local_proxy');
    setDisableLocalFallbacks(Boolean(data.livekit.disable_local_fallbacks));
    setApiKey('');
    setApiSecret('');
    setClearKey(false);
    setClearSecret(false);
    setTestResult(null);
    const callMap: Record<string, string> = {};
    const partMap: Record<string, string> = {};
    const reasonMap: Record<string, string> = {};
    for (const e of data.status_catalog) {
      if (e.kind === 'call') callMap[e.id] = e.label;
      if (e.kind === 'participant') partMap[e.id] = e.label;
      if (e.kind === 'end_reason') reasonMap[e.id] = e.label;
    }
    setCallLabels(callMap);
    setParticipantLabels(partMap);
    setEndReasonLabels(reasonMap);
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => {
      if (!data) throw new Error('no data');
      const body: Parameters<typeof patchCallSettings>[0] = {
        enabled: enabledMode === 'inherit' ? null : enabledMode === 'on',
        features,
        allowed_roles: roles,
        ring_timeout_sec: ringTimeout,
        token_ttl_sec: tokenTtl,
        invite_ttl_hours: inviteTtl,
        max_group_participants: maxParticipants,
        ghost_grace_sec: ghostGrace,
        ghost_miss_ticks: ghostMiss,
        livekit_internal_url: internalUrl.trim() || null,
        livekit_public_url: publicUrl.trim() || null,
        livekit_routing_mode: routingMode,
        livekit_disable_local_fallbacks: disableLocalFallbacks,
        status_labels: {
          call: callLabels,
          participant: participantLabels,
          end_reason: endReasonLabels,
        },
      };
      if (clearKey) body.clear_livekit_api_key = true;
      else if (apiKey.trim()) body.livekit_api_key = apiKey.trim();
      if (clearSecret) body.clear_livekit_api_secret = true;
      else if (apiSecret.trim()) body.livekit_api_secret = apiSecret.trim();
      return patchCallSettings(body);
    },
    onSuccess: () => {
      setNote({ type: 'ok', text: 'Настройки звонков сохранены.' });
      setTestResult(null);
      void qc.invalidateQueries({ queryKey: Q_CALLS });
      void qc.invalidateQueries({ queryKey: Q_STATS });
    },
    onError: (e) =>
      setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось сохранить настройки звонков.') }),
  });

  const testMut = useMutation({
    mutationFn: () => {
      const body: Parameters<typeof testLiveKitConnection>[0] = {
        livekit_internal_url: internalUrl.trim() || null,
        livekit_public_url: publicUrl.trim() || null,
        livekit_routing_mode: routingMode,
        livekit_disable_local_fallbacks: disableLocalFallbacks,
      };
      if (apiKey.trim()) body.livekit_api_key = apiKey.trim();
      if (apiSecret.trim()) body.livekit_api_secret = apiSecret.trim();
      return testLiveKitConnection(body);
    },
    onSuccess: (result) => {
      setTestResult(result);
      setNote(
        result.ok
          ? { type: 'ok', text: 'Подключение к LiveKit успешно.' }
          : {
              type: 'err',
              text: result.error
                ? `Проверка не прошла: ${result.error}`
                : 'Проверка не прошла — Room Service недоступен.',
            },
      );
    },
    onError: (e) =>
      setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось проверить LiveKit.') }),
  });

  const hasKey = Boolean(apiKey.trim()) || (Boolean(data?.livekit.has_api_key) && !clearKey);
  const hasSecret =
    Boolean(apiSecret.trim()) || (Boolean(data?.livekit.has_api_secret) && !clearSecret);
  const remoteRequiredMissing =
    routingMode === 'remote_server' &&
    (!internalUrl.trim() || !publicUrl.trim() || !hasKey || !hasSecret);

  if (isLoading) {
    return <div className="h-56 animate-pulse rounded-2xl bg-stone-200/50" />;
  }
  if (error || !data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/80 p-6 text-center">
        <p className="font-semibold text-red-900">Не удалось загрузить настройки звонков</p>
        <p className="mt-2 text-sm text-red-800">{apiErrorMessage(error, 'Ошибка сети или сервера.')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StatusBanner data={data} onRefresh={() => void refetch()} refreshing={isFetching} />

      {note ? (
        <div
          className={
            note.type === 'ok'
              ? 'rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900'
              : 'rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900'
          }
        >
          {note.text}
        </div>
      ) : null}

      <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5 space-y-4">
        <header>
          <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
            <LuPhone className="h-4 w-4" aria-hidden />
            Включение звонков
          </h3>
          <p className="mt-1 text-xs text-stone-500">
            Можно явно включить/выключить или наследовать флаг <code>CALLS_ENABLED</code> из окружения
            (сейчас env: {data.env_calls_enabled ? 'true' : 'false'}).
          </p>
        </header>
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              ['inherit', 'Как в .env'],
              ['on', 'Включено'],
              ['off', 'Выключено'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={
                enabledMode === id
                  ? 'rounded-xl border border-primary bg-primary/10 px-3 py-2.5 text-sm font-semibold text-primary'
                  : 'rounded-xl border border-stone-200 px-3 py-2.5 text-sm font-medium text-stone-600'
              }
              onClick={() => setEnabledMode(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-stone-500">
          Эффективно сейчас:{' '}
          <strong className={data.effective_enabled ? 'text-emerald-700' : 'text-red-700'}>
            {data.effective_enabled ? 'включено' : 'выключено'}
          </strong>{' '}
          ({sourceHint(data.enabled_source)})
        </p>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5 space-y-4">
        <header>
          <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
            <LuServer className="h-4 w-4" aria-hidden />
            Сервер LiveKit
          </h3>
          <p className="mt-1 text-xs text-stone-500">
            Куда приложение отправляет звонки: локальный прокси на этом хосте или отдельный удалённый
            LiveKit. Секреты в пустых полях не меняются.
          </p>
        </header>

        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              {
                id: 'local_proxy' as const,
                title: 'Локальный прокси',
                desc: 'Браузер → wss://приложение/lk (nginx). Room Service с текущего хоста.',
              },
              {
                id: 'remote_server' as const,
                title: 'Удалённый сервер LiveKit',
                desc: 'Браузер и API ходят на новый хост. Нужны Room Service URL, Public WSS, Key и Secret.',
              },
            ] as const
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={
                routingMode === mode.id
                  ? 'rounded-xl border border-primary bg-primary/10 px-3 py-3 text-left'
                  : 'rounded-xl border border-stone-200 px-3 py-3 text-left hover:bg-stone-50'
              }
              onClick={() => {
                setRoutingMode(mode.id);
                setDisableLocalFallbacks(mode.id === 'remote_server');
                setTestResult(null);
              }}
            >
              <p
                className={`text-sm font-semibold ${
                  routingMode === mode.id ? 'text-primary' : 'text-stone-800'
                }`}
              >
                {mode.title}
              </p>
              <p className="mt-1 text-[11px] text-stone-500">{mode.desc}</p>
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-stone-100 bg-stone-50/80 px-3 py-3 space-y-1.5">
          <p className="text-xs font-semibold text-stone-800">Сейчас реально используется</p>
          <p className="text-[11px] text-stone-600 break-all">
            Room Service:{' '}
            <span className="font-medium text-stone-800">
              {data.livekit.effective_internal_url || '—'}
            </span>{' '}
            <span className="text-stone-400">({sourceHint(data.livekit.internal_url_source)})</span>
          </p>
          <p className="text-[11px] text-stone-600 break-all">
            Public WSS:{' '}
            <span className="font-medium text-stone-800">
              {data.livekit.effective_public_url || '—'}
            </span>{' '}
            <span className="text-stone-400">({sourceHint(data.livekit.public_url_source)})</span>
          </p>
          {data.livekit.public_url_warning ? (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
              {data.livekit.public_url_warning}
            </p>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-stone-600 sm:col-span-2">
            Room Service URL (API → LiveKit)
            <input
              className={`${fieldClass()} mt-1`}
              value={internalUrl}
              onChange={(e) => {
                setInternalUrl(e.target.value);
                setTestResult(null);
              }}
              placeholder={
                routingMode === 'remote_server'
                  ? 'https://livekit.example.com или http://IP:7880'
                  : 'http://host.docker.internal:7880'
              }
              required={routingMode === 'remote_server'}
            />
            <span className="mt-1 block text-[11px] text-stone-400">
              Источник сохранённого: {sourceHint(data.livekit.internal_url_source)}
            </span>
          </label>
          <label className="block text-xs font-medium text-stone-600 sm:col-span-2">
            Public WSS (браузер)
            <input
              className={`${fieldClass()} mt-1`}
              value={publicUrl}
              onChange={(e) => {
                setPublicUrl(e.target.value);
                setTestResult(null);
              }}
              placeholder={
                routingMode === 'remote_server'
                  ? 'wss://livekit.example.com'
                  : 'wss://app.example.com/lk'
              }
              required={routingMode === 'remote_server'}
            />
            <span className="mt-1 block text-[11px] text-stone-400">
              В режиме «удалённый сервер» этот адрес уходит в браузер как есть (без подмены на /lk).
            </span>
          </label>
          <label className="block text-xs font-medium text-stone-600">
            API Key
            <input
              className={`${fieldClass()} mt-1`}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setClearKey(false);
                setTestResult(null);
              }}
              placeholder={
                data.livekit.api_key_masked
                  ? `Текущий: ${data.livekit.api_key_masked}`
                  : 'Введите ключ'
              }
              autoComplete="off"
            />
            <label className="mt-2 flex items-center gap-2 text-[11px] font-normal text-stone-500">
              <input type="checkbox" checked={clearKey} onChange={(e) => setClearKey(e.target.checked)} />
              Сбросить ключ к env
            </label>
          </label>
          <label className="block text-xs font-medium text-stone-600">
            API Secret
            <input
              className={`${fieldClass()} mt-1`}
              type="password"
              value={apiSecret}
              onChange={(e) => {
                setApiSecret(e.target.value);
                setClearSecret(false);
                setTestResult(null);
              }}
              placeholder={
                data.livekit.has_api_secret
                  ? 'Секрет задан — вставьте новый, чтобы заменить'
                  : 'Введите секрет'
              }
              autoComplete="new-password"
            />
            <label className="mt-2 flex items-center gap-2 text-[11px] font-normal text-stone-500">
              <input
                type="checkbox"
                checked={clearSecret}
                onChange={(e) => setClearSecret(e.target.checked)}
              />
              Сбросить секрет к env
            </label>
          </label>
        </div>

        <label className="flex items-start gap-2 text-xs text-stone-600">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={disableLocalFallbacks}
            onChange={(e) => {
              setDisableLocalFallbacks(e.target.checked);
              setTestResult(null);
            }}
          />
          <span>
            Не пробовать локальные fallback Room Service (docker-gateway / 127.0.0.1). Рекомендуется
            для удалённого сервера — иначе можно получить ложный OK от старого инстанса.
          </span>
        </label>

        {routingMode === 'remote_server' && remoteRequiredMissing ? (
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
            Для удалённого сервера заполните Room Service URL, Public WSS, API Key и Secret (или
            оставьте уже сохранённые ключи).
          </p>
        ) : null}

        {publicUrl.trim().startsWith('http://') || publicUrl.trim().startsWith('ws://') ? (
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
            Публичный URL без TLS (ws/http). На проде обычно нужен wss:// .
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={btnSecondary()}
            disabled={testMut.isPending || (routingMode === 'remote_server' && remoteRequiredMissing)}
            onClick={() => testMut.mutate()}
          >
            {testMut.isPending ? 'Проверка…' : 'Проверить подключение'}
          </button>
          {testResult ? (
            <span
              className={`text-xs font-medium ${
                testResult.ok ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {testResult.ok
                ? `OK · ${testResult.internal_url || 'Room Service'}`
                : testResult.error || 'недоступен'}
            </span>
          ) : null}
        </div>
        {testResult?.warnings?.length ? (
          <ul className="space-y-1">
            {testResult.warnings.map((w) => (
              <li
                key={w}
                className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5"
              >
                {w}
              </li>
            ))}
          </ul>
        ) : null}
        {testResult?.public_url_effective ? (
          <p className="text-[11px] text-stone-500 break-all">
            Effective Public WSS при проверке: {testResult.public_url_effective}
          </p>
        ) : null}

        <details className="rounded-xl border border-stone-100 bg-stone-50/60 px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold text-stone-800">
            Чеклист переноса на другой сервер
          </summary>
          <div className="mt-2 space-y-2 text-[11px] text-stone-600">
            <p className="font-medium text-stone-700">Что меняет эта форма (приложение):</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Режим маршрутизации (локальный прокси / удалённый сервер)</li>
              <li>URL Room Service и публичный WSS для браузера</li>
              <li>API Key / Secret для выдачи токенов и Room Service</li>
            </ul>
            <p className="font-medium text-stone-700 pt-1">
              Что настраивают на новом сервере LiveKit (вне админки):
            </p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>RTC node IP / advertised addresses</li>
              <li>TURN (3478 / 50100) и firewall UDP/TCP 7881–7882</li>
              <li>TLS и DNS для публичного WSS</li>
              <li>nginx upstream / docker compose на стороне медиа-ноды</li>
            </ul>
          </div>
        </details>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5 space-y-4">
        <header>
          <h3 className="text-sm font-semibold text-stone-900">Лимиты и таймауты</h3>
          <p className="mt-1 text-xs text-stone-500">
            Гудки, TTL токена/приглашения, лимит группы, очистка «призраков» — как в CALL_* переменных.
          </p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <IntField
            label="Таймаут гудков, сек"
            syncKey={`ring:${data.ring_timeout_sec}`}
            value={ringTimeout}
            onChange={setRingTimeout}
            min={data.limits.ring_timeout_sec.min}
            max={data.limits.ring_timeout_sec.max}
            hint={`по умолчанию ${data.limits.ring_timeout_sec.default}`}
          />
          <IntField
            label="TTL JWT токена, сек"
            syncKey={`ttl:${data.token_ttl_sec}`}
            value={tokenTtl}
            onChange={setTokenTtl}
            min={data.limits.token_ttl_sec.min}
            max={data.limits.token_ttl_sec.max}
            hint={`по умолчанию ${data.limits.token_ttl_sec.default}`}
          />
          <IntField
            label="TTL приглашения, ч"
            syncKey={`invite:${data.invite_ttl_hours}`}
            value={inviteTtl}
            onChange={setInviteTtl}
            min={data.limits.invite_ttl_hours.min}
            max={data.limits.invite_ttl_hours.max}
            hint={`по умолчанию ${data.limits.invite_ttl_hours.default}`}
          />
          <IntField
            label="Макс. участников группы"
            syncKey={`max:${data.max_group_participants}`}
            value={maxParticipants}
            onChange={setMaxParticipants}
            min={data.limits.max_group_participants.min}
            max={data.limits.max_group_participants.max}
            hint={`по умолчанию ${data.limits.max_group_participants.default}`}
          />
          <IntField
            label="Grace «призраков», сек"
            syncKey={`grace:${data.ghost_grace_sec}`}
            value={ghostGrace}
            onChange={setGhostGrace}
            min={data.limits.ghost_grace_sec.min}
            max={data.limits.ghost_grace_sec.max}
            hint={`по умолчанию ${data.limits.ghost_grace_sec.default}`}
          />
          <IntField
            label="Пропуски LiveKit до left"
            syncKey={`miss:${data.ghost_miss_ticks}`}
            value={ghostMiss}
            onChange={setGhostMiss}
            min={data.limits.ghost_miss_ticks.min}
            max={data.limits.ghost_miss_ticks.max}
            hint={`по умолчанию ${data.limits.ghost_miss_ticks.default}`}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5 space-y-4">
        <header>
          <h3 className="text-sm font-semibold text-stone-900">Возможности</h3>
          <p className="mt-1 text-xs text-stone-500">Какие типы звонков разрешены пользователям.</p>
        </header>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ['direct_calls', 'Личные звонки'],
              ['group_calls', 'Групповые звонки'],
              ['link_meetings', 'Встречи по ссылке'],
              ['audio', 'Аудио'],
              ['video', 'Видео'],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex items-center gap-3 rounded-xl border border-stone-200 px-3 py-2.5 text-sm text-stone-800"
            >
              <input
                type="checkbox"
                checked={features[key]}
                onChange={(e) => setFeatures((f) => ({ ...f, [key]: e.target.checked }))}
              />
              {label}
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5 space-y-4">
        <header>
          <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
            <LuUsers className="h-4 w-4" aria-hidden />
            Кто может начинать звонки
          </h3>
          <p className="mt-1 text-xs text-stone-500">Роли приложения, которым разрешено создавать звонки и встречи.</p>
        </header>
        <div className="flex flex-wrap gap-2">
          {data.role_catalog.map((role) => {
            const on = roles.includes(role.id);
            return (
              <button
                key={role.id}
                type="button"
                className={
                  on
                    ? 'rounded-xl border border-primary bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary'
                    : 'rounded-xl border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600'
                }
                onClick={() =>
                  setRoles((prev) =>
                    prev.includes(role.id) ? prev.filter((r) => r !== role.id) : [...prev, role.id],
                  )
                }
              >
                {role.label}
              </button>
            );
          })}
        </div>
      </section>

      <StatusLabelsEditor
        title="Статусы звонка"
        kind="call"
        catalog={data.status_catalog.filter((e) => e.kind === 'call')}
        values={callLabels}
        onChange={setCallLabels}
      />
      <StatusLabelsEditor
        title="Статусы участников"
        kind="participant"
        catalog={data.status_catalog.filter((e) => e.kind === 'participant')}
        values={participantLabels}
        onChange={setParticipantLabels}
      />
      <StatusLabelsEditor
        title="Причины завершения"
        kind="end_reason"
        catalog={data.status_catalog.filter((e) => e.kind === 'end_reason')}
        values={endReasonLabels}
        onChange={setEndReasonLabels}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={btnPrimary()}
          disabled={saveMut.isPending || roles.length === 0 || remoteRequiredMissing}
          onClick={() => saveMut.mutate()}
        >
          {saveMut.isPending ? 'Сохранение…' : 'Сохранить настройки'}
        </button>
        <button
          type="button"
          className={btnSecondary()}
          disabled={isFetching}
          onClick={() => void refetch()}
        >
          <span className="inline-flex items-center gap-2">
            <LuRefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} aria-hidden />
            Обновить статус
          </span>
        </button>
      </div>
    </div>
  );
}

function StatusBanner({
  data,
  onRefresh,
  refreshing,
}: {
  data: CallSettingsAdminResponse;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const probe = data.livekit.probe;
  const ok = data.effective_enabled && data.livekit.configured && probe?.ok;
  return (
    <section
      className={
        ok
          ? 'rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4'
          : 'rounded-2xl border border-amber-200 bg-amber-50/70 p-4'
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-stone-900 flex items-center gap-2">
            <LuSignal className="h-4 w-4" aria-hidden />
            Состояние службы звонков
          </p>
          <ul className="mt-2 space-y-1 text-xs text-stone-700">
            <li className="flex items-center gap-2">
              <Dot ok={data.effective_enabled} />
              Звонки: {data.effective_enabled ? 'включены' : 'выключены'} ({sourceHint(data.enabled_source)})
            </li>
            <li className="flex items-center gap-2">
              <Dot ok={data.livekit.configured} />
              LiveKit настроен: {data.livekit.configured ? 'да' : 'нет'}
            </li>
            <li className="flex items-center gap-2">
              <Dot ok={Boolean(probe?.ok)} />
              Room Service:{' '}
              {probe?.ok
                ? `OK${probe.url ? ` (${probe.url})` : ''}`
                : probe?.error || 'не проверен'}
            </li>
          </ul>
        </div>
        <button type="button" className={btnSecondary()} onClick={onRefresh} disabled={refreshing}>
          <LuRefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
        </button>
      </div>
    </section>
  );
}

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-red-500'}`}
      aria-hidden
    />
  );
}

function IntField({
  label,
  syncKey,
  value,
  onChange,
  min,
  max,
  hint,
}: {
  label: string;
  syncKey: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  hint?: string;
}) {
  return (
    <label className="block text-xs font-medium text-stone-600">
      {label}
      <IntegerTextInput
        syncKey={syncKey}
        className={`${fieldClass()} mt-1`}
        value={value}
        onChange={(n) => onChange(typeof n === 'number' ? n : min)}
        min={min}
        max={max}
      />
      {hint ? <span className="mt-1 block text-[11px] text-stone-400">{hint}</span> : null}
    </label>
  );
}

function StatusLabelsEditor({
  title,
  catalog,
  values,
  onChange,
}: {
  title: string;
  kind: string;
  catalog: CallSettingsAdminResponse['status_catalog'];
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5 space-y-3">
      <header>
        <h3 className="text-sm font-semibold text-stone-900">{title}</h3>
        <p className="mt-1 text-xs text-stone-500">
          Подписи для админки и статистики. Пустое значение вернёт подпись по умолчанию при следующем
          сохранении через сброс к default.
        </p>
      </header>
      <div className="space-y-2">
        {catalog.map((entry) => (
          <div
            key={`${entry.kind}:${entry.id}`}
            className="grid gap-2 rounded-xl border border-stone-100 bg-stone-50/60 p-3 sm:grid-cols-[140px_1fr]"
          >
            <div>
              <p className="text-xs font-semibold text-stone-800">{entry.id}</p>
              <p className="text-[11px] text-stone-500">{entry.description}</p>
            </div>
            <input
              className={fieldClass()}
              value={values[entry.id] ?? ''}
              placeholder={entry.default_label}
              onChange={(e) => onChange({ ...values, [entry.id]: e.target.value })}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function CallsStatsPanel() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState('');

  const queryKey = useMemo(() => [...Q_STATS, from, to, status] as const, [from, to, status]);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: () =>
      fetchCallUsageStats({
        from: new Date(`${from}T00:00:00`).toISOString(),
        to: new Date(`${to}T23:59:59`).toISOString(),
        status: status || undefined,
        limit: 50,
      }),
  });

  if (isLoading) {
    return <div className="h-56 animate-pulse rounded-2xl bg-stone-200/50" />;
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/80 p-6 text-center">
        <p className="font-semibold text-red-900">Не удалось загрузить статистику</p>
        <p className="mt-2 text-sm text-red-800">{apiErrorMessage(error, 'Ошибка сети или сервера.')}</p>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-3">
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
              <option value="">Все</option>
              {data.by_status.map((s) => (
                <option key={s.status} value={s.status}>
                  {s.label}
                </option>
              ))}
              {['ringing', 'waiting', 'active', 'ended', 'missed', 'declined', 'cancelled', 'failed']
                .filter((s) => !data.by_status.some((x) => x.status === s))
                .map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
            </select>
          </label>
          <button type="button" className={btnSecondary()} onClick={() => void refetch()} disabled={isFetching}>
            <span className="inline-flex items-center gap-2">
              <LuRefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} aria-hidden />
              Обновить
            </span>
          </button>
        </div>
      </section>

      <SummaryCards summary={data.summary} />

      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownCard title="По статусам" rows={data.by_status.map((r) => ({ label: r.label, count: r.count }))} />
        <BreakdownCard
          title="По причинам завершения"
          rows={data.by_end_reason.map((r) => ({ label: r.label, count: r.count }))}
        />
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5 overflow-x-auto">
        <h3 className="text-sm font-semibold text-stone-900 mb-3">Активность по дням</h3>
        {data.by_day.length === 0 ? (
          <p className="text-sm text-stone-500">Нет звонков за период.</p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-stone-500">
              <tr>
                <th className="py-2 pr-4">День</th>
                <th className="py-2 pr-4">Звонков</th>
                <th className="py-2 pr-4">Ср. длительность</th>
                <th className="py-2">Ср. качество</th>
              </tr>
            </thead>
            <tbody>
              {data.by_day.map((d) => (
                <tr key={d.day} className="border-t border-stone-100">
                  <td className="py-2 pr-4 font-medium text-stone-800">{d.day}</td>
                  <td className="py-2 pr-4">{d.count}</td>
                  <td className="py-2 pr-4">{formatDuration(d.avg_duration_sec)}</td>
                  <td className="py-2">{qualityBadge(d.avg_quality)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5 overflow-x-auto">
        <h3 className="text-sm font-semibold text-stone-900 mb-3">Кто звонит чаще</h3>
        {data.top_users.length === 0 ? (
          <p className="text-sm text-stone-500">Пока нет данных.</p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-stone-500">
              <tr>
                <th className="py-2 pr-4">Участник</th>
                <th className="py-2 pr-4">Начал</th>
                <th className="py-2 pr-4">Участвовал</th>
                <th className="py-2 pr-4">В эфире</th>
                <th className="py-2">Качество</th>
              </tr>
            </thead>
            <tbody>
              {data.top_users.map((u) => (
                <tr key={u.member_id} className="border-t border-stone-100">
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      <PersonAvatar
                        name={u.name}
                        src={u.avatar_url ? resolvePublicUrl(u.avatar_url) : null}
                        size={28}
                      />
                      <span className="font-medium text-stone-800">{u.name}</span>
                    </div>
                  </td>
                  <td className="py-2 pr-4">{u.calls_initiated}</td>
                  <td className="py-2 pr-4">{u.calls_joined}</td>
                  <td className="py-2 pr-4">{formatDuration(u.total_duration_sec)}</td>
                  <td className="py-2">{qualityBadge(u.avg_quality)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <RecentCallsTable recent={data.recent} />
    </div>
  );
}

function SummaryCards({ summary }: { summary: CallUsageStatsResponse['summary'] }) {
  const cards = [
    { label: 'Всего', value: String(summary.total_calls) },
    { label: 'Сейчас активны', value: String(summary.active_now) },
    { label: 'Завершены', value: String(summary.completed) },
    { label: 'Пропущены', value: String(summary.missed) },
    { label: 'Отклонены', value: String(summary.declined) },
    { label: 'Ср. длительность', value: formatDuration(summary.avg_duration_sec) },
    { label: 'Ср. качество', value: summary.avg_quality_score != null ? `${summary.avg_quality_score}/5` : '—' },
    {
      label: 'Аудио / видео',
      value: `${summary.by_media.audio} / ${summary.by_media.video}`,
    },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-[11px] uppercase tracking-wide text-stone-500">{c.label}</p>
          <p className="mt-1 text-xl font-semibold text-stone-900">{c.value}</p>
        </div>
      ))}
    </div>
  );
}

function BreakdownCard({ title, rows }: { title: string; rows: Array<{ label: string; count: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-stone-900 mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-stone-500">Нет данных.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="mb-1 flex items-center justify-between text-xs text-stone-700">
                <span>{r.label}</span>
                <span className="font-semibold">{r.count}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentCallsTable({ recent }: { recent: CallUsageStatsResponse['recent'] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-stone-900 mb-3">Последние звонки</h3>
      {recent.length === 0 ? (
        <p className="text-sm text-stone-500">За период звонков нет.</p>
      ) : (
        <ul className="space-y-2">
          {recent.map((c) => {
            const open = openId === c.id;
            return (
              <li key={c.id} className="rounded-xl border border-stone-100 bg-stone-50/50">
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center gap-3 px-3 py-3 text-left"
                  onClick={() => setOpenId(open ? null : c.id)}
                >
                  <PersonAvatar
                    name={c.initiator_name}
                    src={c.initiator_avatar ? resolvePublicUrl(c.initiator_avatar) : null}
                    size={32}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-stone-900">
                      {c.title || c.initiator_name}
                      <span className="ml-2 font-normal text-stone-500">
                        · {c.media_type === 'video' ? 'видео' : 'аудио'} · {c.type}
                      </span>
                    </p>
                    <p className="text-xs text-stone-500">
                      {formatWhen(c.created_at)} · {c.status_label}
                      {c.end_reason_label ? ` · ${c.end_reason_label}` : ''} ·{' '}
                      {formatDuration(c.duration_seconds)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {qualityBadge(c.quality_score)}
                    {open ? <LuCheck className="h-4 w-4 text-stone-400" aria-hidden /> : null}
                  </div>
                </button>
                {open ? (
                  <div className="border-t border-stone-100 px-3 py-3 text-xs text-stone-700 space-y-3">
                    <div>
                      <p className="font-semibold text-stone-800 mb-1">Участники</p>
                      <ul className="space-y-1">
                        {c.participants.map((p) => (
                          <li key={p.user_id} className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-2">
                              <PersonAvatar
                                name={p.name}
                                src={p.avatar_url ? resolvePublicUrl(p.avatar_url) : null}
                                size={22}
                              />
                              {p.name}
                              <span className="text-stone-400">({p.role})</span>
                            </span>
                            <span className="text-stone-500">{p.status}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    {c.quality_reports.length > 0 ? (
                      <div>
                        <p className="font-semibold text-stone-800 mb-1">Отчёты качества</p>
                        <ul className="space-y-1">
                          {c.quality_reports.map((r) => (
                            <li key={`${r.userId}-${r.at}`}>
                              user #{r.userId}: {r.score}/5
                              {r.connectionQuality ? ` · ${r.connectionQuality}` : ''}
                              {r.rttMs != null ? ` · RTT ${Math.round(r.rttMs)}мс` : ''}
                              {r.packetLoss != null
                                ? ` · loss ${(r.packetLoss * 100).toFixed(1)}%`
                                : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-stone-500">Отчётов качества пока нет.</p>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
