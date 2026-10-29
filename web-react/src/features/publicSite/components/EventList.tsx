import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { formatEventDateRu } from '../format';
import type { SiteEvent } from '../types';

type Props = {
  events: SiteEvent[];
  emptyText?: string;
};

export function EventList({ events, emptyText }: Props) {
  if (!events.length) {
    return (
      <p className="rounded-2xl border border-dashed border-[#d9c4ba] bg-white/40 px-4 py-8 text-center text-sm text-[#6b5a5e]">
        {emptyText ?? 'Ближайших событий пока нет'}
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {events.map((ev) => {
        const poster = resolvePublicUrl(ev.poster_url);
        return (
          <li
            key={ev.id}
            className="flex flex-col gap-3 overflow-hidden rounded-2xl border border-[#e8d9d0] bg-white sm:flex-row"
          >
            {poster && (
              <img
                src={poster}
                alt=""
                className="h-40 w-full object-cover sm:h-auto sm:w-40 sm:shrink-0"
                loading="lazy"
              />
            )}
            <div className="flex flex-1 flex-col gap-1.5 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#7B1C1C]">
                {formatEventDateRu(ev.event_date, ev.event_time)}
                {ev.recurrence_type === 'weekly' ? ' · каждую неделю' : ''}
              </p>
              <h3 className="text-lg font-extrabold leading-snug text-[#2b0d16]">{ev.title}</h3>
              {ev.description?.trim() && (
                <p className="text-sm leading-relaxed text-[#5a4a4e] whitespace-pre-wrap">
                  {ev.description.trim()}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
