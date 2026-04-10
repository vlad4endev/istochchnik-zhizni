import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { createDraft, deleteDraft, fetchDrafts, updateDraft } from '../api';

export function DraftsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['studio', 'drafts'], queryFn: fetchDrafts });
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const createMut = useMutation({
    mutationFn: () => createDraft(title || 'Без названия', content),
    onSuccess: () => {
      setTitle('');
      setContent('');
      void qc.invalidateQueries({ queryKey: ['studio', 'drafts'] });
    },
  });

  const delMut = useMutation({
    mutationFn: (id: number) => deleteDraft(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['studio', 'drafts'] }),
  });

  if (q.isLoading) return <p className="text-sm text-zinc-500">Загрузка…</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-lg font-semibold text-white">Черновики</h1>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-500">Новый черновик</p>
        <input
          className="mb-2 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
          placeholder="Название"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="mb-3 min-h-[120px] w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-200"
          placeholder="ChordPro…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <button
          type="button"
          onClick={() => createMut.mutate()}
          disabled={createMut.isPending}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          Сохранить черновик
        </button>
      </div>
      <ul className="space-y-2">
        {(q.data ?? []).map((d) => (
          <DraftRow key={d.id} draft={d} onDeleted={() => delMut.mutate(Number(d.id))} />
        ))}
      </ul>
    </div>
  );
}

function DraftRow({
  draft,
  onDeleted,
}: {
  draft: { id: string; title: string; content: string; updated_at: string };
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
    <li className="rounded-lg border border-zinc-800 p-3">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-left font-medium text-zinc-200 hover:text-white"
        >
          {draft.title || 'Без названия'}
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Удалить черновик?')) onDeleted();
          }}
          className="text-xs text-red-400 hover:text-red-300"
        >
          Удалить
        </button>
      </div>
      <p className="text-xs text-zinc-500">{new Date(draft.updated_at).toLocaleString()}</p>
      {open && (
        <div className="mt-3 space-y-2">
          <input
            className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="min-h-[100px] w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-sm"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="text-sm text-sky-400 hover:text-sky-300"
          >
            Сохранить
          </button>
        </div>
      )}
    </li>
  );
}
