import type { ServicePlanMailingDestinations } from '../api';

export const Q_TG = ['admin', 'telegram', 'settings'] as const;
export const Q_TG_DISPATCH = ['admin', 'telegram', 'dispatch-settings'] as const;
export const Q_TG_RECIPIENTS = ['admin', 'telegram', 'recipients'] as const;
export const Q_TG_MAILING_CHATS = ['admin', 'telegram', 'mailing-messenger-chats'] as const;
export const Q_TG_CHATS = ['admin', 'telegram', 'chats'] as const;

/** Sub-section within `/admin?tab=telegram`. */
export type TgSection = 'overview' | 'bot' | 'chats' | 'prayer' | 'program';

export type ProgramPanel = 'mailing' | 'published';

export const TG_SECTIONS: Array<{
  id: TgSection;
  label: string;
  hint: string;
}> = [
  { id: 'overview', label: 'Обзор', hint: 'Статус и быстрые действия' },
  { id: 'bot', label: 'Бот', hint: 'Токен и прокси' },
  { id: 'chats', label: 'Чаты', hint: 'Реестр и роли' },
  { id: 'prayer', label: 'Молитва', hint: 'Текст и личная рассылка' },
  { id: 'program', label: 'Программа', hint: 'Авторассылки служения' },
];

export const PROGRAM_PANELS: Array<{
  id: ProgramPanel;
  step: string;
  title: string;
  hint: string;
}> = [
  {
    id: 'mailing',
    step: '1',
    title: 'Плановая рассылка',
    hint: 'По расписанию в выбранные Telegram и чаты приложения',
  },
  {
    id: 'published',
    step: '2',
    title: 'При публикации',
    hint: 'Уведомление в выбранные чаты, когда программа готова',
  },
];

export const WEEKDAY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'Понедельник' },
  { value: 2, label: 'Вторник' },
  { value: 3, label: 'Среда' },
  { value: 4, label: 'Четверг' },
  { value: 5, label: 'Пятница' },
  { value: 6, label: 'Суббота' },
  { value: 0, label: 'Воскресенье' },
];

/** Совпадает с DEFAULT_SERVICE_PLAN_MONDAY_MAILING_TEMPLATE на бэкенде. */
export const DEFAULT_PROGRAM_MAILING_TEMPLATE = [
  '{{sunday_heading}}',
  '1. Проповедник — {{preacher}}',
  '{{sermon_topic_block}}{{sermon_scripture_block}}2. Группа прославления — {{music}}, в среду или ранее нужно внести в программу гимны и порядок куплетов и припевов для каждой песни.',
  '3. Стих — {{poem}}, в среду или ранее нужно сказать, будет стих или нет, если будет, то нужно прислать:',
  '    1. Чтец',
  '    2. Название',
  '    3. Автор',
  '    4. Текст/тема',
  '4. {{choir_line}}',
  '5. Ведущий — {{leader}}, в четверг нужно будет приступить к формированию программы.',
  '6. Проповедник — {{preacher}}, в четверг нужно предоставить информацию по проповеди для трансляции: название, тезисы, тексты Писания (если будут изменения), если есть презентация, то загрузить в блок проповеди файл презентации к воскресенью 8:00 утра.',
  '7. Медиа-команда, с пятницы по субботу готовит все материалы для трансляции.',
  '8. Ссылка на программу: {{share_url}}',
].join('\n');

/** Совпадает с DEFAULT_SERVICE_PLAN_PUBLISHED_TEMPLATE на бэкенде. */
export const DEFAULT_PROGRAM_PUBLISHED_TEMPLATE = [
  'Финальная программа служения на {{date_long}} готова',
  '',
  '{{share_url}}',
].join('\n');

export const DEFAULT_PROGRAM_PUBLISHED_BUTTON_TEXT = 'Открыть программу';

export function emptyDestinations(): ServicePlanMailingDestinations {
  return { telegram_chat_ids: [], messenger_conversation_ids: [] };
}

export function normalizeDestinations(
  raw: ServicePlanMailingDestinations | null | undefined,
): ServicePlanMailingDestinations {
  if (!raw) return emptyDestinations();
  return {
    telegram_chat_ids: Array.isArray(raw.telegram_chat_ids)
      ? raw.telegram_chat_ids.map(String).map((s) => s.trim()).filter(Boolean)
      : [],
    messenger_conversation_ids: Array.isArray(raw.messenger_conversation_ids)
      ? raw.messenger_conversation_ids.map(String).map((s) => s.trim()).filter(Boolean)
      : [],
  };
}

export function parseTgSection(value: string | null | undefined): TgSection {
  if (
    value === 'overview' ||
    value === 'bot' ||
    value === 'chats' ||
    value === 'prayer' ||
    value === 'program'
  ) {
    return value;
  }
  // Legacy deep-links / bookmarks from the previous IA
  if (value === 'registry') return 'chats';
  if (value === 'dispatch') return 'prayer';
  return 'overview';
}

export function parseProgramPanel(value: string | null | undefined): ProgramPanel {
  return value === 'published' ? 'published' : 'mailing';
}
