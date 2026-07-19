import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBroadcastViewers } from '../../../hooks/useBroadcastViewers';
import {
  createBroadcast,
  fetchActiveBroadcast,
  fetchBroadcastHistory,
  patchBroadcast,
  type BroadcastData,
} from '../../../api/broadcast';
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
import {
  formatBroadcastStartsAtForApi,
  parseBroadcastStartsAt,
  splitBroadcastStartsAt,
} from '../../../utils/broadcastStartsAt';
import { emitAppToast } from '../../../lib/uiFeedback';
import { useMe } from '@/hooks/useMe';
import { keys } from '@/lib/queryKeys';

import { StreamPlayer } from '../components/StreamPlayer';
import { BroadcastHistory } from '../components/BroadcastHistory';
import { StreamSettings } from '../components/StreamSettings';

const HISTORY_LIMIT = 30;

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
  const [archiveItem, setArchiveItem] = useState<BroadcastData | null>(null);
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

  const {
    data: historyData,
    isLoading: historyLoading,
  } = useQuery({
    queryKey: keys.broadcastArchive(HISTORY_LIMIT),
    queryFn: () => fetchBroadcastHistory(HISTORY_LIMIT),
  });

  useEffect(() => {
    setArchiveItem(null);
    setPlayerUrl(getEmbedUrl(activeBroadcast?.stream_url ?? '') ?? null);
    const { date, time } = splitBroadcastStartsAt(activeBroadcast?.starts_at ?? null);
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

  const viewerCount = useBroadcastViewers({ watching: !archiveItem });
  const broadcastUiMode = getBroadcastUiMode(broadcastTickMs, activeBroadcast);
  const broadcastMainTimer = formatBroadcastMainTimer(broadcastTickMs, activeBroadcast);
  const countdownPhrase = formatBroadcastCountdownPhrase(broadcastTickMs, activeBroadcast?.starts_at ?? null);
  const broadcastEndsLabel = useMemo(() => {
    if (!activeBroadcast?.starts_at) return null;
    if (broadcastUiMode !== 'pre' && broadcastUiMode !== 'onair') return null;
    const t = parseBroadcastStartsAt(activeBroadcast.starts_at)?.getTime();
    if (t == null || !Number.isFinite(t)) return null;
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
      qc.invalidateQueries({ queryKey: keys.broadcastArchive(HISTORY_LIMIT) });
      emitAppToast({ kind: 'success', message: 'Настройки трансляции сохранены' });
    },
    onError: () => emitAppToast({ kind: 'error', message: 'Не удалось сохранить настройки трансляции' }),
  });

  const activeStartsAtIso = useMemo(() => {
    if (!datePart || !timePart) return null;
    return formatBroadcastStartsAtForApi(datePart, timePart);
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
    setArchiveItem(null);
    setFormState((prev) => ({
      ...prev,
      stream_url: parsed,
      platform: detectPlatform(parsed),
    }));
    setPlayerUrl(parsed);
    setSmartInput('');
    emitAppToast({ kind: 'success', message: 'Ссылка распознана и подставлена в трансляцию' });
  };

  const openHistoryItem = (item: BroadcastData) => {
    const embed = getEmbedUrl(item.stream_url ?? '') ?? item.stream_url;
    if (!embed) {
      emitAppToast({ kind: 'error', message: 'Не удалось открыть запись' });
      return;
    }
    setArchiveItem(item);
    setPlayerUrl(embed);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const watchingArchive = Boolean(archiveItem);

  const playerTimeLine = useMemo(() => {
    if (watchingArchive) {
      if (!archiveItem?.starts_at) return 'Запись эфира';
      const d = parseBroadcastStartsAt(archiveItem.starts_at);
      if (!d) return 'Запись эфира';
      return `Запись · ${format(d, 'd MMMM yyyy, HH:mm', { locale: ru })}`;
    }
    if (broadcastUiMode === 'post') return 'Запланированный эфир завершён';
    if (broadcastUiMode === 'onair') return `В эфире: ${broadcastMainTimer}`;
    if (countdownPhrase) return countdownPhrase;
    if (
      activeBroadcast?.starts_at &&
      Number.isFinite(parseBroadcastStartsAt(activeBroadcast.starts_at)?.getTime() ?? NaN) &&
      broadcastTickMs >= (parseBroadcastStartsAt(activeBroadcast.starts_at)?.getTime() ?? 0)
    ) {
      return 'Время начала наступило — вставьте ссылку в настройках.';
    }
    return 'До начала: время уточняется';
  }, [
    watchingArchive,
    archiveItem?.starts_at,
    broadcastUiMode,
    broadcastMainTimer,
    countdownPhrase,
    activeBroadcast?.starts_at,
    broadcastTickMs,
  ]);

  const playerTimeLineSub = watchingArchive
    ? 'Вы смотрите запись из истории трансляции'
    : broadcastEndsLabel
      ? `Окончание эфира: ${broadcastEndsLabel}`
      : null;

  const displayUrl = playerUrl ?? activeBroadcast?.stream_url ?? null;
  const displayTitle = archiveItem?.title ?? activeBroadcast?.title ?? null;

  return (
    <div className="min-h-full bg-[var(--surface)] max-lg:pb-0 lg:pb-8">
      {/* ❌ НЕ ТРОГАТЬ — шапка раздела */}
      <div className={sectionHeroStickyClass}>
        <PageHeader title="Трансляция" />
      </div>

      <div className="px-3 py-4 sm:px-4 sm:py-6 md:px-6 lg:px-8 xl:px-10">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-4 md:max-w-xl lg:max-w-3xl xl:max-w-5xl">

          {/* Player card — shown for all users */}
          {broadcastLoading ? (
            <div style={skeletonStyle}>
              <div style={{ background: '#1a0808', width: '100%', aspectRatio: '16/9', borderRadius: '20px 20px 0 0' }} />
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ height: 16, background: '#eee', borderRadius: 8, width: '55%' }} />
                <div style={{ height: 36, background: '#F4F0EE', borderRadius: 10, width: '100%' }} />
              </div>
            </div>
          ) : error ? (
            <div style={{ ...skeletonStyle, padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 13, color: '#999' }}>Не удалось загрузить данные трансляции</span>
            </div>
          ) : (
            <StreamPlayer
              url={displayUrl}
              title={displayTitle}
              viewersCount={watchingArchive ? null : viewerCount}
              isLive={!watchingArchive && broadcastUiMode === 'onair'}
              timeLine={playerTimeLine}
              timeLineSub={playerTimeLineSub}
            />
          )}

          <BroadcastHistory
            items={historyData?.items ?? []}
            activeId={archiveItem?.id ?? null}
            isLoading={historyLoading}
            onOpen={openHistoryItem}
          />

          {isAdmin && (
            <StreamSettings
              formTitle={formState.title}
              formStreamUrl={formState.stream_url}
              formDescription={formState.description}
              formNotifyMembers={formState.notify_members}
              formIsPublic={formState.is_public}
              formPlatform={formState.platform}
              datePart={datePart}
              timePart={timePart}
              smartInput={smartInput}
              streamUrlError={streamUrlError}
              isSaving={saveMutation.isPending}

              onTitleChange={(v) => setFormState((p) => ({ ...p, title: v }))}
              onStreamUrlChange={(v) => {
                setFormState((p) => ({ ...p, stream_url: v }));
                if (!v.trim()) { setStreamUrlError(null); return; }
                const parsed = parseBroadcastInputToEmbed(v);
                setStreamUrlError(parsed ? null : 'Ссылка не распознана. Вставьте URL или iframe-код.');
              }}
              onStreamUrlBlur={(v) => {
                const embed = getEmbedUrl(v);
                setFormState((p) => ({
                  ...p,
                  stream_url: embed ?? v,
                  platform: detectPlatform(embed ?? v),
                }));
                if (!v.trim()) { setStreamUrlError(null); return; }
                const parsed = parseBroadcastInputToEmbed(v);
                setStreamUrlError(parsed ? null : 'Ссылка не распознана. Вставьте URL или iframe-код.');
              }}
              onDescriptionChange={(v) => setFormState((p) => ({ ...p, description: v }))}
              onNotifyMembersChange={(v) => setFormState((p) => ({ ...p, notify_members: v }))}
              onIsPublicChange={(v) => setFormState((p) => ({ ...p, is_public: v }))}
              onDateChange={setDatePart}
              onTimeChange={setTimePart}
              onSmartInputChange={setSmartInput}
              onApplySmartInput={applySmartEmbedInput}
              onSave={onSave}
            />
          )}

        </div>
      </div>
    </div>
  );
}

const skeletonStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 20,
  border: '1px solid rgba(0,0,0,0.07)',
  overflow: 'hidden',
  width: '100%',
};
