import type { IconType } from 'react-icons';
import {
  LuBell,
  LuCalendarDays,
  LuCalendarRange,
  LuChartColumnBig,
  LuHistory,
  LuInbox,
  LuLink2,
  LuPalette,
  LuPanelsTopLeft,
  LuShield,
  LuSend,
  LuSparkles,
  LuUsersRound,
} from 'react-icons/lu';

export interface AdminTabConfig {
  id:
    | 'members'
    | 'requests'
    | 'calendar'
    | 'events'
    | 'templates'
    | 'project'
    | 'sections'
    | 'roles'
    | 'journal'
    | 'notifications'
    | 'telegram'
    | 'integrations'
    | 'diagnostics';
  /** Заголовок раздела в контенте и полная подпись для подсказки в сайдбаре */
  label: string;
  /** Короткая подпись в левом меню (если не задано — показывается `label`) */
  navLabel?: string;
  Icon: IconType;
  short: string;
  description: string;
}

/** Вкладки админ-панели: порядок и смысл совпадают с разделами приложения. */
export const ADMIN_TABS: readonly AdminTabConfig[] = [
  {
    id: 'members',
    label: 'Пользователи',
    Icon: LuUsersRound,
    short: 'Люди',
    description: 'Карточки пользователей, роли, доступ и разовая дата в цикле молитв.',
  },
  {
    id: 'requests',
    label: 'Заявки',
    Icon: LuInbox,
    short: 'Вход',
    description: 'Одобрение регистраций, когда ФИО и телефон не совпали с карточкой автоматически.',
  },
  {
    id: 'calendar',
    label: 'Молитвенный календарь',
    navLabel: 'Молитв. календарь',
    Icon: LuCalendarDays,
    short: 'Молитва',
    description:
      'Дата старта цикла, члены церкви в ежедневной очереди на молитву, глобальные темы, служения и отступники в приложении.',
  },
  {
    id: 'events',
    label: 'События',
    Icon: LuCalendarRange,
    short: 'Анонсы',
    description: 'Управление событиями, которые отображаются в дашборде.',
  },
  {
    id: 'templates',
    label: 'Шаблоны',
    Icon: LuSparkles,
    short: 'Подсказки',
    description: 'Готовые роли и направления при добавлении пользователя.',
  },
  {
    id: 'project',
    label: 'Оформление',
    Icon: LuPalette,
    short: 'Вид',
    description:
      'Название и логотип в меню хранятся только в этом браузере — тот же формат, что в мобильном приложении.',
  },
  {
    id: 'sections',
    label: 'Разделы приложения',
    navLabel: 'Разделы',
    Icon: LuPanelsTopLeft,
    short: 'Доступ',
    description: 'Управление видимостью разделов приложения для ролей пользователей.',
  },
  {
    id: 'roles',
    label: 'Права ролей',
    navLabel: 'Роли',
    Icon: LuShield,
    short: 'RBAC',
    description: 'Детальная настройка функций для каждой роли: разделы, студия, админка и др.',
  },
  {
    id: 'journal',
    label: 'Журнал',
    Icon: LuHistory,
    short: 'Логи',
    description: 'Логи процессов, HTTP-запросов и ошибок сервера для быстрой диагностики проблем.',
  },
  {
    id: 'notifications',
    label: 'Уведомления',
    Icon: LuBell,
    short: 'Пуш',
    description:
      'Расписание напоминаний: молитва, дни рождения, трансляция, обновления, проповеди и события — время, важность и периодичность.',
  },
  {
    id: 'telegram',
    label: 'Telegram',
    Icon: LuSend,
    short: 'Бот',
    description: 'Бот, чаты, тексты молитвы и программы служения, авторассылки.',
  },
  {
    id: 'diagnostics',
    label: 'Диагностика проекта',
    navLabel: 'Диагностика',
    Icon: LuChartColumnBig,
    short: 'Диагностика',
    description:
      'Интеграционные автотесты (API, БД, безопасность) и полный срез: метрики, скан проекта, журнал и AI-аудит.',
  },
  {
    id: 'integrations',
    label: 'Интеграции',
    Icon: LuLink2,
    short: 'SMS + ИИ',
    description:
      'Управление внешними интеграциями: SMS.ru для восстановления пароля и ИИ-модели для серверного агента.',
  },
];

export type AdminTabId = (typeof ADMIN_TABS)[number]['id'];
