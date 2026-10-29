import { toEmbedUrlForPlayer, detectPlatformLabel } from '../../../utils/broadcast';
import { formatBroadcastStartsAt } from '../format';
import type { SiteBroadcast } from '../types';

type Props = {
  broadcast: SiteBroadcast | null;
};

export function SiteLivePlayer({ broadcast }: Props) {
  if (!broadcast?.stream_url) {
    return (
      <div className="rounded-2xl border border-dashed border-[#d9c4ba] bg-white/50 px-5 py-10 text-center">
        <p className="text-base font-semibold text-[#4a2a32]">Сейчас нет публичной трансляции</p>
        <p className="mt-2 text-sm text-[#6b5a5e]">
          Когда эфир станет публичным, плеер появится здесь автоматически.
        </p>
      </div>
    );
  }

  const embedUrl = toEmbedUrlForPlayer(broadcast.stream_url);
  const platform = detectPlatformLabel(broadcast.stream_url);
  const isLive = broadcast.status === 'live';

  if (!embedUrl) {
    return (
      <div className="rounded-2xl border border-[#e8d9d0] bg-white px-5 py-8 text-center">
        <p className="font-semibold">Не удалось открыть плеер</p>
        <a
          href={broadcast.stream_url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-[#7B1C1C] underline"
        >
          Смотреть по ссылке
        </a>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-[#1a0a10] shadow-[0_18px_40px_rgba(43,13,22,0.18)]">
      {isLive && (
        <div className="flex items-center gap-2 bg-[#7B1C1C] px-4 py-2 text-sm font-bold tracking-wide text-white">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-white" />
          В ЭФИРЕ
          <span className="ml-auto text-xs font-semibold opacity-90">{platform}</span>
        </div>
      )}
      <div className="relative aspect-video w-full bg-black">
        <iframe
          src={embedUrl}
          title={broadcast.title ?? 'Трансляция'}
          className="absolute inset-0 h-full w-full border-0"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      </div>
      <div className="space-y-1 bg-white px-4 py-4">
        <h2 className="text-lg font-extrabold text-[#2b0d16]">
          {broadcast.title?.trim() || 'Трансляция'}
        </h2>
        {broadcast.starts_at && (
          <p className="text-sm text-[#6b5a5e]">{formatBroadcastStartsAt(broadcast.starts_at)}</p>
        )}
        {broadcast.description?.trim() && (
          <p className="pt-1 text-sm leading-relaxed text-[#4a2a32] whitespace-pre-wrap">
            {broadcast.description.trim()}
          </p>
        )}
      </div>
    </div>
  );
}
