import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuExternalLink, LuImagePlus, LuPlus, LuTrash2 } from 'react-icons/lu';

import { resolvePublicUrl } from '../../lib/resolvePublicUrl';
import { apiErrorMessage } from './api';
import {
  addAdminGalleryPhoto,
  createAdminGalleryAlbum,
  deleteAdminGalleryAlbum,
  deleteAdminGalleryPhoto,
  fetchAdminGalleryAlbum,
  fetchAdminGalleryAlbums,
  fetchAdminSiteSettings,
  patchAdminGalleryAlbum,
  patchAdminSiteSettings,
  uploadAdminGalleryImage,
} from './siteApi';
import type { SiteSettings } from '../publicSite/types';

const Q_SETTINGS = ['admin', 'site', 'settings'] as const;
const Q_ALBUMS = ['admin', 'site', 'albums'] as const;

function fieldClass() {
  return (
    'w-full rounded-xl border border-stone-200/90 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none ' +
    'focus:border-primary focus:ring-2 focus:ring-primary/20'
  );
}

function btnPrimary(c = '') {
  return `inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:opacity-95 disabled:opacity-50 ${c}`;
}

function btnSecondary(c = '') {
  return `inline-flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-800 transition hover:bg-stone-50 disabled:opacity-50 ${c}`;
}

export function SiteContentSection() {
  const qc = useQueryClient();
  const settingsQ = useQuery({ queryKey: Q_SETTINGS, queryFn: fetchAdminSiteSettings });
  const albumsQ = useQuery({ queryKey: Q_ALBUMS, queryFn: fetchAdminGalleryAlbums });
  const [note, setNote] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [form, setForm] = useState<SiteSettings | null>(null);
  const [newAlbumTitle, setNewAlbumTitle] = useState('');
  const [selectedAlbumId, setSelectedAlbumId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const settings = form ?? settingsQ.data ?? null;

  const saveSettingsMut = useMutation({
    mutationFn: () => {
      if (!settings) throw new Error('Нет данных');
      return patchAdminSiteSettings({
        church_name: settings.church_name,
        tagline: settings.tagline,
        about_text: settings.about_text,
        contact_text: settings.contact_text,
        show_events: settings.show_events,
        show_live: settings.show_live,
        show_gallery: settings.show_gallery,
      });
    },
    onSuccess: (next) => {
      setForm(next);
      void qc.invalidateQueries({ queryKey: Q_SETTINGS });
      setNote({ type: 'ok', text: 'Настройки сайта сохранены' });
    },
    onError: (err) => setNote({ type: 'err', text: apiErrorMessage(err, 'Ошибка сохранения') }),
  });

  const createAlbumMut = useMutation({
    mutationFn: () => createAdminGalleryAlbum({ title: newAlbumTitle.trim(), is_published: true }),
    onSuccess: (album) => {
      setNewAlbumTitle('');
      setSelectedAlbumId(album.id);
      void qc.invalidateQueries({ queryKey: Q_ALBUMS });
      setNote({ type: 'ok', text: 'Альбом создан' });
    },
    onError: (err) => setNote({ type: 'err', text: apiErrorMessage(err, 'Не удалось создать альбом') }),
  });

  const albumDetailQ = useQuery({
    queryKey: ['admin', 'site', 'album', selectedAlbumId],
    queryFn: () => fetchAdminGalleryAlbum(selectedAlbumId!),
    enabled: selectedAlbumId != null,
  });

  const togglePublishMut = useMutation({
    mutationFn: (album: { id: number; is_published: boolean }) =>
      patchAdminGalleryAlbum(album.id, { is_published: !album.is_published }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: Q_ALBUMS });
      if (selectedAlbumId != null) {
        void qc.invalidateQueries({ queryKey: ['admin', 'site', 'album', selectedAlbumId] });
      }
    },
    onError: (err) => setNote({ type: 'err', text: apiErrorMessage(err, 'Ошибка обновления') }),
  });

  const deleteAlbumMut = useMutation({
    mutationFn: (id: number) => deleteAdminGalleryAlbum(id),
    onSuccess: () => {
      setSelectedAlbumId(null);
      void qc.invalidateQueries({ queryKey: Q_ALBUMS });
      setNote({ type: 'ok', text: 'Альбом удалён' });
    },
    onError: (err) => setNote({ type: 'err', text: apiErrorMessage(err, 'Не удалось удалить') }),
  });

  const uploadPhotoMut = useMutation({
    mutationFn: async (file: File) => {
      if (selectedAlbumId == null) throw new Error('Выберите альбом');
      const { image_url } = await uploadAdminGalleryImage(file);
      return addAdminGalleryPhoto(selectedAlbumId, { image_url });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: Q_ALBUMS });
      if (selectedAlbumId != null) {
        void qc.invalidateQueries({ queryKey: ['admin', 'site', 'album', selectedAlbumId] });
      }
      setNote({ type: 'ok', text: 'Фото добавлено' });
    },
    onError: (err) => setNote({ type: 'err', text: apiErrorMessage(err, 'Не удалось загрузить фото') }),
  });

  const deletePhotoMut = useMutation({
    mutationFn: (photoId: number) => deleteAdminGalleryPhoto(photoId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: Q_ALBUMS });
      if (selectedAlbumId != null) {
        void qc.invalidateQueries({ queryKey: ['admin', 'site', 'album', selectedAlbumId] });
      }
    },
    onError: (err) => setNote({ type: 'err', text: apiErrorMessage(err, 'Не удалось удалить фото') }),
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-stone-900">Публичный сайт</h2>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">
            Мини-раздел управления: тексты главной, видимость блоков, фотогалерея. События берутся из
            раздела «Мероприятия», трансляция — из «Трансляции» (нужен флаг «Публичная»).
          </p>
        </div>
        <Link to="/site" target="_blank" rel="noreferrer" className={btnSecondary()}>
          <LuExternalLink className="h-4 w-4" />
          Открыть сайт
        </Link>
      </div>

      {note && (
        <p
          className={`rounded-xl px-3 py-2 text-sm ${
            note.type === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {note.text}
        </p>
      )}

      <section className="space-y-4 rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
        <h3 className="font-bold text-stone-900">Настройки и тексты</h3>
        {!settings ? (
          <p className="text-sm text-stone-500">Загрузка…</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-xs font-semibold text-stone-500">Название церкви</span>
              <input
                className={fieldClass()}
                value={settings.church_name}
                onChange={(e) => setForm({ ...settings, church_name: e.target.value })}
              />
            </label>
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-xs font-semibold text-stone-500">Короткий слоган</span>
              <input
                className={fieldClass()}
                value={settings.tagline}
                onChange={(e) => setForm({ ...settings, tagline: e.target.value })}
              />
            </label>
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-xs font-semibold text-stone-500">О церкви (на главной)</span>
              <textarea
                className={fieldClass()}
                rows={3}
                value={settings.about_text}
                onChange={(e) => setForm({ ...settings, about_text: e.target.value })}
              />
            </label>
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-xs font-semibold text-stone-500">Контакты в подвале</span>
              <textarea
                className={fieldClass()}
                rows={2}
                value={settings.contact_text}
                onChange={(e) => setForm({ ...settings, contact_text: e.target.value })}
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-stone-800">
              <input
                type="checkbox"
                checked={settings.show_events}
                onChange={(e) => setForm({ ...settings, show_events: e.target.checked })}
              />
              Показывать события
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-stone-800">
              <input
                type="checkbox"
                checked={settings.show_live}
                onChange={(e) => setForm({ ...settings, show_live: e.target.checked })}
              />
              Показывать трансляцию
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-stone-800">
              <input
                type="checkbox"
                checked={settings.show_gallery}
                onChange={(e) => setForm({ ...settings, show_gallery: e.target.checked })}
              />
              Показывать галерею
            </label>
            <div className="sm:col-span-2">
              <button
                type="button"
                className={btnPrimary()}
                disabled={saveSettingsMut.isPending}
                onClick={() => saveSettingsMut.mutate()}
              >
                Сохранить настройки
              </button>
            </div>
          </div>
        )}
        <p className="text-xs text-stone-500">
          События редактируются в «Мероприятия». Чтобы эфир появился на сайте, в разделе трансляций
          включите «Публичная» и укажите ссылку на поток.
        </p>
      </section>

      <section className="space-y-4 rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
        <h3 className="font-bold text-stone-900">Фотогалерея</h3>
        <div className="flex flex-wrap gap-2">
          <input
            className={`${fieldClass()} max-w-sm`}
            placeholder="Название нового альбома"
            value={newAlbumTitle}
            onChange={(e) => setNewAlbumTitle(e.target.value)}
          />
          <button
            type="button"
            className={btnPrimary()}
            disabled={!newAlbumTitle.trim() || createAlbumMut.isPending}
            onClick={() => createAlbumMut.mutate()}
          >
            <LuPlus className="h-4 w-4" />
            Создать альбом
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <ul className="space-y-1">
            {(albumsQ.data ?? []).map((album) => (
              <li key={album.id}>
                <button
                  type="button"
                  onClick={() => setSelectedAlbumId(album.id)}
                  className={`w-full rounded-xl px-3 py-2.5 text-left text-sm transition ${
                    selectedAlbumId === album.id
                      ? 'bg-primary text-white'
                      : 'bg-stone-50 text-stone-800 hover:bg-stone-100'
                  }`}
                >
                  <span className="font-semibold">{album.title}</span>
                  <span className="mt-0.5 block text-xs opacity-80">
                    {album.photo_count} фото · {album.is_published ? 'опубликован' : 'скрыт'}
                  </span>
                </button>
              </li>
            ))}
            {albumsQ.data?.length === 0 && (
              <li className="text-sm text-stone-500">Альбомов пока нет</li>
            )}
          </ul>

          <div className="min-h-[12rem] rounded-xl border border-dashed border-stone-200 p-3">
            {selectedAlbumId == null ? (
              <p className="py-10 text-center text-sm text-stone-500">Выберите альбом слева</p>
            ) : albumDetailQ.isLoading ? (
              <p className="text-sm text-stone-500">Загрузка альбома…</p>
            ) : albumDetailQ.isError || !albumDetailQ.data ? (
              <p className="text-sm text-red-700">Не удалось открыть альбом</p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="flex-1 font-bold text-stone-900">{albumDetailQ.data.album.title}</h4>
                  <button
                    type="button"
                    className={btnSecondary()}
                    onClick={() => togglePublishMut.mutate(albumDetailQ.data!.album)}
                  >
                    {albumDetailQ.data.album.is_published ? 'Скрыть' : 'Опубликовать'}
                  </button>
                  <button
                    type="button"
                    className={btnSecondary('text-red-700')}
                    onClick={() => {
                      if (window.confirm('Удалить альбом со всеми фото?')) {
                        deleteAlbumMut.mutate(selectedAlbumId);
                      }
                    }}
                  >
                    <LuTrash2 className="h-4 w-4" />
                    Удалить
                  </button>
                  <button
                    type="button"
                    className={btnPrimary()}
                    disabled={uploadPhotoMut.isPending}
                    onClick={() => fileRef.current?.click()}
                  >
                    <LuImagePlus className="h-4 w-4" />
                    Добавить фото
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) uploadPhotoMut.mutate(file);
                    }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {albumDetailQ.data.photos.map((photo) => {
                    const src = resolvePublicUrl(photo.image_url);
                    return (
                      <div key={photo.id} className="group relative overflow-hidden rounded-lg bg-stone-100">
                        {src && (
                          <img src={src} alt="" className="aspect-square w-full object-cover" />
                        )}
                        <button
                          type="button"
                          className="absolute right-1 top-1 rounded-lg bg-black/60 p-1.5 text-white opacity-0 transition group-hover:opacity-100"
                          aria-label="Удалить фото"
                          onClick={() => deletePhotoMut.mutate(photo.id)}
                        >
                          <LuTrash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                {albumDetailQ.data.photos.length === 0 && (
                  <p className="text-center text-sm text-stone-500">В альбоме пока нет фото</p>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
