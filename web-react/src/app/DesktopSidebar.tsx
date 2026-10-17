import '../styles/desktopSidebar.css';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import type { IconType } from 'react-icons';
import {
  LuChevronDown,
  LuEllipsis,
  LuLogOut,
  LuPanelLeftClose,
  LuPanelLeftOpen,
  LuSearch,
  LuSettings,
  LuShield,
  LuUser,
} from 'react-icons/lu';

import { AppAvatar } from '../components/AppAvatar';
import { PrefetchNavLink } from '../components/PrefetchNavLink';
import {
  ADMIN_SIDEBAR_GROUPS,
  ADMIN_TABS,
  adminTabNavLabel,
  adminTabPath,
  type AdminTabId,
} from '../features/admin/adminTabs';

/** Ширины колонки: совпадают с `--sidebar-width` для отступа `main` (index.css). */
export const SIDEBAR_WIDTH_EXPANDED = 272;
export const SIDEBAR_WIDTH_COLLAPSED = 80;

const LS_NAV_COLLAPSED = 'app_nav_collapsed';
const AUTO_COLLAPSE_QUERY = '(max-width: 1279px)';

function readStoredPref(): boolean | null {
  try {
    const v = localStorage.getItem(LS_NAV_COLLAPSED);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Свёрнуто/развёрнуто. Пока пользователь не выбрал сам — окно уже 1280px сворачивает панель
 * автоматически (на ноутбуке и в половине экрана контент важнее подписей).
 */
export function useSidebarCollapsed() {
  const [pref, setPref] = useState<boolean | null>(readStoredPref);
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(AUTO_COLLAPSE_QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(AUTO_COLLAPSE_QUERY);
    const onChange = () => setNarrow(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const collapsed = pref ?? narrow;

  const toggle = useCallback(() => {
    setPref(() => {
      const next = !collapsed;
      try {
        localStorage.setItem(LS_NAV_COLLAPSED, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [collapsed]);

  return { collapsed, toggle };
}

export type SidebarNavItem = { to: string; label: string; Icon: IconType };

type PrefetchCfg = { queryKey: readonly unknown[]; queryFn: () => Promise<unknown>; staleTime?: number };

type Props = {
  collapsed: boolean;
  onToggle: () => void;
  items: SidebarNavItem[];
  prefetchByPath: Record<string, PrefetchCfg>;
  badgeFor: (to: string) => number;
  badgeAria: (to: string, count: number) => string | undefined;
  isAdminRoute: boolean;
  activeAdminTab: AdminTabId;
  adminBadgeFor: (id: AdminTabId) => number | null;
  appName: string;
  description: string;
  logoSrc: string | null;
  logoScalePercent: number;
  showAccount: boolean;
  profileTo: string;
  hasProfileDraft: boolean;
  userName: string;
  userHint: string;
  userAvatarUrl: string | null;
  onLogout: () => void;
};

function badgeText(n: number): string {
  return n > 99 ? '99+' : String(n);
}

function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
}

function isEditableTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  return Boolean(el.closest('textarea, [contenteditable="true"], [contenteditable=""]'));
}

type Tip = { label: string; top: number; left: number };

/* ───────────────────────── Быстрый переход (Ctrl/⌘ + K) ───────────────────────── */

type PaletteEntry = { key: string; to: string; label: string; group: string; Icon: IconType };

function QuickNav({ entries, onClose }: { entries: PaletteEntry[]; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => `${e.group} ${e.label}`.toLowerCase().includes(q));
  }, [entries, query]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
    const prevFocus = document.activeElement as HTMLElement | null;
    return () => prevFocus?.focus?.();
  }, []);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const go = (entry: PaletteEntry | undefined) => {
    if (!entry) return;
    onClose();
    navigate(entry.to);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => (filtered.length ? (i + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(filtered[index]);
    }
  };

  return createPortal(
    <div className="dsb-qn" onKeyDown={onKeyDown}>
      <button type="button" className="dsb-qn__backdrop" aria-label="Закрыть поиск" tabIndex={-1} onClick={onClose} />
      <div className="dsb-qn__panel" role="dialog" aria-modal="true" aria-label="Быстрый переход">
        <div className="dsb-qn__search">
          <LuSearch className="dsb-qn__search-icon" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Перейти в раздел…"
            aria-label="Поиск раздела"
            role="combobox"
            aria-expanded="true"
            aria-controls="dsb-qn-list"
            aria-activedescendant={filtered[index] ? `dsb-qn-${filtered[index].key}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="dsb-kbd">Esc</kbd>
        </div>
        <ul id="dsb-qn-list" ref={listRef} className="dsb-qn__list" role="listbox">
          {filtered.length === 0 ? <li className="dsb-qn__empty">Ничего не найдено</li> : null}
          {filtered.map((e, i) => {
            const Icon = e.Icon;
            return (
              <li
                key={e.key}
                id={`dsb-qn-${e.key}`}
                role="option"
                aria-selected={i === index}
                data-active={i === index}
                className="dsb-qn__item"
                onMouseMove={() => setIndex(i)}
                onClick={() => go(e)}
              >
                <Icon className="dsb-qn__item-icon" aria-hidden />
                <span className="dsb-qn__item-label">{e.label}</span>
                <span className="dsb-qn__item-group">{e.group}</span>
              </li>
            );
          })}
        </ul>
        <div className="dsb-qn__foot">
          <span><kbd className="dsb-kbd">↑</kbd> <kbd className="dsb-kbd">↓</kbd> выбор</span>
          <span><kbd className="dsb-kbd">Enter</kbd> открыть</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ───────────────────────── Админ-аккордеон ───────────────────────── */

function AdminAccordion({
  collapsed,
  isAdminRoute,
  activeTab,
  badgeFor,
  tipProps,
}: {
  collapsed: boolean;
  isAdminRoute: boolean;
  activeTab: AdminTabId;
  badgeFor: (id: AdminTabId) => number | null;
  tipProps: (label: string) => Record<string, unknown>;
}) {
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const expanded = !collapsed && (manualOpen ?? isAdminRoute);

  useEffect(() => {
    if (isAdminRoute) setManualOpen(null);
  }, [isAdminRoute]);

  const pending = useMemo(
    () => ADMIN_TABS.reduce((s, t) => s + (badgeFor(t.id) ?? 0), 0),
    [badgeFor],
  );

  return (
    <div className="dsb-admin">
      <div className={['dsb-item dsb-item--split', isAdminRoute ? 'is-active nav-active-glow' : ''].join(' ')}>
        <PrefetchNavLink
          to="/admin"
          onClick={() => setManualOpen(true)}
          className="dsb-item__main"
          aria-current={isAdminRoute ? 'page' : undefined}
          {...tipProps('Админ')}
        >
          <span className="dsb-item__icon"><LuShield aria-hidden /></span>
          <span className="dsb-label">Админ</span>
        </PrefetchNavLink>
        {!collapsed ? (
          <button
            type="button"
            className="dsb-item__chev"
            aria-expanded={expanded}
            aria-label={expanded ? 'Свернуть разделы админки' : 'Развернуть разделы админки'}
            onClick={() => setManualOpen(!expanded)}
          >
            <LuChevronDown className={expanded ? '' : 'is-closed'} aria-hidden />
          </button>
        ) : null}
        {collapsed && pending > 0 ? <span className="dsb-dot" aria-hidden /> : null}
      </div>

      {expanded ? (
        <div className="dsb-sub" role="group" aria-label="Разделы админки">
          {ADMIN_SIDEBAR_GROUPS.map((group) => (
            <div key={group.label} className="dsb-sub__group">
              <p className="dsb-sub__title">{group.label}</p>
              {group.items.map((item) => {
                const cfg = ADMIN_TABS.find((t) => t.id === item.id)!;
                const SubIcon = cfg.Icon;
                const active = isAdminRoute && activeTab === item.id;
                const badge = item.hasBadge ? badgeFor(item.id) : null;
                return (
                  <Link
                    key={item.id}
                    to={adminTabPath(item.id)}
                    title={cfg.label}
                    aria-current={active ? 'page' : undefined}
                    className={['dsb-sub__item', active ? 'is-active' : ''].join(' ')}
                  >
                    <SubIcon aria-hidden />
                    <span className="dsb-sub__label">{adminTabNavLabel(item.id)}</span>
                    {badge != null ? (
                      <span className={['dsb-pill', item.badgeRed && badge > 0 ? 'dsb-pill--alert' : 'dsb-pill--muted'].join(' ')}>
                        {badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ───────────────────────── Сайдбар ───────────────────────── */

export function DesktopSidebar(props: Props) {
  const {
    collapsed,
    onToggle,
    items,
    prefetchByPath,
    badgeFor,
    badgeAria,
    isAdminRoute,
    activeAdminTab,
    adminBadgeFor,
    appName,
    description,
    logoSrc,
    logoScalePercent,
    showAccount,
    profileTo,
    hasProfileDraft,
    userName,
    userHint,
    userAvatarUrl,
    onLogout,
  } = props;

  const location = useLocation();
  const [tip, setTip] = useState<Tip | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [menu, setMenu] = useState<{ left: number; bottom: number } | null>(null);
  const userBtnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const mod = isMac() ? '⌘' : 'Ctrl';

  /* Подсказка рядом с иконкой — только в свёрнутом виде. Один fixed-элемент: nav скроллится и обрезал бы абсолютный. */
  const tipProps = useCallback(
    (label: string) => {
      if (!collapsed) return {};
      const show = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        setTip({ label, top: r.top + r.height / 2, left: r.right + 10 });
      };
      return {
        onMouseEnter: (e: MouseEvent<HTMLElement>) => show(e.currentTarget),
        onMouseLeave: () => setTip(null),
        onFocus: (e: FocusEvent<HTMLElement>) => {
          if (e.currentTarget.matches(':focus-visible')) show(e.currentTarget);
        },
        onBlur: () => setTip(null),
      };
    },
    [collapsed],
  );

  useEffect(() => {
    setTip(null);
  }, [collapsed, location.pathname]);

  useEffect(() => {
    setMenu(null);
  }, [location.pathname, collapsed]);

  /* Горячие клавиши: Ctrl/⌘+K — быстрый переход, Ctrl/⌘+\ — свернуть/развернуть. По e.code — работает и в русской раскладке. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (e.code === 'KeyK' && !isEditableTarget(e.target)) {
        e.preventDefault();
        setQuickOpen((v) => !v);
      } else if (e.code === 'Backslash') {
        e.preventDefault();
        onToggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onToggle]);

  /* Меню пользователя: закрытие по клику вне и Esc. */
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || userBtnRef.current?.contains(t)) return;
      setMenu(null);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenu(null);
        userBtnRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [menu]);

  useEffect(() => {
    if (menu) menuRef.current?.querySelector<HTMLElement>('a,button')?.focus();
  }, [menu]);

  const openMenu = () => {
    if (menu) {
      setMenu(null);
      return;
    }
    const r = userBtnRef.current?.getBoundingClientRect();
    if (!r) return;
    setMenu({
      left: collapsed ? r.right + 10 : r.left,
      bottom: Math.max(8, collapsed ? window.innerHeight - r.bottom : window.innerHeight - r.top + 8),
    });
  };

  const hasAdmin = items.some((i) => i.to === '/admin');
  const sectionItems = items.filter((i) => i.to !== '/admin');

  const paletteEntries = useMemo<PaletteEntry[]>(() => {
    const out: PaletteEntry[] = items
      .filter((i) => i.to !== '/admin')
      .map((i) => ({ key: i.to, to: i.to, label: i.label, group: 'Раздел', Icon: i.Icon }));
    if (hasAdmin) {
      for (const t of ADMIN_TABS) {
        out.push({ key: `admin-${t.id}`, to: adminTabPath(t.id), label: t.navLabel ?? t.label, group: 'Админ', Icon: t.Icon });
      }
    }
    if (showAccount) {
      out.push({ key: 'profile', to: profileTo, label: 'Моя страница', group: 'Аккаунт', Icon: LuUser });
      out.push({ key: 'settings', to: '/settings', label: 'Настройки', group: 'Аккаунт', Icon: LuSettings });
    }
    return out;
  }, [items, hasAdmin, showAccount, profileTo]);

  const itemClass = ({ isActive }: { isActive: boolean }) =>
    ['dsb-item', isActive ? 'is-active nav-active-glow' : ''].join(' ');

  const style = {
    '--dsb-width': `${collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED}px`,
  } as CSSProperties;

  const initialsSource = userName || appName;

  return (
    <>
      <aside
        className="dsb hidden lg:flex"
        data-collapsed={collapsed ? 'true' : 'false'}
        style={style}
        aria-label="Боковая панель"
      >
        {/* Шапка: логотип + название + поиск */}
        <header className="dsb__head">
          <Link to="/dashboard" className="dsb__brand" aria-label={`${appName} — на главную`} {...tipProps(appName)}>
            <span className="dsb__logo">
              <img
                src={logoSrc || '/assets/logo.svg'}
                alt=""
                style={logoSrc ? { transform: `scale(${Math.min(100, logoScalePercent) / 100})` } : undefined}
              />
            </span>
            <span className="dsb-label dsb__brand-text">
              <span className="dsb__brand-name">{appName}</span>
              {description ? <span className="dsb__brand-desc">{description}</span> : null}
            </span>
          </Link>
          <button
            type="button"
            className="dsb__icon-btn dsb__search-btn"
            onClick={() => setQuickOpen(true)}
            aria-label={`Быстрый переход (${mod}+K)`}
            aria-keyshortcuts="Control+K Meta+K"
            {...tipProps(`Поиск · ${mod}+K`)}
          >
            <LuSearch aria-hidden />
          </button>
        </header>

        {/* Переключатель вида */}
        <button
          type="button"
          onClick={onToggle}
          className="dsb__toggle"
          aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
          aria-keyshortcuts="Control+Backslash Meta+Backslash"
          aria-expanded={!collapsed}
          {...tipProps(`Развернуть меню · ${mod}+\\`)}
        >
          {collapsed ? <LuPanelLeftOpen aria-hidden /> : <LuPanelLeftClose aria-hidden />}
          <span className="dsb-label">Свернуть меню</span>
          <kbd className="dsb-kbd dsb-label">{mod}+\</kbd>
        </button>

        {/* Разделы */}
        <nav className="dsb__nav" data-web-nav="react-icons" aria-label="Основная навигация">
          <p className="dsb__section dsb-label">Разделы</p>
          {sectionItems.map((item) => {
            const Icon = item.Icon;
            const badge = badgeFor(item.to);
            const cfg = prefetchByPath[item.to];
            return (
              <PrefetchNavLink
                key={item.to}
                to={item.to}
                queryKey={cfg?.queryKey}
                queryFn={cfg?.queryFn}
                staleTime={cfg?.staleTime}
                className={itemClass}
                aria-label={badgeAria(item.to, badge) ?? (collapsed ? item.label : undefined)}
                {...tipProps(badge > 0 ? `${item.label} · ${badgeText(badge)}` : item.label)}
              >
                <span className="dsb-item__icon">
                  <Icon aria-hidden />
                  {badge > 0 && collapsed ? <span className="dsb-dot dsb-dot--count" aria-hidden>{badgeText(badge)}</span> : null}
                </span>
                <span className="dsb-label dsb-item__text">{item.label}</span>
                {badge > 0 ? <span className="dsb-pill dsb-label">{badgeText(badge)}</span> : null}
              </PrefetchNavLink>
            );
          })}
          {hasAdmin ? (
            <AdminAccordion
              collapsed={collapsed}
              isAdminRoute={isAdminRoute}
              activeTab={activeAdminTab}
              badgeFor={adminBadgeFor}
              tipProps={tipProps}
            />
          ) : null}

          {showAccount ? (
            <>
              <div className="dsb__divider" role="separator" />
              <p className="dsb__section dsb-label">Аккаунт</p>
              <NavLink
                to={profileTo}
                className={itemClass}
                aria-label={
                  hasProfileDraft ? 'Моя страница, есть несохранённый черновик поста' : collapsed ? 'Моя страница' : undefined
                }
                {...tipProps('Моя страница')}
              >
                <span className="dsb-item__icon">
                  <LuUser aria-hidden />
                  {hasProfileDraft ? <span className="dsb-dot dsb-dot--draft" aria-hidden /> : null}
                </span>
                <span className="dsb-label dsb-item__text">Моя страница</span>
              </NavLink>
              <NavLink to="/settings" end className={itemClass} aria-label={collapsed ? 'Настройки' : undefined} {...tipProps('Настройки')}>
                <span className="dsb-item__icon"><LuSettings aria-hidden /></span>
                <span className="dsb-label dsb-item__text">Настройки</span>
              </NavLink>
            </>
          ) : null}
        </nav>

        {/* Карточка пользователя */}
        <footer className="dsb__foot">
          {showAccount ? (
            <button
              ref={userBtnRef}
              type="button"
              className="dsb-user"
              onClick={openMenu}
              aria-haspopup="menu"
              aria-expanded={Boolean(menu)}
              aria-label={`Меню профиля: ${userName || 'пользователь'}`}
              {...tipProps(userName || 'Профиль')}
            >
              <AppAvatar
                src={userAvatarUrl}
                fallback={<span>{(initialsSource.trim()[0] ?? '?').toUpperCase()}</span>}
                initialsFallbackText={userName}
                className="dsb-user__avatar"
              />
              <span className="dsb-label dsb-user__text">
                <span className="dsb-user__name">{userName || 'Профиль'}</span>
                {userHint ? <span className="dsb-user__hint">{userHint}</span> : null}
              </span>
              <LuEllipsis className="dsb-label dsb-user__more" aria-hidden />
            </button>
          ) : (
            <button type="button" className="dsb-item dsb-item--button" onClick={onLogout} aria-label="Выйти" {...tipProps('Выйти')}>
              <span className="dsb-item__icon"><LuLogOut aria-hidden /></span>
              <span className="dsb-label dsb-item__text">Выйти</span>
            </button>
          )}
        </footer>
      </aside>

      {tip ? (
        <div role="tooltip" className="dsb-tip" style={{ top: tip.top, left: tip.left }}>
          {tip.label}
        </div>
      ) : null}

      {menu && showAccount
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label="Профиль"
              className="dsb-menu"
              style={{ left: menu.left, bottom: menu.bottom }}
            >
              <div className="dsb-menu__who">
                <span className="dsb-menu__name">{userName || 'Профиль'}</span>
                {userHint ? <span className="dsb-menu__hint">{userHint}</span> : null}
              </div>
              <Link role="menuitem" to={profileTo} className="dsb-menu__item" onClick={() => setMenu(null)}>
                <LuUser aria-hidden /> Моя страница
              </Link>
              <Link role="menuitem" to="/settings" className="dsb-menu__item" onClick={() => setMenu(null)}>
                <LuSettings aria-hidden /> Настройки
              </Link>
              <button
                type="button"
                role="menuitem"
                className="dsb-menu__item dsb-menu__item--danger"
                onClick={() => {
                  setMenu(null);
                  onLogout();
                }}
              >
                <LuLogOut aria-hidden /> Выйти
              </button>
            </div>,
            document.body,
          )
        : null}

      {quickOpen ? <QuickNav entries={paletteEntries} onClose={() => setQuickOpen(false)} /> : null}
    </>
  );
}
