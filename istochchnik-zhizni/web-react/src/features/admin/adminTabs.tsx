import type { IconType } from 'react-icons';
import { LuCalendarDays, LuInbox, LuPalette, LuSparkles, LuUsersRound } from 'react-icons/lu';

export interface AdminTabConfig {
  id: 'members' | 'requests' | 'calendar' | 'templates' | 'project';
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
    label: 'Календарь',
    Icon: LuCalendarDays,
    short: 'Цикл',
    description: 'Старт недельного цикла и общие темы, служения, имена для молитвы.',
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
];

export type AdminTabId = (typeof ADMIN_TABS)[number]['id'];
