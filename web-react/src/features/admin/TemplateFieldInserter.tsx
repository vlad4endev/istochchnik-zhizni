import { useEffect, useMemo, useRef, useState } from 'react';

export type TemplateFieldItem = {
  token: string;
  /** Короткое понятное название на русском */
  label: string;
  /** Что получится в сообщении */
  example?: string;
};

export type TemplateFieldGroup = {
  id: string;
  title: string;
  items: TemplateFieldItem[];
};

export const PRAYER_TEMPLATE_FIELD_GROUPS: TemplateFieldGroup[] = [
  {
    id: 'main',
    title: 'Основное',
    items: [
      { token: '{{date}}', label: 'Дата', example: '27 июля 2026' },
      { token: '{{member_name}}', label: 'Имя человека дня' },
      {
        token: '{{member_prayer_request_bullets}}',
        label: 'Просьба о молитве списком',
        example: '- пункт\n- пункт',
      },
      { token: '{{member_prayer_request}}', label: 'Просьба о молитве целиком' },
    ],
  },
  {
    id: 'first',
    title: 'Первая тема',
    items: [
      { token: '{{theme_title}}', label: 'Название темы' },
      { token: '{{theme_bible_verse}}', label: 'Библейский стих' },
      { token: '{{theme_prayer_points}}', label: 'Пункты молитвы' },
      { token: '{{ministry_title}}', label: 'Название служения' },
      { token: '{{ministry_prayer_points}}', label: 'Нужды служения' },
      { token: '{{backslider_name}}', label: 'Имя отпавшего' },
    ],
  },
  {
    id: 'blocks',
    title: 'Готовые блоки',
    items: [
      { token: '{{all_themes_block}}', label: 'Все темы молитвы' },
      { token: '{{all_ministries_block}}', label: 'Все служения и нужды' },
      { token: '{{all_backsliders_inline}}', label: 'Все отпавшие через запятую' },
    ],
  },
];

export const PROGRAM_TEMPLATE_FIELD_GROUPS: TemplateFieldGroup[] = [
  {
    id: 'frequent',
    title: 'Частое',
    items: [
      { token: '{{sunday_heading}}', label: 'Заголовок дня', example: 'Воскресенье — 26 июля' },
      { token: '{{preacher}}', label: 'Проповедник', example: '@ник или имя' },
      { token: '{{music}}', label: 'Группа прославления' },
      { token: '{{poem}}', label: 'Ответственный за стих' },
      { token: '{{leader}}', label: 'Ведущий' },
      {
        token: '{{sermon_topic_block}}',
        label: 'Строка «Тема: …»',
        example: 'Тема: «…» (скрывается, если пусто)',
      },
      {
        token: '{{sermon_scripture_block}}',
        label: 'Строка «Текст: …»',
        example: 'Текст: … (скрывается, если пусто)',
      },
      { token: '{{choir_line}}', label: 'Фраза про хор', example: 'Хор петь не будет.' },
      { token: '{{share_url}}', label: 'Ссылка на программу' },
    ],
  },
  {
    id: 'people',
    title: 'Люди',
    items: [
      { token: '{{preacher}}', label: 'Проповедник (@ник или имя)' },
      { token: '{{preacher_name}}', label: 'Проповедник — только имя' },
      { token: '{{music}}', label: 'Прославление (@ник или имя)' },
      { token: '{{music_name}}', label: 'Прославление — только имя' },
      { token: '{{poem}}', label: 'Ответственный за стих (@ник или имя)' },
      { token: '{{poem_name}}', label: 'Ответственный за стих — имя' },
      { token: '{{leader}}', label: 'Ведущий (@ник или имя)' },
      { token: '{{leader_name}}', label: 'Ведущий — только имя' },
    ],
  },
  {
    id: 'sermon',
    title: 'Проповедь',
    items: [
      { token: '{{sermon_topic}}', label: 'Тема' },
      { token: '{{sermon_scripture}}', label: 'Писание' },
      { token: '{{sermon_topic_block}}', label: 'Строка «Тема: …» (скрывается, если пусто)' },
      { token: '{{sermon_scripture_block}}', label: 'Строка «Текст: …» (скрывается, если пусто)' },
      { token: '{{sermon_title}}', label: 'Название из «Мои проповеди»' },
      { token: '{{sermon_title_block}}', label: 'Строка «Название: …»' },
      { token: '{{sermon_notes}}', label: 'Заметки в блоке проповеди' },
      { token: '{{sermon_body}}', label: 'Текст конспекта' },
      { token: '{{sermon_body_excerpt}}', label: 'Краткий фрагмент конспекта' },
      { token: '{{sermon_presentation}}', label: 'Имя файла презентации' },
      { token: '{{sermon_presentation_url}}', label: 'Ссылка на презентацию' },
      { token: '{{sermon_for_broadcast}}', label: 'Готовый блок для медиа' },
      { token: '{{sermon_block}}', label: 'Сводка по проповеди' },
    ],
  },
  {
    id: 'poem',
    title: 'Стих и хор',
    items: [
      { token: '{{choir_line}}', label: 'Фраза про хор' },
      { token: '{{poem_reader}}', label: 'Чтец' },
      { token: '{{poem_reader_name}}', label: 'Чтец — только имя' },
      { token: '{{poem_author}}', label: 'Автор стиха' },
      { token: '{{poem_theme}}', label: 'Тема стиха' },
      { token: '{{poem_text}}', label: 'Текст стиха' },
      { token: '{{poem_block}}', label: 'Сводка по стиху' },
    ],
  },
  {
    id: 'media',
    title: 'Песни и медиа',
    items: [
      { token: '{{songs_list}}', label: 'Список песен' },
      { token: '{{songs_inline}}', label: 'Песни через запятую' },
      { token: '{{media_team}}', label: 'Медиа-команда списком' },
      { token: '{{media_team_inline}}', label: 'Медиа-команда через запятую' },
      { token: '{{media_team_or_default}}', label: 'Медиа-команда или стандартный текст' },
    ],
  },
  {
    id: 'links',
    title: 'Дата и ссылки',
    items: [
      { token: '{{sunday_heading}}', label: 'Заголовок дня', example: 'Воскресенье — 26 июля' },
      { token: '{{date_short}}', label: 'Дата коротко', example: '26.07.2026' },
      { token: '{{date_long}}', label: 'Дата полностью', example: '26 июля 2026 г.' },
      { token: '{{start_time}}', label: 'Время начала', example: '10:00' },
      { token: '{{status_ru}}', label: 'Статус', example: 'черновик' },
      { token: '{{notes}}', label: 'Заметки к программе' },
      { token: '{{share_url}}', label: 'Публичная ссылка' },
      { token: '{{edit_url}}', label: 'Ссылка для редактирования' },
    ],
  },
];

/** Поля для сценариев Telegram-рассылки координаторам сбора нужд. */
export const COORDINATOR_TEMPLATE_FIELD_GROUPS: TemplateFieldGroup[] = [
  {
    id: 'week',
    title: 'Неделя',
    items: [
      {
        token: '{{week_range}}',
        label: 'Неделя с — по',
        example: '28 июля — 3 августа',
      },
      { token: '{{week_from}}', label: 'Начало недели', example: '28 июля' },
      { token: '{{week_to}}', label: 'Конец недели', example: '3 августа' },
      { token: '{{week_label}}', label: '«эту / следующую»', example: 'следующую' },
      { token: '{{cycle_index}}', label: 'Номер молитвенного цикла', example: '12' },
    ],
  },
  {
    id: 'people',
    title: 'Координатор и участники',
    items: [
      { token: '{{coordinator_name}}', label: 'Имя координатора' },
      {
        token: '{{participants}}',
        label: 'Назначенные участники',
        example: 'Иван, Мария',
      },
      {
        token: '{{participants_list}}',
        label: 'Участники списком',
        example: '• Иван\n• Мария',
      },
      { token: '{{participants_count}}', label: 'Число участников', example: '3' },
      {
        token: '{{participants_with_dates}}',
        label: 'Участники с датами в цикле',
        example: '• Иван — Понедельник, 28 июля',
      },
      {
        token: '{{cycle_schedule}}',
        label: 'Дни цикла координатора',
        example: 'Понедельник, 28 июля: Иван',
      },
    ],
  },
  {
    id: 'reminder',
    title: 'Напоминание о нужде',
    items: [
      { token: '{{member_name}}', label: 'Участник дня' },
      { token: '{{date_long}}', label: 'Дата полностью', example: 'Понедельник, 28 июля' },
      { token: '{{date_short}}', label: 'Дата коротко', example: '28 июля' },
      { token: '{{weekday_cap}}', label: 'День недели', example: 'Понедельник' },
      { token: '{{date}}', label: 'Дата YYYY-MM-DD', example: '2026-07-28' },
      {
        token: '{{coordinator_name}}',
        label: 'Ответственный координатор',
      },
      { token: '{{title}}', label: 'Заголовок сценария' },
      { token: '{{cycle_index}}', label: 'Номер цикла' },
    ],
  },
  {
    id: 'assignment',
    title: 'Одно назначение',
    items: [
      { token: '{{member_name}}', label: 'Назначенный участник' },
      {
        token: '{{member_cycle_weekday}}',
        label: 'День участника в цикле',
        example: 'Понедельник',
      },
      {
        token: '{{member_cycle_date}}',
        label: 'Дата участника в цикле',
        example: '28 июля',
      },
      {
        token: '{{member_cycle_date_long}}',
        label: 'Дата участника полностью',
        example: 'Понедельник, 28 июля',
      },
      { token: '{{actor}}', label: 'Кто назначил', example: 'Пастор' },
      { token: '{{coordinator_name}}', label: 'Имя координатора' },
      { token: '{{week_range}}', label: 'Неделя с — по' },
      { token: '{{title}}', label: 'Заголовок' },
      { token: '{{body}}', label: 'Стандартный текст (как в push)' },
    ],
  },
  {
    id: 'list',
    title: 'Общий список',
    items: [
      {
        token: '{{assignments_block}}',
        label: 'Полный список по координаторам',
        example: 'Иван:\n  • Мария — …',
      },
      {
        token: '{{cycle_week_schedule}}',
        label: 'Все дни недели цикла',
        example: 'Понедельник, 28 июля: …',
      },
      { token: '{{all_participants}}', label: 'Все участники недели' },
      { token: '{{all_coordinators}}', label: 'Все координаторы' },
    ],
  },
];

/**
 * Выбор поля для вставки в шаблон: русские названия, вкладки, поиск.
 * Технические {{токены}} не показываем в списке — только смысл.
 */
export function TemplateFieldInserter({
  groups,
  onInsert,
  searchPlaceholder = 'Найти: проповедник, тема, ссылка…',
}: {
  groups: TemplateFieldGroup[];
  onInsert: (token: string) => void;
  searchPlaceholder?: string;
}) {
  const [activeId, setActiveId] = useState(groups[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [justInserted, setJustInserted] = useState<string | null>(null);
  const [showTech, setShowTech] = useState(false);
  const feedbackTimer = useRef<number | null>(null);

  const activeGroup = groups.find((g) => g.id === activeId) ?? groups[0];
  const q = query.trim().toLowerCase();

  const visibleItems = useMemo(() => {
    if (!q) return activeGroup?.items ?? [];
    const all = groups.flatMap((g) => g.items);
    const seen = new Set<string>();
    return all.filter((item) => {
      if (seen.has(item.token)) return false;
      const hay = `${item.label} ${item.token} ${item.example ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
      seen.add(item.token);
      return true;
    });
  }, [activeGroup, groups, q]);

  const handleInsert = (item: TemplateFieldItem) => {
    onInsert(item.token);
    setJustInserted(item.label);
    if (feedbackTimer.current != null) window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setJustInserted(null), 1600);
  };

  useEffect(() => {
    return () => {
      if (feedbackTimer.current != null) window.clearTimeout(feedbackTimer.current);
    };
  }, []);

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <div className="border-b border-stone-100 px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-stone-900">Добавить в текст</p>
            <p className="mt-0.5 text-xs text-stone-500">
              Поставьте курсор в шаблон выше и выберите поле — подставится само.
            </p>
          </div>
          {justInserted ? (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
              Вставлено: {justInserted}
            </span>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 outline-none placeholder:text-stone-400 focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
          />
          <button
            type="button"
            onClick={() => setShowTech((v) => !v)}
            className="shrink-0 rounded-lg border border-stone-200 px-2.5 py-2 text-xs font-medium text-stone-500 hover:bg-stone-50 hover:text-stone-800"
            title="Показать технические коды полей"
          >
            {showTech ? 'Скрыть коды' : 'Коды'}
          </button>
        </div>
      </div>

      {!q ? (
        <div className="flex gap-1.5 overflow-x-auto border-b border-stone-100 px-3 py-2 sm:px-4">
          {groups.map((group) => {
            const active = group.id === activeGroup?.id;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => setActiveId(group.id)}
                className={[
                  'shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                  active
                    ? 'bg-stone-900 text-white'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-900',
                ].join(' ')}
              >
                {group.title}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="border-b border-stone-100 px-3 py-2 text-xs text-stone-500 sm:px-4">
          Поиск по всем полям
          {visibleItems.length > 0 ? ` · ${visibleItems.length}` : ''}
        </div>
      )}

      <div className="max-h-64 space-y-0.5 overflow-y-auto p-1.5 sm:max-h-72 sm:p-2">
        {visibleItems.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-stone-500">Ничего не найдено</p>
        ) : (
          visibleItems.map((item) => (
            <button
              key={`${item.token}-${item.label}`}
              type="button"
              onClick={() => handleInsert(item)}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-stone-900">{item.label}</span>
                {item.example ? (
                  <span className="mt-0.5 block truncate text-xs text-stone-500">
                    например: {item.example}
                  </span>
                ) : null}
                {showTech ? (
                  <code className="mt-1 block truncate font-mono text-[11px] text-stone-400">
                    {item.token}
                  </code>
                ) : null}
              </span>
              <span className="shrink-0 rounded-md bg-stone-100 px-2 py-1 text-[11px] font-semibold text-stone-600">
                Вставить
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
