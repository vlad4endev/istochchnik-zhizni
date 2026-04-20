import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import { LyricsWithChords } from '../../songbook/components/LyricsWithChords';
import { fetchPublicSetlist } from '../api';

export function PublicSetlistPage() {
  const { token } = useParams<{ token: string }>();
  const q = useQuery({
    queryKey: ['public', 'setlist', token],
    queryFn: () => fetchPublicSetlist(token ?? ''),
    enabled: Boolean(token && token.length > 20),
  });

  if (!token) {
    return <p className="p-6 text-red-600">Некорректная ссылка</p>;
  }
  if (q.isLoading) {
    return (
      <div className="flex min-h-[40dvh] items-center justify-center text-stone-500">
        Загрузка…
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <p className="text-red-600">Сетлист не найден или ссылка снята с публикации.</p>
      </div>
    );
  }

  const { setlist, items } = q.data;

  return (
    <div className="min-h-[100dvh] bg-[var(--surface)]">
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 pb-24">
        <p className="text-sm">
          <Link to="/login" className="text-sky-600 hover:underline">
            Войти
          </Link>
        </p>
      <header>
        <h1 className="text-2xl font-bold text-stone-900">{setlist.title}</h1>
        {setlist.event_date && (
          <p className="text-sm text-stone-500">{setlist.event_date}</p>
        )}
        <p className="mt-2 text-sm text-stone-600">
          Публичный просмотр — только список и тексты, без редактирования.
        </p>
      </header>

      <ol className="space-y-10">
        {items.map((it, idx) => (
          <li key={it.id} className="scroll-mt-4 border-b border-stone-200 pb-10 last:border-0">
            <h2 className="text-lg font-semibold text-stone-900">
              {idx + 1}. {it.song.title}
            </h2>
            <p className="mt-1 text-xs text-stone-500">
              Тональность: {it.effective_key ?? it.song.default_key ?? '—'} · BPM:{' '}
              {it.song.tempo ?? '—'}
            </p>
            <div className="mt-3 font-sans text-base text-stone-800">
              <LyricsWithChords
                text={it.effective_content || it.song.content || ''}
                transposeSemitones={0}
                chordTone="light"
                className="leading-relaxed"
              />
            </div>
          </li>
        ))}
      </ol>
      </div>
    </div>
  );
}
