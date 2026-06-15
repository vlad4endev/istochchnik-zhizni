import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LuPenLine, LuRocket, LuTrash2 } from 'react-icons/lu';

import { SongListSkeleton } from '@/components/skeletons/SongListSkeleton';
import { useAuthStore } from '../../auth/authStore';
import {
  deleteDraft,
  fetchDrafts,
  fetchImportedSandboxSongs,
  fetchMyVersions,
  fetchPublicCatalogSyncStatus,
  fetchRecentSongs,
  syncStudioToPublicCatalog,
  type StudioDraft,
  type StudioVersionListItem,
} from '../api';
import { studioAddSongPath, studioCatalogPath, studioEditSongPath, useStudioModuleSurface } from '../studioPaths';
import { type SongListItem } from '../../songbook/api';
import { usePublishSong } from '../usePublishSong';
import { emitAppToast } from '../../../lib/uiFeedback';

type MySongsTab = 'saved' | 'drafts' | 'recent' | 'imported';

function parseMySongsTab(searchParams: URLSearchParams): MySongsTab {
  const t = searchParams.get('tab');
  if (t === 'drafts' || t === 'recent' || t === 'imported' || t === 'saved') return t;
  return 'saved';
}

const MISSING_TEXT_TAG = 'нет_текста';

function ImportedSongRow({ song }: { song: SongListItem }) {
  const publishMut = usePublishSong();

  const isMissingText = (song.tags ?? []).includes(MISSING_TEXT_TAG) || !song.content?.trim();

  const editHref = studioEditSongPath(Number(song.id));

  return (
    <li className="rounded-xl border border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] px-4 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2 sm:gap-3">
          <Link
            to={editHref}
            className="min-w-0 flex-1 rounded-lg text-left outline-none ring-sky-400 focus-visible:ring-2"
          >
            <p className="truncate text-sm font-semibold text-[var(--studio-editor-text)] hover:text-[var(--studio-editor-accent)]">
              {song.song_number != null ? `${song.song_number}. ` : ''}
              {song.title || 'Без названия'}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {isMissingText ? (
                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                  нет текста
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
                  готова
                </span>
              )}
              <span className="text-xs text-[var(--studio-editor-mute)]">не в каталоге</span>
            </div>
          </Link>
          <Link
            to={editHref}
            className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[var(--studio-editor-accent)] hover:text-[var(--studio-editor-accent)]"
          >
            <LuPenLine className="h-4 w-4" aria-hidden />
            Редактор
          </Link>
        </div>
        <button
          type="button"
          onClick={() => {
            const body = (song.content ?? '').trim();
            if (!isMissingText && !body) {
              window.alert('Сначала добавьте текст песни.');
              return;
            }
            if (isMissingText && !window.confirm('Опубликовать без текста? Песня попадёт в каталог.')) {
              return;
            }
            void publishMut.mutateAsync({
              songId: Number(song.id),
              content: song.content,
              customKey: song.default_key,
            });
          }}
          disabled={publishMut.isPending}
          className="studio-btn-primary inline-flex shrink-0 items-center gap-1 text-xs shadow-sm transition disabled:opacity-50"
          aria-label="Опубликовать в каталог"
          title="Опубликовать в каталог"
        >
          <LuRocket className="h-3.5 w-3.5" aria-hidden />
          {publishMut.isPending ? 'Публикую…' : 'Опубликовать'}
        </button>
      </div>
      {publishMut.isError ? (
        <p className="mt-2 text-xs text-red-600">Не удалось опубликовать — проверьте права.</p>
      ) : null}
    </li>
  );
}

function SavedVersionRow({ version }: { version: StudioVersionListItem }) {
  const publishMut = usePublishSong();
  const editHref = studioEditSongPath(Number(version.song_id));

  return (
    <li className="rounded-xl border border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] px-4 py-3 shadow-sm">
      <div className="flex min-h-[52px] items-center justify-between gap-3">
        <Link to={editHref} className="min-w-0 flex-1">
          <p className="truncate font-medium text-[var(--studio-editor-text)] hover:text-[var(--studio-editor-accent)]">{version.song_title}</p>
          <p className="mt-0.5 text-xs text-[var(--studio-editor-mute)]">
            {version.custom_key ?? '—'} · {new Date(version.updated_at).toLocaleString()}
          </p>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          {!version.song_is_published ? (
            <button
              type="button"
              onClick={() => {
                const body = (version.custom_content ?? '').trim();
                if (!body && !window.confirm('Опубликовать без текста? Песня попадёт в каталог.')) {
                  return;
                }
                void publishMut.mutateAsync({
                  songId: Number(version.song_id),
                  content: version.custom_content ?? '',
                  customKey: version.custom_key,
                  saveVersionFirst: false,
                });
              }}
              disabled={publishMut.isPending}
              className="studio-btn-primary inline-flex items-center gap-1 text-xs shadow-sm disabled:opacity-50"
            >
              <LuRocket className="h-3.5 w-3.5" aria-hidden />
              {publishMut.isPending ? 'Публикую…' : 'Опубликовать'}
            </button>
          ) : (
            <span className="studio-btn-success inline-flex cursor-default items-center px-3 py-2 text-sm opacity-90" aria-disabled>
              ✓ В каталоге
            </span>
          )}
          <Link
            to={editHref}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-[var(--studio-editor-mute)] hover:text-[var(--studio-editor-accent)]"
            aria-label="Редактор"
          >
            <LuPenLine className="h-5 w-5" aria-hidden />
          </Link>
        </div>
      </div>
      {publishMut.isError ? (
        <p className="mt-2 text-xs text-red-600">Не удалось опубликовать — проверьте права.</p>
      ) : null}
    </li>
  );
}

function DraftRow({
  draft,
  composeHref,
  onDeleted,
}: {
  draft: StudioDraft;
  composeHref: string;
  onDeleted: () => void;
}) {
  return (
    <li className="rounded-xl border border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] px-4 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--studio-editor-text)]">{draft.title || 'Без названия'}</p>
          <p className="mt-1 text-xs text-[var(--studio-editor-mute)]">{new Date(draft.updated_at).toLocaleString()}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Link
            to={composeHref}
            state={{ draft: { id: Number(draft.id), title: draft.title, content: draft.content } }}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[var(--studio-editor-accent)] hover:bg-[var(--studio-nav-active-bg)]/40"
            aria-label="Открыть в редакторе"
            title="Открыть в редакторе"
          >
            <LuPenLine className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Удалить черновик?')) onDeleted();
            }}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[var(--studio-editor-mute)] hover:bg-red-50 hover:text-red-600"
            aria-label="Удалить черновик"
          >
            <LuTrash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </li>
  );
}

export function MySongsPage() {
  const surface = useStudioModuleSurface();
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.role);
  void role;

  const q = useQuery({ queryKey: ['studio', 'versions'], queryFn: fetchMyVersions });
  const draftsQ = useQuery({ queryKey: ['studio', 'drafts'], queryFn: fetchDrafts });
  const recentQ = useQuery({
    queryKey: ['studio', 'recent-songs'],
    queryFn: () => fetchRecentSongs(8),
  });
  const importedQ = useQuery({
    queryKey: ['studio', 'imported-songs'],
    queryFn: () => fetchImportedSandboxSongs(),
    enabled: true,
  });

  const syncStatusQ = useQuery({
    queryKey: ['studio', 'public-catalog-sync-status'],
    queryFn: fetchPublicCatalogSyncStatus,
  });

  const syncCatalogMut = useMutation({
    mutationFn: () => syncStudioToPublicCatalog(),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['songs'] });
      void qc.invalidateQueries({ queryKey: ['studio'] });
      void qc.invalidateQueries({ queryKey: ['studio', 'versions'] });
      void qc.invalidateQueries({ queryKey: ['studio', 'imported-songs'] });
      void qc.invalidateQueries({ queryKey: ['studio', 'public-catalog-sync-status'] });
      const total = result.published + result.contentSynced;
      emitAppToast({
        kind: 'success',
        message:
          total > 0
            ? `В общий песенник перенесено: ${total} песен`
            : 'Все готовые песни уже в общем каталоге',
      });
    },
    onError: () => emitAppToast('Не удалось вынести песни в общий песенник'),
  });

  const [importedSearch, setImportedSearch] = useState('');
  const importedFiltered = useMemo(() => {
    const list = (importedQ.data ?? []) as SongListItem[];
    const q = importedSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        String(s.song_number ?? '').includes(q),
    );
  }, [importedQ.data, importedSearch]);

  const importedErrorSuffix = useMemo(() => {
    if (!importedQ.isError || !importedQ.error) return '';
    const ax = importedQ.error as AxiosError<{ error?: string }>;
    const st = ax.response?.status;
    const data = ax.response?.data;
    const msg =
      typeof data === 'object' && data !== null && typeof data.error === 'string' ? data.error : '';
    const hint = [st ? `HTTP ${st}` : '', msg].filter(Boolean).join(': ');
    return hint ? ` (${hint})` : '';
  }, [importedQ.isError, importedQ.error]);

  const [searchParams, setSearchParams] = useSearchParams();
  /** Одна правда: вкладка из `?tab=` — без отдельного useState, чтобы не сбрасывать «Импортированные». */
  const tab = useMemo(() => parseMySongsTab(searchParams), [searchParams]);

  const setTab = useCallback(
    (next: MySongsTab) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === 'saved') {
            p.delete('tab');
          } else {
            p.set('tab', next);
          }
          return p;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const [savedSearch, setSavedSearch] = useState('');
  const [savedKeyFilter, setSavedKeyFilter] = useState('');
  const composeHref = studioAddSongPath(surface);

  const delDraftMut = useMutation({
    mutationFn: (id: number) => deleteDraft(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['studio', 'drafts'] }),
  });

  useEffect(() => {
    const recent = recentQ.data ?? [];
    const showRecentTab = recent.length > 0;
    if (tab === 'recent' && !showRecentTab && !recentQ.isLoading) {
      setTab('saved');
    }
  }, [tab, recentQ.data, recentQ.isLoading, setTab]);

  if (q.isLoading) {
    return <SongListSkeleton />;
  }
  if (q.isError) {
    return <p className="text-sm text-red-600">Не удалось загрузить список.</p>;
  }

  const rows = q.data ?? [];
  const filteredRows = rows.filter((v) => {
    const qText = savedSearch.trim().toLowerCase();
    const okText = qText.length === 0 || v.song_title.toLowerCase().includes(qText);
    const okKey = savedKeyFilter.trim().length === 0 || (v.custom_key ?? '').toLowerCase() === savedKeyFilter.trim().toLowerCase();
    return okText && okKey;
  });
  const recent = recentQ.data ?? [];
  const drafts = draftsQ.data ?? [];
  const showRecentTab = recent.length > 0;
  const importedCount = (importedQ.data ?? []).length;
  const showImportedTab = true;

  const pageCard =
    surface === 'songbook'
      ? 'rounded-2xl border border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] p-4 shadow-sm md:p-6'
      : '';

  const tabBtn = (id: MySongsTab, label: string, hint: string) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={tab === id}
      title={hint}
      onClick={() => setTab(id)}
      className={[
        'min-h-[44px] flex-1 rounded-xl px-2 py-2 text-center text-xs font-semibold transition-colors sm:text-sm',
        tab === id
          ? 'bg-[var(--studio-nav-active-bg)] text-[var(--studio-nav-active-text)] shadow-sm'
          : 'text-[var(--studio-nav-text)] hover:bg-[var(--studio-nav-active-bg)]/60 hover:text-[var(--studio-editor-text)]',
      ].join(' ')}
    >
      {label}
    </button>
  );

  return (
    <div className={['mx-auto max-w-3xl space-y-6', pageCard].filter(Boolean).join(' ')}>
      <header className="space-y-3 border-b border-[var(--studio-editor-border)] pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--studio-editor-text)]">Студия · мои песни</h1>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-[var(--studio-editor-mute)]">
            Личные версии и черновики — только у вас. Все опубликованные песни всех участников — в разделе{' '}
            <Link to={studioCatalogPath(surface)} className="font-semibold text-[var(--studio-editor-accent)] hover:text-[var(--studio-editor-accent)]">
              Каталог
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to={composeHref}
            className="studio-btn-primary inline-flex min-h-[44px] items-center rounded-xl"
          >
            + Новая песня
          </Link>
        </div>
        <div
          className="flex w-full gap-1 rounded-2xl bg-[var(--studio-nav-active-bg)]/40 p-1"
          role="tablist"
          aria-label="Разделы «Мои версии»"
        >
          {tabBtn('saved', 'Мои версии', 'Ваши личные правки к песням из песенника')}
          {showRecentTab ? tabBtn('recent', 'Недавние', 'Песни, которые вы недавно открывали в песеннике') : null}
          {tabBtn('drafts', 'Черновики', 'Тексты без привязки к песне из каталога')}
          {showImportedTab
            ? tabBtn(
                'imported',
                importedCount > 0 ? `Импортированные · ${importedCount}` : 'Импортированные',
                'Песочница студии: видят все с доступом к студии. После «Опубликовать» песня попадает в общий песенник.',
              )
            : null}
        </div>
      </header>

      {(syncStatusQ.data?.hidden ?? 0) > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Общий песенник — это то, что видят все</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-900/90">
            У вас {syncStatusQ.data?.hidden} песен с текстом, которые пока видны только вам в студии. Перенесите их
            в общий каталог, чтобы они появились в разделе «Песенник» у всей церкви.
          </p>
          <button
            type="button"
            onClick={() => syncCatalogMut.mutate()}
            disabled={syncCatalogMut.isPending}
            className="studio-btn-primary mt-3 inline-flex min-h-[44px] items-center rounded-xl disabled:opacity-50"
          >
            {syncCatalogMut.isPending ? 'Переносим…' : 'Вынести в общий песенник'}
          </button>
        </div>
      ) : null}

      <div
        className="min-h-[12rem]"
        role="tabpanel"
        aria-label={
          tab === 'saved'
            ? 'Мои версии'
            : tab === 'recent'
              ? 'Недавние'
              : tab === 'imported'
                ? 'Импортированные'
                : 'Черновики'
        }
      >
        {tab === 'drafts' ? (
          <section className="space-y-4">
            <div className="rounded-xl border border-dashed border-[var(--studio-editor-border)] bg-[var(--studio-editor-bg)] px-4 py-5 text-sm text-[var(--studio-editor-mute)]">
              <p className="font-semibold text-[var(--studio-editor-text)]">Единый редактор песен</p>
              <p className="mt-1 leading-relaxed">
                Импорт из текста, PDF и ссылок, превью с аккордами, быстрые аккорды и метаданные — в одном мастере.
                Черновик можно сохранить на любом шаге.
              </p>
              <Link
                to={composeHref}
                className="studio-btn-primary mt-3 inline-flex min-h-[44px] items-center rounded-xl"
              >
                Создать песню или черновик
              </Link>
            </div>
            {drafts.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {drafts.map((d) => (
                  <DraftRow key={d.id} draft={d} composeHref={composeHref} onDeleted={() => delDraftMut.mutate(Number(d.id))} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--studio-editor-mute)]">Список черновиков пуст — начните с кнопки выше.</p>
            )}
          </section>
        ) : null}

        {tab === 'recent' ? (
          <section className="space-y-3">
            <p className="text-sm text-[var(--studio-editor-mute)]">
              Открывайте карточку в песеннике или сразу переходите в редактор своей версии.
            </p>
            {recentQ.isLoading ? (
              <SongListSkeleton />
            ) : (
              <ul className="flex flex-col gap-2">
                {recent.map((s) => (
                  <li
                    key={s.id}
                    className="flex min-h-[48px] items-center gap-3 rounded-xl border border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] px-4 py-3 shadow-sm"
                  >
                    <Link
                      to={`/songbook/${s.id}`}
                      className="min-w-0 flex-1 truncate font-medium text-[var(--studio-editor-text)] hover:text-[var(--studio-editor-accent)]"
                    >
                      {s.title}
                    </Link>
                    <Link
                      to={studioEditSongPath(Number(s.id))}
                      className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[var(--studio-editor-accent)] hover:text-[var(--studio-editor-accent)]"
                    >
                      <LuPenLine className="h-4 w-4" aria-hidden />
                      Редактор
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {tab === 'saved' ? (
          <section className="space-y-3">
            <p className="text-sm text-[var(--studio-editor-mute)]">
              Это ваши сохранённые правки к песням из общего каталога. Оригинал в песеннике не меняется.
            </p>
            <div className="grid gap-2 rounded-xl border border-[var(--studio-editor-border)] bg-[var(--studio-editor-bg)] p-3 sm:grid-cols-2">
              <input
                value={savedSearch}
                onChange={(e) => setSavedSearch(e.target.value)}
                placeholder="Поиск по названию"
                className="min-h-[42px] rounded-lg border border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] px-3 text-sm outline-none"
              />
              <input
                value={savedKeyFilter}
                onChange={(e) => setSavedKeyFilter(e.target.value)}
                placeholder="Фильтр по тональности"
                className="min-h-[42px] rounded-lg border border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] px-3 text-sm outline-none"
              />
            </div>
            {rows.length === 0 ? (
              <div className="space-y-3 rounded-xl border border-dashed border-[var(--studio-editor-border)] bg-[var(--studio-editor-bg)] px-4 py-6 text-sm text-[var(--studio-editor-mute)]">
                <p>Пока нет сохранённых версий. Откройте песню в песеннике и выберите «В студию».</p>
                <Link to="/songbook" className="inline-flex font-semibold text-[var(--studio-editor-accent)] hover:text-[var(--studio-editor-accent)]">
                  Перейти в песенник →
                </Link>
              </div>
            ) : (
              <>
                {filteredRows.length === 0 ? (
                  <p className="text-sm text-[var(--studio-editor-mute)]">По выбранным фильтрам ничего не найдено.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {filteredRows.map((v) => (
                      <SavedVersionRow key={v.id} version={v} />
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        ) : null}

        {tab === 'imported' ? (
          <section className="space-y-3">
            <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3 text-sm text-sky-900">
              <p className="font-semibold">Импортированные — только для студии</p>
              <p className="mt-1 text-xs leading-relaxed text-sky-900/80">
                Этот список видят все музыканты с доступом к студии (песни всех авторов). После кнопки{' '}
                <span className="font-semibold">«Опубликовать»</span> песня попадает в общий{' '}
                <Link to="/songbook" className="font-semibold underline hover:text-sky-950">
                  песенник
                </Link>{' '}
                для всех.
              </p>
            </div>
            <input
              value={importedSearch}
              onChange={(e) => setImportedSearch(e.target.value)}
              placeholder="Поиск по номеру или названию"
              className="min-h-[42px] w-full rounded-lg border border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] px-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            />
            {importedQ.isLoading ? (
              <SongListSkeleton />
            ) : importedQ.isError ? (
              <p className="text-sm text-red-600">
                Не удалось загрузить импортированные песни.{importedErrorSuffix}
              </p>
            ) : importedFiltered.length === 0 ? (
              <p className="text-sm text-[var(--studio-editor-mute)]">
                {importedCount === 0
                  ? 'Здесь только неопубликованные заготовки с импорта (тег «импортированная» / «импортировано» или дата импорта). Уже в каталоге песни здесь не показываются.'
                  : 'Ничего не найдено по запросу.'}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {importedFiltered.map((s) => (
                  <ImportedSongRow key={s.id} song={s} />
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
