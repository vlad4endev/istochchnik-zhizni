import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { LuBell, LuExpand, LuPlay, LuTv } from 'react-icons/lu';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBroadcast, fetchActiveBroadcast, fetchFinishedBroadcasts, patchBroadcast, type BroadcastData } from '../../../api/broadcast';
import { PageHeader } from '@/components/layout/PageHeader';
import { sectionHeroStickyClass } from '../../../lib/sectionHeroChrome';
import { useAuthStore } from '../../auth/authStore';
import { detectPlatform, getEmbedUrl, parseBroadcastInputToEmbed } from '../../../utils/broadcast';
import {
  BROADCAST_SLOT_MS,
  formatBroadcastCountdownPhrase,
  formatBroadcastMainTimer,
  getBroadcastUiMode,
} from '../../../utils/broadcastDisplay';
import { emitAppToast } from '../../../lib/uiFeedback';
import { useMe } from '@/hooks/useMe';
import { keys } from '@/lib/queryKeys';
import { SkeletonBox } from '@/components/ui/SkeletonBox';

function btnPrimary(c = '') { return `flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-white shadow hover:border-transparent hover:!bg-[#e34254] disabled:pointer-events-none disabled:opacity-50 transition-colors ${c}`; }
function btnSecondary(c = '') { return `flex h-10 items-center justify-center rounded-xl border border-stone-200 bg-white px-4 text-sm font-bold text-stone-700 hover:bg-stone-50 disabled:pointer-events-none disabled:opacity-50 transition-colors ${c}`; }
function fieldClass() { return 'w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none focus:border-primary focus:bg-white transition-colors'; }

function splitStartDateTime(startsAt: string | null): { date: string; time: string } {
  if (!startsAt) return { date: '', time: '' };
  const dt = new Date(startsAt);
  if (Number.isNaN(dt.getTime())) return { date: '', time: '' };
  const y = dt.getFullYear();
  const m = `${dt.getMonth() + 1}`.padStart(2, '0');
  const d = `${dt.getDate()}`.padStart(2, '0');
  const h = `${dt.getHours()}`.padStart(2, '0');
  const min = `${dt.getMinutes()}`.padStart(2, '0');
  return { date: `${y}-${m}-${d}`, time: `${h}:${min}` };
}

function platformIcon(platform: string): string {
  if (platform === 'youtube') return '▶️';
  if (platform === 'rutube') return '📺';
  if (platform === 'vk') return '🟦';
  return '🎬';
}

function platformLabel(platform: string): string {
  if (platform === 'youtube') return 'YouTube';
  if (platform === 'rutube') return 'RuTube';
  if (platform === 'vk') return 'VK Видео';
  return 'Не определена';
}

export function BroadcastPage() {
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.role);
  const meQ = useMe();
  const ministryDirection = String(meQ.data?.ministry_direction ?? '').trim().toLowerCase().replace(/ё/g, 'е');
  const isAdmin = role === 'admin' || role === 'minister' || ministryDirection.includes('медиа');
  const { data, isLoading: broadcastLoading, error } = useQuery({
    queryKey: keys.broadcast,
    queryFn: fetchActiveBroadcast,
  });
  const activeBroadcast = data?.broadcast ?? null;
  const [playerUrl, setPlayerUrl] = useState<string | null>(null);
  const [broadcastTickMs, setBroadcastTickMs] = useState(() => Date.now());
  const [datePart, setDatePart] = useState('');
  const [timePart, setTimePart] = useState('');
  const [smartInput, setSmartInput] = useState('');
  const [streamUrlError, setStreamUrlError] = useState<string | null>(null);
  const [formState, setFormState] = useState<{
    title: string;
    stream_url: string;
    description: string;
    notify_members: boolean;
    is_public: boolean;
    platform: BroadcastData['platform'];
  }>({
    title: '',
    stream_url: '',
    description: '',
    notify_members: true,
    is_public: false,
    platform: 'other',
  });

  const { data: archiveData } = useQuery({
    queryKey: keys.broadcastArchive(10),
    queryFn: () => fetchFinishedBroadcasts(10),
    enabled: isAdmin,
  });

  useEffect(() => {
    setPlayerUrl(getEmbedUrl(activeBroadcast?.stream_url ?? '') ?? null);
    const { date, time } = splitStartDateTime(activeBroadcast?.starts_at ?? null);
    setDatePart(date);
    setTimePart(time);
    setFormState({
      title: activeBroadcast?.title ?? '',
      stream_url: activeBroadcast?.stream_url ?? '',
      description: activeBroadcast?.description ?? '',
      notify_members: Boolean(activeBroadcast?.notify_members ?? true),
      is_public: Boolean(activeBroadcast?.is_public ?? false),
      platform: activeBroadcast?.platform ?? detectPlatform(activeBroadcast?.stream_url),
    });
  }, [activeBroadcast?.description, activeBroadcast?.id, activeBroadcast?.is_public, activeBroadcast?.notify_members, activeBroadcast?.platform, activeBroadcast?.starts_at, activeBroadcast?.stream_url, activeBroadcast?.title]);

  useEffect(() => {
    const id = window.setInterval(() => setBroadcastTickMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const broadcastUiMode = getBroadcastUiMode(broadcastTickMs, activeBroadcast);
  const broadcastMainTimer = formatBroadcastMainTimer(broadcastTickMs, activeBroadcast);
  const countdownPhrase = formatBroadcastCountdownPhrase(broadcastTickMs, activeBroadcast?.starts_at ?? null);
  const broadcastEndsLabel = useMemo(() => {
    if (!activeBroadcast?.starts_at) return null;
    if (broadcastUiMode !== 'pre' && broadcastUiMode !== 'onair') return null;
    const t = new Date(activeBroadcast.starts_at).getTime();
    if (!Number.isFinite(t)) return null;
    return format(new Date(t + BROADCAST_SLOT_MS), 'dd.MM.yyyy HH:mm', { locale: ru });
  }, [activeBroadcast?.starts_at, broadcastUiMode]);

  const saveMutation = useMutation({
    mutationFn: async (payload: Partial<BroadcastData>) => {
      if (activeBroadcast?.id) {
        return patchBroadcast(activeBroadcast.id, payload);
      }
      return createBroadcast({
        ...payload,
        status: 'scheduled',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.broadcast });
      emitAppToast({ kind: 'success', message: 'Настройки трансляции сохранены' });
    },
    onError: () => emitAppToast({ kind: 'error', message: 'Не удалось сохранить настройки трансляции' }),
  });

  const activeStartsAtIso = useMemo(() => {
    if (!datePart || !timePart) return null;
    return new Date(`${datePart}T${timePart}:00`).toISOString();
  }, [datePart, timePart]);

  const onSave = () => {
    const streamRaw = formState.stream_url.trim();
    if (streamRaw) {
      const parsed = parseBroadcastInputToEmbed(streamRaw);
      if (!parsed) {
        setStreamUrlError('Укажите корректную ссылку или iframe-код плеера.');
        emitAppToast({ kind: 'error', message: 'Сохранение невозможно: ссылка трансляции некорректна' });
        return;
      }
      if (parsed !== streamRaw) {
        setFormState((prev) => ({ ...prev, stream_url: parsed, platform: detectPlatform(parsed) }));
      }
    }
    setStreamUrlError(null);
    saveMutation.mutate({
      title: formState.title || null,
      stream_url: formState.stream_url || null,
      description: formState.description || null,
      notify_members: formState.notify_members,
      is_public: formState.is_public,
      platform: formState.platform,
      starts_at: activeStartsAtIso,
    });
  };

  const onReminder = () => {
    if (!activeBroadcast?.starts_at) {
      emitAppToast({ kind: 'info', message: 'Время начала пока не задано' });
      return;
    }
    localStorage.setItem('broadcast_reminder_at', activeBroadcast.starts_at);
    emitAppToast({ kind: 'success', message: 'Напоминание сохранено' });
  };

  const applySmartEmbedInput = () => {
    const parsed = parseBroadcastInputToEmbed(smartInput);
    if (!parsed) {
      emitAppToast({
        kind: 'error',
        message: 'Не удалось распознать ссылку. Вставьте URL или iframe-код плеера.',
      });
      return;
    }
    setStreamUrlError(null);
    setFormState((prev) => ({
      ...prev,
      stream_url: parsed,
      platform: detectPlatform(parsed),
    }));
    setPlayerUrl(parsed);
    emitAppToast({ kind: 'success', message: 'Ссылка распознана и подставлена в трансляцию' });
  };

  return (
    <div className="min-h-full bg-[var(--surface)] max-lg:pb-0 lg:pb-8">
      <div className={sectionHeroStickyClass}>
        <PageHeader title="Трансляция" />
      </div>

      <div className="px-3 py-6 sm:px-4 sm:py-8 md:px-6 lg:px-8 xl:px-10">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-6 sm:gap-8 md:max-w-xl lg:max-w-4xl xl:max-w-6xl">
          <section className="rounded-[1.35rem] border border-stone-200/70 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow-card)] sm:rounded-3xl sm:p-6 sm:shadow-[var(--shadow)] lg:p-8 shell:p-8" aria-labelledby="broadcast-heading">
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 id="broadcast-heading" className="flex items-center gap-3 text-base font-extrabold text-stone-900 sm:text-lg md:text-xl">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/[0.08] text-primary/80 shrink-0">
                  <LuTv className="h-6 w-6" strokeWidth={2} aria-hidden />
                </div>
                <span className="leading-tight">Прямой эфир</span>
              </h2>
            </div>

            <div className="player-ratio-box">
              {broadcastLoading ? (
                <div className="absolute inset-0 bg-stone-950/50 p-6">
                  <div className="mx-auto flex h-full w-full max-w-xl flex-col justify-center gap-3">
                    <SkeletonBox height="18px" width="42%" />
                    <SkeletonBox height="12px" width="86%" />
                    <SkeletonBox height="12px" width="58%" />
                  </div>
                </div>
              ) : error ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400 p-6 text-center bg-stone-950/50">
                  <p className="text-sm font-medium">Не удалось загрузить данные трансляции</p>
                </div>
              ) : playerUrl ? (
                <iframe src={playerUrl} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen title="Трансляция" />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-stone-400 p-6 text-center bg-stone-950/50">
                  <img src="/assets/logo.svg" alt="Логотип церкви" className="mb-4 h-14 w-14 opacity-70" />
                  <p className="text-sm font-medium">Трансляция скоро начнётся</p>
                </div>
              )}
            </div>

            <div className="mt-4 space-y-1">
              {broadcastUiMode === 'post' ? (
                <p className="text-sm font-semibold text-stone-600">Запланированный эфир завершён (прошло 2 ч с указанного начала).</p>
              ) : broadcastUiMode === 'onair' ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs font-extrabold text-white">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" aria-hidden />
                    В эфире
                  </span>
                  <p className="text-sm font-semibold text-stone-800 tabular-nums">Идёт: {broadcastMainTimer}</p>
                </>
              ) : (
                <p className="text-sm font-semibold text-stone-700">
                  {countdownPhrase
                    ?? (activeBroadcast?.starts_at
                      && Number.isFinite(new Date(activeBroadcast.starts_at).getTime())
                      && broadcastTickMs >= new Date(activeBroadcast.starts_at).getTime()
                      ? 'Время начала наступило — вставьте ссылку на трансляцию в настройках.'
                      : 'До начала: время уточняется')}
                </p>
              )}
              {broadcastEndsLabel ? (
                <p className="text-xs font-medium text-stone-500">Окончание эфира: {broadcastEndsLabel}</p>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" className={btnSecondary('gap-2')} onClick={() => document.documentElement.requestFullscreen?.().catch(() => undefined)}>
                <LuExpand className="h-4 w-4" />
                На весь экран
              </button>
              <button type="button" className={btnSecondary('gap-2')} onClick={onReminder}>
                <LuBell className="h-4 w-4" />
                Напомнить
              </button>
            </div>

            {isAdmin && (
              <div className="mt-8 space-y-4">
                <div className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">🔒 Только для администраторов</div>

                <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-[var(--shadow-card)]">
                  <h3 className="mb-4 text-base font-extrabold text-stone-900">Настройки трансляции</h3>
                  <div className="mb-4 rounded-xl border border-stone-200 bg-stone-50/70 p-3">
                    <p className="text-xs font-semibold text-stone-700">Умное добавление плеера</p>
                    <p className="mt-1 text-xs text-stone-500">
                      Вставьте ссылку YouTube/RuTube/VK или готовый iframe. Мы автоматически извлечем embed-ссылку.
                    </p>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <textarea
                        className={`${fieldClass()} min-h-[74px] flex-1`}
                        placeholder='Например: https://youtu.be/... или <iframe src="..."></iframe>'
                        value={smartInput}
                        onChange={(e) => setSmartInput(e.target.value)}
                      />
                      <button type="button" className={btnSecondary('shrink-0')} onClick={applySmartEmbedInput}>
                        Применить
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-semibold text-stone-600">
                      Название
                      <input className={fieldClass()} value={formState.title} onChange={(e) => setFormState((prev) => ({ ...prev, title: e.target.value }))} />
                    </label>
                    <label className="text-xs font-semibold text-stone-600 sm:col-span-2">
                      URL трансляции
                      <input
                        className={fieldClass()}
                        value={formState.stream_url}
                        onChange={(e) => {
                          const value = e.target.value;
                          setFormState((prev) => ({ ...prev, stream_url: value }));
                          if (!value.trim()) {
                            setStreamUrlError(null);
                            return;
                          }
                          const parsed = parseBroadcastInputToEmbed(value);
                          setStreamUrlError(parsed ? null : 'Ссылка не распознана. Вставьте URL или iframe-код.');
                        }}
                        onBlur={(e) => {
                          const embed = getEmbedUrl(e.target.value);
                          setFormState((prev) => ({
                            ...prev,
                            stream_url: embed ?? e.target.value,
                            platform: detectPlatform(embed ?? e.target.value),
                          }));
                          if (!e.target.value.trim()) {
                            setStreamUrlError(null);
                            return;
                          }
                          const parsed = parseBroadcastInputToEmbed(e.target.value);
                          setStreamUrlError(parsed ? null : 'Ссылка не распознана. Вставьте URL или iframe-код.');
                        }}
                      />
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-700">
                          Платформа: {platformIcon(formState.platform)} {platformLabel(formState.platform)}
                        </span>
                        {streamUrlError ? (
                          <span className="text-[11px] font-semibold text-red-600">{streamUrlError}</span>
                        ) : null}
                      </div>
                    </label>
                    <label className="text-xs font-semibold text-stone-600">
                      Дата начала
                      <input type="date" className={fieldClass()} value={datePart} onChange={(e) => setDatePart(e.target.value)} />
                    </label>
                    <label className="text-xs font-semibold text-stone-600">
                      Время начала
                      <input type="time" className={fieldClass()} value={timePart} onChange={(e) => setTimePart(e.target.value)} />
                    </label>
                    <label className="text-xs font-semibold text-stone-600 sm:col-span-2">
                      Описание
                      <textarea className={`${fieldClass()} min-h-24 resize-y`} value={formState.description} onChange={(e) => setFormState((prev) => ({ ...prev, description: e.target.value }))} />
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-stone-700">
                      <input type="checkbox" checked={formState.notify_members} onChange={(e) => setFormState((prev) => ({ ...prev, notify_members: e.target.checked }))} />
                      Уведомить участников
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-stone-700">
                      <input type="checkbox" checked={formState.is_public} onChange={(e) => setFormState((prev) => ({ ...prev, is_public: e.target.checked }))} />
                      Публичная трансляция
                    </label>
                  </div>
                  <button
                    type="button"
                    className={btnPrimary('mt-4 w-full sm:w-auto')}
                    onClick={onSave}
                    disabled={saveMutation.isPending || Boolean(streamUrlError)}
                  >
                    {saveMutation.isPending ? 'Сохранение...' : 'Сохранить'}
                  </button>
                </section>

                <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-[var(--shadow-card)]">
                  <h3 className="mb-4 text-base font-extrabold text-stone-900">Архив трансляций</h3>
                  <div className="space-y-2">
                    {(archiveData?.items ?? []).map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded-xl border border-stone-200 px-3 py-2">
                        <div>
                          <p className="text-sm font-semibold text-stone-900">{item.title ?? 'Без названия'}</p>
                          <p className="text-xs text-stone-500">{item.starts_at ? new Date(item.starts_at).toLocaleString('ru-RU') : 'Дата не задана'} • {platformIcon(item.platform)} {item.platform}</p>
                        </div>
                        <button type="button" className={btnSecondary('h-9 px-3 gap-1')} onClick={() => setPlayerUrl(getEmbedUrl(item.stream_url ?? '') ?? item.stream_url)}>
                          <LuPlay className="h-4 w-4" />
                          Смотреть
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
