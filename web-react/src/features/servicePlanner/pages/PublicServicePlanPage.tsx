import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addMinutes, format, parse } from 'date-fns';
import { Link, useParams } from 'react-router-dom';
import {
  FaBookBible,
  FaBullhorn,
  FaHandHoldingDollar,
  FaHandsPraying,
  FaMicrophoneLines,
  FaMusic,
  FaPuzzlePiece,
} from 'react-icons/fa6';
import type { IconType } from 'react-icons';

import { fetchPublicServicePlan } from '../api';

const ICON_BY_CODE: Record<string, { Icon: IconType; wrapClass: string; iconClass: string }> = {
  prayer: { Icon: FaHandsPraying, wrapClass: 'bg-violet-100', iconClass: 'text-violet-700' },
  song: { Icon: FaMusic, wrapClass: 'bg-sky-100', iconClass: 'text-sky-700' },
  scripture: { Icon: FaBookBible, wrapClass: 'bg-amber-100', iconClass: 'text-amber-700' },
  sermon: { Icon: FaMicrophoneLines, wrapClass: 'bg-rose-100', iconClass: 'text-rose-700' },
  announcements: { Icon: FaBullhorn, wrapClass: 'bg-emerald-100', iconClass: 'text-emerald-700' },
  offering: { Icon: FaHandHoldingDollar, wrapClass: 'bg-lime-100', iconClass: 'text-lime-700' },
  custom: { Icon: FaPuzzlePiece, wrapClass: 'bg-stone-200', iconClass: 'text-stone-700' },
};

const ICON_BY_MARK_KEY = ICON_BY_CODE;

function isSeparator(content: Record<string, unknown>): boolean {
  return content.is_separator === true;
}

function parseStartClock(dateIso: string, time: string): Date {
  return parse(`${dateIso} ${time}`, 'yyyy-MM-dd HH:mm', new Date());
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function isPoem(code: string | null, typeName: string | null): boolean {
  const normalizedName = String(typeName ?? '').toLowerCase();
  return code === 'poem' || normalizedName.includes('стих');
}

export function PublicServicePlanPage() {
  const { token } = useParams<{ token: string }>();
  const q = useQuery({
    queryKey: ['public', 'service-plan', token],
    queryFn: () => fetchPublicServicePlan(token ?? ''),
    enabled: Boolean(token && token.length > 20),
  });

  const rows = useMemo(() => {
    if (!q.data) return [];
    const { plan, blocks } = q.data;
    let cursor = parseStartClock(plan.service_date, plan.start_time);
    return blocks
      .slice()
      .sort((a, b) => a.order_index - b.order_index)
      .map((b) => {
        const startsAt = format(cursor, 'HH:mm');
        const separator = isSeparator(b.content_json);
        const duration = separator ? 0 : Math.max(0, b.duration_minutes);
        cursor = addMinutes(cursor, duration);
        return { ...b, startsAt, separator };
      });
  }, [q.data]);

  if (!token) {
    return <p className="p-6 text-red-600">Некорректная ссылка</p>;
  }
  if (q.isLoading) {
    return (
      <div className="flex min-h-[40dvh] items-center justify-center text-stone-500">
        Загрузка программы...
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <p className="text-red-600">Программа не найдена или ссылка недействительна.</p>
      </div>
    );
  }

  const { plan } = q.data;
  const dateText = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${plan.service_date}T12:00:00`));

  return (
    <div className="min-h-[100dvh] bg-[var(--surface)]">
      <div className="mx-auto max-w-3xl space-y-4 px-3 py-5 pb-[calc(84px+env(safe-area-inset-bottom))] sm:space-y-6 sm:px-4 sm:py-8 sm:pb-24">
        <p className="text-sm">
          <Link to="/login" className="text-sky-600 hover:underline">
            Войти
          </Link>
        </p>

        <header className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm sm:p-4">
          <h1 className="text-xl font-extrabold text-stone-900 sm:text-2xl">{plan.template_name ?? 'Программа служения'}</h1>
          <p className="mt-1 text-sm text-stone-600 sm:text-base">
            На собрание: <span className="font-semibold text-stone-800">{dateText}</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-600 sm:text-sm">
            <span className="rounded-full bg-stone-100 px-2 py-0.5">Старт: {plan.start_time}</span>
            <span className="rounded-full bg-stone-100 px-2 py-0.5">{plan.total_duration_minutes} мин</span>
            <span className="rounded-full bg-stone-100 px-2 py-0.5">
              Ведущий: {plan.leader_name ?? 'Не назначен'}
            </span>
            {plan.preacher_name ? (
              <span className="rounded-full bg-stone-100 px-2 py-0.5">Проповедник: {plan.preacher_name}</span>
            ) : null}
          </div>
        </header>

        <section className="space-y-2.5">
          {rows.map((b, idx) =>
            b.separator ? (
              <div key={b.id} className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-3 py-2.5">
                <p className="text-center text-sm font-bold leading-snug text-stone-700 sm:text-base">
                  {String(b.content_json.separator_text ?? b.title ?? 'Раздел')}
                </p>
              </div>
            ) : (
              <article key={b.id} className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm sm:p-4">
                <div className="flex items-start gap-2.5 sm:gap-3">
                  <div className="w-11 shrink-0 rounded-md bg-stone-100 px-1.5 py-1 text-center text-[11px] font-bold text-stone-700 sm:w-12 sm:bg-transparent sm:px-0 sm:py-0 sm:text-xs">
                    {b.startsAt}
                  </div>
                  {(() => {
                    const custom = typeof b.content_json.block_mark === 'string' ? b.content_json.block_mark.trim() : '';
                    const markIconKey =
                      typeof b.content_json.block_mark_icon === 'string'
                        ? b.content_json.block_mark_icon.trim().toLowerCase()
                        : '';
                    const markIcon = markIconKey ? ICON_BY_MARK_KEY[markIconKey] : null;
                    if (markIcon) {
                      const MarkIcon = markIcon.Icon;
                      return (
                        <div className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${markIcon.wrapClass}`}>
                          <MarkIcon className={`h-4 w-4 ${markIcon.iconClass}`} />
                        </div>
                      );
                    }
                    if (custom) {
                      return (
                        <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-lg">
                          {custom}
                        </div>
                      );
                    }
                    const iconMeta = ICON_BY_CODE[(b.block_type_code ?? '').toLowerCase()];
                    if (iconMeta) {
                      const Icon = iconMeta.Icon;
                      return (
                        <div
                          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconMeta.wrapClass}`}
                        >
                          <Icon className={`h-4 w-4 ${iconMeta.iconClass}`} />
                        </div>
                      );
                    }
                    return (
                      <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-sm">
                        •
                      </div>
                    );
                  })()}
                  <div className="min-w-0 flex-1">
                    {(() => {
                      const notesRaw =
                        typeof b.content_json.notes === 'string' ? b.content_json.notes.trim() : '';
                      const textRaw = typeof b.content_json.text === 'string' ? b.content_json.text.trim() : '';
                      const fallback = notesRaw || textRaw;
                      const songVariants = [
                        b.song_title ?? '',
                        b.song_title && b.song_key ? `${b.song_title} [${b.song_key}]` : '',
                        b.title ?? '',
                      ]
                        .map((s) => s.trim())
                        .filter((s) => s.length > 0)
                        .map((s) => normalizeText(s));
                      const noteIsSongDuplicate =
                        fallback.length > 0 && songVariants.includes(normalizeText(fallback));
                      const noteToShow = noteIsSongDuplicate ? '' : fallback;
                      const poem = isPoem(b.block_type_code, b.block_type_name);
                      const poemAuthor =
                        typeof b.content_json.poem_author === 'string' ? b.content_json.poem_author.trim() : '';
                      const poemTheme =
                        typeof b.content_json.poem_theme === 'string' ? b.content_json.poem_theme.trim() : '';
                      const poemSubline =
                        poemAuthor && poemTheme ? `${poemAuthor} • ${poemTheme}` : poemAuthor || poemTheme;
                      const heading = poem ? `СТИХ - ${b.assigned_member_name ?? 'Чтец'}` : b.title;

                      return (
                        <>
                    <h2 className="text-[15px] font-bold leading-snug text-stone-900 sm:text-base">
                      {idx + 1}. {heading}
                    </h2>
                    <p className="mt-0.5 text-xs leading-snug text-stone-500 sm:text-sm">
                      {b.block_type_name ?? 'Блок'} • {b.duration_minutes} мин
                      {b.assigned_member_name ? ` • ${b.assigned_member_name}` : ''}
                    </p>
                    {poemSubline ? <p className="mt-0.5 text-xs leading-snug text-stone-600 sm:text-sm">{poemSubline}</p> : null}
                    {b.song_title ? (
                      <p className="mt-1 text-sm font-semibold leading-snug text-stone-700">
                        {b.song_title}
                        {b.song_key ? ` [${b.song_key}]` : ''}
                      </p>
                    ) : null}
                    {noteToShow ? (
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-stone-700 sm:text-base">{noteToShow}</p>
                    ) : null}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </article>
            ),
          )}
        </section>
      </div>
    </div>
  );
}
