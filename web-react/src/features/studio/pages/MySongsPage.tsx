import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuPenLine, LuTrash2 } from 'react-icons/lu';

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

type MySongsTab = 'saved' | 'drafts' | 'recent';

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

  const q = useQuery({ queryKey: ['studio', 'versions'], queryFn: fetchMyVersions });
  const draftsQ = useQuery({ queryKey: ['studio', 'drafts'], queryFn: fetchDrafts });
  const recentQ = useQuery({
    queryKey: ['studio', 'recent-songs'],
    queryFn: () => fetchRecentSongs(8),
  });

  const [tab, setTab] = useState<MySongsTab>('saved');
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
    return <p className="text-sm text-stone-500">Загрузка…</p>;
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
        </div>
      </header>

      <div className="min-h-[12rem]" role="tabpanel" aria-label={tab === 'saved' ? 'Каталог' : tab === 'recent' ? 'Недавние' : 'Черновики'}>
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
              <p className="text-sm text-stone-500">Загрузка…</p>
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
      </div>
    </div>
  );
}
