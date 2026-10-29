import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { fetchPublicSiteGallery, fetchPublicSiteSettings } from '../api';

export function PublicSiteGalleryPage() {
  const settingsQ = useQuery({
    queryKey: ['public-site', 'settings'],
    queryFn: fetchPublicSiteSettings,
  });
  const galleryQ = useQuery({
    queryKey: ['public-site', 'gallery'],
    queryFn: fetchPublicSiteGallery,
    enabled: settingsQ.data?.show_gallery !== false,
  });

  if (settingsQ.data && settingsQ.data.show_gallery === false) {
    return (
      <p className="rounded-2xl border border-dashed border-[#d9c4ba] bg-white/40 px-4 py-8 text-center text-sm text-[#6b5a5e]">
        Галерея временно скрыта.
      </p>
    );
  }

  const albums = galleryQ.data ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Фотогалерея</h1>
        <p className="mt-2 text-sm text-[#6b5a5e]">Моменты жизни общины</p>
      </header>
      {galleryQ.isLoading ? (
        <p className="text-sm text-[#6b5a5e]">Загрузка…</p>
      ) : galleryQ.isError ? (
        <p className="text-sm text-red-700">Не удалось загрузить галерею</p>
      ) : albums.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#d9c4ba] bg-white/40 px-4 py-8 text-center text-sm text-[#6b5a5e]">
          Альбомы пока не опубликованы
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {albums.map((album) => {
            const cover = resolvePublicUrl(album.cover_url);
            return (
              <Link
                key={album.id}
                to={`/site/gallery/${album.id}`}
                className="overflow-hidden rounded-2xl border border-[#e8d9d0] bg-white transition hover:border-[#7B1C1C]/35"
              >
                {cover ? (
                  <img
                    src={cover}
                    alt=""
                    className="aspect-[4/3] w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center bg-[#efe6df] text-[#6b5a5e]">
                    Нет обложки
                  </div>
                )}
                <div className="px-4 py-3">
                  <h2 className="font-extrabold text-[#2b0d16]">{album.title}</h2>
                  {album.description?.trim() && (
                    <p className="mt-1 line-clamp-2 text-sm text-[#6b5a5e]">{album.description}</p>
                  )}
                  <p className="mt-2 text-xs font-semibold text-[#7B1C1C]">{album.photo_count} фото</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
