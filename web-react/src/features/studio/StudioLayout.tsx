import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LuArrowLeft, LuCirclePlus, LuGuitar, LuListMusic, LuMusic2 } from 'react-icons/lu';

import { PageHeader } from '@/components/layout/PageHeader';
import { sectionHeroStickyClass } from '@/lib/sectionHeroChrome';
import { useAuthStore } from '../auth/authStore';
import { canModerateSongCatalog } from '../auth/studioAccess';

type NavItem = {
  to: string;
  label: string;
  hint: string;
  Icon: typeof LuMusic2;
  tone?: 'default' | 'catalog' | 'muted';
};

type NavGroup = { id: string; title: string; items: NavItem[] };

const navBase =
  'flex min-h-[44px] items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors';

function itemClass(isActive: boolean, tone: NavItem['tone']) {
  if (tone === 'catalog') {
    return [
      navBase,
      isActive
        ? 'bg-sky-600 text-white shadow-sm'
        : 'border border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100',
    ].join(' ');
  }
  if (tone === 'muted') {
    return [
      navBase,
      isActive
        ? 'bg-stone-800 text-white shadow-sm'
        : 'text-stone-500 hover:bg-stone-100 hover:text-stone-800',
    ].join(' ');
  }
  return [
    navBase,
    isActive ? 'bg-stone-900 text-white shadow-sm' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
  ].join(' ');
}

export function StudioLayout() {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.role);
  const showAddSong = canModerateSongCatalog(role);

  const groups: NavGroup[] = [
    ...(showAddSong
      ? [
          {
            id: 'catalog',
            title: 'Каталог',
            items: [
              {
                to: '/studio/add-song',
                label: 'Новая песня',
                hint: 'Добавить песню в общий песенник',
                Icon: LuCirclePlus,
                tone: 'catalog' as const,
              },
            ],
          },
        ]
      : []),
    {
      id: 'songs',
      title: 'Тексты и версии',
      items: [
        {
          to: '/studio/my-songs',
          label: 'Мои версии',
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
          hint: 'Расширенные настройки в JSON (редко нужно)',
          Icon: LuGuitar,
          tone: 'muted' as const,
        },
      ],
    },
  ];

  return (
    <div className="flex w-full flex-col overscroll-y-none bg-stone-50 text-stone-900 [max-height:var(--viewport-height,100dvh)] [min-height:var(--viewport-height,100dvh)]">
      <div className={sectionHeroStickyClass}>
        <PageHeader title="Студия" />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-stone-200 bg-white px-2 py-3 shadow-sm md:w-64 md:border-b-0 md:border-r md:py-6 md:pl-5 md:pr-3">
        <div className="flex items-center gap-3 px-2 py-2 md:px-0">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 text-stone-600 transition hover:border-stone-300 hover:bg-white hover:text-stone-900"
            aria-label="Назад в приложение"
          >
            <LuArrowLeft className="h-5 w-5" />
          </button>
        </div>
        <ol className="mt-2 hidden list-decimal space-y-1.5 px-6 text-[11px] leading-snug text-stone-500 md:block">
          <li>Версии и черновики — в «Мои версии».</li>
          <li>Программа служения — в «Сетлисты».</li>
        </ol>

        <nav
          className="mt-3 flex flex-row gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] md:mt-5 md:flex-col md:gap-0 md:overflow-visible md:pb-0 [&::-webkit-scrollbar]:hidden"
          aria-label="Разделы студии"
        >
          {groups.map((group, gi) => (
            <div
              key={group.id}
              className={[
                'flex min-w-[9.5rem] shrink-0 flex-col gap-1 md:min-w-0',
                gi > 0 ? 'border-l border-stone-200 pl-3 md:border-l-0 md:border-t md:pl-0 md:pt-4 md:mt-1' : '',
              ].join(' ')}
            >
              <p className="px-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-400 md:pb-1">
                {group.title}
              </p>
              <div className="flex flex-row gap-1 md:flex-col">
                {group.items.map(({ to, label, hint, Icon, tone }) => (
                  <NavLink
                    key={to}
                    to={to}
                    title={hint}
                    className={({ isActive }) => itemClass(isActive, tone ?? 'default')}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-current" aria-hidden />
                    {label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>
      <main className="min-h-0 flex-1 overflow-auto px-3 pb-10 pt-4 md:px-10 md:pb-12 md:pt-8">
        <Outlet />
      </main>
      </div>
    </div>
  );
}
