import type { IconType } from 'react-icons';
import {
  LuBell,
  LuCalendarDays,
  LuCalendarRange,
  LuHistory,
  LuInbox,
  LuPalette,
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
    | 'journal'
    | 'notifications'
    | 'telegram';
  label: string;
  Icon: IconType;
  short: string;
  description: string;
}

/** Вкладки админ-панели: порядок и смысл совпадают с разделами приложения. */
export const ADMIN_TABS: readonly AdminTabConfig[] = [
  {
    id: 'members',
    label: 'Участники',
    Icon: LuUsersRound,
    short: 'Люди',
    description: 'Карточки, роли, доступ и разовая дата в цикле молитв.',
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
    Icon: LuCalendarDays,
    short: 'Молитва',
    description:
      'Дата старта цикла, кто в ежедневной очереди на молитву, глобальные темы, служения и отступники в приложении.',
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
    description: 'Готовые роли и направления при добавлении участника.',
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
    description: 'Скрытый админ-модуль для отправки молитв и недельных списков в Telegram.',
  },
];

export type AdminTabId = (typeof ADMIN_TABS)[number]['id'];
