import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { fetchPublicSiteOverview } from '../api';
import { EventList } from '../components/EventList';
import { SiteLivePlayer } from '../components/SiteLivePlayer';

export function PublicSiteHomePage() {
  const q = useQuery({
    queryKey: ['public-site', 'overview'],
    queryFn: fetchPublicSiteOverview,
  });

  if (q.isLoading) {
    return <p className="text-sm text-[#6b5a5e]">Загрузка…</p>;
  }

  if (q.isError || !q.data) {
    return (
      <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-800">
        Не удалось загрузить сайт. Попробуйте обновить страницу.
      </p>
    );
  }

  const { settings, events, broadcast, albums } = q.data;

  return (
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-[1.75rem]">
        <img
          src="/assets/landing-hero.webp"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#2b0d16]/85 via-[#2b0d16]/45 to-[#2b0d16]/25" />
        <div className="relative px-6 py-14 text-white sm:px-10 sm:py-20">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/80">
            {settings.church_name}
          </p>
          <h1 className="mt-3 max-w-xl text-3xl font-extrabold leading-tight sm:text-5xl">
            {settings.tagline?.trim() || 'Добро пожаловать'}
          </h1>
          {settings.about_text?.trim() && (
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/90 whitespace-pre-wrap">
              {settings.about_text.trim()}
            </p>
          )}
          <div className="mt-7 flex flex-wrap gap-3">
            {settings.show_live && (
              <Link
                to="/site/live"
                className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#7B1C1C] transition hover:bg-[#f7f1ec]"
              >
                Смотреть трансляцию
              </Link>
            )}
            {settings.show_events && (
              <Link
                to="/site/events"
                className="rounded-xl border border-white/40 bg-white/10 px-5 py-3 text-sm font-bold text-white backdrop-blur transition hover:bg-white/20"
              >
                Календарь событий
              </Link>
            )}
          </div>
        </div>
      </section>

      {settings.show_live && (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-2xl font-extrabold">Трансляция</h2>
            <Link to="/site/live" className="text-sm font-semibold text-[#7B1C1C] hover:underline">
              Открыть
            </Link>
          </div>
          <SiteLivePlayer broadcast={broadcast} />
        </section>
      )}

      {settings.show_events && (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-2xl font-extrabold">Ближайшие события</h2>
            <Link to="/site/events" className="text-sm font-semibold text-[#7B1C1C] hover:underline">
              Весь календарь
            </Link>
          </div>
          <EventList events={events.slice(0, 5)} />
        </section>
      )}

      {settings.show_gallery && albums.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-2xl font-extrabold">Фотогалерея</h2>
            <Link to="/site/gallery" className="text-sm font-semibold text-[#7B1C1C] hover:underline">
              Все альбомы
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {albums.map((album) => {
              const cover = resolvePublicUrl(album.cover_url);
              return (
                <Link
                  key={album.id}
                  to={`/site/gallery/${album.id}`}
                  className="group overflow-hidden rounded-2xl bg-[#2b0d16]"
                >
                  {cover ? (
                    <img
                      src={cover}
                      alt=""
                      className="aspect-square w-full object-cover transition duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex aspect-square items-center justify-center bg-[#7B1C1C]/30 text-white/70">
                      Фото
                    </div>
                  )}
                  <div className="px-3 py-2.5 text-white">
                    <p className="truncate text-sm font-bold">{album.title}</p>
                    <p className="text-xs text-white/70">{album.photo_count} фото</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
