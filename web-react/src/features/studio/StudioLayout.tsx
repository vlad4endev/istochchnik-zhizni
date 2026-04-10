import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LuArrowLeft, LuFileText, LuGuitar, LuListMusic, LuMusic2 } from 'react-icons/lu';

const links = [
  { to: '/studio/my-songs', label: 'Мои песни', Icon: LuMusic2 },
  { to: '/studio/drafts', label: 'Черновики', Icon: LuFileText },
  { to: '/studio/setlists', label: 'Сетлисты', Icon: LuListMusic },
  { to: '/studio/instruments', label: 'Инструменты', Icon: LuGuitar },
];

export function StudioLayout() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-zinc-950 text-zinc-100 md:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-zinc-800 md:w-56 md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-900"
            aria-label="Назад в приложение"
          >
            <LuArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Моя студия</p>
            <p className="text-sm font-semibold text-white">Рабочее место</p>
          </div>
        </div>
        <nav className="flex flex-row gap-1 overflow-x-auto px-2 py-2 md:flex-col md:overflow-visible md:px-3 md:py-4">
          {links.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                  isActive
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200',
                ].join(' ')
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="min-h-0 flex-1 overflow-auto p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
