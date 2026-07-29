import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LuCheck, LuCircleAlert, LuClock, LuSend } from 'react-icons/lu';

import {
  apiErrorMessage,
  addTelegramChat,
  deleteTelegramChat,
  fetchTelegramChats,
  fetchTelegramDispatchRecipients,
  fetchTelegramDispatchSettings,
  fetchTelegramMailingMessengerChats,
  fetchTelegramSettings,
  humanizeTelegramError,
  patchTelegramDispatchSettings,
  patchTelegramSettings,
  refreshTelegramChat,
  runServicePlanMondayMailing,
  runTelegramDispatchNow,
  sendTelegramMessage,
  testTelegramConnection,
  testTelegramProxy,
  type ServicePlanMailingDestinations,
  type ServicePlanMailingMessengerChat,
  type TelegramChatRecord,
  type TelegramDispatchRecipient,
  type TelegramDispatchSettingsResponse,
  type TelegramSettingsResponse,
} from './api';
import {
  TemplateFieldInserter,
  PRAYER_TEMPLATE_FIELD_GROUPS,
  PROGRAM_TEMPLATE_FIELD_GROUPS,
} from './TemplateFieldInserter';

const Q_TG = ['admin', 'telegram', 'settings'] as const;
const Q_TG_DISPATCH = ['admin', 'telegram', 'dispatch-settings'] as const;
const Q_TG_RECIPIENTS = ['admin', 'telegram', 'recipients'] as const;
const Q_TG_MAILING_CHATS = ['admin', 'telegram', 'mailing-messenger-chats'] as const;
const Q_TG_CHATS = ['admin', 'telegram', 'chats'] as const;

type TgTab = 'bot' | 'chats' | 'prayer' | 'program' | 'dispatch';

/** Совпадает с DEFAULT_SERVICE_PLAN_MONDAY_MAILING_TEMPLATE на бэкенде. */
const DEFAULT_PROGRAM_MAILING_TEMPLATE = [
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
const DEFAULT_PROGRAM_PUBLISHED_TEMPLATE = [
  'Финальная программа служения на {{date_long}} готова',
  '',
  '{{share_url}}',
].join('\n');

const DEFAULT_PROGRAM_PUBLISHED_BUTTON_TEXT = 'Открыть программу';

const WEEKDAY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'Понедельник' },
  { value: 2, label: 'Вторник' },
  { value: 3, label: 'Среда' },
  { value: 4, label: 'Четверг' },
  { value: 5, label: 'Пятница' },
  { value: 6, label: 'Суббота' },
  { value: 0, label: 'Воскресенье' },
];

type ProgramPreviewState = {
  text: string;
  textMessenger: string;
  serviceDate?: string;
  planId?: number;
  channel: 'telegram' | 'messenger';
};

const TABS: { id: TgTab; label: string }[] = [
  { id: 'bot', label: 'Бот' },
  { id: 'chats', label: 'Чаты' },
  { id: 'prayer', label: 'Молитва' },
  { id: 'program', label: 'Программа' },
  { id: 'dispatch', label: 'Личная' },
];

type ProgramPanel = 'mailing' | 'published';

const PROGRAM_PANELS: Array<{
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

function emptyDestinations(): ServicePlanMailingDestinations {
  return { telegram_chat_ids: [], messenger_conversation_ids: [] };
}

function normalizeDestinations(
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

function chatLabel(chat: Pick<TelegramChatRecord, 'chat_id' | 'title' | 'type' | 'username'>): string {
  const title = chat.title?.trim() || (chat.username ? `@${chat.username}` : null) || chat.chat_id;
  const typeRu =
    chat.type === 'channel'
      ? 'канал'
      : chat.type === 'supergroup'
        ? 'супергруппа'
        : chat.type === 'group'
          ? 'группа'
          : chat.type === 'private'
            ? 'личный'
            : chat.type;
  return typeRu ? `${title} · ${typeRu}` : title;
}

function chatOptionLabel(chat: Pick<TelegramChatRecord, 'chat_id' | 'title' | 'type' | 'username'>): string {
  return `${chatLabel(chat)} (${chat.chat_id})`;
}

/** Одиночный выбор чата из реестра. */
function ChatSelect({
  label,
  hint,
  chats,
  value,
  onChange,
  allowEmpty = true,
  emptyLabel = 'Не выбран',
  emptyHint,
}: {
  label: string;
  hint: string;
  chats: TelegramChatRecord[];
  value: string;
  onChange: (v: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  emptyHint?: string;
}) {
  const known = new Set(chats.map((c) => c.chat_id));
  const orphan = value && !known.has(value) ? value : null;
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-stone-700">{label}</label>
      <p className="mb-1.5 text-xs text-stone-500">{hint}</p>
      {chats.length === 0 && !orphan ? (
        <p className="rounded-xl border border-dashed border-stone-200 bg-stone-50/80 px-3 py-3 text-xs text-stone-500">
          {emptyHint ?? 'Сначала добавьте чаты в реестр на вкладке «Чаты».'}
        </p>
      ) : (
        <select className={fieldClass()} value={value} onChange={(e) => onChange(e.target.value)}>
          {allowEmpty ? <option value="">{emptyLabel}</option> : null}
          {orphan ? <option value={orphan}>{orphan} (нет в реестре)</option> : null}
          {chats.map((chat) => (
            <option key={chat.id} value={chat.chat_id}>
              {chatOptionLabel(chat)}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/** Мультивыбор Telegram-чатов из реестра. */
function ChatMultiSelect({
  label,
  hint,
  chats,
  selectedIds,
  onChange,
  emptyHint,
}: {
  label: string;
  hint: string;
  chats: TelegramChatRecord[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  emptyHint?: string;
}) {
  const known = new Set(chats.map((c) => c.chat_id));
  const orphans = selectedIds.filter((id) => !known.has(id));
  const size = Math.min(8, Math.max(3, chats.length + orphans.length + 1));
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-stone-700">{label}</label>
      <p className="mb-1.5 text-xs text-stone-500">
        {hint} Удерживайте Ctrl/⌘ для выбора нескольких.
      </p>
      {chats.length === 0 && orphans.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-200 bg-stone-50/80 px-3 py-3 text-xs text-stone-500">
          {emptyHint ?? 'Сначала добавьте чаты во вкладке «Чаты».'}
        </p>
      ) : (
        <select
          className={`${fieldClass()} min-h-[7.5rem]`}
          multiple
          size={size}
          value={selectedIds}
          onChange={(e) => {
            onChange(Array.from(e.target.selectedOptions).map((o) => o.value));
          }}
        >
          {orphans.map((id) => (
            <option key={`orphan-${id}`} value={id}>
              {id} (нет в реестре)
            </option>
          ))}
          {chats.map((chat) => (
            <option key={chat.id} value={chat.chat_id}>
              {chatOptionLabel(chat)}
            </option>
          ))}
        </select>
      )}
      {selectedIds.length > 0 ? (
        <p className="mt-1.5 text-[11px] text-stone-500">Выбрано: {selectedIds.length}</p>
      ) : (
        <p className="mt-1.5 text-[11px] text-amber-700/80">
          Telegram не выбран — уйдёт только в отмеченные чаты приложения (если есть).
        </p>
      )}
    </div>
  );
}

function MailingDestinationsEditor({
  value,
  onChange,
  chats,
  chatsLoading,
  telegramChats,
  purpose,
}: {
  value: ServicePlanMailingDestinations;
  onChange: (next: ServicePlanMailingDestinations) => void;
  chats: ServicePlanMailingMessengerChat[];
  chatsLoading: boolean;
  telegramChats: TelegramChatRecord[];
  purpose: 'mailing' | 'published';
}) {
  const selected = new Set(value.messenger_conversation_ids);

  return (
    <div className="space-y-4">
      <ChatMultiSelect
        label="Telegram — чаты из реестра"
        hint="Выберите один или несколько чатов."
        chats={telegramChats}
        selectedIds={value.telegram_chat_ids}
        onChange={(telegram_chat_ids) => onChange({ ...value, telegram_chat_ids })}
        emptyHint="Реестр пуст — добавьте чаты во вкладке «Чаты»."
      />

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label className="block text-xs font-semibold text-stone-700">
            Чаты в приложении
          </label>
          {value.messenger_conversation_ids.length > 0 ? (
            <span className="text-[11px] font-medium text-stone-500">
              Выбрано: {value.messenger_conversation_ids.length}
            </span>
          ) : null}
        </div>
        <p className="mb-2 text-xs text-stone-500">
          Отметьте каналы или группы проекта. Можно выбрать несколько.
        </p>
        {chatsLoading ? (
          <p className="text-xs text-stone-500">Загрузка чатов…</p>
        ) : chats.length === 0 ? (
          <p className="rounded-lg border border-dashed border-stone-200 bg-stone-50/80 px-3 py-3 text-xs text-stone-500">
            Пока нет каналов или групп в мессенджере. Создайте их в приложении — они появятся здесь.
          </p>
        ) : (
          <ul className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50/50 p-2">
            {chats.map((chat) => {
              const checked = selected.has(chat.id);
              const recommended = chat.recommended_for.includes(purpose);
              return (
                <li key={chat.id}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-white">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-stone-300 text-[#7B2D3F] focus:ring-[#7B2D3F]/30"
                      checked={checked}
                      onChange={(e) => {
                        const nextIds = e.target.checked
                          ? Array.from(new Set([...value.messenger_conversation_ids, chat.id]))
                          : value.messenger_conversation_ids.filter((id) => id !== chat.id);
                        onChange({ ...value, messenger_conversation_ids: nextIds });
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-stone-900">{chat.title}</span>
                      <span className="mt-0.5 block text-[11px] text-stone-500">
                        {chat.type === 'group' ? 'Группа' : 'Канал'}
                        {recommended ? ' · рекомендуется' : ''}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function StepBlock({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start gap-3">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#7B2D3F] text-xs font-bold text-white"
          aria-hidden
        >
          {n}
        </span>
        <div className="min-w-0 pt-0.5">
          <h4 className="text-sm font-semibold text-stone-900">{title}</h4>
          {hint ? <p className="mt-0.5 text-xs leading-relaxed text-stone-500">{hint}</p> : null}
        </div>
      </div>
      <div className="space-y-3">{children}</div>
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
  const mailingChatsQ = useQuery({
    queryKey: Q_TG_MAILING_CHATS,
    queryFn: fetchTelegramMailingMessengerChats,
  });
  const chatsQ = useQuery({
    queryKey: Q_TG_CHATS,
    queryFn: fetchTelegramChats,
  });

  const [tab, setTab] = useState<TgTab>('bot');
  const [newChatId, setNewChatId] = useState('');
  const [programPanel, setProgramPanel] = useState<ProgramPanel>('mailing');
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
    media_chat_id: '',
    service_plan_mailing_destinations: emptyDestinations(),
    service_plan_published_destinations: emptyDestinations(),
    service_plan_published_template: '',
    service_plan_published_button_text: '',
    service_plan_mailing_enabled: true,
    service_plan_mailing_weekday: 1,
    service_plan_mailing_time: '10:00',
    service_plan_mailing_timezone: 'Europe/Moscow',
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
  const [programPreview, setProgramPreview] = useState<ProgramPreviewState | null>(null);
  const [publishedPreview, setPublishedPreview] = useState<ProgramPreviewState | null>(null);
  const prayerTemplateRef = useRef<HTMLTextAreaElement | null>(null);
  const programTemplateRef = useRef<HTMLTextAreaElement | null>(null);
  const publishedTemplateRef = useRef<HTMLTextAreaElement | null>(null);

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
      service_plan_template: (data.service_plan_template ?? '').trim() || DEFAULT_PROGRAM_MAILING_TEMPLATE,
      service_plan_published_chat_id: data.service_plan_published_chat_id ?? '',
      media_chat_id: data.media_chat_id ?? '',
      service_plan_mailing_destinations: normalizeDestinations(
        data.service_plan_mailing_destinations,
      ),
      service_plan_published_destinations: normalizeDestinations(
        data.service_plan_published_destinations,
      ),
      service_plan_published_template:
        (data.service_plan_published_template ?? '').trim() || DEFAULT_PROGRAM_PUBLISHED_TEMPLATE,
      service_plan_published_button_text:
        (data.service_plan_published_button_text ?? '').trim() || DEFAULT_PROGRAM_PUBLISHED_BUTTON_TEXT,
      service_plan_mailing_enabled: data.service_plan_mailing_enabled !== false,
      service_plan_mailing_weekday:
        typeof data.service_plan_mailing_weekday === 'number' ? data.service_plan_mailing_weekday : 1,
      service_plan_mailing_time: data.service_plan_mailing_time?.trim() || '10:00',
      service_plan_mailing_timezone: data.service_plan_mailing_timezone?.trim() || 'Europe/Moscow',
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
        media_chat_id: normalizeUiString(form.media_chat_id),
        service_plan_mailing_destinations: form.service_plan_mailing_destinations,
        service_plan_published_destinations: form.service_plan_published_destinations,
        service_plan_published_template: normalizeUiString(form.service_plan_published_template),
        service_plan_published_button_text: normalizeUiString(form.service_plan_published_button_text),
        service_plan_mailing_enabled: form.service_plan_mailing_enabled,
        service_plan_mailing_weekday: form.service_plan_mailing_weekday,
        service_plan_mailing_time: form.service_plan_mailing_time,
        service_plan_mailing_timezone: form.service_plan_mailing_timezone,
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
    mutationFn: () =>
      runServicePlanMondayMailing({
        force: true,
        template: form.service_plan_template,
      }),
    onSuccess: (r) => {
      const res = r.result;
      if (res.skipped && res.reason === 'no_service_plan') {
        setNote({
          type: 'err',
          text: `Нет ближайшей активной программы (${res.service_date ?? '—'}).`,
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

  const programPreviewMut = useMutation({
    mutationFn: () =>
      runServicePlanMondayMailing({
        force: true,
        dry_run: true,
        template: form.service_plan_template,
      }),
    onSuccess: (r) => {
      const res = r.result;
      if (res.skipped && res.reason === 'no_service_plan') {
        setProgramPreview(null);
        setNote({
          type: 'err',
          text: 'Нет ближайшей активной программы — предпросмотр недоступен.',
        });
        return;
      }
      if (res.reason === 'dry_run' && (res.text || res.text_messenger)) {
        setProgramPreview({
          text: res.text ?? '',
          textMessenger: res.text_messenger ?? res.text ?? '',
          serviceDate: res.service_date,
          planId: res.plan_id,
          channel: 'telegram',
        });
        setNote({
          type: 'ok',
          text: `Предпросмотр: программа #${res.plan_id ?? '—'} от ${res.service_date ?? '—'}.`,
        });
        return;
      }
      setProgramPreview(null);
      setNote({
        type: 'err',
        text: `Не удалось построить предпросмотр (${res.reason ?? 'ошибка'}).`,
      });
    },
    onError: (e) =>
      setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось загрузить предпросмотр.') }),
  });

  const saveProgramTemplateMut = useMutation({
    mutationFn: () =>
      patchTelegramSettings({
        service_plan_mailing_destinations: form.service_plan_mailing_destinations,
        service_plan_template: normalizeUiString(form.service_plan_template),
        service_plan_mailing_enabled: form.service_plan_mailing_enabled,
        service_plan_mailing_weekday: form.service_plan_mailing_weekday,
        service_plan_mailing_time: form.service_plan_mailing_time,
        service_plan_mailing_timezone: form.service_plan_mailing_timezone,
      }),
    onSuccess: (next) => {
      setNote({ type: 'ok', text: 'Плановая рассылка сохранена.' });
      qc.setQueryData(Q_TG, next);
      setForm((prev) => ({
        ...prev,
        service_plan_chat_id: next.service_plan_chat_id ?? '',
        service_plan_mailing_destinations: normalizeDestinations(
          next.service_plan_mailing_destinations,
        ),
      }));
    },
    onError: (e) =>
      setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось сохранить шаблон.') }),
  });

  const publishedPreviewMut = useMutation({
    mutationFn: () =>
      runServicePlanMondayMailing({
        force: true,
        dry_run: true,
        template: form.service_plan_published_template,
      }),
    onSuccess: (r) => {
      const res = r.result;
      if (res.skipped && res.reason === 'no_service_plan') {
        setPublishedPreview(null);
        setNote({
          type: 'err',
          text: 'Нет ближайшей активной программы — предпросмотр уведомления недоступен.',
        });
        return;
      }
      if (res.reason === 'dry_run' && (res.text || res.text_messenger)) {
        setPublishedPreview({
          text: res.text ?? '',
          textMessenger: res.text_messenger ?? res.text ?? '',
          serviceDate: res.service_date,
          planId: res.plan_id,
          channel: 'telegram',
        });
        setNote({
          type: 'ok',
          text: `Предпросмотр уведомления о готовности: программа #${res.plan_id ?? '—'} от ${res.service_date ?? '—'}.`,
        });
        return;
      }
      setPublishedPreview(null);
      setNote({
        type: 'err',
        text: `Не удалось построить предпросмотр (${res.reason ?? 'ошибка'}).`,
      });
    },
    onError: (e) =>
      setNote({
        type: 'err',
        text: apiErrorMessage(e, 'Не удалось загрузить предпросмотр уведомления.'),
      }),
  });

  const savePublishedTemplateMut = useMutation({
    mutationFn: () =>
      patchTelegramSettings({
        service_plan_published_template: normalizeUiString(form.service_plan_published_template),
        service_plan_published_button_text: normalizeUiString(form.service_plan_published_button_text),
        service_plan_published_destinations: form.service_plan_published_destinations,
      }),
    onSuccess: (next) => {
      setNote({ type: 'ok', text: 'Уведомление о готовности сохранено.' });
      qc.setQueryData(Q_TG, next);
      setForm((prev) => ({
        ...prev,
        service_plan_published_chat_id: next.service_plan_published_chat_id ?? '',
        media_chat_id: next.media_chat_id ?? '',
        service_plan_published_destinations: normalizeDestinations(
          next.service_plan_published_destinations,
        ),
      }));
    },
    onError: (e) =>
      setNote({
        type: 'err',
        text: apiErrorMessage(e, 'Не удалось сохранить шаблон уведомления.'),
      }),
  });


  const addChatMut = useMutation({
    mutationFn: (chatId: string) => addTelegramChat(chatId),
    onSuccess: () => {
      setNewChatId('');
      setNote({ type: 'ok', text: 'Чат добавлен: данные получены из Telegram и сохранены.' });
      void qc.invalidateQueries({ queryKey: Q_TG_CHATS });
    },
    onError: (e) =>
      setNote({
        type: 'err',
        text: humanizeTelegramError(e, 'Не удалось добавить чат. Проверьте ID и что бот в чате.'),
      }),
  });

  const refreshChatMut = useMutation({
    mutationFn: (id: number) => refreshTelegramChat(id),
    onSuccess: () => {
      setNote({ type: 'ok', text: 'Данные чата обновлены из Telegram.' });
      void qc.invalidateQueries({ queryKey: Q_TG_CHATS });
    },
    onError: (e) =>
      setNote({ type: 'err', text: humanizeTelegramError(e, 'Не удалось обновить чат.') }),
  });

  const deleteChatMut = useMutation({
    mutationFn: (id: number) => deleteTelegramChat(id),
    onSuccess: (_void, id) => {
      const removed = (chatsQ.data ?? []).find((c) => c.id === id)?.chat_id;
      if (removed) {
        setForm((s) => ({
          ...s,
          prayer_chat_id: s.prayer_chat_id === removed ? '' : s.prayer_chat_id,
          coordinator_chat_id: s.coordinator_chat_id === removed ? '' : s.coordinator_chat_id,
          default_chat_id: s.default_chat_id === removed ? '' : s.default_chat_id,
          media_chat_id: s.media_chat_id === removed ? '' : s.media_chat_id,
          service_plan_mailing_destinations: {
            ...s.service_plan_mailing_destinations,
            telegram_chat_ids: s.service_plan_mailing_destinations.telegram_chat_ids.filter(
              (x) => x !== removed,
            ),
          },
          service_plan_published_destinations: {
            ...s.service_plan_published_destinations,
            telegram_chat_ids: s.service_plan_published_destinations.telegram_chat_ids.filter(
              (x) => x !== removed,
            ),
          },
        }));
        setCustomChatId((prev) => (prev === removed ? '' : prev));
      }
      setNote({ type: 'ok', text: 'Чат удалён из реестра.' });
      void qc.invalidateQueries({ queryKey: Q_TG_CHATS });
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось удалить чат.') }),
  });

  const registryChats = chatsQ.data ?? [];

  const mailingScheduleLabel = useMemo(() => {
    const day =
      WEEKDAY_OPTIONS.find((d) => d.value === form.service_plan_mailing_weekday)?.label ??
      `день ${form.service_plan_mailing_weekday}`;
    if (!form.service_plan_mailing_enabled) return `выключена · было: ${day} ${form.service_plan_mailing_time}`;
    return `${day} в ${form.service_plan_mailing_time} (${form.service_plan_mailing_timezone})`;
  }, [
    form.service_plan_mailing_enabled,
    form.service_plan_mailing_weekday,
    form.service_plan_mailing_time,
    form.service_plan_mailing_timezone,
  ]);

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
    media_chat_id: null,
    service_plan_published_template: null,
    service_plan_published_button_text: null,
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
    <div className={`mx-auto space-y-5 ${tab === 'program' ? 'max-w-5xl' : 'max-w-3xl'}`}>
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
            <p className="mt-0.5 text-sm text-stone-500">Бот, чаты и настройка авторассылок</p>
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
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-stone-900">Реестр Telegram-чатов</h3>
                <p className="mt-0.5 text-xs text-stone-500">
                  Введите ID или @username — бот запросит getChat и сохранит чат в базе. Дальше
                  выбирайте чаты из выпадающих списков в ролях и авторассылках.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[220px] flex-1">
                  <label className="mb-1 block text-xs font-semibold text-stone-700">
                    ID или @username
                  </label>
                  <input
                    className={fieldClass()}
                    value={newChatId}
                    onChange={(e) => setNewChatId(e.target.value)}
                    placeholder="-100… или @channel"
                    autoComplete="off"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const id = newChatId.trim();
                        if (!id || addChatMut.isPending) return;
                        setNote(null);
                        addChatMut.mutate(id);
                      }
                    }}
                  />
                </div>
                <button
                  type="button"
                  className={btnPrimary()}
                  disabled={!newChatId.trim() || addChatMut.isPending}
                  onClick={() => {
                    const id = newChatId.trim();
                    if (!id) return;
                    setNote(null);
                    addChatMut.mutate(id);
                  }}
                >
                  {addChatMut.isPending ? 'Загрузка…' : 'Добавить чат'}
                </button>
              </div>
              {chatsQ.isLoading ? (
                <p className="text-sm text-stone-500">Загрузка списка…</p>
              ) : chatsQ.isError ? (
                <p className="text-sm text-red-600">Не удалось загрузить реестр чатов.</p>
              ) : registryChats.length === 0 ? (
                <p className="rounded-xl border border-dashed border-stone-200 bg-stone-50/80 px-3 py-4 text-sm text-stone-500">
                  Пока нет сохранённых чатов. Добавьте ID группы или канала — бот должен быть участником.
                </p>
              ) : (
                <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200">
                  {registryChats.map((chat) => (
                    <li
                      key={chat.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-3 py-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-stone-900">{chatLabel(chat)}</div>
                        <div className="mt-0.5 font-mono text-xs text-stone-500">{chat.chat_id}</div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          className={btnSecondary('!px-2.5 !py-1.5 text-xs')}
                          disabled={refreshChatMut.isPending}
                          onClick={() => {
                            setNote(null);
                            refreshChatMut.mutate(chat.id);
                          }}
                        >
                          Обновить
                        </button>
                        <button
                          type="button"
                          className={btnSecondary('!px-2.5 !py-1.5 text-xs text-red-700')}
                          disabled={deleteChatMut.isPending}
                          onClick={() => {
                            if (!window.confirm(`Удалить чат «${chatLabel(chat)}» из реестра?`)) return;
                            setNote(null);
                            deleteChatMut.mutate(chat.id);
                          }}
                        >
                          Удалить
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-stone-100 pt-5">
              <p className="mb-3 text-sm text-stone-500">
                Назначение ролей — выберите чат из реестра.
              </p>
              <div className="grid gap-5 sm:grid-cols-2">
                <ChatSelect
                  label="Молитва"
                  hint="«Молитва на сегодня» и ручная отправка в канал"
                  chats={registryChats}
                  value={form.prayer_chat_id}
                  onChange={(prayer_chat_id) => setForm((s) => ({ ...s, prayer_chat_id }))}
                />
                <ChatSelect
                  label="Координаторы"
                  hint="План на неделю и ответственные"
                  chats={registryChats}
                  value={form.coordinator_chat_id}
                  onChange={(coordinator_chat_id) => setForm((s) => ({ ...s, coordinator_chat_id }))}
                />
                <ChatSelect
                  label="Запасной"
                  hint="Если для типа сообщения чат не задан"
                  chats={registryChats}
                  value={form.default_chat_id}
                  onChange={(default_chat_id) => setForm((s) => ({ ...s, default_chat_id }))}
                />
                <ChatSelect
                  label="Медийка"
                  hint="Telegram-чат медиа-команды"
                  chats={registryChats}
                  value={form.media_chat_id}
                  onChange={(media_chat_id) => setForm((s) => ({ ...s, media_chat_id }))}
                />
              </div>
              <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50/70 px-4 py-3 text-xs text-stone-600">
                <p>
                  Плановая рассылка:{' '}
                  <span className="font-medium text-stone-800">
                    {form.service_plan_mailing_destinations.telegram_chat_ids.length} Telegram
                  </span>
                  {' · '}
                  <span className="font-medium text-stone-800">
                    {form.service_plan_mailing_destinations.messenger_conversation_ids.length} в
                    приложении
                  </span>
                </p>
                <p className="mt-1.5">
                  При публикации:{' '}
                  <span className="font-medium text-stone-800">
                    {form.service_plan_published_destinations.telegram_chat_ids.length} Telegram
                  </span>
                  {' · '}
                  <span className="font-medium text-stone-800">
                    {form.service_plan_published_destinations.messenger_conversation_ids.length} в
                    приложении
                  </span>
                </p>
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold text-[#7B2D3F] underline-offset-2 hover:underline"
                  onClick={() => setTab('program')}
                >
                  Настроить во вкладке «Программа»
                </button>
              </div>
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
            <TemplateFieldInserter
              groups={PRAYER_TEMPLATE_FIELD_GROUPS}
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
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-semibold text-stone-900">Авторассылки программы</h3>
              <p className="mt-1 text-sm text-stone-500">
                Два разных сообщения: плановая рассылка по расписанию и короткое уведомление при
                публикации. Настройте каждое по шагам.
              </p>
            </div>

            <div
              className="grid gap-2 sm:grid-cols-2"
              role="tablist"
              aria-label="Тип сообщения программы"
            >
              {PROGRAM_PANELS.map((panel) => {
                const active = programPanel === panel.id;
                const status =
                  panel.id === 'mailing'
                    ? form.service_plan_mailing_enabled
                      ? mailingScheduleLabel
                      : 'выключена'
                    : form.service_plan_published_destinations.telegram_chat_ids.length +
                          form.service_plan_published_destinations.messenger_conversation_ids
                            .length >
                        0
                      ? `${form.service_plan_published_destinations.telegram_chat_ids.length} TG · ${form.service_plan_published_destinations.messenger_conversation_ids.length} в приложении`
                      : 'чаты не выбраны';
                return (
                  <button
                    key={panel.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`rounded-xl border px-4 py-3 text-left transition ${
                      active
                        ? 'border-[#7B2D3F]/40 bg-[#7B2D3F]/[0.04] shadow-sm'
                        : 'border-stone-200 bg-stone-50/60 hover:border-stone-300 hover:bg-white'
                    }`}
                    onClick={() => setProgramPanel(panel.id)}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          active ? 'bg-[#7B2D3F] text-white' : 'bg-stone-200 text-stone-600'
                        }`}
                      >
                        {panel.step}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-stone-900">
                          {panel.title}
                        </span>
                        <span className="mt-0.5 block text-xs text-stone-500">{panel.hint}</span>
                        <span className="mt-1.5 block text-[11px] font-medium text-stone-600">
                          {status}
                        </span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {programPanel === 'mailing' ? (
              <div className="space-y-4" role="tabpanel">
                <StepBlock
                  n={1}
                  title="Куда отправлять"
                  hint="Выберите Telegram-чаты из реестра и отметьте галками чаты приложения. Можно несколько."
                >
                  <MailingDestinationsEditor
                    purpose="mailing"
                    value={form.service_plan_mailing_destinations}
                    onChange={(service_plan_mailing_destinations) =>
                      setForm((s) => ({ ...s, service_plan_mailing_destinations }))
                    }
                    chats={mailingChatsQ.data ?? []}
                    chatsLoading={mailingChatsQ.isLoading}
                    telegramChats={registryChats}
                  />
                </StepBlock>

                <StepBlock
                  n={2}
                  title="Когда отправлять"
                  hint="Автоотправка раз в неделю. Вручную можно отправить кнопкой внизу в любой момент."
                >
                  <Toggle
                    checked={form.service_plan_mailing_enabled}
                    onChange={(service_plan_mailing_enabled) =>
                      setForm((s) => ({ ...s, service_plan_mailing_enabled }))
                    }
                    label="Включить авторассылку"
                    hint={
                      form.service_plan_mailing_enabled
                        ? `Сейчас: ${mailingScheduleLabel}`
                        : 'Выключено — только ручная отправка'
                    }
                  />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-stone-600">
                        День недели
                      </label>
                      <select
                        className={fieldClass()}
                        value={form.service_plan_mailing_weekday}
                        onChange={(e) =>
                          setForm((s) => ({
                            ...s,
                            service_plan_mailing_weekday: Number(e.target.value),
                          }))
                        }
                      >
                        {WEEKDAY_OPTIONS.map((d) => (
                          <option key={d.value} value={d.value}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-stone-600">Время</label>
                      <input
                        type="time"
                        className={fieldClass()}
                        value={form.service_plan_mailing_time}
                        onChange={(e) =>
                          setForm((s) => ({
                            ...s,
                            service_plan_mailing_time: e.target.value || '10:00',
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-stone-600">
                        Часовой пояс
                      </label>
                      <select
                        className={fieldClass()}
                        value={form.service_plan_mailing_timezone}
                        onChange={(e) =>
                          setForm((s) => ({
                            ...s,
                            service_plan_mailing_timezone: e.target.value,
                          }))
                        }
                      >
                        <option value="Europe/Moscow">Europe/Moscow</option>
                        <option value="Europe/Samara">Europe/Samara</option>
                        <option value="Asia/Yekaterinburg">Asia/Yekaterinburg</option>
                        <option value="UTC">UTC</option>
                      </select>
                    </div>
                  </div>
                  <p className="text-xs text-stone-500">
                    Повторно в тот же день для той же даты программы не отправится.
                  </p>
                </StepBlock>

                <StepBlock
                  n={3}
                  title="Текст сообщения"
                  hint="Данные берутся из ближайшей активной программы. В Telegram люди — как @ник, если он есть."
                >
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                          Шаблон
                        </label>
                        <button
                          type="button"
                          className="text-xs font-semibold text-stone-600 underline-offset-2 hover:underline"
                          onClick={() => {
                            if (
                              !window.confirm(
                                'Сбросить шаблон к стандартному тексту? Несохранённые правки пропадут.',
                              )
                            ) {
                              return;
                            }
                            setForm((s) => ({
                              ...s,
                              service_plan_template: DEFAULT_PROGRAM_MAILING_TEMPLATE,
                            }));
                            setProgramPreview(null);
                          }}
                        >
                          Сбросить к стандартному
                        </button>
                      </div>
                      <textarea
                        ref={programTemplateRef}
                        className="min-h-[280px] w-full resize-y rounded-xl border border-stone-200 px-3 py-3 font-mono text-[13px] leading-relaxed text-stone-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        value={form.service_plan_template}
                        onChange={(e) => {
                          setForm((s) => ({ ...s, service_plan_template: e.target.value }));
                          setProgramPreview(null);
                        }}
                        placeholder={DEFAULT_PROGRAM_MAILING_TEMPLATE}
                        spellCheck={false}
                      />
                      <TemplateFieldInserter
                        groups={PROGRAM_TEMPLATE_FIELD_GROUPS}
                        onInsert={(token) =>
                          insertAtCursor(
                            programTemplateRef.current,
                            token,
                            form.service_plan_template,
                            (next) => {
                              setForm((s) => ({ ...s, service_plan_template: next }));
                              setProgramPreview(null);
                            },
                          )
                        }
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                          Предпросмотр
                        </label>
                        {programPreview ? (
                          <div className="flex rounded-lg border border-stone-200 bg-stone-50 p-0.5 text-xs font-semibold">
                            <button
                              type="button"
                              className={`rounded-md px-2.5 py-1 ${
                                programPreview.channel === 'telegram'
                                  ? 'bg-white text-stone-900 shadow-sm'
                                  : 'text-stone-500'
                              }`}
                              onClick={() =>
                                setProgramPreview((p) => (p ? { ...p, channel: 'telegram' } : p))
                              }
                            >
                              Telegram
                            </button>
                            <button
                              type="button"
                              className={`rounded-md px-2.5 py-1 ${
                                programPreview.channel === 'messenger'
                                  ? 'bg-white text-stone-900 shadow-sm'
                                  : 'text-stone-500'
                              }`}
                              onClick={() =>
                                setProgramPreview((p) => (p ? { ...p, channel: 'messenger' } : p))
                              }
                            >
                              Мессенджер
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <div className="min-h-[280px] rounded-xl border border-stone-200 bg-stone-50/80 p-4">
                        {programPreview ? (
                          <div className="space-y-3">
                            <p className="text-xs text-stone-500">
                              Программа #{programPreview.planId ?? '—'} ·{' '}
                              {programPreview.serviceDate ?? '—'} ·{' '}
                              {programPreview.channel === 'telegram'
                                ? 'как в Telegram'
                                : 'как в чате приложения'}
                            </p>
                            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-stone-800">
                              {programPreview.channel === 'telegram'
                                ? programPreview.text
                                : programPreview.textMessenger}
                            </pre>
                          </div>
                        ) : (
                          <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 px-4 text-center">
                            <p className="text-sm font-medium text-stone-700">
                              Пока нет предпросмотра
                            </p>
                            <p className="max-w-sm text-xs text-stone-500">
                              Нажмите «Предпросмотр» внизу — подставим данные ближайшей программы.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </StepBlock>

                <div className="sticky bottom-0 z-10 -mx-5 border-t border-stone-200 bg-white/95 px-5 py-4 backdrop-blur supports-[backdrop-filter]:bg-white/80">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className={btnSecondary()}
                      disabled={programPreviewMut.isPending}
                      onClick={() => {
                        setNote(null);
                        programPreviewMut.mutate();
                      }}
                    >
                      {programPreviewMut.isPending ? 'Собираем…' : 'Предпросмотр'}
                    </button>
                    <button
                      type="button"
                      className={btnPrimary()}
                      disabled={saveProgramTemplateMut.isPending}
                      onClick={() => {
                        setNote(null);
                        saveProgramTemplateMut.mutate();
                      }}
                    >
                      {saveProgramTemplateMut.isPending ? 'Сохранение…' : 'Сохранить'}
                    </button>
                    <button
                      type="button"
                      className={btnSecondary()}
                      disabled={programMailingMut.isPending}
                      onClick={() => {
                        if (
                          !window.confirm(
                            'Отправить рассылку сейчас в выбранные Telegram и чаты приложения?\nБудет использован текст из редактора (как в предпросмотре).',
                          )
                        ) {
                          return;
                        }
                        setNote(null);
                        programMailingMut.mutate();
                      }}
                    >
                      {programMailingMut.isPending ? 'Отправка…' : 'Отправить сейчас'}
                    </button>
                    <span className="text-xs text-stone-400">
                      1 → 2 → 3 → сохранить · отправка по желанию
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

            {programPanel === 'published' ? (
              <div className="space-y-4" role="tabpanel">
                <StepBlock
                  n={1}
                  title="Куда отправлять"
                  hint="При «Опубликовать» сообщение уйдёт во все выбранные Telegram-чаты из реестра и отмеченные чаты приложения."
                >
                  <MailingDestinationsEditor
                    purpose="published"
                    value={form.service_plan_published_destinations}
                    onChange={(service_plan_published_destinations) =>
                      setForm((s) => ({ ...s, service_plan_published_destinations }))
                    }
                    chats={mailingChatsQ.data ?? []}
                    chatsLoading={mailingChatsQ.isLoading}
                    telegramChats={registryChats}
                  />
                </StepBlock>

                <StepBlock
                  n={2}
                  title="Кнопка со ссылкой"
                  hint="Под текстом в Telegram будет кнопка, ведущая на публичную программу."
                >
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-stone-600">
                      Текст кнопки
                    </label>
                    <input
                      className={fieldClass()}
                      value={form.service_plan_published_button_text}
                      onChange={(e) =>
                        setForm((s) => ({
                          ...s,
                          service_plan_published_button_text: e.target.value,
                        }))
                      }
                      placeholder={DEFAULT_PROGRAM_PUBLISHED_BUTTON_TEXT}
                    />
                  </div>
                </StepBlock>

                <StepBlock
                  n={3}
                  title="Текст уведомления"
                  hint="Те же подстановки, что у плановой рассылки. Уходит один раз при нажатии «Опубликовать»."
                >
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                          Шаблон
                        </label>
                        <button
                          type="button"
                          className="text-xs font-semibold text-stone-600 underline-offset-2 hover:underline"
                          onClick={() => {
                            if (
                              !window.confirm(
                                'Сбросить шаблон к стандартному тексту? Несохранённые правки пропадут.',
                              )
                            ) {
                              return;
                            }
                            setForm((s) => ({
                              ...s,
                              service_plan_published_template: DEFAULT_PROGRAM_PUBLISHED_TEMPLATE,
                              service_plan_published_button_text:
                                DEFAULT_PROGRAM_PUBLISHED_BUTTON_TEXT,
                            }));
                            setPublishedPreview(null);
                          }}
                        >
                          Сбросить к стандартному
                        </button>
                      </div>
                      <textarea
                        ref={publishedTemplateRef}
                        className="min-h-[220px] w-full resize-y rounded-xl border border-stone-200 px-3 py-3 font-mono text-[13px] leading-relaxed text-stone-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        value={form.service_plan_published_template}
                        onChange={(e) => {
                          setForm((s) => ({
                            ...s,
                            service_plan_published_template: e.target.value,
                          }));
                          setPublishedPreview(null);
                        }}
                        placeholder={DEFAULT_PROGRAM_PUBLISHED_TEMPLATE}
                        spellCheck={false}
                      />
                      <TemplateFieldInserter
                        groups={PROGRAM_TEMPLATE_FIELD_GROUPS}
                        onInsert={(token) =>
                          insertAtCursor(
                            publishedTemplateRef.current,
                            token,
                            form.service_plan_published_template,
                            (next) => {
                              setForm((s) => ({ ...s, service_plan_published_template: next }));
                              setPublishedPreview(null);
                            },
                          )
                        }
                      />
                    </div>

                    <div className="space-y-3">
                      <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                        Предпросмотр
                      </label>
                      <div className="min-h-[220px] rounded-xl border border-stone-200 bg-stone-50/80 p-4">
                        {publishedPreview ? (
                          <div className="space-y-3">
                            <p className="text-xs text-stone-500">
                              Программа #{publishedPreview.planId ?? '—'} ·{' '}
                              {publishedPreview.serviceDate ?? '—'} · как в Telegram
                            </p>
                            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-stone-800">
                              {publishedPreview.text}
                            </pre>
                            <p className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-600">
                              Кнопка:{' '}
                              <span className="font-semibold text-stone-900">
                                {form.service_plan_published_button_text.trim() ||
                                  DEFAULT_PROGRAM_PUBLISHED_BUTTON_TEXT}
                              </span>
                            </p>
                          </div>
                        ) : (
                          <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 px-4 text-center">
                            <p className="text-sm font-medium text-stone-700">
                              Пока нет предпросмотра
                            </p>
                            <p className="max-w-sm text-xs text-stone-500">
                              Нажмите «Предпросмотр» внизу — подставим данные ближайшей программы.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </StepBlock>

                <div className="sticky bottom-0 z-10 -mx-5 border-t border-stone-200 bg-white/95 px-5 py-4 backdrop-blur supports-[backdrop-filter]:bg-white/80">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className={btnSecondary()}
                      disabled={publishedPreviewMut.isPending}
                      onClick={() => {
                        setNote(null);
                        publishedPreviewMut.mutate();
                      }}
                    >
                      {publishedPreviewMut.isPending ? 'Собираем…' : 'Предпросмотр'}
                    </button>
                    <button
                      type="button"
                      className={btnPrimary()}
                      disabled={savePublishedTemplateMut.isPending}
                      onClick={() => {
                        setNote(null);
                        savePublishedTemplateMut.mutate();
                      }}
                    >
                      {savePublishedTemplateMut.isPending ? 'Сохранение…' : 'Сохранить'}
                    </button>
                    <span className="text-xs text-stone-400">
                      Уходит при «Опубликовать» в планировщике
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === 'dispatch' ? (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-stone-900">Личная авторассылка молитвы</h3>
              <p className="mt-0.5 text-xs text-stone-500">
                Каждому участнику с Telegram ID в карточке — отдельно от рассылки программы.
                Часовой пояс сервера:{' '}
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
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <ChatSelect
                    label="Чат"
                    hint="Куда отправить свой текст (из реестра)"
                    chats={registryChats}
                    value={customChatId}
                    onChange={setCustomChatId}
                    emptyLabel="По умолчанию (запасной / роль)"
                    emptyHint="Добавьте чаты во вкладке «Чаты», либо оставьте «по умолчанию»."
                  />
                </div>
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
