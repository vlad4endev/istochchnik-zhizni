import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LuArrowLeft, LuCirclePlus, LuGuitar, LuListMusic, LuMusic2 } from 'react-icons/lu';

import { useAuthStore } from '../auth/authStore';
import { canModerateSongCatalog } from '../auth/studioAccess';

const links = [
  {
    to: '/studio/my-songs',
    label: 'Мои версии',
    hint: 'Черновики и свои правки к песням каталога',
    Icon: LuMusic2,
  },
  {
    to: '/studio/setlists',
    label: 'Сетлисты',
    hint: 'Программы: порядок песен, PDF, ссылка для группы',
    Icon: LuListMusic,
  },
  {
    to: '/studio/instruments',
    label: 'Инструменты',
    hint: 'Доп. настройки (JSON)',
    Icon: LuGuitar,
  },
] as const;

const navBase =
  'flex min-h-[44px] items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors';

export function StudioLayout() {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.role);
  const showAddSong = canModerateSongCatalog(role);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-stone-50 text-stone-900 md:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-stone-200 bg-white px-2 py-3 shadow-sm md:w-60 md:border-b-0 md:border-r md:py-6 md:pl-5 md:pr-3">
        <div className="flex items-center gap-3 px-2 py-2 md:px-0">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 text-stone-600 transition hover:border-stone-300 hover:bg-white hover:text-stone-900"
            aria-label="Назад в приложение"
          >
            <LuArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-500">Студия</p>
            <p className="truncate text-sm font-semibold text-stone-900">Песни и программы</p>
          </div>
        </div>
        <p className="mt-1 hidden px-0 text-xs leading-snug text-stone-500 md:block">
          Личные версии текстов, сетлисты для репетиций и выступлений.
        </p>

        <nav
          className="mt-3 flex flex-row gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] md:mt-5 md:flex-col md:gap-1 md:overflow-visible md:pb-0 [&::-webkit-scrollbar]:hidden"
          aria-label="Разделы студии"
        >
          {showAddSong ? (
            <>
              <p className="hidden px-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-stone-400 md:block">
                Каталог
              </p>
              <NavLink
                to="/studio/add-song"
                className={({ isActive }) =>
                  [
                    navBase,
                    isActive
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'border border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100',
                  ].join(' ')
                }
              >
                <LuCirclePlus className="h-4 w-4 shrink-0" aria-hidden />
                Новая песня
              </NavLink>
            </>
          ) : null}

          <p
            className={[
              'hidden px-1 text-[10px] font-semibold uppercase tracking-wide text-stone-400 md:block',
              showAddSong ? 'pt-3' : 'pt-1',
            ].join(' ')}
          >
            Работа
          </p>
          {links.map(({ to, label, hint, Icon }) => (
            <NavLink
              key={to}
              to={to}
              title={hint}
              className={({ isActive }) =>
                [
                  navBase,
                  isActive
                    ? 'bg-stone-900 text-white shadow-sm'
                    : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
                ].join(' ')
              }
            >
              <Icon className="h-4 w-4 shrink-0 text-current" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="min-h-0 flex-1 overflow-auto px-3 pb-10 pt-4 md:px-10 md:pb-12 md:pt-8">
        <Outlet />
      </main>
    </div>
  );
}
