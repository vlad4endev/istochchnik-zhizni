import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { LuBell, LuUser } from 'react-icons/lu';

import { SectionHeroToolbarEnd } from '@/components/SectionHeroToolbarEnd';
import { sectionHeroHeaderClass } from '@/lib/sectionHeroChrome';

export default function DashboardHeader({ user, notificationsCount = 0 }) {
  const firstName = String(user?.firstName ?? '').trim();
  const greetingName = firstName || 'друг';
  const dateLabel = format(new Date(), 'EEEE, d MMMM', { locale: ru });

  return (
    <header className={sectionHeroHeaderClass}>
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-white/80">Главная</p>
          <h1 className="mt-1 text-xl font-extrabold leading-tight sm:text-2xl">Добро пожаловать, {greetingName}</h1>
          <p className="mt-1 text-sm text-white/85">{dateLabel}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="relative inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl bg-white/10 text-white"
            aria-label="Уведомления"
          >
            <LuBell className="h-4 w-4" />
            {notificationsCount > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold text-white">
                {notificationsCount}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl bg-white/10 text-white"
            aria-label="Профиль"
          >
            <LuUser className="h-4 w-4" />
          </button>
          <SectionHeroToolbarEnd />
        </div>
      </div>
    </header>
  );
}
