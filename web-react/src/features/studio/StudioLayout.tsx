import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LuArrowLeft, LuCirclePlus, LuGuitar, LuListMusic, LuMusic2 } from 'react-icons/lu';

import { useAuthStore } from '../auth/authStore';
import { canModerateSongCatalog } from '../auth/studioAccess';

const links = [
  { to: '/studio/my-songs', label: 'Мои версии', Icon: LuMusic2 },
  { to: '/studio/setlists', label: 'Сетлисты', Icon: LuListMusic },
  { to: '/studio/instruments', label: 'Инструменты', Icon: LuGuitar },
];

export function StudioLayout() {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.role);
  const showAddSong = canModerateSongCatalog(role);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-slate-950 text-slate-100 md:flex-row md:gap-4">
      <aside className="flex w-full shrink-0 flex-col gap-2 px-2 py-3 md:w-56 md:py-6 md:pl-4 md:pr-0">
        <div className="flex items-center gap-3 px-2 py-2 md:px-1">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900/80 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
            aria-label="Назад в приложение"
          >
            <LuArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Студия</p>
            <p className="text-sm font-semibold text-white">Моя работа</p>
          </div>
        </div>
        <nav className="flex flex-row gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
          {showAddSong && (
            <NavLink
              to="/studio/add-song"
              className={({ isActive }) =>
                [
                  'flex min-h-[44px] items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
                  isActive
                    ? 'bg-slate-800 text-sky-100'
                    : 'text-sky-300/90 hover:bg-slate-900/80 hover:text-sky-200',
                ].join(' ')
              }
            >
              <LuCirclePlus className="h-4 w-4 shrink-0" />
              В каталог
            </NavLink>
          )}
          {links.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  'flex min-h-[44px] items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
                  isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-900/80 hover:text-slate-200',
                ].join(' ')
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="min-h-0 flex-1 overflow-auto px-3 pb-8 pt-2 md:px-8 md:pt-4">
        <Outlet />
      </main>
    </div>
  );
}
