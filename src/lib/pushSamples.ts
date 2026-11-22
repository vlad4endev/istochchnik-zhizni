/**
 * Примеры напоминаний для проверки на своём устройстве («Примеры напоминаний» в приложении).
 * Поля `url`, `type`, `kind` совпадают с теми, что шлёт notificationRulesRunner и сервисы,
 * поэтому по нажатию приложение ведёт туда же, куда и по настоящему уведомлению.
 */
export type PushSample = {
  id: string;
  label: string;
  title: string;
  body: string;
  data: Record<string, string>;
};

export const PUSH_SAMPLES: readonly PushSample[] = [
  {
    id: 'prayer_reminder',
    label: 'Напоминание помолиться',
    title: 'Время молитвы',
    body: 'Сегодня вы молитесь за брата или сестру из цикла.',
    data: { url: '/prayer', kind: 'prayer_reminder', type: 'prayer_reminder', tag: 'rule-prayer_reminder' },
  },
  {
    id: 'birthday_today',
    label: 'День рождения сегодня',
    title: 'Дни рождения сегодня',
    body: 'Сегодня день рождения у Анны Орловой.',
    data: { url: '/dashboard', kind: 'birthday_today', type: 'birthday_today', tag: 'rule-birthday_today' },
  },
  {
    id: 'broadcast_start',
    label: 'Трансляция началась',
    title: 'Трансляция',
    body: 'Трансляция началась — присоединяйтесь к эфиру.',
    data: { url: '/dashboard', kind: 'broadcast', type: 'broadcast_start', tag: 'rule-broadcast_start' },
  },
  {
    id: 'new_sermon',
    label: 'Новая проповедь',
    title: 'Новая проповедь',
    body: 'Вышла новая проповедь.',
    data: { url: '/sermons', kind: 'new_sermon', type: 'new_sermon', tag: 'rule-new_sermon' },
  },
  {
    id: 'new_event',
    label: 'Новое мероприятие',
    title: 'Новое мероприятие',
    body: 'Добавлено мероприятие: молодёжная встреча.',
    data: { url: '/dashboard', kind: 'new_event', type: 'new_event', tag: 'rule-new_event' },
  },
  {
    id: 'feed_new_post',
    label: 'Новая публикация в ленте',
    title: 'Анна Орлова',
    body: 'Поделилась новостью в ленте.',
    data: { url: '/feed', kind: 'feed_new_post', type: 'feed_new_post', tag: 'feed-sample' },
  },
  {
    id: 'media_reminder',
    label: 'Напоминание о служении завтра',
    title: '⏰ Напоминание о служении завтра',
    body: 'Завтра вы служите в медиа-команде.',
    data: { url: '/media-schedule/my', type: 'media_reminder', tag: 'media-reminder-sample' },
  },
  {
    id: 'coordinator_week_digest',
    label: 'Куратору: итоги недели',
    title: 'Молитвенный цикл',
    body: 'Назначения на следующую неделю: проверьте нужды.',
    data: { url: '/calendar', kind: 'coordinator_week_digest', type: 'coordinator_week_digest', tag: 'rule-coordinator_week_digest' },
  },
  {
    id: 'sermon_feedback_ready',
    label: 'Проповеднику: комментарии к проповеди',
    title: 'Комментарии к проповеди',
    body: 'Слушатели оставили комментарии к вашей проповеди.',
    data: { url: '/service-plan/sermon-comments/sample', type: 'sermon_feedback_ready', tag: 'sermon-feedback-sample' },
  },
] as const;

export function findPushSample(id: unknown): PushSample | undefined {
  if (typeof id !== 'string') return undefined;
  return PUSH_SAMPLES.find((s) => s.id === id);
}
