import { Link, useLocation } from 'react-router-dom';

import {
  listAccessibleScheduleMinistries,
  SCHEDULE_MINISTRY_LABELS,
  SCHEDULE_MINISTRY_SHORT_LABELS,
  schedulePathForMinistry,
  type ScheduleMinistryKey,
} from '../ministryScheduleAccess';

type Props = {
  role: string | undefined;
  ministryDirection: unknown;
  ministryRole: unknown;
  roles?: Array<string | null | undefined>;
  active: ScheduleMinistryKey;
};

export function MinistryScheduleSwitcher({ role, ministryDirection, ministryRole, roles, active }: Props) {
  const location = useLocation();
  const ministries = listAccessibleScheduleMinistries(role, ministryDirection, ministryRole, roles);
  if (ministries.length <= 1) return null;

  return (
    <div
      className="flex gap-1.5 rounded-2xl border border-stone-200 bg-white p-1.5 shadow-sm"
      role="tablist"
      aria-label="Направление расписания"
    >
      {ministries.map((key) => {
        const isActive = key === active;
        const to = schedulePathForMinistry(key);
        const mySuffix = location.pathname.endsWith('/my') ? '/my' : '';
        return (
          <Link
            key={key}
            to={`${to}${mySuffix}`}
            role="tab"
            aria-selected={isActive}
            className={[
              'flex min-h-[40px] min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-xl px-2 py-2 text-center text-sm font-bold transition [overflow-wrap:normal] sm:flex-none sm:px-4',
              isActive
                ? 'bg-primary text-white shadow-sm'
                : 'text-stone-700 hover:bg-stone-50 active:bg-stone-100',
            ].join(' ')}
          >
            <span className="sm:hidden">{SCHEDULE_MINISTRY_SHORT_LABELS[key]}</span>
            <span className="hidden sm:inline">{SCHEDULE_MINISTRY_LABELS[key]}</span>
          </Link>
        );
      })}
    </div>
  );
}
