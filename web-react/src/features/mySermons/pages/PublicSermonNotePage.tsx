import { useQuery } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';

import { fetchPublicSermonNote } from '../api';
import { bodyToEditorHtml } from '../bodyContent';

export function PublicSermonNotePage() {
  const { token = '' } = useParams<{ token: string }>();

  const q = useQuery({
    queryKey: ['public-sermon-note', token],
    queryFn: () => fetchPublicSermonNote(token),
    enabled: Boolean(token),
  });

  const html = useMemo(() => {
    if (!q.data) return '';
    const raw = bodyToEditorHtml(q.data.body, q.data.body_format);
    return DOMPurify.sanitize(raw, {
      USE_PROFILES: { html: true },
    });
  }, [q.data]);

  const title = q.data?.title.trim() || 'Конспект проповеди';

  return (
    <div className="min-h-[100dvh] bg-[var(--surface)] px-4 py-6 sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Общий доступ</p>
        {q.isLoading ? (
          <p className="mt-8 text-sm text-stone-500">Загрузка…</p>
        ) : q.isError ? (
          <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-6">
            <h1 className="text-xl font-bold text-stone-900">Ссылка недоступна</h1>
            <p className="mt-2 text-sm text-stone-600">
              Документ удалён, доступ выключен или ссылка устарела.
            </p>
            <Link to="/login" className="mt-4 inline-block text-sm font-semibold text-primary">
              Войти в приложение
            </Link>
          </div>
        ) : (
          <article className="mt-3 rounded-2xl border border-stone-200 bg-white px-5 py-6 shadow-sm sm:px-8 sm:py-8">
            <h1 className="text-3xl font-bold tracking-tight text-stone-900">{title}</h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-500">
              {q.data?.author_name ? <span>{q.data.author_name}</span> : null}
              {q.data?.scripture.trim() ? <span>{q.data.scripture.trim()}</span> : null}
              {q.data?.topic.trim() ? <span>{q.data.topic.trim()}</span> : null}
            </div>
            {html ? (
              <div
                className="sermon-doc-viewer mt-6"
                // Sanitized with DOMPurify above.
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : (
              <p className="mt-6 text-sm text-stone-400">Документ пока пуст.</p>
            )}
          </article>
        )}
      </div>
    </div>
  );
}
