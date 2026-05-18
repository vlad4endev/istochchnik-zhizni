import type { AppRole } from './appRole';
import { APP_ROLE_IDS } from './sectionVisibilitySettings';
import {
  APP_SECTION_IDS,
  defaultSectionVisibilitySettings,
  type AppSectionId,
} from './sectionVisibilitySettings';

export const APP_PERMISSION_CATEGORIES = [
  {
    id: 'sections',
    label: 'Разделы приложения',
    description: 'Доступ к разделам в меню и по прямой ссылке.',
  },
  {
    id: 'admin',
    label: 'Админ-панель',
    description: 'Управление пользователями, настройками и системой.',
  },
  {
    id: 'studio',
    label: 'Студия и песенник',
    description: 'Работа со студией и каталогом песен.',
  },
  {
    id: 'planner',
    label: 'Планировщик служений',
    description: 'Создание и редактирование планов служений.',
  },
  {
    id: 'calendar',
    label: 'Молитва и календарь',
    description: 'Координация молитвенного цикла и заметки на главной.',
  },
  {
    id: 'broadcast',
    label: 'Трансляции',
    description: 'Управление прямыми эфирами и анонсами трансляций.',
  },
  {
    id: 'content',
    label: 'Контент и лента',
    description: 'Публикации на личной странице участника.',
  },
] as const;

export type AppPermissionCategoryId = (typeof APP_PERMISSION_CATEGORIES)[number]['id'];

export const APP_PERMISSION_DEFS = [
  { id: 'section.dashboard', category: 'sections', label: 'Главная', description: 'Дашборд и общая лента событий.' },
  { id: 'section.prayer', category: 'sections', label: 'Молитва', description: 'Молитвенный календарь и цикл.' },
  { id: 'section.songbook', category: 'sections', label: 'Песенник', description: 'Каталог песен для просмотра.' },
  { id: 'section.service_planner', category: 'sections', label: 'Планировщик', description: 'Раздел планировщика служений.' },
  { id: 'section.studio', category: 'sections', label: 'Студия', description: 'Студия аранжировок и репетиций.' },
  { id: 'section.sermons', category: 'sections', label: 'Проповеди', description: 'Архив проповедей.' },
  { id: 'section.messenger', category: 'sections', label: 'Чаты', description: 'Мессенджер и групповые чаты.' },
  { id: 'admin.panel', category: 'admin', label: 'Админ-панель', description: 'Вход в раздел /admin.' },
  { id: 'admin.users_manage', category: 'admin', label: 'Пользователи', description: 'Просмотр и редактирование карточек участников.' },
  { id: 'admin.access_requests', category: 'admin', label: 'Заявки на вход', description: 'Одобрение новых регистраций.' },
  { id: 'admin.analytics', category: 'admin', label: 'Аналитика', description: 'Статистика использования приложения.' },
  { id: 'admin.diagnostics', category: 'admin', label: 'Диагностика', description: 'Тесты и диагностика сервера.' },
  { id: 'studio.access', category: 'studio', label: 'Студия (API)', description: 'Мутации в /api/studio (кроме муз. служения).' },
  { id: 'studio.catalog_create', category: 'studio', label: 'Добавление песен', description: 'Создание записей в каталоге песен.' },
  { id: 'studio.catalog_edit', category: 'studio', label: 'Редактирование песен', description: 'Правка песен в каталоге.' },
  { id: 'studio.catalog_delete', category: 'studio', label: 'Удаление из каталога', description: 'Удаление песен из общего каталога.' },
  { id: 'planner.manage', category: 'planner', label: 'Управление планами', description: 'Создание и изменение планов служений.' },
  {
    id: 'calendar.collection_coordinator',
    category: 'calendar',
    label: 'Координатор сбора',
    description: 'Заявки на сбор нужд и связанные действия (или флаг координатора).',
  },
  {
    id: 'calendar.dashboard_notes',
    category: 'calendar',
    label: 'Заметки координатора на главной',
    description: 'Срочная молитва и объявления на дашборде.',
  },
  {
    id: 'calendar.prayer_need_improve',
    category: 'calendar',
    label: 'Улучшение текста нужды',
    description: 'AI-улучшение формулировок молитвенных нужд.',
  },
  { id: 'broadcast.manage', category: 'broadcast', label: 'Трансляции', description: 'Запуск и настройка трансляций.' },
  { id: 'content.posts_create', category: 'content', label: 'Публикации', description: 'Создание постов на личной странице.' },
] as const;

export type AppPermissionId = (typeof APP_PERMISSION_DEFS)[number]['id'];

export const APP_PERMISSION_IDS: readonly AppPermissionId[] = APP_PERMISSION_DEFS.map((d) => d.id);

export type RolePermissionMap = Record<AppPermissionId, boolean>;

export type RolePermissionsByRole = Record<AppRole, RolePermissionMap>;

export interface RolePermissionsSettingsDocument {
  roles: RolePermissionsByRole;
}

const SECTION_PERMISSION_PREFIX = 'section.' as const;

export function sectionPermissionId(sectionId: AppSectionId): AppPermissionId {
  return `section.${sectionId}` as AppPermissionId;
}

function emptyMap(): RolePermissionMap {
  const out = {} as RolePermissionMap;
  for (const id of APP_PERMISSION_IDS) {
    out[id] = false;
  }
  return out;
}

function grant(map: RolePermissionMap, ids: AppPermissionId[]): void {
  for (const id of ids) {
    map[id] = true;
  }
}

/** Права по умолчанию — соответствуют текущей логике приложения. */
export function defaultRolePermissionsSettings(): RolePermissionsSettingsDocument {
  const roles = {} as RolePermissionsByRole;
  for (const roleId of APP_ROLE_IDS) {
    roles[roleId] = emptyMap();
  }

  const sectionVis = defaultSectionVisibilitySettings();
  for (const sectionId of APP_SECTION_IDS) {
    const permId = sectionPermissionId(sectionId);
    const allowed = sectionVis.sections[sectionId].roles;
    for (const roleId of allowed) {
      roles[roleId][permId] = true;
    }
  }

  const memberLike: AppPermissionId[] = [
    'content.posts_create',
    'calendar.prayer_need_improve',
  ];
  for (const roleId of ['member', 'pastor', 'minister', 'musician', 'editor'] as AppRole[]) {
    grant(roles[roleId], memberLike);
  }

  grant(roles.minister, ['planner.manage', 'broadcast.manage', 'calendar.dashboard_notes']);
  grant(roles.musician, [
    'studio.access',
    'studio.catalog_create',
    'studio.catalog_edit',
    'studio.catalog_delete',
  ]);
  grant(roles.editor, ['studio.catalog_create', 'studio.catalog_edit', 'studio.catalog_delete']);

  grant(roles.parishioner, ['section.messenger', 'content.posts_create']);

  const adminPerms = [...APP_PERMISSION_IDS];
  grant(roles.admin, adminPerms);

  return { roles };
}

function isPermissionId(raw: unknown): raw is AppPermissionId {
  return typeof raw === 'string' && (APP_PERMISSION_IDS as readonly string[]).includes(raw);
}

export function normalizeRolePermissionsSettings(raw: unknown): RolePermissionsSettingsDocument {
  const defaults = defaultRolePermissionsSettings();
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }
  const input = raw as { roles?: unknown };
  if (!input.roles || typeof input.roles !== 'object') {
    return defaults;
  }
  const src = input.roles as Record<string, unknown>;
  const out = { ...defaults.roles };

  for (const roleId of APP_ROLE_IDS) {
    const roleRaw = src[roleId];
    const base = { ...defaults.roles[roleId] };
    if (!roleRaw || typeof roleRaw !== 'object') {
      out[roleId] = base;
      continue;
    }
    const permSrc = roleRaw as Record<string, unknown>;
    for (const permId of APP_PERMISSION_IDS) {
      const v = permSrc[permId];
      if (typeof v === 'boolean') {
        base[permId] = v;
      }
    }
    if (roleId === 'admin') {
      grant(base, ['admin.panel', 'admin.users_manage']);
    }
    out[roleId] = base;
  }

  return { roles: out };
}

export function roleHasPermission(
  doc: RolePermissionsSettingsDocument,
  userRoles: AppRole[],
  permissionId: AppPermissionId,
): boolean {
  const normalized = normalizeAppRolesForCheck(userRoles);
  for (const role of normalized) {
    if (doc.roles[role]?.[permissionId]) {
      return true;
    }
  }
  return false;
}

function normalizeAppRolesForCheck(roles: AppRole[]): AppRole[] {
  const out: AppRole[] = [];
  for (const r of roles) {
    if (!out.includes(r)) out.push(r);
    if (r === 'parishioner' && !out.includes('member')) {
      /* parishioner inherits section.member rules via section visibility, not here */
    }
  }
  return out.length > 0 ? out : ['member'];
}

/** Роли, у которых включено право на раздел (для синхронизации section_visibility). */
export function rolesWithSectionPermission(
  doc: RolePermissionsSettingsDocument,
  sectionId: AppSectionId,
): AppRole[] {
  const permId = sectionPermissionId(sectionId);
  return APP_ROLE_IDS.filter((role) => Boolean(doc.roles[role]?.[permId]));
}

export function isSectionPermissionKey(id: AppPermissionId): boolean {
  return id.startsWith(SECTION_PERMISSION_PREFIX);
}

export function parseSectionPermissionKey(id: AppPermissionId): AppSectionId | null {
  if (!isSectionPermissionKey(id)) return null;
  const sectionId = id.slice(SECTION_PERMISSION_PREFIX.length) as AppSectionId;
  return (APP_SECTION_IDS as readonly string[]).includes(sectionId) ? sectionId : null;
}

export function permissionDefById(id: AppPermissionId) {
  return APP_PERMISSION_DEFS.find((d) => d.id === id);
}
