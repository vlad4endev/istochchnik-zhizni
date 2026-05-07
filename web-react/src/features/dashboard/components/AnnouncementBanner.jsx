import { LuMegaphone } from 'react-icons/lu';

export default function AnnouncementBanner({ announcement }) {
  if (!announcement) return null;

  return (
    <section className="rounded-2xl border border-stone-200/70 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow-card)] sm:p-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <LuMegaphone className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-primary">{announcement.tag || 'Объявление'}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm font-medium leading-relaxed text-stone-800">{announcement.text}</p>
        </div>
      </div>
    </section>
  );
}
