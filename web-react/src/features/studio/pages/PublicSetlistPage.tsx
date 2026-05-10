import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import { SongListSkeleton } from '@/components/skeletons/SongListSkeleton';
import { useAppearanceStore } from '@/stores/useAppearanceStore';
import { LyricsWithChords } from '../../songbook/components/LyricsWithChords';
import { fetchPublicSetlist } from '../api';

export function PublicSetlistPage() {
  const { token } = useParams<{ token: string }>();
  const appearanceTheme = useAppearanceStore((state) => state.theme);
  const q = useQuery({
    queryKey: ['public', 'setlist', token],
    queryFn: () => fetchPublicSetlist(token ?? ''),
    enabled: Boolean(token && token.length > 20),
  });
  const darkThemeEnabled =
    appearanceTheme === 'dark' ||
    (appearanceTheme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  if (!token) {
    return <p className="p-6 text-red-600">Некорректная ссылка</p>;
  }
  if (q.isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <SongListSkeleton />
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
    <div className="w-full overflow-y-auto overflow-x-hidden overscroll-y-contain bg-[var(--surface)] [max-height:var(--viewport-height,100dvh)] [min-height:var(--viewport-height,100dvh)]">
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
        <p className="text-sm">
          <Link to="/login" className="text-sky-600 hover:underline">
            Войти
          </Link>
        </p>
      <header>
        <h1 className="text-2xl font-bold text-[var(--text)]">{setlist.title}</h1>
        {setlist.event_date && (
          <p className="text-sm text-[var(--text-muted)]">{setlist.event_date}</p>
        )}
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Публичный просмотр — только список и тексты, без редактирования.
        </p>
      </header>

      <ol className="space-y-10">
        {items.map((it, idx) => (
          <li key={it.id} className="scroll-mt-4 border-b border-[var(--border)] pb-10 last:border-0 last:pb-0">
            <h2 className="text-lg font-semibold text-[var(--text)]">
              {idx + 1}. {it.song.title}
            </h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Тональность: {it.effective_key ?? it.song.default_key ?? '—'} · BPM:{' '}
              {it.song.tempo ?? '—'}
            </p>
            <div className="mt-3 font-sans text-base text-[var(--text-secondary)]">
              <LyricsWithChords
                text={it.effective_content || it.song.content || ''}
                transposeSemitones={0}
                chordTone={darkThemeEnabled ? 'dark' : 'light'}
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
