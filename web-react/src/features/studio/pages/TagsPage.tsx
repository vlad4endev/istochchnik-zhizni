import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { LuPencil, LuPlus, LuTags, LuTrash2, LuX } from 'react-icons/lu';

import { SongListSkeleton } from '@/components/skeletons/SongListSkeleton';
import { emitAppToast } from '../../../lib/uiFeedback';
import { useAuthStore } from '../../auth/authStore';
import { canModerateSongCatalogSession } from '../../auth/studioAccess';
import {
  createStudioSongTag,
  deleteStudioSongTag,
  fetchStudioSongTags,
  renameStudioSongTag,
} from '../api';

export function TagsPage() {
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.role);
  const roles = useAuthStore((s) => s.roles ?? [s.role]);
  const canManage = canModerateSongCatalogSession(role, roles);

  const [name, setName] = useState('');
  const [filter, setFilter] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const q = useQuery({
    queryKey: ['studio', 'tags'],
    queryFn: fetchStudioSongTags,
    staleTime: 60_000,
  });

  const createMut = useMutation({
    mutationFn: () => createStudioSongTag(name.trim()),
    onSuccess: () => {
      setName('');
      void qc.invalidateQueries({ queryKey: ['studio', 'tags'] });
      emitAppToast({ kind: 'success', message: 'Тег создан' });
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number; data?: { error?: string } } })?.response;
      emitAppToast(status?.data?.error || 'Не удалось создать тег');
    },
  });

  const renameMut = useMutation({
    mutationFn: ({ id, next }: { id: number; next: string }) => renameStudioSongTag(id, next),
    onSuccess: () => {
      setEditingId(null);
      setEditName('');
      void qc.invalidateQueries({ queryKey: ['studio', 'tags'] });
      void qc.invalidateQueries({ queryKey: ['songs'] });
      emitAppToast({ kind: 'success', message: 'Тег переименован' });
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { data?: { error?: string } } })?.response;
      emitAppToast(status?.data?.error || 'Не удалось переименовать тег');
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteStudioSongTag(id, true),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['studio', 'tags'] });
      void qc.invalidateQueries({ queryKey: ['songs'] });
      emitAppToast({
        kind: 'success',
        message:
          result.songsUpdated > 0
            ? `Тег удалён (снят с ${result.songsUpdated} песен)`
            : 'Тег удалён',
      });
    },
    onError: () => emitAppToast('Не удалось удалить тег'),
  });

  const filtered = useMemo(() => {
    const rows = q.data ?? [];
    const f = filter.trim().toLowerCase();
    if (!f) return rows;
    return rows.filter((t) => t.name.toLowerCase().includes(f));
  }, [q.data, filter]);

  if (q.isLoading) return <SongListSkeleton variant="studio" />;

  if (q.isError) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="studio-page-heading text-xl font-bold text-[var(--studio-editor-text)]">Теги</h1>
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Не удалось загрузить теги. Обновите страницу — если ошибка повторится, перезапустите API
          (нужна таблица studio_song_tags).
        </p>
        <button
          type="button"
          onClick={() => void q.refetch()}
          className="studio-btn-primary min-h-[44px] rounded-xl px-4"
        >
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 md:space-y-8">
      <header className="space-y-2 border-b border-[var(--studio-editor-border)] pb-5">
        <h1 className="studio-page-heading flex items-center gap-2 text-xl font-bold text-[var(--studio-editor-text)] md:text-2xl">
          <LuTags className="h-6 w-6 text-[var(--studio-editor-accent)]" aria-hidden />
          Теги
        </h1>
        <p className="text-sm leading-relaxed text-[var(--studio-editor-mute)]">
          Общие метки для каталога. При создании или редактировании песни выберите нужные теги одним
          нажатием.
        </p>
      </header>

      {canManage ? (
        <section className="space-y-3" aria-labelledby="tags-new-heading">
          <h2 id="tags-new-heading" className="text-sm font-semibold text-[var(--studio-editor-text)]">
            Новый тег
          </h2>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim() || createMut.isPending) return;
              createMut.mutate();
            }}
          >
            <input
              className="studio-input flex-1"
              placeholder="Например: прославление, быстрая, рождество"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              aria-label="Название тега"
            />
            <button
              type="submit"
              disabled={!name.trim() || createMut.isPending}
              className="studio-btn-primary inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl disabled:opacity-50 sm:w-auto"
            >
              <LuPlus className="h-4 w-4" aria-hidden />
              Создать
            </button>
          </form>
        </section>
      ) : (
        <p className="rounded-xl border border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] px-4 py-3 text-sm text-[var(--studio-editor-mute)]">
          Просмотр тегов доступен всем в студии. Создавать и менять могут редакторы каталога.
        </p>
      )}

      <section className="space-y-3" aria-labelledby="tags-list-heading">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="tags-list-heading" className="text-sm font-semibold text-[var(--studio-editor-text)]">
            Все теги
            {q.data?.length ? (
              <span className="ml-2 font-normal text-[var(--studio-editor-mute)]">({q.data.length})</span>
            ) : null}
          </h2>
          {(q.data?.length ?? 0) > 6 ? (
            <input
              className="studio-input max-w-xs"
              placeholder="Фильтр…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Фильтр тегов"
            />
          ) : null}
        </div>

        {filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] px-4 py-8 text-center text-sm text-[var(--studio-editor-mute)]">
            {filter.trim()
              ? 'Ничего не найдено.'
              : canManage
                ? 'Пока нет тегов. Создайте первый формой выше.'
                : 'Пока нет тегов.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((tag) => {
              const isEditing = editingId === tag.id;
              return (
                <li
                  key={tag.id}
                  className="studio-list-row flex flex-col gap-2 rounded-xl border border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  {isEditing ? (
                    <form
                      className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!editName.trim()) return;
                        renameMut.mutate({ id: Number(tag.id), next: editName.trim() });
                      }}
                    >
                      <input
                        className="studio-input flex-1"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={80}
                        autoFocus
                        aria-label="Новое название тега"
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={renameMut.isPending || !editName.trim()}
                          className="studio-btn-primary min-h-[40px] rounded-xl px-3 text-sm disabled:opacity-50"
                        >
                          Сохранить
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setEditName('');
                          }}
                          className="studio-touch-target inline-flex items-center justify-center rounded-lg text-[var(--studio-editor-mute)] hover:bg-[var(--studio-nav-active-bg)]/40"
                          aria-label="Отмена"
                        >
                          <LuX className="h-4 w-4" />
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[var(--studio-editor-text)]">{tag.name}</p>
                        <p className="mt-0.5 text-xs text-[var(--studio-editor-mute)]">
                          {tag.song_count === 0
                            ? 'Пока не привязан к песням'
                            : tag.song_count === 1
                              ? '1 песня'
                              : `${tag.song_count} песен`}
                        </p>
                      </div>
                      {canManage ? (
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(tag.id);
                              setEditName(tag.name);
                            }}
                            className="studio-touch-target inline-flex items-center justify-center rounded-lg text-[var(--studio-editor-mute)] hover:bg-[var(--studio-nav-active-bg)]/40 hover:text-[var(--studio-editor-accent)]"
                            aria-label={`Переименовать «${tag.name}»`}
                            title="Переименовать"
                          >
                            <LuPencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const ok = window.confirm(
                                tag.song_count > 0
                                  ? `Удалить тег «${tag.name}» и снять его с ${tag.song_count} песен?`
                                  : `Удалить тег «${tag.name}»?`,
                              );
                              if (!ok) return;
                              deleteMut.mutate(Number(tag.id));
                            }}
                            className="studio-touch-target inline-flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                            aria-label={`Удалить «${tag.name}»`}
                            title="Удалить"
                          >
                            <LuTrash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
