import { useQuery } from '@tanstack/react-query';

import { fetchPublicSiteBroadcast, fetchPublicSiteSettings } from '../api';
import { SiteLivePlayer } from '../components/SiteLivePlayer';

export function PublicSiteLivePage() {
  const settingsQ = useQuery({
    queryKey: ['public-site', 'settings'],
    queryFn: fetchPublicSiteSettings,
  });
  const liveQ = useQuery({
    queryKey: ['public-site', 'broadcast'],
    queryFn: fetchPublicSiteBroadcast,
    refetchInterval: 30_000,
    enabled: settingsQ.data?.show_live !== false,
  });

  if (settingsQ.data && settingsQ.data.show_live === false) {
    return (
      <p className="rounded-2xl border border-dashed border-[#d9c4ba] bg-white/40 px-4 py-8 text-center text-sm text-[#6b5a5e]">
        Публичная трансляция временно скрыта.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Трансляция</h1>
        <p className="mt-2 text-sm text-[#6b5a5e]">
          Прямой эфир и данные о текущей или ближайшей публичной трансляции
        </p>
      </header>
      {liveQ.isLoading ? (
        <p className="text-sm text-[#6b5a5e]">Загрузка…</p>
      ) : liveQ.isError ? (
        <p className="text-sm text-red-700">Не удалось загрузить трансляцию</p>
      ) : (
        <SiteLivePlayer broadcast={liveQ.data ?? null} />
      )}
    </div>
  );
}
