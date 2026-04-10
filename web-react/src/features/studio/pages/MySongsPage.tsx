import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { fetchMyVersions, fetchRecentSongs } from '../api';

export function MySongsPage() {
  const q = useQuery({ queryKey: ['studio', 'versions'], queryFn: fetchMyVersions });
  const recentQ = useQuery({
    queryKey: ['studio', 'recent-songs'],
    queryFn: () => fetchRecentSongs(8),
  });

  if (q.isLoading) {
    return <p className="text-sm text-zinc-500">Загрузка…</p>;
  }
  if (q.isError) {
    return <p className="text-sm text-red-400">Не удалось загрузить список.</p>;
  }

  const rows = q.data ?? [];
  const recent = recentQ.data ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-white">Мои песни</h1>
        <p className="text-sm text-zinc-400">Недавние песни и ваши сохранённые версии.</p>
      </div>

      {!recentQ.isLoading && recent.length > 0 && (
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-500">
            Недавние песни
          </h2>
          <ul className="space-y-2">
            {recent.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2">
                <Link
                  to={`/songbook/${s.id}`}
                  className="min-w-0 truncate font-medium text-zinc-100 hover:text-sky-400"
                >
                  {s.title}
                </Link>
                <Link
                  to={`/studio/edit/${s.id}`}
                  className="shrink-0 text-xs text-sky-400 hover:text-sky-300"
                >
                  Студия
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rows.length === 0 ? (
        <div className="max-w-lg space-y-2">
          <h2 className="text-sm font-semibold text-zinc-300">Личные версии</h2>
          <p className="text-sm text-zinc-400">
            Личных версий пока нет. Откройте песню в песеннике и нажмите «Редактировать в студии».
          </p>
          <Link
            to="/songbook"
            className="inline-flex text-sm font-medium text-sky-400 hover:text-sky-300"
          >
            Перейти в песенник
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-300">Все личные версии</h2>
          <div className="overflow-hidden rounded-lg border border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-900 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Песня</th>
                  <th className="px-3 py-2">Тональность</th>
                  <th className="px-3 py-2">Обновлено</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {rows.map((v) => (
                  <tr key={v.id} className="hover:bg-zinc-900/80">
                    <td className="px-3 py-2 font-medium text-zinc-200">{v.song_title}</td>
                    <td className="px-3 py-2 text-zinc-400">{v.custom_key ?? '—'}</td>
                    <td className="px-3 py-2 text-zinc-500">
                      {new Date(v.updated_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        to={`/studio/edit/${v.song_id}`}
                        className="text-sky-400 hover:text-sky-300"
                      >
                        Править
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
