import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { LuExternalLink, LuMic } from 'react-icons/lu';

import { isSermonRelevant } from '../utils/dashboardHelpers';

function initials(name) {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return 'П';
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

export default function SermonWidget({ preacher, topic, verseRef, verseUrl, date, avatarUrl }) {
  const hasData = Boolean(preacher && topic && verseRef && verseUrl && date);
  if (!hasData || !isSermonRelevant({ date })) return null;

  const formattedDate = format(new Date(date), 'd MMMM yyyy', { locale: ru });

  return (
    <section className="rounded-2xl bg-primary p-4 text-[var(--text-on-primary)] shadow-[var(--shadow-card)] sm:p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/15">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-sm font-bold">{initials(preacher)}</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-white/80">Ближайшая проповедь</p>
          <p className="mt-1 text-base font-extrabold leading-tight sm:text-lg">{topic}</p>
          <p className="mt-1 text-sm font-medium text-white/85">{preacher}</p>
          <p className="mt-1 text-xs text-white/75">{formattedDate}</p>
        </div>
      </div>

      <a
        href={verseUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex min-h-[36px] items-center gap-2 rounded-xl bg-white/10 px-3 text-sm font-semibold text-white transition hover:bg-white/15"
      >
        <LuMic className="h-4 w-4" />
        <span className="truncate">{verseRef}</span>
        <LuExternalLink className="h-4 w-4" />
      </a>
    </section>
  );
}
