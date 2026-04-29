import { useEffect, useMemo, useState } from 'react';
import { LuBell, LuExpand, LuPlay, LuTv } from 'react-icons/lu';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchActiveBroadcast, fetchFinishedBroadcasts, patchBroadcast, type BroadcastData } from '../../../api/broadcast';
import { SectionHeroToolbarEnd } from '@/components/SectionHeroToolbarEnd';
import { sectionHeroHeaderClass, sectionHeroStickyClass } from '../../../lib/sectionHeroChrome';
import { useAuthStore } from '../../auth/authStore';
import { detectPlatform, getEmbedUrl } from '../../../utils/broadcast';
import { emitAppToast } from '../../../lib/uiFeedback';

function btnPrimary(c = '') { return `flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-white shadow hover:border-transparent hover:!bg-[#e34254] disabled:pointer-events-none disabled:opacity-50 transition-colors ${c}`; }
function btnSecondary(c = '') { return `flex h-10 items-center justify-center rounded-xl border border-stone-200 bg-white px-4 text-sm font-bold text-stone-700 hover:bg-stone-50 disabled:pointer-events-none disabled:opacity-50 transition-colors ${c}`; }
function fieldClass() { return 'w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none focus:border-primary focus:bg-white transition-colors'; }

function formatCountdownText(startsAt: string | null): string | null {
  if (!startsAt) return null;
  const diffMs = new Date(startsAt).getTime() - Date.now();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return null;
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `До начала: ${hours} ч ${minutes} мин`;
}

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

export function BroadcastPage() {
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.role);
  const isAdmin = role === 'admin' || role === 'minister';
  const { data, isLoading: broadcastLoading, error } = useQuery({
    queryKey: ['broadcast', 'active'],
    queryFn: fetchActiveBroadcast,
  });
  const activeBroadcast = data?.broadcast ?? null;
  const [playerUrl, setPlayerUrl] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [datePart, setDatePart] = useState('');
  const [timePart, setTimePart] = useState('');
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
    queryKey: ['broadcast', 'archive', 10],
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
    const tick = () => {
      if (activeBroadcast?.status === 'live') {
        setCountdown(null);
        return;
      }
      setCountdown(formatCountdownText(activeBroadcast?.starts_at ?? null));
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [activeBroadcast?.starts_at, activeBroadcast?.status]);

  const patchMutation = useMutation({
    mutationFn: (payload: Partial<BroadcastData>) => {
      if (!activeBroadcast?.id) throw new Error('No active broadcast');
      return patchBroadcast(activeBroadcast.id, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['broadcast'] });
      emitAppToast({ kind: 'success', message: 'Настройки трансляции сохранены' });
    },
    onError: () => emitAppToast({ kind: 'error', message: 'Не удалось сохранить настройки трансляции' }),
  });

  const activeStartsAtIso = useMemo(() => {
    if (!datePart || !timePart) return null;
    return new Date(`${datePart}T${timePart}:00`).toISOString();
  }, [datePart, timePart]);

  const onSave = () => {
    if (!activeBroadcast?.id) {
      emitAppToast({ kind: 'error', message: 'Нет активной трансляции для сохранения' });
      return;
    }
    patchMutation.mutate({
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

  return (
    <div className="min-h-full bg-[var(--surface)] pb-6 shell:pb-8">
      <div className={sectionHeroStickyClass}>
        <header className={sectionHeroHeaderClass}>
          <div className="pointer-events-none absolute -right-4 -top-20 h-48 w-48 rounded-full bg-white/[0.13] blur-3xl animate-prayer-header-breathe motion-reduce:animate-none" aria-hidden />
          <div className="pointer-events-none absolute -bottom-12 -left-10 h-40 w-40 rounded-full bg-black/18 blur-2xl" aria-hidden />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-extrabold leading-tight tracking-tight sm:text-2xl md:text-3xl lg:text-[1.65rem] xl:text-[26px] animate-prayer-fade-up motion-reduce:animate-none">
                Трансляции
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-white/85 md:text-base">
                Смотрите наши богослужения и мероприятия в прямом эфире
              </p>
            </div>
            <SectionHeroToolbarEnd />
          </div>
        </header>
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
                <div className="absolute inset-0 flex flex-col items-center justify-center text-stone-400 p-6 text-center bg-stone-950/50">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent mb-4" />
                  <p className="text-sm font-medium">Загрузка эфира...</p>
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

            <div className="mt-4">
              {activeBroadcast?.status === 'live' ? (
                <span className="inline-flex items-center rounded-full bg-red-600 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-white">● LIVE</span>
              ) : (
                <p className="text-sm font-semibold text-stone-700">{countdown ?? 'До начала: время уточняется'}</p>
              )}
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
                        onChange={(e) => setFormState((prev) => ({ ...prev, stream_url: e.target.value }))}
                        onBlur={(e) => {
                          const embed = getEmbedUrl(e.target.value);
                          setFormState((prev) => ({
                            ...prev,
                            stream_url: embed ?? e.target.value,
                            platform: detectPlatform(embed ?? e.target.value),
                          }));
                        }}
                      />
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
                  <button type="button" className={btnPrimary('mt-4 w-full sm:w-auto')} onClick={onSave} disabled={patchMutation.isPending}>
                    {patchMutation.isPending ? 'Сохранение...' : 'Сохранить'}
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
