import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LuCheck, LuPenLine, LuRocket, LuTrash2 } from 'react-icons/lu';

import { SongListSkeleton } from '@/components/skeletons/SongListSkeleton';
import { useAuthStore } from '../../auth/authStore';
import {
  createDraft,
  deleteDraft,
  fetchDrafts,
  fetchMyVersions,
  fetchRecentSongs,
  updateDraft,
  type StudioDraft,
} from '../api';
import { studioEditSongPath, useStudioModuleSurface } from '../studioPaths';
import {
  fetchSongsForModeration,
  publishSong,
  updateSong,
  type SongListItem,
} from '../../songbook/api';

type MySongsTab = 'saved' | 'drafts' | 'recent' | 'imported';

const IMPORTED_TAG = 'импортированная';
const MISSING_TEXT_TAG = 'нет_текста';

function ImportedSongRow({ song }: { song: SongListItem }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(song.title);
  const [content, setContent] = useState(song.content);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setTitle(song.title);
    setContent(song.content);
  }, [song.id, song.title, song.content]);

  const isMissingText = (song.tags ?? []).includes(MISSING_TEXT_TAG) || !song.content?.trim();

  const saveMut = useMutation({
    mutationFn: () =>
      updateSong(Number(song.id), { title: title.trim() || song.title, content }),
    onSuccess: () => {
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1800);
      void qc.invalidateQueries({ queryKey: ['studio', 'imported-songs'] });
      void qc.invalidateQueries({ queryKey: ['song', Number(song.id)] });
    },
  });

  const publishMut = useMutation({
    mutationFn: () => publishSong(Number(song.id)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['studio', 'imported-songs'] });
      void qc.invalidateQueries({ queryKey: ['songs'] });
      void qc.invalidateQueries({ queryKey: ['song', Number(song.id)] });
    },
  });

  return (
    <li className="rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="min-w-0 flex-1 text-left"
        >
          <p className="truncate text-sm font-semibold text-stone-900 hover:text-sky-700">
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
            <span className="text-xs text-stone-500">не в каталоге</span>
          </div>
        </button>
        <button
          type="button"
          onClick={() => {
            if (!isMissingText && !content.trim()) {
              window.alert('Сначала добавьте текст песни.');
              return;
            }
            if (isMissingText && !window.confirm('Опубликовать без текста? Песня попадёт в каталог.')) {
              return;
            }
            publishMut.mutate();
          }}
          disabled={publishMut.isPending}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-500 disabled:opacity-50"
          aria-label="Опубликовать в каталог"
          title="Опубликовать в каталог"
        >
          <LuRocket className="h-3.5 w-3.5" aria-hidden />
          {publishMut.isPending ? 'Публикую…' : 'Опубликовать'}
        </button>
      </div>

      {open ? (
        <div className="mt-3 space-y-3 border-t border-stone-100 pt-3">
          <input
            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-none placeholder:text-stone-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название"
          />
          <textarea
            className="min-h-[180px] w-full resize-y rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-[13px] leading-5 text-stone-900 outline-none placeholder:text-stone-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="ChordPro / текст песни…"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              className="inline-flex items-center gap-1 rounded-lg bg-stone-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50"
            >
              {saveMut.isPending ? 'Сохраняю…' : 'Сохранить'}
            </button>
            {savedFlash ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                <LuCheck className="h-3 w-3" aria-hidden /> Сохранено
              </span>
            ) : null}
            {saveMut.isError ? (
              <span className="text-xs text-red-600">Не удалось сохранить — проверьте права.</span>
            ) : null}
            {publishMut.isError ? (
              <span className="text-xs text-red-600">
                Не удалось опубликовать — проверьте права.
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}

function DraftRow({
  draft,
  onDeleted,
}: {
  draft: StudioDraft;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(draft.title);
  const [content, setContent] = useState(draft.content);

  const save = useMutation({
    mutationFn: () => updateDraft(Number(draft.id), { title, content }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['studio', 'drafts'] }),
  });

  return (
    <li className="rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="min-w-0 flex-1 text-left text-sm font-medium text-stone-900 hover:text-sky-700"
        >
          {draft.title || 'Без названия'}
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Удалить черновик?')) onDeleted();
          }}
          className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-stone-400 hover:bg-red-50 hover:text-red-600"
          aria-label="Удалить черновик"
        >
          <LuTrash2 className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-xs text-stone-500">{new Date(draft.updated_at).toLocaleString()}</p>
      {open ? (
        <div className="mt-3 space-y-3 border-t border-stone-100 pt-3">
          <input
            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-none ring-0 placeholder:text-stone-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название"
          />
          <textarea
            className="min-h-[100px] w-full resize-y rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-sm text-stone-900 outline-none placeholder:text-stone-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="ChordPro…"
          />
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="text-sm font-semibold text-sky-700 hover:text-sky-800 disabled:opacity-50"
          >
            Сохранить
          </button>
        </div>
      ) : null}
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
    queryFn: () => fetchSongsForModeration({ tags: [IMPORTED_TAG] }),
    // backend также разрешает участникам музыкального служения (как и импорт)
    enabled: true,
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

  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab: MySongsTab = ((): MySongsTab => {
    const t = searchParams.get('tab');
    if (t === 'drafts' || t === 'recent' || t === 'imported' || t === 'saved') return t;
    return 'saved';
  })();
  const [tab, setTab] = useState<MySongsTab>(initialTab);
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && t !== tab && (t === 'drafts' || t === 'recent' || t === 'imported' || t === 'saved')) {
      setTab(t);
    }
  }, [searchParams, tab]);
  useEffect(() => {
    const current = searchParams.get('tab');
    if (current === tab) return;
    const next = new URLSearchParams(searchParams);
    if (tab === 'saved') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next, { replace: true });
  }, [tab, searchParams, setSearchParams]);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [savedSearch, setSavedSearch] = useState('');
  const [savedKeyFilter, setSavedKeyFilter] = useState('');

  const createMut = useMutation({
    mutationFn: () => createDraft(draftTitle || 'Без названия', draftContent),
    onSuccess: () => {
      setDraftTitle('');
      setDraftContent('');
      void qc.invalidateQueries({ queryKey: ['studio', 'drafts'] });
    },
  });

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
  }, [tab, recentQ.data, recentQ.isLoading]);

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
      ? 'rounded-2xl border border-stone-200 bg-white p-4 shadow-sm md:p-6'
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
        tab === id ? 'bg-stone-900 text-white shadow-sm' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
      ].join(' ')}
    >
      {label}
    </button>
  );

  return (
    <div className={['mx-auto max-w-3xl space-y-6', pageCard].filter(Boolean).join(' ')}>
      <header className="space-y-3 border-b border-stone-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">Мои версии</h1>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-stone-600">
            Три зоны: правки к песням каталога, свободные черновики и быстрый возврат к недавним песням.
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
          className="flex w-full gap-1 rounded-2xl bg-stone-100 p-1"
          role="tablist"
          aria-label="Разделы «Мои версии»"
        >
          {tabBtn('saved', 'Каталог', 'Сохранённые студийные версии песен из общего списка')}
          {showRecentTab ? tabBtn('recent', 'Недавние', 'Песни, которые вы недавно открывали в песеннике') : null}
          {tabBtn('drafts', 'Черновики', 'Тексты без привязки к песне из каталога')}
          {showImportedTab
            ? tabBtn(
                'imported',
                importedCount > 0 ? `Импортированные · ${importedCount}` : 'Импортированные',
                'Песни, импортированные из таблицы. После «Опубликовать» переходят в каталог.',
              )
            : null}
        </div>
      </header>

      <div
        className="min-h-[12rem]"
        role="tabpanel"
        aria-label={
          tab === 'saved'
            ? 'Каталог'
            : tab === 'recent'
              ? 'Недавние'
              : tab === 'imported'
                ? 'Импортированные'
                : 'Черновики'
        }
      >
        {tab === 'drafts' ? (
          <section className="space-y-4">
            <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-500">Новый черновик</p>
              <div className="space-y-2">
                <input
                  className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none placeholder:text-stone-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                  placeholder="Название"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                />
                <textarea
                  className="min-h-[88px] w-full resize-y rounded-lg border border-stone-200 bg-white px-3 py-2 font-mono text-sm text-stone-900 outline-none placeholder:text-stone-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                  placeholder="Текст, ChordPro…"
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending}
                className="mt-3 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50"
              >
                Сохранить черновик
              </button>
            </div>
            {drafts.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {drafts.map((d) => (
                  <DraftRow key={d.id} draft={d} onDeleted={() => delDraftMut.mutate(Number(d.id))} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-stone-500">Список черновиков пуст — создайте первый формой выше.</p>
            )}
          </section>
        ) : null}

        {tab === 'recent' ? (
          <section className="space-y-3">
            <p className="text-sm text-stone-600">
              Открывайте карточку в песеннике или сразу переходите в редактор своей версии.
            </p>
            {recentQ.isLoading ? (
              <SongListSkeleton />
            ) : (
              <ul className="flex flex-col gap-2">
                {recent.map((s) => (
                  <li
                    key={s.id}
                    className="flex min-h-[48px] items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm"
                  >
                    <Link
                      to={`/songbook/${s.id}`}
                      className="min-w-0 flex-1 truncate font-medium text-stone-900 hover:text-sky-700"
                    >
                      {s.title}
                    </Link>
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

        {tab === 'saved' ? (
          <section className="space-y-3">
            <p className="text-sm text-stone-600">
              Это ваши сохранённые правки к песням из общего каталога. Оригинал в песеннике не меняется.
            </p>
            <div className="grid gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 sm:grid-cols-2">
              <input
                value={savedSearch}
                onChange={(e) => setSavedSearch(e.target.value)}
                placeholder="Поиск по названию"
                className="min-h-[42px] rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none"
              />
              <input
                value={savedKeyFilter}
                onChange={(e) => setSavedKeyFilter(e.target.value)}
                placeholder="Фильтр по тональности"
                className="min-h-[42px] rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none"
              />
            </div>
            {rows.length === 0 ? (
              <div className="space-y-3 rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-600">
                <p>Пока нет сохранённых версий. Откройте песню в песеннике и выберите «В студию».</p>
                <Link to="/songbook" className="inline-flex font-semibold text-sky-700 hover:text-sky-800">
                  Перейти в песенник →
                </Link>
              </div>
            ) : (
              <>
                {filteredRows.length === 0 ? (
                  <p className="text-sm text-stone-500">По выбранным фильтрам ничего не найдено.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {filteredRows.map((v) => (
                      <li key={v.id}>
                        <Link
                          to={studioEditSongPath(surface, Number(v.song_id))}
                          className="flex min-h-[52px] items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm transition hover:border-stone-300 hover:bg-stone-50"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-stone-900">{v.song_title}</p>
                            <p className="mt-0.5 text-xs text-stone-500">
                              {v.custom_key ?? '—'} · {new Date(v.updated_at).toLocaleString()}
                            </p>
                          </div>
                          <LuPenLine className="h-5 w-5 shrink-0 text-stone-400" aria-hidden />
                        </Link>
                      </li>
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
              <p className="font-semibold">Импортированные песни — “песочница” перед каталогом</p>
              <p className="mt-1 text-xs leading-relaxed text-sky-900/80">
                Здесь все песни, загруженные через таблицу. Откройте песню, поправьте название и текст, затем
                нажмите <span className="font-semibold">«Опубликовать»</span> — она появится в общем песеннике.
              </p>
            </div>
            <input
              value={importedSearch}
              onChange={(e) => setImportedSearch(e.target.value)}
              placeholder="Поиск по номеру или названию"
              className="min-h-[42px] w-full rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            />
            {importedQ.isLoading ? (
              <SongListSkeleton />
            ) : importedQ.isError ? (
              <p className="text-sm text-red-600">Не удалось загрузить импортированные песни.</p>
            ) : importedFiltered.length === 0 ? (
              <p className="text-sm text-stone-500">
                {importedCount === 0
                  ? 'Импортированных песен пока нет. Загрузите таблицу в «Добавить песню → XLSX».'
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
