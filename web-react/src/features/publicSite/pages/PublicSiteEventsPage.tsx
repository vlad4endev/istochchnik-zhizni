import { useQuery } from '@tanstack/react-query';

import { fetchPublicSiteEvents, fetchPublicSiteSettings } from '../api';
import { EventList } from '../components/EventList';

export function PublicSiteEventsPage() {
  const settingsQ = useQuery({
    queryKey: ['public-site', 'settings'],
    queryFn: fetchPublicSiteSettings,
  });
  const eventsQ = useQuery({
    queryKey: ['public-site', 'events'],
    queryFn: fetchPublicSiteEvents,
    enabled: settingsQ.data?.show_events !== false,
  });

  if (settingsQ.data && settingsQ.data.show_events === false) {
    return (
      <p className="rounded-2xl border border-dashed border-[#d9c4ba] bg-white/40 px-4 py-8 text-center text-sm text-[#6b5a5e]">
        Раздел событий временно скрыт.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Календарь событий</h1>
        <p className="mt-2 text-sm text-[#6b5a5e]">Анонсы встреч и мероприятий церкви</p>
      </header>
      {eventsQ.isLoading ? (
        <p className="text-sm text-[#6b5a5e]">Загрузка…</p>
      ) : eventsQ.isError ? (
        <p className="text-sm text-red-700">Не удалось загрузить события</p>
      ) : (
        <EventList events={eventsQ.data ?? []} />
      )}
    </div>
  );
}
