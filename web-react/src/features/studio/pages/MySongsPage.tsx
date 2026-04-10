import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
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
    <li className="rounded-2xl bg-slate-900/50 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="min-w-0 flex-1 text-left text-sm font-medium text-slate-200 hover:text-white"
        >
          {draft.title || 'Без названия'}
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Удалить черновик?')) onDeleted();
          }}
          className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-800 hover:text-red-400"
          aria-label="Удалить черновик"
        >
          <LuTrash2 className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">{new Date(draft.updated_at).toLocaleString()}</p>
      {open ? (
        <div className="mt-3 space-y-3">
          <input
            className="w-full rounded-xl border-0 bg-slate-950/80 px-3 py-2.5 text-sm text-white outline-none ring-1 ring-slate-800 focus:ring-slate-600"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название"
          />
          <textarea
            className="min-h-[100px] w-full resize-y rounded-xl border-0 bg-slate-950/80 px-3 py-2 font-mono text-sm text-slate-200 outline-none ring-1 ring-slate-800 focus:ring-slate-600"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="ChordPro…"
          />
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="text-sm font-medium text-sky-400 hover:text-sky-300"
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

  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');

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

  if (q.isLoading) {
    return <p className="text-sm text-slate-500">Загрузка…</p>;
  }
  if (q.isError) {
    return <p className="text-sm text-red-400">Не удалось загрузить список.</p>;
  }

  const rows = q.data ?? [];
  const recent = recentQ.data ?? [];
  const drafts = draftsQ.data ?? [];

  const shell =
    surface === 'songbook'
      ? 'rounded-2xl bg-[#0c0c0e] p-4 shadow-inner ring-1 ring-slate-800/80 md:p-6'
      : '';

  return (
    <div className={['space-y-8', shell].filter(Boolean).join(' ')}>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-white">Мои версии</h1>
        <p className="text-sm text-slate-400">Черновики и сохранённые аранжировки из каталога</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-300">Черновики</h2>
        <div className="space-y-3 rounded-2xl bg-slate-900/40 p-4">
          <div className="space-y-2">
            <input
              className="w-full rounded-xl border-0 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none ring-1 ring-slate-800 placeholder:text-slate-600 focus:ring-slate-600"
              placeholder="Название нового черновика"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
            />
            <textarea
              className="min-h-[88px] w-full resize-y rounded-xl border-0 bg-slate-950/60 px-3 py-2 font-mono text-sm text-slate-200 outline-none ring-1 ring-slate-800 placeholder:text-slate-600 focus:ring-slate-600"
              placeholder="Текст, ChordPro…"
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending}
            className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-white disabled:opacity-50"
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
          <p className="text-sm text-slate-500">Черновиков пока нет.</p>
        )}
      </section>

      {!recentQ.isLoading && recent.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-300">Недавно открытые</h2>
          <ul className="flex flex-col gap-2">
            {recent.map((s) => (
              <li
                key={s.id}
                className="flex min-h-[48px] items-center gap-3 rounded-2xl bg-slate-900/35 px-4 py-3"
              >
                <Link to={`/songbook/${s.id}`} className="min-w-0 flex-1 truncate font-medium text-slate-200 hover:text-white">
                  {s.title}
                </Link>
                <Link
                  to={studioEditSongPath(surface, Number(s.id))}
                  className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-sky-400 hover:text-sky-300"
                >
                  <LuPenLine className="h-4 w-4" aria-hidden />
                  Студия
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-300">Сохранённые версии каталога</h2>
        {rows.length === 0 ? (
          <div className="space-y-2 rounded-2xl bg-slate-900/30 px-4 py-6 text-sm text-slate-400">
            <p>Пока нет сохранённых версий. Откройте песню в песеннике и нажмите «В студию».</p>
            <Link to="/songbook" className="inline-block font-medium text-sky-400 hover:text-sky-300">
              Песенник
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((v) => (
              <li key={v.id}>
                <Link
                  to={studioEditSongPath(surface, Number(v.song_id))}
                  className="flex min-h-[52px] items-center justify-between gap-3 rounded-2xl bg-slate-900/35 px-4 py-3 transition hover:bg-slate-900/60"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-100">{v.song_title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {v.custom_key ?? '—'} · {new Date(v.updated_at).toLocaleString()}
                    </p>
                  </div>
                  <LuPenLine className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
