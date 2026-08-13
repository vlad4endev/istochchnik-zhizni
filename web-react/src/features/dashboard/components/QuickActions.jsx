import { Link } from 'react-router-dom';
import { LuCalendarDays, LuCirclePlus, LuMessageCircle, LuUserPlus } from 'react-icons/lu';

const actions = [
  { to: '/messenger', label: 'Написать в чат', icon: LuMessageCircle },
  { to: '/events', label: 'Мероприятия', icon: LuCalendarDays },
  { to: '/prayer', label: 'Добавить нужду', icon: LuCirclePlus },
  { to: '/profile', label: 'Пригласить', icon: LuUserPlus },
];

export default function QuickActions() {
  return (
    <>
      <div className="hidden lg:flex lg:flex-wrap lg:gap-3">
        {actions.map((action) => (
          <Link
            key={action.label}
            to={action.to}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-bold text-[var(--text-on-primary)] shadow-[var(--shadow-card)]"
          >
            <action.icon className="h-4 w-4" />
            <span>{action.label}</span>
          </Link>
        ))}
      </div>

      <div className="scrollbar-hide -mx-1 overflow-x-auto px-1 lg:hidden">
        <div className="flex w-max gap-2">
          {actions.map((action) => (
            <Link
              key={action.label}
              to={action.to}
              className="inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-full border border-stone-200/70 bg-[var(--surface-elevated)] px-3 text-sm font-semibold text-stone-700 shadow-[var(--shadow-card)]"
            >
              <action.icon className="h-4 w-4 text-primary" />
              <span>{action.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
