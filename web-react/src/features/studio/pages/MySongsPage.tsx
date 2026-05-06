import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type CSSProperties, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LuPenLine } from 'react-icons/lu';

import { emitAppToast } from '../../../lib/uiFeedback';
import { SongListSkeleton } from '@/components/skeletons/SongListSkeleton';
import { SEMANTIC_COLORS } from '@/lib/designTokens';
import { useAuthStore } from '../../auth/authStore';
import { fetchMyVersions } from '../api';
import { studioEditSongPath, useStudioModuleSurface } from '../studioPaths';
import { deleteSong, fetchSongsForModeration, type SongListItem, updateSong } from '../../songbook/api';

type MySongsTab = 'saved' | 'missingText' | 'imported';
const IMPORTED_TAG = 'импортировано';
const MISSING_TEXT_TAG = 'нет_текста';

export function MySongsPage() {
  const surface = useStudioModuleSurface();
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const role = useAuthStore((s) => s.role);
  const isAdmin = (role ?? 'member').toLowerCase() === 'admin';

  const q = useQuery({ queryKey: ['studio', 'versions'], queryFn: fetchMyVersions });
  const missingQ = useQuery({
    queryKey: ['studio', 'missing-text-songs'],
    queryFn: () => fetchSongsForModeration({ tags: ['нет_текста'], isPublished: false }),
    // backend также разрешает участникам музыкального служения (как и импорт)
    enabled: true,
  });
  const importedQ = useQuery({
    queryKey: ['studio', 'imported-songs'],
    queryFn: () => fetchSongsForModeration({ isPublished: false }),
    enabled: true,
  });

  const [tab, setTab] = useState<MySongsTab>(() => {
    const t = sp.get('tab');
    if (t === 'missingText' || t === 'imported') return t;
    return 'saved';
  });
  const [savedSearch, setSavedSearch] = useState('');
  const [savedKeyFilter, setSavedKeyFilter] = useState('');
  const [selectedImportedSongIds, setSelectedImportedSongIds] = useState<number[]>([]);
  const publishImportedMut = useMutation({
    mutationFn: async (song: SongListItem) => {
      await updateSong(Number(song.id), {
        is_published: true,
        tags: (song.tags ?? []).filter((tag) => tag !== IMPORTED_TAG),
      });
    },
    onSuccess: () => {
      emitAppToast({ kind: 'success', message: 'Песня опубликована и попала в каталог' });
      void qc.invalidateQueries({ queryKey: ['songs'] });
      void qc.invalidateQueries({ queryKey: ['song'] });
      void qc.invalidateQueries({ queryKey: ['studio', 'imported-songs'] });
      void qc.invalidateQueries({ queryKey: ['studio', 'missing-text-songs'] });
    },
    onError: () => emitAppToast('Не удалось опубликовать песню'),
  });
  const massDeleteImportedMut = useMutation({
    mutationFn: async (songIds: number[]) => {
      for (const songId of songIds) {
        await deleteSong(songId);
      }
    },
    onSuccess: () => {
      setSelectedImportedSongIds([]);
      emitAppToast({ kind: 'success', message: 'Выбранные импортированные песни удалены' });
      void qc.invalidateQueries({ queryKey: ['songs'] });
      void qc.invalidateQueries({ queryKey: ['song'] });
      void qc.invalidateQueries({ queryKey: ['studio', 'imported-songs'] });
      void qc.invalidateQueries({ queryKey: ['studio', 'missing-text-songs'] });
    },
    onError: () => emitAppToast('Не удалось удалить выбранные песни'),
  });

  const rows = q.data ?? [];
  const filteredRows = rows.filter((v) => {
    const qText = savedSearch.trim().toLowerCase();
    const okText = qText.length === 0 || v.song_title.toLowerCase().includes(qText);
    const okKey = savedKeyFilter.trim().length === 0 || (v.custom_key ?? '').toLowerCase() === savedKeyFilter.trim().toLowerCase();
    return okText && okKey;
  });
  const showMissingTab = true;
  const importedRows = (importedQ.data ?? []).filter((song) => !((song.tags ?? []).includes('__archived')));
  const showImportedTab = true;
  const selectedImportedCount = selectedImportedSongIds.length;

  useEffect(() => {
    const allowed = new Set(importedRows.map((song) => Number(song.id)));
    setSelectedImportedSongIds((prev) => prev.filter((songId) => allowed.has(songId)));
  }, [importedRows]);

  useEffect(() => {
    const next = new URLSearchParams(sp);
    if (tab === 'saved') next.delete('tab');
    else next.set('tab', tab);
    if (next.toString() !== sp.toString()) {
      setSp(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  if (q.isLoading) {
    return <SongListSkeleton />;
  }
  if (q.isError) {
    return (
      <p className="text-sm" style={{ color: SEMANTIC_COLORS.accent }}>
        Не удалось загрузить список.
      </p>
    );
  }

  const isImportedSelected = (songId: number): boolean => selectedImportedSongIds.includes(songId);
  const toggleImportedSelection = (songId: number): void => {
    setSelectedImportedSongIds((prev) =>
      prev.includes(songId) ? prev.filter((id) => id !== songId) : [...prev, songId],
    );
  };
  const toggleSelectAllImported = (): void => {
    const allIds = importedRows.map((song) => Number(song.id));
    setSelectedImportedSongIds((prev) => (prev.length === allIds.length ? [] : allIds));
  };
  const runMassDeleteImported = (): void => {
    if (!isAdmin) return;
    if (selectedImportedSongIds.length === 0) return;
    if (!window.confirm(`Удалить выбранные песни (${selectedImportedSongIds.length}) из каталога? Действие необратимо.`)) return;
    massDeleteImportedMut.mutate(selectedImportedSongIds);
  };
  const importSourceBadge = (song: SongListItem): { text: string; className: string } => {
    const tags = song.tags ?? [];
    if (tags.includes(IMPORTED_TAG)) {
      return {
        text: 'новый импорт',
        className: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-200',
      };
    }
    return {
      text: 'старый импорт',
      className: 'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-200',
    };
  };

  const pageCard =
    surface === 'songbook'
      ? 'rounded-2xl border border-[var(--ms-border)] bg-[var(--ms-surface-elevated)] p-4 shadow-sm md:p-6'
      : '';

  const semanticVars: Record<`--${string}`, string> = {
    '--ms-surface': `var(--surface, ${SEMANTIC_COLORS.surface})`,
    '--ms-surface-elevated': `var(--surface-elevated, ${SEMANTIC_COLORS.surfaceElevated})`,
    '--ms-text': `var(--text, ${SEMANTIC_COLORS.text})`,
    '--ms-text-secondary': `var(--text-secondary, ${SEMANTIC_COLORS.textSecondary})`,
    '--ms-text-muted': `var(--text-muted, ${SEMANTIC_COLORS.textMuted})`,
    '--ms-primary': `var(--primary, ${SEMANTIC_COLORS.primary})`,
    '--ms-primary-dark': `var(--primary-dark, ${SEMANTIC_COLORS.primaryDark})`,
    '--ms-on-primary': 'var(--text-on-primary, rgb(255 255 255))',
    '--ms-border': 'var(--border, rgba(0, 0, 0, 0.08))',
    '--ms-bg-elevated': 'var(--bg-elevated, rgba(0, 0, 0, 0.04))',
    '--ms-error': SEMANTIC_COLORS.accent,
  };

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
          ? 'bg-[var(--ms-primary)] text-[var(--ms-on-primary)] shadow-sm'
          : 'text-[var(--ms-text-secondary)] hover:bg-[var(--ms-bg-elevated)] hover:text-[var(--ms-text)]',
      ].join(' ')}
    >
      {label}
    </button>
  );

  return (
    <div style={semanticVars as CSSProperties} className={['mx-auto max-w-3xl space-y-6', pageCard].filter(Boolean).join(' ')}>
      <header className="space-y-3 border-b border-[var(--ms-border)] pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--ms-text)]">Мои версии</h1>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-[var(--ms-text-secondary)]">
            Работа с песнями каталога, заготовками без текста и импортированными песнями.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/studio/add-song"
            className="inline-flex min-h-[44px] items-center rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-500"
          >
            + Добавить песню
          </Link>
        </div>
        <div
          className="flex w-full gap-1 rounded-2xl bg-[var(--ms-bg-elevated)] p-1"
          role="tablist"
          aria-label="Разделы «Мои версии»"
        >
          {tabBtn('saved', 'Каталог', 'Сохранённые студийные версии песен из общего списка')}
          {showMissingTab ? tabBtn('missingText', 'Без текста', 'Заготовки песен без слов (тег: нет_текста)') : null}
          {showImportedTab ? tabBtn('imported', 'Импортированные', 'Черновики, созданные импортом из таблицы') : null}
        </div>
      </header>

      <div
        className="min-h-[12rem]"
        role="tabpanel"
        aria-label={
          tab === 'saved'
            ? 'Каталог'
            : tab === 'missingText'
                ? 'Без текста'
                : tab === 'imported'
                  ? 'Импортированные'
                  : 'Каталог'
        }
      >
        {tab === 'saved' ? (
          <section className="space-y-3">
            <p className="text-sm text-[var(--ms-text-secondary)]">
              Это ваши сохранённые правки к песням из общего каталога. Оригинал в песеннике не меняется.
            </p>
            <div className="grid gap-2 rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-elevated)] p-3 sm:grid-cols-2">
              <input
                value={savedSearch}
                onChange={(e) => setSavedSearch(e.target.value)}
                placeholder="Поиск по названию"
                className="min-h-[42px] rounded-lg border border-[var(--ms-border)] bg-[var(--ms-surface-elevated)] px-3 text-sm text-[var(--ms-text)] outline-none placeholder:text-[var(--ms-text-muted)]"
              />
              <input
                value={savedKeyFilter}
                onChange={(e) => setSavedKeyFilter(e.target.value)}
                placeholder="Фильтр по тональности"
                className="min-h-[42px] rounded-lg border border-[var(--ms-border)] bg-[var(--ms-surface-elevated)] px-3 text-sm text-[var(--ms-text)] outline-none placeholder:text-[var(--ms-text-muted)]"
              />
            </div>
            {rows.length === 0 ? (
              <div className="space-y-3 rounded-xl border border-dashed border-[var(--ms-border)] bg-[var(--ms-bg-elevated)] px-4 py-6 text-sm text-[var(--ms-text-secondary)]">
                <p>Пока нет сохранённых версий. Откройте песню в песеннике и выберите «В студию».</p>
                <Link to="/songbook" className="inline-flex font-semibold text-sky-700 hover:text-sky-800">
                  Перейти в песенник →
                </Link>
              </div>
            ) : (
              <>
                {filteredRows.length === 0 ? (
                  <p className="text-sm text-[var(--ms-text-muted)]">По выбранным фильтрам ничего не найдено.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {filteredRows.map((v) => (
                      <li key={v.id}>
                        <Link
                          to={studioEditSongPath(surface, Number(v.song_id))}
                          className="flex min-h-[52px] items-center justify-between gap-3 rounded-xl border border-[var(--ms-border)] bg-[var(--ms-surface-elevated)] px-4 py-3 shadow-sm transition hover:bg-[var(--ms-bg-elevated)]"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-[var(--ms-text)]">{v.song_title}</p>
                            <p className="mt-0.5 text-xs text-[var(--ms-text-muted)]">
                              {v.custom_key ?? '—'} · {new Date(v.updated_at).toLocaleString()}
                            </p>
                          </div>
                          <LuPenLine className="h-5 w-5 shrink-0 text-[var(--ms-text-muted)]" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        ) : null}

        {tab === 'missingText' ? (
          <section className="space-y-3">
            <p className="text-sm text-[var(--ms-text-secondary)]">
              Это заготовки, которые не отображаются в песеннике. Откройте редактор и добавьте слова/аккорды.
            </p>
            {missingQ.isLoading ? (
              <SongListSkeleton />
            ) : missingQ.isError ? (
              <p className="text-sm text-[var(--ms-error)]">Не удалось загрузить список заготовок.</p>
            ) : (missingQ.data ?? []).length === 0 ? (
              <p className="text-sm text-[var(--ms-text-muted)]">Заготовок без текста нет.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {(missingQ.data ?? []).map((s: SongListItem) => (
                  <li
                    key={s.id}
                    className="flex min-h-[48px] items-center gap-3 rounded-xl border border-[var(--ms-border)] bg-[var(--ms-surface-elevated)] px-4 py-3 shadow-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-[var(--ms-text)]">
                        {s.song_number ?? '—'}. {s.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200">
                          нет текста
                        </span>
                        <span className="text-xs text-[var(--ms-text-muted)]">не опубликовано</span>
                      </div>
                    </div>
                    <Link
                      to={studioEditSongPath(surface, Number(s.id))}
                      className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-sky-700 hover:text-sky-800"
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
        {tab === 'imported' ? (
          <section className="space-y-3">
            <p className="text-sm text-[var(--ms-text-secondary)]">
              Здесь отображаются импортированные непубликованные песни (включая ранее импортированные). Отредактируйте и нажмите
              «Опубликовать», чтобы песня попала в общий песенник.
            </p>
            {isAdmin && importedRows.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 dark:border-red-500/40 dark:bg-red-500/10">
                <button
                  type="button"
                  onClick={toggleSelectAllImported}
                  className="inline-flex min-h-[36px] items-center rounded-lg border border-[var(--ms-border)] bg-[var(--ms-surface-elevated)] px-3 text-xs font-semibold text-[var(--ms-text-secondary)] hover:bg-[var(--ms-bg-elevated)]"
                >
                  {selectedImportedCount === importedRows.length ? 'Снять выбор' : 'Выбрать все'}
                </button>
                <button
                  type="button"
                  onClick={runMassDeleteImported}
                  disabled={selectedImportedCount === 0 || massDeleteImportedMut.isPending}
                  className="inline-flex min-h-[36px] items-center rounded-lg bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {massDeleteImportedMut.isPending ? 'Удаляем…' : `Удалить выбранные (${selectedImportedCount})`}
                </button>
              </div>
            ) : null}
            {importedQ.isLoading ? (
              <SongListSkeleton />
            ) : importedQ.isError ? (
              <p className="text-sm text-[var(--ms-error)]">Не удалось загрузить импортированные песни.</p>
            ) : importedRows.length === 0 ? (
              <p className="text-sm text-[var(--ms-text-muted)]">Нет импортированных черновиков.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {importedRows.map((s: SongListItem) => {
                  const sourceBadge = importSourceBadge(s);
                  const isMissingText = (s.tags ?? []).includes(MISSING_TEXT_TAG);
                  return (
                    <li
                      key={s.id}
                      className="flex min-h-[48px] items-center gap-3 rounded-xl border border-[var(--ms-border)] bg-[var(--ms-surface-elevated)] px-4 py-3 shadow-sm"
                    >
                      {isAdmin ? (
                        <label className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center">
                          <input
                            type="checkbox"
                            checked={isImportedSelected(Number(s.id))}
                            onChange={() => toggleImportedSelection(Number(s.id))}
                          />
                        </label>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-[var(--ms-text)]">
                          {s.song_number ?? '—'}. {s.title}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${sourceBadge.className}`}
                          >
                            {sourceBadge.text}
                          </span>
                          <span className="text-xs text-[var(--ms-text-muted)]">черновик</span>
                          {isMissingText ? (
                            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200">
                              нет текста
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <Link
                        to={studioEditSongPath(surface, Number(s.id))}
                        className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-sky-700 hover:text-sky-800"
                      >
                        <LuPenLine className="h-4 w-4" aria-hidden />
                        Редактор
                      </Link>
                      <button
                        type="button"
                        onClick={() => publishImportedMut.mutate(s)}
                        disabled={publishImportedMut.isPending}
                        className="inline-flex min-h-[40px] shrink-0 items-center rounded-lg bg-[var(--ms-primary)] px-3 text-sm font-semibold text-[var(--ms-on-primary)] hover:bg-[var(--ms-primary-dark)] disabled:opacity-50"
                      >
                        Опубликовать
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
