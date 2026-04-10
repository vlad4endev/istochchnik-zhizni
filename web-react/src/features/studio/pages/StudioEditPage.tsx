import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';

import { fetchSong } from '../../songbook/api';
import { fetchVersionForSong, saveVersion } from '../api';

export function StudioEditPage() {
  const { songId } = useParams<{ songId: string }>();
  const id = Number(songId);
  const qc = useQueryClient();

  const songQ = useQuery({
    queryKey: ['song', id],
    queryFn: () => fetchSong(id),
    enabled: Number.isInteger(id) && id > 0,
  });

  const verQ = useQuery({
    queryKey: ['studio', 'version', id],
    queryFn: async () => {
      try {
        return await fetchVersionForSong(id);
      } catch {
        return null;
      }
    },
    enabled: Number.isInteger(id) && id > 0,
  });

  const [content, setContent] = useState('');
  const [key, setKey] = useState('');

  useEffect(() => {
    const s = songQ.data;
    const v = verQ.data as { custom_content?: string | null; custom_key?: string | null } | null;
    if (!s) return;
    setContent(v?.custom_content ?? s.content);
    setKey(v?.custom_key ?? s.default_key ?? '');
  }, [songQ.data, verQ.data]);

  const saveMut = useMutation({
    mutationFn: () => saveVersion(id, { custom_content: content, custom_key: key || null }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['studio', 'versions'] });
      void qc.invalidateQueries({ queryKey: ['songs'] });
      void qc.invalidateQueries({ queryKey: ['song', id] });
    },
  });

  if (!Number.isInteger(id) || id <= 0) {
    return <p className="text-red-400">Некорректный id песни</p>;
  }
  if (songQ.isLoading) return <p className="text-zinc-500">Загрузка…</p>;
  if (songQ.isError || !songQ.data) {
    return <p className="text-red-400">Песня не найдена</p>;
  }

  const s = songQ.data;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-white">{s.title}</h1>
        <p className="text-xs text-zinc-500">
          Оригинал в каталоге не меняется — сохраняется только ваша копия (ветка).
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
        <div>
          <label className="mb-1 block text-xs font-bold uppercase text-zinc-500">Тональность</label>
          <input
            className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="напр. D"
          />
        </div>
        <div className="flex items-end text-sm text-zinc-500">
          <span>
            Темп: {s.tempo ?? '—'} · Размер: {s.time_signature ?? '—'}
          </span>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold uppercase text-zinc-500">ChordPro</label>
        <textarea
          className="min-h-[320px] w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm leading-relaxed text-zinc-100"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </div>
      <button
        type="button"
        onClick={() => saveMut.mutate()}
        disabled={saveMut.isPending}
        className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
      >
        Сохранить мою версию
      </button>
    </div>
  );
}
