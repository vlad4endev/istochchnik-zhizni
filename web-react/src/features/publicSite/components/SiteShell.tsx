import { Link, NavLink, Outlet } from 'react-router-dom';

import type { SiteSettings } from '../types';

const navClass = ({ isActive }: { isActive: boolean }) =>
  [
    'rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
    isActive ? 'bg-[#7B1C1C] text-white' : 'text-[#4a2a32] hover:bg-[#7B1C1C]/10',
  ].join(' ');

type SiteShellProps = {
  settings: SiteSettings | undefined;
};

export function SiteShell({ settings }: SiteShellProps) {
  const name = settings?.church_name?.trim() || 'Церковь';
  const showEvents = settings?.show_events !== false;
  const showLive = settings?.show_live !== false;
  const showGallery = settings?.show_gallery !== false;

  return (
    <div className="min-h-[100dvh] bg-[#f7f1ec] text-[#2b0d16]">
      <header className="sticky top-0 z-20 border-b border-[#e8d9d0]/80 bg-[#f7f1ec]/92 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/site" className="flex items-center gap-2.5">
            <img src="/assets/logo.svg" alt="" aria-hidden className="h-9 w-9 rounded-lg" />
            <span className="text-lg font-extrabold tracking-tight">{name}</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-1">
            <NavLink to="/site" end className={navClass}>
              Главная
            </NavLink>
            {showEvents && (
              <NavLink to="/site/events" className={navClass}>
                События
              </NavLink>
            )}
            {showLive && (
              <NavLink to="/site/live" className={navClass}>
                Трансляция
              </NavLink>
            )}
            {showGallery && (
              <NavLink to="/site/gallery" className={navClass}>
                Фото
              </NavLink>
            )}
            <Link
              to="/login"
              className="ml-1 rounded-lg border border-[#d9c4ba] bg-white/70 px-3 py-2 text-sm font-semibold text-[#5a1830] transition hover:bg-white"
            >
              Войти
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
        <Outlet />
      </main>

      <footer className="border-t border-[#e8d9d0] bg-[#efe6df]/70">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-6 text-sm text-[#6b5a5e] sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {name}</p>
          {settings?.contact_text?.trim() ? (
            <p className="whitespace-pre-wrap">{settings.contact_text.trim()}</p>
          ) : (
            <p>
              Приложение общины —{' '}
              <Link to="/login" className="font-semibold text-[#7B1C1C] underline-offset-2 hover:underline">
                вход для участников
              </Link>
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}
