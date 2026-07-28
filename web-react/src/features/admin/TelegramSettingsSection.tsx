import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LuCheck, LuCircleAlert, LuClock, LuSend } from 'react-icons/lu';

import {
  apiErrorMessage,
  fetchTelegramDispatchRecipients,
  fetchTelegramDispatchSettings,
  fetchTelegramSettings,
  humanizeTelegramError,
  patchTelegramDispatchSettings,
  patchTelegramSettings,
  runServicePlanMondayMailing,
  runTelegramDispatchNow,
  sendTelegramMessage,
  testTelegramConnection,
  testTelegramProxy,
  type TelegramDispatchRecipient,
  type TelegramDispatchSettingsResponse,
  type TelegramSettingsResponse,
} from './api';

const Q_TG = ['admin', 'telegram', 'settings'] as const;
const Q_TG_DISPATCH = ['admin', 'telegram', 'dispatch-settings'] as const;
const Q_TG_RECIPIENTS = ['admin', 'telegram', 'recipients'] as const;

type TgTab = 'bot' | 'chats' | 'prayer' | 'program' | 'dispatch';

const TABS: { id: TgTab; label: string }[] = [
  { id: 'bot', label: 'Бот' },
  { id: 'chats', label: 'Чаты' },
  { id: 'prayer', label: 'Молитва' },
  { id: 'program', label: 'Программа' },
  { id: 'dispatch', label: 'Рассылка' },
];

type PlaceholderItem = {
  token: string;
  label: string;
  example?: string;
};

type PlaceholderGroup = {
  title: string;
  items: PlaceholderItem[];
};

const PRAYER_PLACEHOLDER_GROUPS: PlaceholderGroup[] = [
  {
    title: 'Дата и человек дня',
    items: [
      { token: '{{date}}', label: 'Дата молитвы (по-русски)', example: '27 июля 2026' },
      { token: '{{member_name}}', label: 'Имя члена церкви на сегодня' },
      { token: '{{member_prayer_request}}', label: 'Просьба о молитве целиком (текст)' },
      {
        token: '{{member_prayer_request_bullets}}',
        label: 'Просьба о молитве списком (каждый пункт с «-»)',
      },
    ],
  },
  {
    title: 'Первая тема / служение / отпавший',
    items: [
      { token: '{{theme_title}}', label: 'Название первой глобальной темы' },
      { token: '{{theme_bible_verse}}', label: 'Библейский стих первой темы' },
      { token: '{{theme_prayer_points}}', label: 'Пункты молитвы первой темы' },
      { token: '{{ministry_title}}', label: 'Название первого служения' },
      { token: '{{ministry_prayer_points}}', label: 'Нужды первого служения' },
      { token: '{{backslider_name}}', label: 'Имя первого отпавшего в списке' },
    ],
  },
  {
    title: 'Все сразу (блоки)',
    items: [
      { token: '{{all_themes_block}}', label: 'Все глобальные темы молитвы (готовый блок)' },
      { token: '{{all_ministries_block}}', label: 'Все служения и их нужды (готовый блок)' },
      { token: '{{all_backsliders_inline}}', label: 'Все отпавшие через запятую' },
    ],
  },
];

const PROGRAM_PLACEHOLDER_GROUPS: PlaceholderGroup[] = [
  {
    title: 'Дата и программа',
    items: [
      {
        token: '{{sunday_heading}}',
        label: 'Заголовок дня',
        example: 'Воскресенье — 26 июля',
      },
      { token: '{{date}}', label: 'То же, что sunday_heading (алиас)' },
      { token: '{{date_short}}', label: 'Короткая дата', example: '26.07.2026' },
      { token: '{{date_long}}', label: 'Полная дата', example: '26 июля 2026 г.' },
      { token: '{{service_date}}', label: 'Дата YYYY-MM-DD', example: '2026-07-26' },
      { token: '{{start_time}}', label: 'Время начала служения', example: '10:00' },
      { token: '{{status_ru}}', label: 'Статус по-русски', example: 'черновик / опубликована' },
      { token: '{{status}}', label: 'Статус кода', example: 'draft / published' },
      { token: '{{notes}}', label: 'Заметки к программе' },
      { token: '{{template_name}}', label: 'Название шаблона программы' },
      { token: '{{duration_minutes}}', label: 'Длительность программы (минуты)' },
      { token: '{{plan_id}}', label: 'ID программы в базе' },
    ],
  },
  {
    title: 'Люди (роли программы)',
    items: [
      {
        token: '{{preacher}}',
        label: 'Проповедник — имя (не @member-…)',
        example: 'Иван Иванов',
      },
      { token: '{{preacher_name}}', label: 'Проповедник — только имя' },
      {
        token: '{{preacher_mention}}',
        label: 'Проповедник — то же имя (в мессенджере уходит как упоминание)',
      },
      {
        token: '{{music}}',
        label: 'Ответственный за прославление — имя',
        example: 'Николай',
      },
      { token: '{{music_name}}', label: 'Прославление — только имя' },
      { token: '{{music_mention}}', label: 'Прославление — то же имя / упоминание в мессенджере' },
      {
        token: '{{poem}}',
        label: 'Ответственный за стихи — имя (кто заполняет блок, не чтец)',
      },
      { token: '{{poem_name}}', label: 'Ответственный за стихи — имя' },
      { token: '{{poem_mention}}', label: 'Ответственный за стихи — то же имя / упоминание' },
      { token: '{{leader}}', label: 'Ведущий — имя', example: 'Дмитрий' },
      { token: '{{leader_name}}', label: 'Ведущий — только имя' },
      { token: '{{leader_mention}}', label: 'Ведущий — то же имя / упоминание в мессенджере' },
    ],
  },
  {
    title: 'Проповедь',
    items: [
      { token: '{{sermon_title}}', label: 'Название документа проповеди («Мои проповеди»)' },
      {
        token: '{{sermon_title_block}}',
        label: 'Готовая строка «Название: «…»» (пусто, если названия нет)',
      },
      { token: '{{sermon_topic}}', label: 'Тема проповеди (из блока или конспекта)' },
      { token: '{{sermon_scripture}}', label: 'Текст Писания' },
      {
        token: '{{sermon_topic_block}}',
        label: 'Готовая строка «Тема: «…»» (пусто, если темы нет)',
      },
      {
        token: '{{sermon_scripture_block}}',
        label: 'Готовая строка «Текст: …» (пусто, если текста нет)',
      },
      { token: '{{sermon_notes}}', label: 'Заметки в блоке «Проповедь»' },
      {
        token: '{{sermon_body}}',
        label: 'Полный текст/тезисы конспекта из «Мои проповеди»',
      },
      {
        token: '{{sermon_body_excerpt}}',
        label: 'Краткий фрагмент конспекта (до ~500 символов)',
      },
      {
        token: '{{sermon_note_author}}',
        label: 'Автор привязанного конспекта',
      },
      {
        token: '{{sermon_note_url}}',
        label: 'Публичная ссылка на конспект (если опубликован)',
      },
      {
        token: '{{sermon_has_note}}',
        label: 'Есть ли привязанный конспект',
        example: 'да / нет',
      },
      {
        token: '{{sermon_presentation}}',
        label: 'Имя файла презентации (первое вложение)',
      },
      {
        token: '{{sermon_presentation_url}}',
        label: 'Ссылка на презентацию (первое вложение)',
      },
      {
        token: '{{sermon_attachments_list}}',
        label: 'Все вложения проповеди (имя + ссылка, по строкам)',
      },
      {
        token: '{{sermon_attachments_inline}}',
        label: 'Имена вложений через запятую',
      },
      { token: '{{sermon_attachments_count}}', label: 'Число вложений' },
      {
        token: '{{sermon_block}}',
        label: 'Сводка: название, тема, Писание, автор, файлы',
      },
      {
        token: '{{sermon_for_broadcast}}',
        label: 'Готовый блок для медиа: тема, текст, презентация, конспект',
      },
    ],
  },
  {
    title: 'Стих и хор',
    items: [
      { token: '{{choir_line}}', label: 'Готовая фраза про хор', example: 'Хор петь не будет.' },
      { token: '{{choir}}', label: 'То же, что choir_line' },
      { token: '{{poem_reader}}', label: 'Чтец стиха (@ или имя)' },
      { token: '{{poem_reader_name}}', label: 'Чтец стиха — только имя' },
      { token: '{{poem_author}}', label: 'Автор стиха' },
      { token: '{{poem_theme}}', label: 'Тема стиха' },
      { token: '{{poem_text}}', label: 'Текст / заметки блока стиха' },
      {
        token: '{{poem_block}}',
        label: 'Сводка по стиху: чтец, тема, автор, текст',
      },
    ],
  },
  {
    title: 'Песни и медиа',
    items: [
      { token: '{{songs_list}}', label: 'Список песен (нумерованный, по строкам)' },
      { token: '{{songs_inline}}', label: 'Песни через запятую' },
      { token: '{{songs_count}}', label: 'Число песен' },
      {
        token: '{{media_team}}',
        label: 'Медиа-команда списком: «роль — имя»',
      },
      { token: '{{media_team_inline}}', label: 'Медиа-команда через запятую' },
      {
        token: '{{media_team_or_default}}',
        label: 'Медиа-команда или стандартный текст про подготовку',
      },
    ],
  },
  {
    title: 'Ссылки',
    items: [
      { token: '{{share_url}}', label: 'Публичная ссылка на программу' },
      { token: '{{edit_url}}', label: 'Ссылка для редактирования программы' },
    ],
  },
];

function fieldClass() {
  return (
    'w-full rounded-xl border border-stone-200/90 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none ' +
    'focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-stone-400'
  );
}

function btnPrimary(className = '') {
  return `rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:opacity-95 disabled:opacity-50 ${className}`;
}

function btnSecondary(className = '') {
  return `rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 disabled:opacity-50 ${className}`;
}

function normalizeUiString(value: string): string | null {
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function normalizeUiOptionalUpdateString(value: string): string | undefined {
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

function insertAtCursor(
  textarea: HTMLTextAreaElement | null,
  token: string,
  current: string,
  setValue: (next: string) => void,
) {
  if (!textarea) {
    setValue(current + token);
    return;
  }
  const start = textarea.selectionStart ?? current.length;
  const end = textarea.selectionEnd ?? current.length;
  const next = `${current.slice(0, start)}${token}${current.slice(end)}`;
  setValue(next);
  requestAnimationFrame(() => {
    textarea.focus();
    const pos = start + token.length;
    textarea.setSelectionRange(pos, pos);
  });
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50/70 px-4 py-3">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-stone-900">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-stone-500">{hint}</span> : null}
      </span>
      <span className="relative inline-block h-6 w-11 shrink-0">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="absolute inset-0 cursor-pointer rounded-full bg-stone-300 transition-colors peer-checked:bg-[#7B2D3F]" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

function PlaceholderPicker({
  groups,
  onInsert,
  defaultOpen = true,
}: {
  groups: PlaceholderGroup[];
  onInsert: (token: string) => void;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="rounded-xl border border-stone-200 bg-stone-50/90 open:pb-3"
    >
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-stone-900 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-2">
          <span>Подстановки — нажмите, чтобы вставить в шаблон</span>
          <span className="text-xs font-medium text-stone-500">показать / скрыть</span>
        </span>
      </summary>
      <div className="space-y-4 border-t border-stone-200/80 px-3 pt-3 sm:px-4">
        {groups.map((group) => (
          <div key={group.title}>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-500">
              {group.title}
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {group.items.map((item) => (
                <li key={item.token}>
                  <button
                    type="button"
                    onClick={() => onInsert(item.token)}
                    className="flex w-full flex-col items-start gap-1 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-left shadow-sm transition hover:border-primary/40 hover:bg-primary/[0.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    title={`Вставить ${item.token}`}
                  >
                    <code className="rounded-md bg-stone-100 px-2 py-1 font-mono text-[13px] font-semibold text-[#7B2D3F]">
                      {item.token}
                    </code>
                    <span className="text-sm leading-snug text-stone-800">{item.label}</span>
                    {item.example ? (
                      <span className="text-xs text-stone-500">напр.: {item.example}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}

function ChatField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-stone-700">{label}</label>
      <p className="mb-1.5 text-xs text-stone-500">{hint}</p>
      <input
        className={fieldClass()}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="-100…"
        inputMode="numeric"
      />
    </div>
  );
}

export function TelegramSettingsSection() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: Q_TG,
    queryFn: fetchTelegramSettings,
  });
  const dispatchQ = useQuery({
    queryKey: Q_TG_DISPATCH,
    queryFn: fetchTelegramDispatchSettings,
  });
  const recipientsQ = useQuery({
    queryKey: Q_TG_RECIPIENTS,
    queryFn: fetchTelegramDispatchRecipients,
  });

  const [tab, setTab] = useState<TgTab>('bot');
  const [form, setForm] = useState({
    enabled: false,
    bot_token: '',
    prayer_chat_id: '',
    coordinator_chat_id: '',
    default_chat_id: '',
    prayer_template: '',
    service_plan_chat_id: '',
    service_plan_template: '',
    service_plan_published_chat_id: '',
    proxy_enabled: false,
    proxy_url: '',
  });
  const [customText, setCustomText] = useState('');
  const [customChatId, setCustomChatId] = useState('');
  const [dispatchForm, setDispatchForm] = useState<TelegramDispatchSettingsResponse>({
    enabled: false,
    kind: 'daily',
    time_hhmm: '09:00',
    once_at_iso: null,
    once_at_local: null,
    target: 'all',
    member_ids: [],
    last_sent_at_iso: null,
    server_timezone:
      typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'
        : 'UTC',
    last_sent_label: null,
  });
  const [note, setNote] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [showProxyUrl, setShowProxyUrl] = useState(false);
  const prayerTemplateRef = useRef<HTMLTextAreaElement | null>(null);
  const programTemplateRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!data) return;
    setForm({
      enabled: data.enabled,
      bot_token: '',
      prayer_chat_id: data.prayer_chat_id ?? '',
      coordinator_chat_id: data.coordinator_chat_id ?? '',
      default_chat_id: data.default_chat_id ?? '',
      prayer_template: data.prayer_template ?? '',
      service_plan_chat_id: data.service_plan_chat_id ?? '',
      service_plan_template: data.service_plan_template ?? '',
      service_plan_published_chat_id: data.service_plan_published_chat_id ?? '',
      proxy_enabled: data.proxy?.enabled ?? false,
      proxy_url: '',
    });
  }, [data]);

  useEffect(() => {
    if (!dispatchQ.data) return;
    setDispatchForm(dispatchQ.data);
  }, [dispatchQ.data]);

  const saveMut = useMutation({
    mutationFn: () =>
      patchTelegramSettings({
        enabled: form.enabled,
        bot_token: normalizeUiOptionalUpdateString(form.bot_token),
        prayer_chat_id: normalizeUiString(form.prayer_chat_id),
        coordinator_chat_id: normalizeUiString(form.coordinator_chat_id),
        default_chat_id: normalizeUiString(form.default_chat_id),
        prayer_template: normalizeUiString(form.prayer_template),
        service_plan_chat_id: normalizeUiString(form.service_plan_chat_id),
        service_plan_template: normalizeUiString(form.service_plan_template),
        service_plan_published_chat_id: normalizeUiString(form.service_plan_published_chat_id),
        proxy_enabled: form.proxy_enabled,
        proxy_url: normalizeUiOptionalUpdateString(form.proxy_url),
      }),
    onSuccess: (next) => {
      setNote({ type: 'ok', text: 'Настройки сохранены.' });
      qc.setQueryData(Q_TG, next);
      setForm((prev) => ({ ...prev, bot_token: '', proxy_url: '' }));
    },
    onError: (e) =>
      setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось сохранить настройки.') }),
  });

  const clearProxyMut = useMutation({
    mutationFn: () =>
      patchTelegramSettings({
        proxy_enabled: false,
        proxy_url: null,
      }),
    onSuccess: (next) => {
      setNote({ type: 'ok', text: 'Прокси из настроек проекта очищен.' });
      qc.setQueryData(Q_TG, next);
      setForm((prev) => ({ ...prev, proxy_enabled: false, proxy_url: '' }));
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось очистить прокси.') }),
  });

  const sendMut = useMutation({
    mutationFn: (payload: {
      kind: 'prayer_today' | 'next_week' | 'custom' | 'prayer_today_all_members';
      text?: string;
      chat_id?: string;
    }) => sendTelegramMessage(payload),
    onSuccess: (r) => {
      if (r.kind === 'prayer_today_all_members') {
        setNote({
          type: 'ok',
          text: `Рассылка выполнена. Отправлено: ${r.sent_count ?? 0}.`,
        });
        return;
      }
      setNote({ type: 'ok', text: `Отправлено в чат ${r.chat_id}.` });
    },
    onError: (e) =>
      setNote({ type: 'err', text: humanizeTelegramError(e, 'Ошибка отправки в Telegram.') }),
  });

  const saveDispatchMut = useMutation({
    mutationFn: () =>
      patchTelegramDispatchSettings({
        enabled: dispatchForm.enabled,
        kind: dispatchForm.kind,
        time_hhmm: dispatchForm.time_hhmm,
        target: dispatchForm.target,
        member_ids: dispatchForm.member_ids,
        once_at_local: dispatchForm.kind === 'once' ? dispatchForm.once_at_local : null,
      }),
    onSuccess: (next) => {
      setDispatchForm(next);
      qc.setQueryData(Q_TG_DISPATCH, next);
      setNote({ type: 'ok', text: 'Планировщик сохранён.' });
    },
    onError: (e) =>
      setNote({ type: 'err', text: humanizeTelegramError(e, 'Не удалось сохранить планировщик.') }),
  });

  const runDispatchNowMut = useMutation({
    mutationFn: () => runTelegramDispatchNow(),
    onSuccess: (r) => {
      setNote({
        type: 'ok',
        text: `Рассылка отправлена (${r.mode === 'all' ? 'всем' : 'выбранным'}): ${r.sent_count}.`,
      });
      void qc.invalidateQueries({ queryKey: Q_TG_DISPATCH });
    },
    onError: (e) =>
      setNote({ type: 'err', text: humanizeTelegramError(e, 'Не удалось запустить рассылку.') }),
  });

  const testConnectionMut = useMutation({
    mutationFn: () =>
      testTelegramConnection(form.bot_token.trim() ? { bot_token: form.bot_token.trim() } : undefined),
    onSuccess: (r) => {
      const handle = r.username ? `@${r.username}` : `id ${r.id}`;
      const name = r.first_name?.trim() ? r.first_name : 'бот';
      const via =
        r.proxy?.used && r.proxy.url_masked
          ? ` через прокси (${r.proxy.source ?? '?'}: ${r.proxy.url_masked})`
          : ' напрямую';
      const latency = typeof r.latency_ms === 'number' ? ` · ${r.latency_ms} мс` : '';
      setNote({ type: 'ok', text: `Подключение OK: ${handle}, ${name}${via}${latency}.` });
    },
    onError: (e) =>
      setNote({
        type: 'err',
        text: humanizeTelegramError(e, 'Не удалось проверить подключение к Telegram.'),
      }),
  });

  const testProxyMut = useMutation({
    mutationFn: () => {
      const draftUrl = form.proxy_url.trim();
      return testTelegramProxy({
        ...(draftUrl ? { proxy_url: draftUrl } : {}),
        ...(form.bot_token.trim() ? { bot_token: form.bot_token.trim() } : {}),
      });
    },
    onSuccess: (r) => {
      const handle = r.bot.username ? `@${r.bot.username}` : `id ${r.bot.id}`;
      const via =
        r.proxy.used && r.proxy.url_masked
          ? `${r.proxy.source ?? 'прокси'}: ${r.proxy.url_masked}`
          : 'без прокси';
      setNote({
        type: 'ok',
        text: `Прокси OK (${r.latency_ms} мс) · ${via} · бот ${handle}.`,
      });
    },
    onError: (e) => setNote({ type: 'err', text: humanizeTelegramError(e, 'Не удалось проверить прокси.') }),
  });

  const programMailingMut = useMutation({
    mutationFn: () => runServicePlanMondayMailing({ force: true }),
    onSuccess: (r) => {
      const res = r.result;
      if (res.skipped && res.reason === 'no_service_plan') {
        setNote({
          type: 'err',
          text: `Нет программы на ${res.service_date ?? 'ближайшее воскресенье'}.`,
        });
        return;
      }
      if (!res.ok) {
        setNote({
          type: 'err',
          text: `Не удалось отправить (${res.reason ?? 'ошибка'}).`,
        });
        return;
      }
      setNote({
        type: 'ok',
        text: `Программа #${res.plan_id ?? '—'} от ${res.service_date ?? '—'} отправлена: мессенджер ${res.messenger_ok ? '✓' : '—'}, Telegram ${res.telegram_ok ? '✓' : '—'}.`,
      });
    },
    onError: (e) =>
      setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось отправить программу.') }),
  });

  const lastDispatchLabel = useMemo(() => {
    if (dispatchForm.last_sent_label) return dispatchForm.last_sent_label;
    const iso = dispatchForm.last_sent_at_iso;
    if (!iso) return null;
    try {
      return format(new Date(iso), "d MMMM yyyy 'в' HH:mm", { locale: ru });
    } catch {
      return null;
    }
  }, [dispatchForm.last_sent_label, dispatchForm.last_sent_at_iso]);

  if (isLoading || dispatchQ.isLoading || recipientsQ.isLoading) {
    return <div className="h-44 animate-pulse rounded-2xl bg-stone-200/50" />;
  }

  if (error || dispatchQ.error || recipientsQ.error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/80 p-6 text-center">
        <p className="font-semibold text-red-900">Не удалось загрузить настройки Telegram</p>
        <p className="mt-2 text-sm text-red-800">
          {apiErrorMessage(error ?? dispatchQ.error ?? recipientsQ.error, 'Ошибка сети или сервера.')}
        </p>
        <button
          type="button"
          className={btnPrimary('mt-4')}
          onClick={() => {
            void qc.invalidateQueries({ queryKey: Q_TG });
            void qc.invalidateQueries({ queryKey: Q_TG_DISPATCH });
            void qc.invalidateQueries({ queryKey: Q_TG_RECIPIENTS });
          }}
        >
          Обновить
        </button>
      </div>
    );
  }

  const settings = (data ?? {
    enabled: false,
    bot_token_masked: null,
    prayer_chat_id: null,
    coordinator_chat_id: null,
    default_chat_id: null,
    prayer_template: null,
    service_plan_chat_id: null,
    service_plan_template: null,
    service_plan_published_chat_id: null,
    has_bot_token: false,
    proxy: {
      enabled: false,
      url_masked: null,
      has_url: false,
      active_source: null,
      env_configured: false,
    },
  }) satisfies TelegramSettingsResponse;

  const recipientsCount = recipientsQ.data?.length ?? 0;
  const tokenReady = settings.has_bot_token || form.bot_token.trim().length > 0;
  const proxyReady =
    form.proxy_url.trim().length > 0 ||
    (form.proxy_enabled && settings.proxy.has_url) ||
    settings.proxy.active_source != null;
  const proxyStatusLabel = (() => {
    if (settings.proxy.active_source === 'db' && settings.proxy.url_masked) {
      return `Активен из настроек: ${settings.proxy.url_masked}`;
    }
    if (settings.proxy.active_source === 'env' && settings.proxy.url_masked) {
      return `Активен из env: ${settings.proxy.url_masked}`;
    }
    if (settings.proxy.has_url && settings.proxy.url_masked) {
      return `Сохранён (выключен): ${settings.proxy.url_masked}`;
    }
    return 'Прокси не используется';
  })();

  function saveSettings() {
    setNote(null);
    saveMut.mutate();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {note ? (
        <div
          role="status"
          className={
            note.type === 'ok'
              ? 'rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900'
              : 'rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900'
          }
        >
          {note.text}
        </div>
      ) : null}

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
            aria-hidden
          >
            <LuSend className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-bold tracking-tight text-stone-900">Telegram</h2>
            <p className="mt-0.5 text-sm text-stone-500">Бот, чаты и тексты авторассылок</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                  form.enabled
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border-stone-200 bg-stone-50 text-stone-600'
                }`}
              >
                {form.enabled ? <LuCheck className="h-3 w-3" aria-hidden /> : null}
                {form.enabled ? 'Включён' : 'Выключен'}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                  tokenReady
                    ? 'border-stone-200 bg-white text-stone-700'
                    : 'border-amber-200 bg-amber-50 text-amber-900'
                }`}
              >
                {!tokenReady ? <LuCircleAlert className="h-3 w-3" aria-hidden /> : null}
                {tokenReady
                  ? settings.bot_token_masked
                    ? `Токен ${settings.bot_token_masked}`
                    : 'Токен задан'
                  : 'Нет токена'}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                  settings.proxy.active_source
                    ? 'border-sky-200 bg-sky-50 text-sky-900'
                    : 'border-stone-200 bg-stone-50 text-stone-600'
                }`}
              >
                {settings.proxy.active_source ? 'Прокси активен' : 'Прокси выкл.'}
              </span>
            </div>
          </div>
        </div>
        <button
          type="button"
          className={btnPrimary('shrink-0')}
          disabled={saveMut.isPending}
          onClick={saveSettings}
        >
          {saveMut.isPending ? 'Сохранение…' : 'Сохранить'}
        </button>
      </header>

      <nav
        className="flex gap-1 overflow-x-auto rounded-xl border border-stone-200 bg-stone-50/80 p-1"
        aria-label="Разделы Telegram"
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                active
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-500 hover:bg-white/70 hover:text-stone-800'
              }`}
              aria-current={active ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      <section className="rounded-2xl border border-stone-200/90 bg-white p-5 shadow-sm">
        {tab === 'bot' ? (
          <div className="space-y-4">
            <Toggle
              checked={form.enabled}
              onChange={(enabled) => setForm((s) => ({ ...s, enabled }))}
              label="Разрешить отправку"
              hint="Выключите, чтобы временно остановить все сообщения бота."
            />
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-600" htmlFor="tg-bot-token">
                Bot Token
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="tg-bot-token"
                  type={showToken ? 'text' : 'password'}
                  className={fieldClass()}
                  value={form.bot_token}
                  onChange={(e) => setForm((s) => ({ ...s, bot_token: e.target.value }))}
                  placeholder={
                    settings.bot_token_masked
                      ? `Оставьте пустым, чтобы не менять (${settings.bot_token_masked})`
                      : 'Токен от @BotFather'
                  }
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className={btnSecondary('shrink-0')}
                  onClick={() => setShowToken((v) => !v)}
                >
                  {showToken ? 'Скрыть' : 'Показать'}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-stone-500">
                Можно задать здесь или через <code className="rounded bg-stone-100 px-1">TELEGRAM_BOT_TOKEN</code>.
              </p>
            </div>
            <button
              type="button"
              className={btnSecondary()}
              disabled={testConnectionMut.isPending || !tokenReady}
              onClick={() => {
                setNote(null);
                testConnectionMut.mutate();
              }}
            >
              {testConnectionMut.isPending ? 'Проверка…' : 'Проверить подключение'}
            </button>

            <div className="border-t border-stone-100 pt-4">
              <h3 className="text-sm font-semibold text-stone-900">Исходящий HTTP-прокси</h3>
              <p className="mt-1 text-xs leading-relaxed text-stone-500">
                Если api.telegram.org недоступен с сервера — укажите внешний HTTP(S)-прокси. Не нужно ставить прокси на
                сервер: backend сам ходит через URL. Приоритет: настройки проекта →{' '}
                <code className="rounded bg-stone-100 px-1">TELEGRAM_HTTPS_PROXY</code>.
              </p>
              <div
                className={`mt-3 rounded-xl border px-3 py-2.5 text-sm ${
                  settings.proxy.active_source
                    ? 'border-sky-200 bg-sky-50/80 text-sky-950'
                    : 'border-stone-200 bg-stone-50/80 text-stone-700'
                }`}
              >
                <p className="font-semibold">Статус: {proxyStatusLabel}</p>
              </div>
              <div className="mt-3">
                <Toggle
                  checked={form.proxy_enabled}
                  onChange={(proxy_enabled) => setForm((s) => ({ ...s, proxy_enabled }))}
                  label="Использовать прокси из настроек"
                  hint="Включите после сохранения URL. Пока выключено — может работать env-прокси."
                />
              </div>
              <div className="mt-3">
                <label className="mb-1 block text-xs font-semibold text-stone-600" htmlFor="tg-proxy-url">
                  URL прокси
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="tg-proxy-url"
                    type={showProxyUrl ? 'text' : 'password'}
                    className={fieldClass()}
                    value={form.proxy_url}
                    onChange={(e) => setForm((s) => ({ ...s, proxy_url: e.target.value }))}
                    placeholder={
                      settings.proxy.url_masked
                        ? `Оставьте пустым, чтобы не менять (${settings.proxy.url_masked})`
                        : 'http://user:pass@host:8080'
                    }
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className={btnSecondary('shrink-0')}
                    onClick={() => setShowProxyUrl((v) => !v)}
                  >
                    {showProxyUrl ? 'Скрыть' : 'Показать'}
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={btnSecondary()}
                  disabled={testProxyMut.isPending || !tokenReady || !proxyReady}
                  onClick={() => {
                    setNote(null);
                    testProxyMut.mutate();
                  }}
                >
                  {testProxyMut.isPending ? 'Проверка…' : 'Проверить прокси'}
                </button>
                <button
                  type="button"
                  className={btnSecondary()}
                  disabled={clearProxyMut.isPending || (!settings.proxy.has_url && !settings.proxy.enabled)}
                  onClick={() => {
                    setNote(null);
                    clearProxyMut.mutate();
                  }}
                >
                  {clearProxyMut.isPending ? 'Очистка…' : 'Очистить прокси'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'chats' ? (
          <div className="space-y-5">
            <p className="text-sm text-stone-500">
              ID группы или канала обычно отрицательный (−100…). Узнать можно через @userinfobot.
            </p>
            <div className="grid gap-5 sm:grid-cols-2">
              <ChatField
                label="Молитва"
                hint="«Молитва на сегодня» и ручная отправка"
                value={form.prayer_chat_id}
                onChange={(prayer_chat_id) => setForm((s) => ({ ...s, prayer_chat_id }))}
              />
              <ChatField
                label="Координаторы"
                hint="План на неделю и ответственные"
                value={form.coordinator_chat_id}
                onChange={(coordinator_chat_id) => setForm((s) => ({ ...s, coordinator_chat_id }))}
              />
              <ChatField
                label="Запасной"
                hint="Если для типа сообщения чат не задан"
                value={form.default_chat_id}
                onChange={(default_chat_id) => setForm((s) => ({ ...s, default_chat_id }))}
              />
              <ChatField
                label="Программа служения"
                hint="Понедельник 10:00 · если пусто — запасной"
                value={form.service_plan_chat_id}
                onChange={(service_plan_chat_id) => setForm((s) => ({ ...s, service_plan_chat_id }))}
              />
              <ChatField
                label="Финальная программа"
                hint="При нажатии «Опубликовать» · ссылка + кнопка"
                value={form.service_plan_published_chat_id}
                onChange={(service_plan_published_chat_id) =>
                  setForm((s) => ({ ...s, service_plan_published_chat_id }))
                }
              />
            </div>
          </div>
        ) : null}

        {tab === 'prayer' ? (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-stone-900">Текст «Молитва на сегодня»</h3>
              <p className="mt-0.5 text-xs text-stone-500">
                Для канала и личной рассылки. Пустое поле — стандартный шаблон.
              </p>
            </div>
            <textarea
              ref={prayerTemplateRef}
              className="min-h-[200px] w-full resize-y rounded-xl border border-stone-200 px-3 py-3 font-mono text-[13px] leading-relaxed text-stone-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={form.prayer_template}
              onChange={(e) => setForm((s) => ({ ...s, prayer_template: e.target.value }))}
              placeholder={
                'Сегодня {{date}} мы молимся за члена церкви:\n\n📌 {{member_name}}\nпросит молиться:\n{{member_prayer_request_bullets}}'
              }
            />
            <PlaceholderPicker
              groups={PRAYER_PLACEHOLDER_GROUPS}
              onInsert={(token) =>
                insertAtCursor(prayerTemplateRef.current, token, form.prayer_template, (next) =>
                  setForm((s) => ({ ...s, prayer_template: next })),
                )
              }
            />
            <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-4">
              <button
                type="button"
                className={btnSecondary()}
                disabled={sendMut.isPending}
                onClick={() => {
                  setNote(null);
                  sendMut.mutate({ kind: 'prayer_today' });
                }}
              >
                Отправить в канал молитвы
              </button>
            </div>
          </div>
        ) : null}

        {tab === 'program' ? (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-stone-900">Рассылка программы служения</h3>
              <p className="mt-0.5 text-xs text-stone-500">
                Автоматически каждый понедельник в 10:00 (МСК) — в Telegram и чат «Богослужение
                (планирование)». Все данные (ссылка, проповедь, люди, песни) берутся только из
                ближайшей активной программы в «Служении» (обычно черновик). Чат задаётся во вкладке
                «Чаты». Отдельно: при «Опубликовать» уходит короткое уведомление в чат «Финальная
                программа».
              </p>
            </div>
            <textarea
              ref={programTemplateRef}
              className="min-h-[280px] w-full resize-y rounded-xl border border-stone-200 px-3 py-3 font-mono text-[13px] leading-relaxed text-stone-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={form.service_plan_template}
              onChange={(e) => setForm((s) => ({ ...s, service_plan_template: e.target.value }))}
              placeholder={
                '{{sunday_heading}}\n1. Проповедник — {{preacher}}\n{{sermon_topic_block}}{{sermon_scripture_block}}2. Группа прославления — {{music}}…\n8. Ссылка: {{share_url}}'
              }
            />
            <PlaceholderPicker
              groups={PROGRAM_PLACEHOLDER_GROUPS}
              onInsert={(token) =>
                insertAtCursor(
                  programTemplateRef.current,
                  token,
                  form.service_plan_template,
                  (next) => setForm((s) => ({ ...s, service_plan_template: next })),
                )
              }
            />
            <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-4">
              <button
                type="button"
                className={btnSecondary()}
                disabled={programMailingMut.isPending}
                onClick={() => {
                  setNote(null);
                  programMailingMut.mutate();
                }}
              >
                {programMailingMut.isPending ? 'Отправка…' : 'Отправить сейчас'}
              </button>
              <span className="self-center text-xs text-stone-400">
                Нужна программа на ближайшее воскресенье
              </span>
            </div>
          </div>
        ) : null}

        {tab === 'dispatch' ? (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-stone-900">Личная авторассылка молитвы</h3>
              <p className="mt-0.5 text-xs text-stone-500">
                Участникам с Telegram ID в карточке. Часовой пояс сервера:{' '}
                <code className="rounded bg-stone-100 px-1 text-[11px]">{dispatchForm.server_timezone}</code>
              </p>
            </div>

            {lastDispatchLabel ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
                <LuClock className="h-4 w-4 shrink-0 text-stone-500" aria-hidden />
                Последняя отправка: <span className="font-medium text-stone-900">{lastDispatchLabel}</span>
              </div>
            ) : null}

            <Toggle
              checked={dispatchForm.enabled}
              onChange={(enabled) => setDispatchForm((s) => ({ ...s, enabled }))}
              label="Включить по расписанию"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-600">Режим</label>
                <select
                  className={fieldClass()}
                  value={dispatchForm.kind}
                  onChange={(e) =>
                    setDispatchForm((s) => ({
                      ...s,
                      kind: e.target.value as 'daily' | 'once',
                    }))
                  }
                >
                  <option value="daily">Каждый день</option>
                  <option value="once">Один раз</option>
                </select>
              </div>
              {dispatchForm.kind === 'daily' ? (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-600">Время</label>
                  <input
                    type="time"
                    className={fieldClass()}
                    value={dispatchForm.time_hhmm ?? '09:00'}
                    onChange={(e) => setDispatchForm((s) => ({ ...s, time_hhmm: e.target.value }))}
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-stone-600">Дата</label>
                    <input
                      type="date"
                      className={fieldClass()}
                      value={dispatchForm.once_at_local?.split('T')[0] ?? ''}
                      onChange={(e) => {
                        const d = e.target.value;
                        setDispatchForm((s) => {
                          const t = s.once_at_local?.split('T')[1]?.slice(0, 5) ?? '09:00';
                          return { ...s, once_at_local: d ? `${d}T${t}` : null };
                        });
                      }}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-stone-600">Время</label>
                    <input
                      type="time"
                      className={fieldClass()}
                      value={dispatchForm.once_at_local?.split('T')[1]?.slice(0, 5) ?? ''}
                      onChange={(e) => {
                        const tim = e.target.value;
                        setDispatchForm((s) => {
                          const d = s.once_at_local?.split('T')[0];
                          if (!d || !tim) return s;
                          return { ...s, once_at_local: `${d}T${tim}` };
                        });
                      }}
                    />
                  </div>
                </>
              )}
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-600">Кому</label>
                <select
                  className={fieldClass()}
                  value={dispatchForm.target}
                  onChange={(e) =>
                    setDispatchForm((s) => ({
                      ...s,
                      target: e.target.value as 'all' | 'selected',
                    }))
                  }
                >
                  <option value="all">Всем с Telegram ID ({recipientsCount})</option>
                  <option value="selected">Только выбранным</option>
                </select>
              </div>
            </div>

            {dispatchForm.target === 'selected' ? (
              <div className="rounded-xl border border-stone-200 p-3">
                {recipientsCount === 0 ? (
                  <p className="text-sm text-amber-800">
                    Нет участников с Telegram ID — добавьте в карточках.
                  </p>
                ) : (
                  <div className="max-h-48 space-y-1 overflow-y-auto">
                    {(recipientsQ.data ?? []).map((u: TelegramDispatchRecipient) => {
                      const checked = dispatchForm.member_ids.includes(u.id);
                      return (
                        <label
                          key={u.id}
                          className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-stone-50"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setDispatchForm((s) => ({
                                ...s,
                                member_ids: e.target.checked
                                  ? Array.from(new Set([...s.member_ids, u.id]))
                                  : s.member_ids.filter((id) => id !== u.id),
                              }))
                            }
                          />
                          <span className="text-sm text-stone-700">{u.name}</span>
                          <span className="text-xs text-stone-400">({u.telegram_chat_id})</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={btnPrimary()}
                disabled={saveDispatchMut.isPending}
                onClick={() => {
                  setNote(null);
                  saveDispatchMut.mutate();
                }}
              >
                {saveDispatchMut.isPending ? 'Сохранение…' : 'Сохранить планировщик'}
              </button>
              <button
                type="button"
                className={btnSecondary()}
                disabled={runDispatchNowMut.isPending}
                onClick={() => {
                  setNote(null);
                  runDispatchNowMut.mutate();
                }}
              >
                {runDispatchNowMut.isPending ? 'Отправка…' : 'Отправить сейчас'}
              </button>
            </div>

            <div className="space-y-3 border-t border-stone-100 pt-5">
              <h3 className="text-sm font-semibold text-stone-900">Ручная отправка</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  className={btnSecondary('w-full justify-center')}
                  disabled={sendMut.isPending}
                  onClick={() => {
                    setNote(null);
                    sendMut.mutate({ kind: 'next_week' });
                  }}
                >
                  План координаторам
                </button>
                <button
                  type="button"
                  className={btnSecondary('w-full justify-center')}
                  disabled={sendMut.isPending}
                  onClick={() => {
                    setNote(null);
                    sendMut.mutate({ kind: 'prayer_today_all_members' });
                  }}
                >
                  Молитва всем с ID
                </button>
              </div>
              <textarea
                className={`${fieldClass()} min-h-[88px]`}
                placeholder="Свой текст…"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
              />
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className={fieldClass()}
                  placeholder="chat_id (необязательно)"
                  value={customChatId}
                  onChange={(e) => setCustomChatId(e.target.value)}
                />
                <button
                  type="button"
                  className={btnPrimary('shrink-0')}
                  disabled={sendMut.isPending || customText.trim().length === 0}
                  onClick={() => {
                    setNote(null);
                    sendMut.mutate({
                      kind: 'custom',
                      text: customText,
                      chat_id: customChatId.trim() || undefined,
                    });
                  }}
                >
                  {sendMut.isPending ? 'Отправка…' : 'Отправить'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
