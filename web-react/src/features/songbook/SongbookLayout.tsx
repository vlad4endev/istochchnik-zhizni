import { NavLink, Outlet } from 'react-router-dom';
import { LuDisc3, LuListMusic, LuMusic2 } from 'react-icons/lu';

import { useAuthStore } from '../auth/authStore';
import { canAccessStudioRole } from '../auth/studioAccess';

import { SongbookChromeProvider, useSongbookChrome } from './SongbookChromeContext';

const tabs = [
  { to: '/songbook', end: true, label: 'Общий каталог', Icon: LuMusic2 },
  { to: '/songbook/studio', end: false, label: 'Мои версии', Icon: LuDisc3, studioOnly: true },
  { to: '/songbook/setlists', end: false, label: 'Сетлисты', Icon: LuListMusic, studioOnly: true },
] as const;

function SongbookShell() {
  const role = useAuthStore((s) => s.role);
  const studioOk = canAccessStudioRole(role);
  const { stageMode, toggleStageMode } = useSongbookChrome();

  const visibleTabs = tabs.filter((t) => {
    if ('studioOnly' in t && t.studioOnly) return studioOk;
    return true;
  });

  return (
    <div
      data-songbook-module
      className={[
        'flex min-h-0 min-w-0 flex-1 flex-col',
        stageMode ? 'songbook-stage bg-[#030303] text-zinc-100' : 'bg-[var(--surface)] text-[var(--text)]',
      ].join(' ')}
    >
      <div
        className={[
          'sticky top-0 z-20 border-b backdrop-blur-md',
          stageMode ? 'border-zinc-800 bg-[#030303]/90' : 'border-stone-200/80 bg-[var(--surface)]/95',
        ].join(' ')}
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-3 py-2 md:flex-row md:items-center md:justify-between md:px-4">
          <div className="flex items-center justify-between gap-2 md:justify-start">
            <p className={`text-xs font-bold uppercase tracking-wide ${stageMode ? 'text-zinc-500' : 'text-stone-500'}`}>
              Песни
            </p>
            <button
              type="button"
              onClick={toggleStageMode}
              className={[
                'min-h-[44px] rounded-full px-3 text-xs font-semibold transition-colors md:hidden',
                stageMode ? 'bg-zinc-800 text-zinc-100' : 'bg-stone-200 text-stone-800',
              ].join(' ')}
            >
              {stageMode ? 'Светлая' : 'Сцена'}
            </button>
          </div>

          {/* Mobile: segmented */}
          <div
            className={[
              'grid w-full gap-1 rounded-2xl p-1 md:hidden',
              stageMode ? 'bg-zinc-900' : 'bg-stone-100',
            ].join(' ')}
            style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))` }}
            role="tablist"
            aria-label="Раздел песен"
          >
            {visibleTabs.map(({ to, end, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  [
                    'flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-center text-xs font-semibold transition-colors',
                    isActive
                      ? stageMode
                        ? 'bg-zinc-800 text-white shadow-sm'
                        : 'bg-white text-stone-900 shadow-sm'
                      : stageMode
                        ? 'text-zinc-400 hover:text-zinc-200'
                        : 'text-stone-600 hover:text-stone-900',
                  ].join(' ')
                }
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{label}</span>
              </NavLink>
            ))}
          </div>

          {/* Web: tabs row */}
          <nav
            className={['hidden gap-1 md:flex', stageMode ? 'text-zinc-300' : 'text-stone-600'].join(' ')}
            aria-label="Подразделы песен"
          >
            {visibleTabs.map(({ to, end, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  [
                    'inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors',
                    isActive
                      ? stageMode
                        ? 'bg-zinc-800 text-white'
                        : 'bg-stone-900 text-white'
                      : stageMode
                        ? 'hover:bg-zinc-900'
                        : 'hover:bg-stone-100',
                  ].join(' ')
                }
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </NavLink>
            ))}
          </nav>

          <button
            type="button"
            onClick={toggleStageMode}
            className={[
              'hidden min-h-[44px] rounded-xl border px-3 text-xs font-semibold md:inline-flex',
              stageMode
                ? 'border-zinc-600 text-zinc-200 hover:bg-zinc-900'
                : 'border-stone-200 text-stone-700 hover:bg-stone-50',
            ].join(' ')}
          >
            Режим сцены
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-4 md:px-6">
        <Outlet />
      </div>
    </div>
  );
}

/** Вложенный layout модуля «Песни» внутри основного App Layout. */
export function SongbookLayout() {
  return (
    <SongbookChromeProvider>
      <SongbookShell />
    </SongbookChromeProvider>
  );
}
