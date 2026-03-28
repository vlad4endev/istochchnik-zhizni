import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { FaPrayingHands } from 'react-icons/fa';
import type { IconType } from 'react-icons';
import { LuCross, LuShield, LuUser } from 'react-icons/lu';

import { useAuthStore } from '../features/auth/authStore';
import { useBrandingStore } from '../features/branding/brandingStore';
import { useSyncServerRole } from '../hooks/useSyncServerRole';

type NavItem = {
  to: string;
  label: string;
  Icon: IconType;
  adminOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { to: '/prayer', label: 'Молитва', Icon: FaPrayingHands },
  { to: '/profile', label: 'Профиль', Icon: LuUser },
  { to: '/admin', label: 'Админ', Icon: LuShield, adminOnly: true },
];

const navIconClass = (isActive: boolean) =>
  [
    'h-5 w-5 shrink-0 transition-colors',
    isActive ? 'text-white' : 'text-stone-500 group-hover:text-primary',
  ].join(' ');

function navClassName(isActive: boolean, compact = false): string {
  const base =
    'group flex items-center justify-center gap-2 rounded-2xl font-semibold transition-colors tap-highlight-transparent';
  const size = compact ? 'min-h-[44px] flex-1 px-2 py-2 text-xs' : 'w-full px-4 py-3 text-sm text-left';
  const active = isActive
    ? 'bg-primary text-white shadow-md shadow-primary/25'
    : 'text-stone-600 hover:bg-stone-100 shell:hover:bg-stone-50';
  return `${base} ${size} ${active}`;
}

export function Layout() {
  useSyncServerRole();
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.role);
  const logout = useAuthStore((s) => s.logout);

  const appName = useBrandingStore((s) => s.appName);
  const description = useBrandingStore((s) => s.description);
  const customLogoDataUrl = useBrandingStore((s) => s.customLogoDataUrl);
  const logoScalePercent = useBrandingStore((s) => s.logoScalePercent);

  const isAdmin = (role ?? 'member').toLowerCase() === 'admin';
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  async function handleLogout() {
    if (!window.confirm('Завершить текущую сессию?')) {
      return;
    }
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--surface)] text-[var(--text)] shell:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden w-[260px] flex-col border-r border-stone-200/80 bg-[var(--surface-elevated)] shadow-[4px_0_16px_rgba(0,0,0,0.06)] shell:flex">
        <div className="flex flex-1 flex-col gap-1 p-6">
          <div className="mb-6 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/15 text-primary">
              {customLogoDataUrl ? (
                <img
                  src={customLogoDataUrl}
                  alt=""
                  className="max-h-full max-w-full object-contain"
                  style={{ transform: `scale(${logoScalePercent / 100})` }}
                />
              ) : (
                <LuCross className="h-5 w-5" strokeWidth={2} aria-hidden />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-base font-extrabold leading-tight text-stone-900">{appName}</p>
              <p className="mt-0.5 text-xs text-stone-500">{description}</p>
            </div>
          </div>

          <nav className="flex flex-col gap-1">
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => navClassName(isActive)}>
                {({ isActive }) => (
                  <>
                    <item.Icon className={navIconClass(isActive)} aria-hidden />
                    {item.label}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="mt-auto border-t border-stone-200/80 p-4">
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-stone-600 transition-colors hover:bg-stone-100"
          >
            Выйти
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="min-h-0 flex-1 overflow-auto pb-24 shell:ml-0 shell:pb-0">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 shell:hidden"
        aria-label="Основная навигация"
      >
        <div className="mx-auto flex max-w-lg items-center justify-around rounded-3xl bg-[var(--surface-elevated)] px-2 py-2 shadow-[var(--shadow)]">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => navClassName(isActive, true)}
            >
              {({ isActive }) => (
                <>
                  <item.Icon className={navIconClass(isActive)} aria-hidden />
                  <span className="max-w-[4.5rem] truncate text-center text-[10px] font-bold leading-tight min-[400px]:max-w-none min-[400px]:text-xs">
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
