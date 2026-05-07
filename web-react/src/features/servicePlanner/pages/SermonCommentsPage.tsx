import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import {
  fetchSermonFeedbackByToken,
  saveSermonFeedbackByToken,
} from '../sermonFeedbackApi';
import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';

export function SermonCommentsPage() {
  const { token } = useParams<{ token: string }>();
  const qc = useQueryClient();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const canFetch = Boolean(token && token.length > 20);

  const q = useQuery({
    queryKey: ['service-plan', 'sermon-feedback', token],
    queryFn: () => fetchSermonFeedbackByToken(token ?? ''),
    enabled: canFetch,
  });

  const saveM = useMutation({
    mutationFn: async () =>
      saveSermonFeedbackByToken(token ?? '', {
        rating,
        comment,
      }),
    onSuccess: async () => {
      setComment('');
      await qc.invalidateQueries({ queryKey: ['service-plan', 'sermon-feedback', token] });
    },
  });

  const avgLabel = useMemo(() => {
    const avg = q.data?.stats.avg_rating;
    if (avg == null) return '—';
    return avg.toFixed(2);
  }, [q.data?.stats.avg_rating]);

  if (!canFetch) {
    return <div className="p-6 text-red-600">Некорректная ссылка</div>;
  }

  if (q.isLoading) {
    return <div className="p-6 text-stone-600">Загружаем комментарии…</div>;
  }

  if (q.isError || !q.data) {
    return <div className="p-6 text-red-600">Комментарии к проповеди не найдены.</div>;
  }

  const data = q.data;

  return (
    <div className="w-full overflow-y-auto bg-[var(--surface)] [max-height:var(--app-viewport-height,100dvh)]">
      <div className="mx-auto max-w-3xl space-y-4 px-3 py-5 sm:px-4 sm:py-8">
        <p className="text-sm">
          <Link to="/dashboard" className="font-semibold text-sky-600 hover:underline">
            На дашборд
          </Link>
        </p>

        <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <h1 className="text-xl font-extrabold text-stone-900">Комментарии к проповеди</h1>
          <p className="mt-2 text-sm font-semibold text-stone-700">{data.plan.topic}</p>
          <p className="mt-1 text-sm text-stone-600">Писание: {data.plan.scripture}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-600">
            <span className="rounded-full bg-stone-100 px-2 py-0.5">Оценок: {data.stats.ratings_count}</span>
            <span className="rounded-full bg-stone-100 px-2 py-0.5">Комментариев: {data.stats.comments_count}</span>
            <span className="rounded-full bg-stone-100 px-2 py-0.5">Средняя: {avgLabel}</span>
          </div>
        </section>

        {data.plan.can_comment ? (
          <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-bold text-stone-900">Оцените проповедь</p>
            <div className="mt-3">
              <label className="mb-1 block text-xs font-semibold text-stone-600" htmlFor="sermon-rating">
                Оценка
              </label>
              <select
                id="sermon-rating"
                value={rating}
                onChange={(e) => setRating(Number(e.target.value) || 5)}
                className="min-h-[42px] w-full rounded-xl border border-stone-300 bg-white px-3 text-sm font-semibold"
              >
                {[5, 4, 3, 2, 1].map((v) => (
                  <option key={v} value={v}>
                    {v} / 5
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-xs font-semibold text-stone-600" htmlFor="sermon-comment">
                Комментарий
              </label>
              <textarea
                id="sermon-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                maxLength={4000}
                className="w-full resize-y rounded-xl border border-stone-300 bg-white p-3 text-sm"
                placeholder="Что вас коснулось в проповеди?"
              />
            </div>
            {saveM.isError ? (
              <p className="mt-2 text-sm text-red-600">Не удалось сохранить. Попробуйте снова.</p>
            ) : null}
            {saveM.isSuccess ? (
              <p className="mt-2 text-sm text-emerald-700">Спасибо! Ваш отзыв сохранён.</p>
            ) : null}
            <button
              type="button"
              disabled={saveM.isPending}
              onClick={() => void saveM.mutateAsync()}
              className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#2F4DA4] px-5 text-sm font-extrabold text-white disabled:opacity-60"
            >
              {saveM.isPending ? 'Сохраняем…' : 'Отправить отзыв'}
            </button>
          </section>
        ) : (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            Окно для комментариев закрыто. Сейчас доступен только просмотр.
          </section>
        )}

        <section className="space-y-2">
          {data.comments.length === 0 ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-4 text-sm font-semibold text-stone-600">
              Пока нет комментариев.
            </div>
          ) : (
            data.comments.map((item) => {
              const avatar = resolvePublicUrl(item.author_avatar_url ?? null);
              return (
                <article
                  key={item.id}
                  className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 overflow-hidden rounded-full bg-stone-100">
                      {avatar ? (
                        <img src={avatar} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-extrabold text-stone-900">{item.author_name}</p>
                      <p className="text-xs font-semibold text-stone-500">
                        {new Date(item.created_at).toLocaleString('ru-RU')}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-stone-700">Оценка: {item.rating ?? '—'} / 5</p>
                      {item.comment.trim() ? (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">{item.comment}</p>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}
