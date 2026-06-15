import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LuArrowLeft, LuBookOpen, LuCirclePlus, LuGuitar, LuListMusic, LuMusic2 } from 'react-icons/lu';

import { useAuthStore } from '../auth/authStore';
import { canModerateSongCatalogSession } from '../auth/studioAccess';

type NavItem = {
  to: string;
  label: string;
  shortLabel: string;
  hint: string;
  Icon: typeof LuMusic2;
};

type NavGroup = { id: string; title: string; items: NavItem[] };

const sidebarLinkBase =
  'flex min-h-[44px] items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors';

function sidebarLinkClass(isActive: boolean): string {
  return isActive
    ? [
        sidebarLinkBase,
        'studio-nav-link-active bg-[var(--studio-nav-active-bg)] font-semibold text-[var(--studio-nav-active-text)]',
      ].join(' ')
    : [
        sidebarLinkBase,
        'border-l-[3px] border-transparent pl-[calc(0.75rem-3px)] text-[var(--studio-nav-text)] hover:bg-[var(--studio-nav-active-bg)]/60',
      ].join(' ');
}

const mobileNavLinkBase =
  'flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-medium transition-colors sm:text-xs';

function mobileNavLinkClass(isActive: boolean): string {
  return isActive
    ? `${mobileNavLinkBase} font-semibold text-[var(--studio-nav-active-text)]`
    : `${mobileNavLinkBase} text-[var(--studio-nav-text-mute)]`;
}

function buildNavGroups(showAddSong: boolean): NavGroup[] {
  return [
    {
      id: 'catalog',
      title: 'Каталог',
      items: [
        {
          to: '/studio/catalog',
          label: 'Каталог',
          shortLabel: 'Каталог',
          hint: 'Все опубликованные песни всех участников',
          Icon: LuBookOpen,
        },
        ...(showAddSong
          ? [
              {
                to: '/studio/add-song',
                label: 'Новая песня',
                shortLabel: 'Добавить',
                hint: 'Добавить песню в общий каталог',
                Icon: LuCirclePlus,
              },
            ]
          : []),
      ],
    },
    {
      id: 'songs',
      title: 'Тексты и версии',
      items: [
        {
          to: '/studio/my-songs',
          label: 'Мои версии',
          shortLabel: 'Мои',
          hint: 'Черновики, недавние песни и сохранённые правки к каталогу',
          Icon: LuMusic2,
        },
      ],
    },
    {
      id: 'sets',
      title: 'Программа',
      items: [
        {
          to: '/studio/setlists',
          label: 'Сетлисты',
          shortLabel: 'Сетлисты',
          hint: 'Порядок песен, PDF, режим выступления, ссылка для группы',
          Icon: LuListMusic,
        },
      ],
    },
    {
      id: 'extra',
      title: 'Дополнительно',
      items: [
        {
          to: '/studio/instruments',
          label: 'Инструменты',
          shortLabel: 'JSON',
          hint: 'Расширенные настройки в JSON (редко нужно)',
          Icon: LuGuitar,
        },
      ],
    },
  ];
}

function flattenMobileNavItems(groups: NavGroup[]): NavItem[] {
  return groups.flatMap((g) => g.items);
}

type StudioSidebarProps = {
  groups: NavGroup[];
  onBack: () => void;
};

function StudioSidebar({ groups, onBack }: StudioSidebarProps) {
  return (
    <aside
      className="hidden h-screen w-14 shrink-0 flex-col overflow-y-auto border-r border-[var(--studio-nav-border)] bg-[var(--studio-nav-bg)] md:flex lg:w-56"
      aria-label="Навигация студии"
    >
      <div className="hidden px-4 py-4 lg:block">
        <p className="text-base font-bold text-[var(--studio-editor-text)]">Студия</p>
        <p className="mt-1 text-xs text-[var(--studio-nav-text-mute)]">Тексты, версии и сетлисты</p>
      </div>
      <div className="flex items-center justify-center px-2 py-3 lg:justify-start lg:px-4">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--studio-nav-border)] text-[var(--studio-nav-text)] transition hover:bg-[var(--studio-nav-active-bg)]"
          aria-label="Назад в приложение"
        >
          <LuArrowLeft className="h-5 w-5" />
        </button>
      </div>
      <nav className="mt-2 flex flex-1 flex-col gap-4 px-2 pb-6 lg:px-3" aria-label="Разделы студии">
        {groups.map((group, gi) => (
          <div
            key={group.id}
            className={gi > 0 ? 'border-t border-[var(--studio-nav-border)] pt-4' : ''}
          >
            <p className="mb-1 hidden px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--studio-nav-text-mute)] lg:block">
              {group.title}
            </p>
            <div className="flex flex-col gap-1">
              {group.items.map(({ to, label, hint, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  title={hint}
                  className={({ isActive }) => sidebarLinkClass(isActive)}
                >
                  <Icon className="h-4 w-4 shrink-0 text-current" aria-hidden />
                  <span className="hidden truncate lg:inline">{label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}

function StudioTopBar({ onBack }: { onBack: () => void }) {
  return (
    <header
      className="flex shrink-0 items-center gap-3 border-b border-[var(--studio-toolbar-border)] bg-[var(--studio-toolbar-bg)] px-3 py-2 md:hidden"
      style={{
        boxShadow: 'var(--studio-toolbar-shadow)',
        paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
      }}
    >
      <button
        type="button"
        onClick={onBack}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--studio-nav-border)] text-[var(--studio-nav-text)]"
        aria-label="Назад в приложение"
      >
        <LuArrowLeft className="h-5 w-5" />
      </button>
      <h1 className="min-w-0 flex-1 truncate text-base font-bold text-[var(--studio-editor-text)]">Студия</h1>
    </header>
  );
}

function StudioMobileNav({ items }: { items: NavItem[] }) {
  return (
    <nav
      className="studio-mobile-nav fixed bottom-0 left-0 right-0 z-[var(--z-sticky)] flex h-16 items-stretch gap-1 border-t border-[var(--studio-dock-border)] bg-[var(--studio-dock-bg)] px-1 md:hidden"
      style={{
        boxShadow: 'var(--studio-dock-shadow)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      aria-label="Разделы студии"
    >
      {items.map(({ to, shortLabel, hint, Icon }) => (
        <NavLink key={to} to={to} title={hint} className={({ isActive }) => mobileNavLinkClass(isActive)}>
          <Icon className="h-5 w-5 shrink-0" aria-hidden />
          <span className="max-w-full truncate">{shortLabel}</span>
        </NavLink>
      ))}
    </nav>
  );
}

/** Страницы с собственным нижним dock — без дублирующей мобильной навигации студии. */
function isFullBleedStudioRoute(pathname: string): boolean {
  return pathname.startsWith('/studio/add-song');
}

export function StudioLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const role = useAuthStore((s) => s.role);
  const roles = useAuthStore((s) => s.roles ?? [s.role]);
  const showAddSong = canModerateSongCatalogSession(role, roles);

  const groups = buildNavGroups(showAddSong);
  const mobileItems = flattenMobileNavItems(groups);
  const fullBleed = isFullBleedStudioRoute(location.pathname);

  return (
    <div
      className="studio-layout flex w-full flex-col overscroll-y-none bg-[var(--studio-editor-bg)] text-[var(--studio-editor-text)]"
      style={{ height: 'var(--viewport-height, 100dvh)' }}
    >
      {!fullBleed ? <StudioTopBar onBack={() => navigate('/dashboard')} /> : null}
      <div className="studio-body flex min-h-0 min-w-0 flex-1 flex-row">
        <StudioSidebar groups={groups} onBack={() => navigate('/dashboard')} />
        <main
          className={[
            'studio-main min-h-0 min-w-0 flex-1 overflow-y-auto px-3 pt-4 md:px-8 md:pt-6 lg:px-10',
            fullBleed ? 'pb-0' : 'studio-content-with-nav pb-16 md:pb-0',
          ].join(' ')}
        >
          <Outlet />
        </main>
      </div>
      {!fullBleed ? <StudioMobileNav items={mobileItems} /> : null}
    </div>
  );
}
