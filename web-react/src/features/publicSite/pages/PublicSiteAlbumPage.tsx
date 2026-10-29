import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { fetchPublicSiteAlbum } from '../api';

export function PublicSiteAlbumPage() {
  const { albumId } = useParams<{ albumId: string }>();
  const id = Number(albumId);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['public-site', 'album', id],
    queryFn: () => fetchPublicSiteAlbum(id),
    enabled: Number.isInteger(id) && id > 0,
  });

  if (!Number.isInteger(id) || id <= 0) {
    return <p className="text-sm text-red-700">Некорректный альбом</p>;
  }

  if (q.isLoading) {
    return <p className="text-sm text-[#6b5a5e]">Загрузка…</p>;
  }

  if (q.isError || !q.data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-700">Альбом не найден или скрыт</p>
        <Link to="/site/gallery" className="text-sm font-semibold text-[#7B1C1C] hover:underline">
          ← К галерее
        </Link>
      </div>
    );
  }

  const { album, photos } = q.data;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/site/gallery" className="text-sm font-semibold text-[#7B1C1C] hover:underline">
          ← Все альбомы
        </Link>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight">{album.title}</h1>
        {album.description?.trim() && (
          <p className="mt-2 text-sm leading-relaxed text-[#6b5a5e] whitespace-pre-wrap">
            {album.description.trim()}
          </p>
        )}
      </div>

      {photos.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#d9c4ba] bg-white/40 px-4 py-8 text-center text-sm text-[#6b5a5e]">
          В альбоме пока нет фотографий
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((photo) => {
            const src = resolvePublicUrl(photo.image_url);
            if (!src) return null;
            return (
              <button
                key={photo.id}
                type="button"
                onClick={() => setLightbox(src)}
                className="group overflow-hidden rounded-xl bg-[#2b0d16] text-left"
              >
                <img
                  src={src}
                  alt={photo.caption ?? ''}
                  className="aspect-square w-full object-cover transition duration-300 group-hover:scale-105"
                  loading="lazy"
                />
              </button>
            );
          })}
        </div>
      )}

      {lightbox && (
        <button
          type="button"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setLightbox(null)}
          aria-label="Закрыть"
        >
          <img
            src={lightbox}
            alt=""
            className="max-h-[90dvh] max-w-full rounded-lg object-contain"
          />
        </button>
      )}
    </div>
  );
}
