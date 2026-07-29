import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LuBot,
  LuCalendarDays,
  LuClipboardList,
  LuClock,
  LuHeart,
  LuMessagesSquare,
  LuSend,
  LuUsers,
  LuZap,
} from 'react-icons/lu';
import { useSearchParams } from 'react-router-dom';

import {
  apiErrorMessage,
  addTelegramChat,
  deleteTelegramChat,
  fetchCoordinatorTelegramScenarios,
  fetchTelegramChats,
  fetchTelegramDispatchRecipients,
  fetchTelegramDispatchSettings,
  fetchTelegramMailingMessengerChats,
  fetchTelegramSettings,
  humanizeTelegramError,
  patchCoordinatorTelegramScenarios,
  patchTelegramDispatchSettings,
  patchTelegramSettings,
  refreshTelegramChat,
  runCoordinatorTelegramScenarioNow,
  runServicePlanMondayMailing,
  runTelegramDispatchNow,
  sendTelegramMessage,
  syncMembersFromTelegramProfiles,
  testTelegramConnection,
  testTelegramProxy,
  type CoordinatorTelegramScenario,
  type CoordinatorTelegramScenarioId,
  type TelegramDispatchRecipient,
  type TelegramDispatchSettingsResponse,
  type TelegramSettingsResponse,
} from '../api';
import {
  TemplateFieldInserter,
  PRAYER_TEMPLATE_FIELD_GROUPS,
  PROGRAM_TEMPLATE_FIELD_GROUPS,
  COORDINATOR_TEMPLATE_FIELD_GROUPS,
} from '../TemplateFieldInserter';
import { chatTypeBadge, chatLabel, ChatSelect, MailingDestinationsEditor } from './chatControls';
import {
  Q_TG,
  Q_TG_DISPATCH,
  Q_TG_RECIPIENTS,
  Q_TG_MAILING_CHATS,
  Q_TG_CHATS,
  Q_TG_COORD_SCENARIOS,
  TG_SECTIONS,
  PROGRAM_PANELS,
  WEEKDAY_OPTIONS,
  COORDINATOR_TARGET_OPTIONS,
  COORDINATOR_REPEAT_OPTIONS,
  COORDINATOR_DAY_OFFSET_OPTIONS,
  COORDINATOR_SCENARIO_HINTS,
  DEFAULT_PROGRAM_MAILING_TEMPLATE,
  DEFAULT_PROGRAM_PUBLISHED_TEMPLATE,
  DEFAULT_PROGRAM_PUBLISHED_BUTTON_TEXT,
  emptyDestinations,
  normalizeDestinations,
  parseTgSection,
  parseProgramPanel,
  type TgSection,
  type ProgramPanel,
  type CoordinatorTelegramTarget,
  type CoordinatorTelegramRepeat,
} from './constants';
import {
  fieldClass,
  btnPrimary,
  btnSecondary,
  normalizeUiString,
  normalizeUiOptionalUpdateString,
  insertAtCursor,
  Toggle,
  StatusNote,
  PanelIntro,
  StepBlock,
  StatusChip,
  SetupStepRow,
} from './ui';

type ProgramPreviewState = {
  text: string;
  textMessenger: string;
  serviceDate?: string;
  planId?: number;
  channel: 'telegram' | 'messenger';
};

type PrayerPanel = 'template' | 'dispatch' | 'manual';

const PRAYER_PANELS: Array<{ id: PrayerPanel; label: string }> = [
  { id: 'template', label: 'Текст' },
  { id: 'dispatch', label: 'Личная рассылка' },
  { id: 'manual', label: 'Ручная отправка' },
];

const SECTION_ICONS: Record<TgSection, typeof LuZap> = {
  overview: LuZap,
  bot: LuBot,
  chats: LuMessagesSquare,
  prayer: LuHeart,
  coordinators: LuClipboardList,
  program: LuCalendarDays,
};

function formatSyncedAt(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return format(new Date(iso), 'd MMM yyyy, HH:mm', { locale: ru });
  } catch {
    return null;
  }
}

export function TelegramSettingsSection() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const section = parseTgSection(searchParams.get('tg'));
  const programPanel = parseProgramPanel(searchParams.get('program'));

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
  const coordScenariosQ = useQuery({
    queryKey: Q_TG_COORD_SCENARIOS,
    queryFn: fetchCoordinatorTelegramScenarios,
  });

  const [newChatId, setNewChatId] = useState('');
  const [coordTimezone, setCoordTimezone] = useState('Europe/Moscow');
  const [coordScenarios, setCoordScenarios] = useState<CoordinatorTelegramScenario[]>([]);
  const [prayerPanel, setPrayerPanel] = useState<PrayerPanel>('template');
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
        ? (Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC')
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
  const coordBodyRefs = useRef<Partial<Record<CoordinatorTelegramScenarioId, HTMLTextAreaElement | null>>>(
    {},
  );

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
      service_plan_mailing_destinations: normalizeDestinations(data.service_plan_mailing_destinations),
      service_plan_published_destinations: normalizeDestinations(data.service_plan_published_destinations),
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

  useEffect(() => {
    if (!coordScenariosQ.data) return;
    setCoordTimezone(coordScenariosQ.data.timezone || 'Europe/Moscow');
    setCoordScenarios(
      coordScenariosQ.data.scenarios.map((s) => {
        const repeat =
          s.repeat === 'event' || s.repeat === 'daily' || s.repeat === 'weekly'
            ? s.repeat
            : s.id === 'assignment'
              ? 'event'
              : s.id === 'week_list'
                ? 'weekly'
                : 'daily';
        const dayOffset =
          typeof s.dayOffset === 'number' && Number.isFinite(s.dayOffset)
            ? s.dayOffset
            : s.id === 'missing_need_tomorrow'
              ? 1
              : 0;
        return { ...s, repeat, dayOffset };
      }),
    );
  }, [coordScenariosQ.data]);

  function goToSection(next: TgSection) {
    setNote(null);
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set('tab', 'telegram');
        if (next === 'overview') params.delete('tg');
        else params.set('tg', next);
        if (next !== 'program') params.delete('program');
        return params;
      },
      { replace: true },
    );
  }

  function goToProgramPanel(next: ProgramPanel) {
    setNote(null);
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set('tab', 'telegram');
        params.set('tg', 'program');
        params.set('program', next);
        return params;
      },
      { replace: true },
    );
  }

  const saveBotMut = useMutation({
    mutationFn: () =>
      patchTelegramSettings({
        enabled: form.enabled,
        bot_token: normalizeUiOptionalUpdateString(form.bot_token),
        proxy_enabled: form.proxy_enabled,
        proxy_url: normalizeUiOptionalUpdateString(form.proxy_url),
      }),
    onSuccess: (next) => {
      setNote({ type: 'ok', text: 'Настройки бота сохранены.' });
      qc.setQueryData(Q_TG, next);
      setForm((prev) => ({ ...prev, bot_token: '', proxy_url: '' }));
    },
    onError: (e) =>
      setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось сохранить настройки бота.') }),
  });

  const saveRolesMut = useMutation({
    mutationFn: () =>
      patchTelegramSettings({
        prayer_chat_id: normalizeUiString(form.prayer_chat_id),
        coordinator_chat_id: normalizeUiString(form.coordinator_chat_id),
        default_chat_id: normalizeUiString(form.default_chat_id),
        media_chat_id: normalizeUiString(form.media_chat_id),
      }),
    onSuccess: (next) => {
      setNote({ type: 'ok', text: 'Роли чатов сохранены.' });
      qc.setQueryData(Q_TG, next);
    },
    onError: (e) =>
      setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось сохранить роли чатов.') }),
  });

  const savePrayerTemplateMut = useMutation({
    mutationFn: () =>
      patchTelegramSettings({
        prayer_template: normalizeUiString(form.prayer_template),
      }),
    onSuccess: (next) => {
      setNote({ type: 'ok', text: 'Шаблон молитвы сохранён.' });
      qc.setQueryData(Q_TG, next);
    },
    onError: (e) =>
      setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось сохранить шаблон молитвы.') }),
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

  const saveCoordScenariosMut = useMutation({
    mutationFn: () =>
      patchCoordinatorTelegramScenarios({
        timezone: coordTimezone.trim() || 'Europe/Moscow',
        scenarios: coordScenarios,
      }),
    onSuccess: (next) => {
      setCoordTimezone(next.timezone);
      setCoordScenarios(next.scenarios.map((s) => ({ ...s })));
      qc.setQueryData(Q_TG_COORD_SCENARIOS, next);
      setNote({ type: 'ok', text: 'Сценарии координаторов сохранены.' });
    },
    onError: (e) =>
      setNote({
        type: 'err',
        text: apiErrorMessage(e, 'Не удалось сохранить сценарии координаторов.'),
      }),
  });

  const runCoordScenarioMut = useMutation({
    mutationFn: (scenarioId: CoordinatorTelegramScenarioId) =>
      runCoordinatorTelegramScenarioNow({ scenario_id: scenarioId }),
    onSuccess: (r) => {
      if (r.scenario_id === 'week_list') {
        setNote({
          type: 'ok',
          text: `Список отправлен: личек ${r.sent_dm ?? 0}, чат ${r.sent_chat ? 'да' : 'нет'}.`,
        });
        return;
      }
      setNote({
        type: 'ok',
        text: `Сценарий выполнен. Отправлено сообщений: ${r.sent ?? 0}.`,
      });
    },
    onError: (e) =>
      setNote({
        type: 'err',
        text: humanizeTelegramError(e, 'Не удалось запустить сценарий.'),
      }),
  });

  function updateCoordScenario(
    id: CoordinatorTelegramScenarioId,
    patch: Partial<CoordinatorTelegramScenario>,
  ) {
    setCoordScenarios((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

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

  const syncProfilesMut = useMutation({
    mutationFn: () => syncMembersFromTelegramProfiles(),
    onSuccess: (r) => {
      setNote({
        type: 'ok',
        text: `Синхронизация завершена: просмотрено ${r.scanned}, обновлено ${r.processed} (аватары: ${r.avatars_updated}, телефоны: ${r.phones_updated}).`,
      });
    },
    onError: (e) =>
      setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось синхронизировать профили.') }),
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
        service_plan_mailing_destinations: normalizeDestinations(next.service_plan_mailing_destinations),
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
        service_plan_published_destinations: normalizeDestinations(next.service_plan_published_destinations),
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

  const activeSectionMeta = TG_SECTIONS.find((s) => s.id === section);

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

  const rolesAssigned =
    Boolean(form.prayer_chat_id.trim()) ||
    Boolean(form.coordinator_chat_id.trim()) ||
    Boolean(form.default_chat_id.trim());
  const prayerConfigured =
    form.prayer_template.trim().length > 0 || dispatchForm.enabled;
  const coordinatorsConfigured =
    coordScenarios.some((s) => s.enabled) && Boolean(form.coordinator_chat_id.trim());
  const programConfigured =
    form.service_plan_mailing_enabled &&
    (form.service_plan_mailing_destinations.telegram_chat_ids.length > 0 ||
      form.service_plan_mailing_destinations.messenger_conversation_ids.length > 0);

  const setupSteps = [
    tokenReady,
    registryChats.length > 0,
    rolesAssigned,
    prayerConfigured,
    coordinatorsConfigured,
    programConfigured,
  ];
  const setupDoneCount = setupSteps.filter(Boolean).length;
  const setupTotal = setupSteps.length;

  return (
    <div className={`mx-auto space-y-5 ${section === 'program' ? 'max-w-5xl' : 'max-w-4xl'}`}>
      <StatusNote note={note} />

      <header className="space-y-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
            aria-hidden
          >
            <LuSend className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-bold tracking-tight text-stone-900">Telegram</h2>
            <p className="mt-0.5 text-sm text-stone-500">
              Бот, чаты, молитва, координаторы и авторассылки программы
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusChip ok={form.enabled} okLabel="Включён" badLabel="Выключен" />
              <StatusChip
                ok={tokenReady}
                okLabel={
                  settings.bot_token_masked ? `Токен ${settings.bot_token_masked}` : 'Токен задан'
                }
                badLabel="Нет токена"
                warn={!tokenReady}
              />
              <StatusChip
                ok={Boolean(settings.proxy.active_source)}
                okLabel="Прокси активен"
                badLabel="Прокси выкл."
              />
              <StatusChip
                ok={registryChats.length > 0}
                okLabel={`${registryChats.length} чат${registryChats.length === 1 ? '' : registryChats.length < 5 ? 'а' : 'ов'}`}
                badLabel="Нет чатов"
                warn={registryChats.length === 0}
              />
              <StatusChip
                ok={recipientsCount > 0}
                okLabel={`${recipientsCount} с Telegram ID`}
                badLabel="Нет Telegram ID"
                warn={recipientsCount === 0}
              />
            </div>
          </div>
        </div>
      </header>

      <nav
        className="rounded-xl border border-stone-200/90 bg-stone-50/80 p-1"
        aria-label="Разделы Telegram"
      >
        <div className="flex gap-1 overflow-x-auto">
          {TG_SECTIONS.map((item) => {
            const active = section === item.id;
            const Icon = SECTION_ICONS[item.id];
            return (
              <button
                key={item.id}
                type="button"
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  active
                    ? 'bg-white text-stone-900 shadow-sm'
                    : 'text-stone-500 hover:bg-white/70 hover:text-stone-800'
                }`}
                aria-current={active ? 'page' : undefined}
                onClick={() => goToSection(item.id)}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                {item.label}
              </button>
            );
          })}
        </div>
        {activeSectionMeta ? (
          <p className="px-2 pb-1 pt-2 text-xs text-stone-500" aria-live="polite">
            {activeSectionMeta.hint}
          </p>
        ) : null}
      </nav>

      <section className="rounded-2xl border border-stone-200/90 bg-white p-5 shadow-sm">
        {section === 'overview' ? (
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-3 rounded-2xl border border-stone-200/90 bg-stone-50/40 p-4">
              <PanelIntro
                title="Настройка"
                action={
                  <span className="text-xs font-semibold tabular-nums text-stone-600">
                    {setupDoneCount}/{setupTotal}
                  </span>
                }
              >
                <p>Пройдите шаги по порядку — так быстрее запустить рассылки.</p>
              </PanelIntro>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-stone-200/90"
                role="progressbar"
                aria-valuenow={setupDoneCount}
                aria-valuemin={0}
                aria-valuemax={setupTotal}
                aria-label="Прогресс настройки Telegram"
              >
                <div
                  className="h-full rounded-full bg-[#7B2D3F] transition-[width] duration-300"
                  style={{ width: `${(setupDoneCount / setupTotal) * 100}%` }}
                />
              </div>
              <div className="space-y-2">
                <SetupStepRow
                  step={1}
                  done={tokenReady}
                  title="Бот подключён"
                  hint="Токен от @BotFather и проверка подключения"
                  actionLabel="Настроить бота"
                  onAction={() => goToSection('bot')}
                />
                <SetupStepRow
                  step={2}
                  done={registryChats.length > 0}
                  title="Чаты в реестре"
                  hint="Группы и каналы, куда бот может писать"
                  actionLabel="Добавить чаты"
                  onAction={() => goToSection('chats')}
                />
                <SetupStepRow
                  step={3}
                  done={rolesAssigned}
                  title="Роли назначены"
                  hint="Молитва, координаторы, запасной чат"
                  actionLabel="Назначить роли"
                  onAction={() => goToSection('chats')}
                />
                <SetupStepRow
                  step={4}
                  done={prayerConfigured}
                  title="Молитва и личная рассылка"
                  hint="Шаблон текста или планировщик личных сообщений"
                  actionLabel="Настроить молитву"
                  onAction={() => goToSection('prayer')}
                />
                <SetupStepRow
                  step={5}
                  done={coordinatorsConfigured}
                  title="Сценарии координаторов"
                  hint="Назначения, напоминания о нуждах, недельный список"
                  actionLabel="Настроить сценарии"
                  onAction={() => goToSection('coordinators')}
                />
                <SetupStepRow
                  step={6}
                  done={programConfigured}
                  title="Авторассылка программы"
                  hint="Плановая рассылка по расписанию"
                  actionLabel="Настроить программу"
                  onAction={() => goToSection('program')}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-stone-200/90 bg-white p-4">
              <PanelIntro title="Быстрые действия">
                <p>Проверки и разовые отправки без перехода в разделы.</p>
              </PanelIntro>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  className={btnSecondary('justify-start gap-2')}
                  disabled={testConnectionMut.isPending || !tokenReady}
                  onClick={() => {
                    setNote(null);
                    testConnectionMut.mutate();
                  }}
                >
                  <LuBot className="h-4 w-4 shrink-0" aria-hidden />
                  {testConnectionMut.isPending ? 'Проверка…' : 'Проверить бота'}
                </button>
                <button
                  type="button"
                  className={btnSecondary('justify-start gap-2')}
                  disabled={syncProfilesMut.isPending}
                  onClick={() => {
                    setNote(null);
                    syncProfilesMut.mutate();
                  }}
                >
                  <LuUsers className="h-4 w-4 shrink-0" aria-hidden />
                  {syncProfilesMut.isPending ? 'Синхронизация…' : 'Синхронизировать профили'}
                </button>
                <button
                  type="button"
                  className={btnSecondary('justify-start gap-2')}
                  disabled={sendMut.isPending}
                  onClick={() => {
                    setNote(null);
                    sendMut.mutate({ kind: 'prayer_today' });
                  }}
                >
                  <LuHeart className="h-4 w-4 shrink-0" aria-hidden />
                  Отправить молитву в канал
                </button>
                <button
                  type="button"
                  className={btnSecondary('justify-start gap-2')}
                  onClick={() => goToSection('program')}
                >
                  <LuCalendarDays className="h-4 w-4 shrink-0" aria-hidden />
                  Открыть программу
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {section === 'bot' ? (
          <div className="space-y-4">
            <PanelIntro title="Бот и подключение">
              <p>Токен, включение отправки и исходящий HTTP-прокси.</p>
            </PanelIntro>
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
                Можно задать здесь или через{' '}
                <code className="rounded bg-stone-100 px-1">TELEGRAM_BOT_TOKEN</code>.
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
                Если api.telegram.org недоступен с сервера — укажите внешний HTTP(S)-прокси. Не нужно
                ставить прокси на сервер: backend сам ходит через URL. Приоритет: настройки проекта →{' '}
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

            <div className="border-t border-stone-100 pt-4">
              <button
                type="button"
                className={btnPrimary()}
                disabled={saveBotMut.isPending}
                onClick={() => {
                  setNote(null);
                  saveBotMut.mutate();
                }}
              >
                {saveBotMut.isPending ? 'Сохранение…' : 'Сохранить настройки бота'}
              </button>
            </div>
          </div>
        ) : null}

        {section === 'chats' ? (
          <div className="space-y-8">
            <div className="space-y-5">
              <PanelIntro
                title="Реестр"
                action={
                  <span className="inline-flex items-center rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-semibold text-stone-700">
                    {registryChats.length}{' '}
                    {registryChats.length === 1 ? 'чат' : registryChats.length < 5 ? 'чата' : 'чатов'}
                  </span>
                }
              >
                <p>
                  База чатов для авторассылок. Добавьте ID группы или канала — бот запросит данные через
                  Telegram API и сохранит название.
                </p>
              </PanelIntro>

              <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Добавить чат
                </label>
                <p className="mb-3 text-xs text-stone-500">
                  Числовой ID (−100…) или @username. Бот должен быть участником чата.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    className={fieldClass()}
                    value={newChatId}
                    onChange={(e) => setNewChatId(e.target.value)}
                    placeholder="-1001234567890 или @channel"
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
                  <button
                    type="button"
                    className={btnPrimary('shrink-0 sm:min-w-[9.5rem]')}
                    disabled={!newChatId.trim() || addChatMut.isPending}
                    onClick={() => {
                      const id = newChatId.trim();
                      if (!id) return;
                      setNote(null);
                      addChatMut.mutate(id);
                    }}
                  >
                    {addChatMut.isPending ? 'Загрузка…' : 'Добавить'}
                  </button>
                </div>
              </div>

              {chatsQ.isLoading ? (
                <p className="text-sm text-stone-500">Загрузка реестра…</p>
              ) : chatsQ.isError ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  Не удалось загрузить реестр чатов.
                </p>
              ) : registryChats.length === 0 ? (
                <div className="rounded-xl border border-dashed border-stone-300 bg-white px-5 py-10 text-center">
                  <p className="text-sm font-semibold text-stone-800">Реестр пуст</p>
                  <p className="mx-auto mt-1.5 max-w-md text-sm text-stone-500">
                    Добавьте хотя бы один чат выше. Без реестра в авторассылках не из чего выбирать.
                  </p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-stone-200">
                  <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] gap-3 border-b border-stone-100 bg-stone-50/90 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500 sm:grid">
                    <span>Название</span>
                    <span>ID</span>
                    <span className="text-right">Действия</span>
                  </div>
                  <ul className="divide-y divide-stone-100">
                    {registryChats.map((chat) => {
                      const badge = chatTypeBadge(chat.type);
                      const synced = formatSyncedAt(chat.last_synced_at);
                      return (
                        <li
                          key={chat.id}
                          className="grid gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-center"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-semibold text-stone-900">
                                {chat.title?.trim() ||
                                  (chat.username ? `@${chat.username}` : null) ||
                                  'Без названия'}
                              </span>
                              <span
                                className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${badge.className}`}
                              >
                                {badge.label}
                              </span>
                            </div>
                            {synced ? (
                              <p className="mt-1 text-[11px] text-stone-400">Обновлён {synced}</p>
                            ) : null}
                            {chat.description ? (
                              <p className="mt-1 line-clamp-1 text-xs text-stone-500">{chat.description}</p>
                            ) : null}
                          </div>
                          <div className="min-w-0">
                            <code className="block truncate rounded-lg bg-stone-50 px-2 py-1 font-mono text-xs text-stone-700">
                              {chat.chat_id}
                            </code>
                            {chat.username ? (
                              <p className="mt-1 truncate text-[11px] text-stone-400">@{chat.username}</p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
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
                                if (
                                  !window.confirm(
                                    `Удалить «${chatLabel(chat)}» из реестра?\nВ авторассылках этот чат нужно будет выбрать заново.`,
                                  )
                                ) {
                                  return;
                                }
                                setNote(null);
                                deleteChatMut.mutate(chat.id);
                              }}
                            >
                              Удалить
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            <div className="space-y-5 border-t border-stone-100 pt-8">
              <PanelIntro title="Роли чатов">
                <p>Выберите из реестра, куда уходят сообщения по ролям.</p>
              </PanelIntro>
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
              <button
                type="button"
                className={btnPrimary()}
                disabled={saveRolesMut.isPending}
                onClick={() => {
                  setNote(null);
                  saveRolesMut.mutate();
                }}
              >
                {saveRolesMut.isPending ? 'Сохранение…' : 'Сохранить роли'}
              </button>
            </div>
          </div>
        ) : null}

        {section === 'prayer' ? (
          <div className="space-y-5">
            <PanelIntro title="Молитва">
              <p>Шаблон для канала, личная рассылка участникам и ручные отправки.</p>
            </PanelIntro>

            <div
              className="flex flex-wrap gap-1 rounded-xl border border-stone-200 bg-stone-50/80 p-1"
              role="tablist"
              aria-label="Подразделы молитвы"
            >
              {PRAYER_PANELS.map((panel) => {
                const active = prayerPanel === panel.id;
                return (
                  <button
                    key={panel.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                      active
                        ? 'bg-white text-stone-900 shadow-sm'
                        : 'text-stone-500 hover:bg-white/70 hover:text-stone-800'
                    }`}
                    onClick={() => setPrayerPanel(panel.id)}
                  >
                    {panel.label}
                  </button>
                );
              })}
            </div>

            {prayerPanel === 'template' ? (
              <div className="space-y-4" role="tabpanel">
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
                    className={btnPrimary()}
                    disabled={savePrayerTemplateMut.isPending}
                    onClick={() => {
                      setNote(null);
                      savePrayerTemplateMut.mutate();
                    }}
                  >
                    {savePrayerTemplateMut.isPending ? 'Сохранение…' : 'Сохранить шаблон'}
                  </button>
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

            {prayerPanel === 'dispatch' ? (
              <div className="space-y-5" role="tabpanel">
                <div>
                  <h3 className="text-sm font-semibold text-stone-900">Личная авторассылка молитвы</h3>
                  <p className="mt-0.5 text-xs text-stone-500">
                    Каждому участнику с Telegram ID в карточке — отдельно от рассылки программы.
                    Часовой пояс сервера:{' '}
                    <code className="rounded bg-stone-100 px-1 text-[11px]">
                      {dispatchForm.server_timezone}
                    </code>
                  </p>
                </div>

                {lastDispatchLabel ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
                    <LuClock className="h-4 w-4 shrink-0 text-stone-500" aria-hidden />
                    Последняя отправка:{' '}
                    <span className="font-medium text-stone-900">{lastDispatchLabel}</span>
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
              </div>
            ) : null}

            {prayerPanel === 'manual' ? (
              <div className="space-y-4" role="tabpanel">
                <div>
                  <h3 className="text-sm font-semibold text-stone-900">Ручная отправка</h3>
                  <p className="mt-0.5 text-xs text-stone-500">
                    Разовые сообщения без планировщика.
                  </p>
                </div>
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
                      emptyHint="Добавьте чаты в разделе «Чаты», либо оставьте «по умолчанию»."
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
            ) : null}
          </div>
        ) : null}

        {section === 'coordinators' ? (
          <div className="space-y-5">
            <PanelIntro
              title="Сценарии для координаторов"
              action={
                <button
                  type="button"
                  className={btnPrimary()}
                  disabled={saveCoordScenariosMut.isPending}
                  onClick={() => {
                    setNote(null);
                    saveCoordScenariosMut.mutate();
                  }}
                >
                  {saveCoordScenariosMut.isPending ? 'Сохранение…' : 'Сохранить'}
                </button>
              }
            >
              <p>
                Дублируют push-уведомления о сборе молитвенных нужд: назначения, напоминания о
                пустой нужде и еженедельный список по координаторам — в личку или в чат с ролью
                «Координаторы».
              </p>
            </PanelIntro>

            {!form.coordinator_chat_id.trim() ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
                Не назначен чат с ролью «Координаторы». Сценарии с целью «Чат» не смогут отправить
                сообщение.{' '}
                <button
                  type="button"
                  className="font-semibold underline underline-offset-2"
                  onClick={() => goToSection('chats')}
                >
                  Назначить в разделе «Чаты»
                </button>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Часовой пояс
                </span>
                <input
                  className={fieldClass()}
                  value={coordTimezone}
                  onChange={(e) => setCoordTimezone(e.target.value)}
                  placeholder="Europe/Moscow"
                />
              </label>
              <p className="text-xs text-stone-500 sm:pb-2.5">
                Для плановых сценариев (напоминания и недельный список).
              </p>
            </div>

            <div className="space-y-4">
              {(coordScenarios.length > 0
                ? coordScenarios
                : (coordScenariosQ.data?.scenarios ?? [])
              ).map((scenario) => {
                const hint = COORDINATOR_SCENARIO_HINTS[scenario.id];
                return (
                  <article
                    key={scenario.id}
                    className="space-y-3 rounded-2xl border border-stone-200/90 bg-stone-50/40 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <input
                          className={`${fieldClass()} max-w-md font-semibold`}
                          value={scenario.title}
                          onChange={(e) =>
                            updateCoordScenario(scenario.id, { title: e.target.value })
                          }
                        />
                        <p className="text-xs text-stone-500">{hint.description}</p>
                      </div>
                      <Toggle
                        checked={scenario.enabled}
                        onChange={(enabled) => updateCoordScenario(scenario.id, { enabled })}
                        label={scenario.enabled ? 'Вкл.' : 'Выкл.'}
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block space-y-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                          Куда отправлять
                        </span>
                        <select
                          className={fieldClass()}
                          value={scenario.target}
                          onChange={(e) =>
                            updateCoordScenario(scenario.id, {
                              target: e.target.value as CoordinatorTelegramTarget,
                            })
                          }
                        >
                          {COORDINATOR_TARGET_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <span className="block text-xs text-stone-500">
                          {
                            COORDINATOR_TARGET_OPTIONS.find((o) => o.value === scenario.target)
                              ?.hint
                          }
                        </span>
                      </label>

                      {hint.schedule ? (
                        <label className="block space-y-1.5">
                          <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                            Как часто
                          </span>
                          <select
                            className={fieldClass()}
                            value={scenario.repeat === 'event' ? 'daily' : scenario.repeat}
                            onChange={(e) =>
                              updateCoordScenario(scenario.id, {
                                repeat: e.target.value as CoordinatorTelegramRepeat,
                              })
                            }
                          >
                            {COORDINATOR_REPEAT_OPTIONS.filter((o) => o.value !== 'event').map(
                              (opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ),
                            )}
                          </select>
                          <span className="block text-xs text-stone-500">
                            {
                              COORDINATOR_REPEAT_OPTIONS.find(
                                (o) =>
                                  o.value ===
                                  (scenario.repeat === 'event' ? 'daily' : scenario.repeat),
                              )?.hint
                            }
                          </span>
                        </label>
                      ) : (
                        <div className="rounded-xl border border-dashed border-stone-200 bg-white/70 px-3 py-2 text-xs text-stone-500">
                          Срабатывает сразу при назначении — расписание не нужно.
                        </div>
                      )}
                    </div>

                    {hint.schedule ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {hint.missingNeed ? (
                          <label className="block space-y-1.5">
                            <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                              Условие: день в цикле
                            </span>
                            <select
                              className={fieldClass()}
                              value={scenario.dayOffset}
                              onChange={(e) =>
                                updateCoordScenario(scenario.id, {
                                  dayOffset: Number(e.target.value),
                                })
                              }
                            >
                              {COORDINATOR_DAY_OFFSET_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            <span className="block text-xs text-stone-500">
                              Проверяется участник этого дня цикла. Сообщение уйдёт его
                              ответственному координатору — у каждого координатора свои дни.
                            </span>
                          </label>
                        ) : scenario.repeat === 'weekly' ? (
                          <label className="block space-y-1.5">
                            <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                              День недели
                            </span>
                            <select
                              className={fieldClass()}
                              value={scenario.weekDay}
                              onChange={(e) =>
                                updateCoordScenario(scenario.id, {
                                  weekDay: Number(e.target.value),
                                })
                              }
                            >
                              {WEEKDAY_OPTIONS.map((d) => (
                                <option key={d.value} value={d.value}>
                                  {d.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : (
                          <div className="rounded-xl border border-dashed border-stone-200 bg-white/70 px-3 py-2 text-xs text-stone-500">
                            Каждый день — день недели не нужен.
                          </div>
                        )}

                        <label className="block space-y-1.5">
                          <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                            Время
                          </span>
                          <input
                            type="time"
                            className={fieldClass()}
                            value={scenario.time}
                            onChange={(e) =>
                              updateCoordScenario(scenario.id, { time: e.target.value })
                            }
                          />
                          {hint.missingNeed && scenario.repeat === 'weekly' ? (
                            <span className="block text-xs text-amber-800">
                              Для разных дней цикла у координаторов лучше «Каждый день».
                            </span>
                          ) : null}
                        </label>

                        {hint.missingNeed && scenario.repeat === 'weekly' ? (
                          <label className="block space-y-1.5 sm:col-span-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                              День недели (только при «Раз в неделю»)
                            </span>
                            <select
                              className={fieldClass()}
                              value={scenario.weekDay}
                              onChange={(e) =>
                                updateCoordScenario(scenario.id, {
                                  weekDay: Number(e.target.value),
                                })
                              }
                            >
                              {WEEKDAY_OPTIONS.map((d) => (
                                <option key={d.value} value={d.value}>
                                  {d.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <label className="block space-y-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                          Шаблон сообщения
                        </span>
                        <textarea
                          ref={(el) => {
                            coordBodyRefs.current[scenario.id] = el;
                          }}
                          className={`${fieldClass()} min-h-[120px] font-mono text-[13px] leading-relaxed`}
                          value={scenario.customBody ?? ''}
                          onChange={(e) =>
                            updateCoordScenario(scenario.id, { customBody: e.target.value })
                          }
                          placeholder={
                            scenario.id === 'week_list'
                              ? 'Список на {{week_range}}\n\n{{assignments_block}}'
                              : scenario.id === 'assignment'
                                ? '{{actor}} назначил(а) вам {{member_name}} на {{week_label}} неделю ({{week_range}}).\nДень в цикле: {{member_cycle_weekday}}, {{member_cycle_date}}.'
                                : '{{member_name}}: нужда на {{date_long}} не заполнена.\nОтветственный: {{coordinator_name}}.'
                          }
                        />
                        <span className="block text-xs text-stone-500">
                          Пустое поле — стандартный текст как в push. Вставьте поля ниже.
                        </span>
                      </label>
                      <TemplateFieldInserter
                        groups={COORDINATOR_TEMPLATE_FIELD_GROUPS}
                        searchPlaceholder="Найти: неделя, участник, координатор…"
                        onInsert={(token) =>
                          insertAtCursor(
                            coordBodyRefs.current[scenario.id] ?? null,
                            token,
                            scenario.customBody ?? '',
                            (next) => updateCoordScenario(scenario.id, { customBody: next }),
                          )
                        }
                      />
                    </div>

                    {scenario.id !== 'assignment' ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={btnSecondary()}
                          disabled={
                            runCoordScenarioMut.isPending ||
                            !scenario.enabled ||
                            !tokenReady
                          }
                          onClick={() => {
                            setNote(null);
                            runCoordScenarioMut.mutate(scenario.id);
                          }}
                        >
                          {runCoordScenarioMut.isPending &&
                          runCoordScenarioMut.variables === scenario.id
                            ? 'Отправка…'
                            : 'Запустить сейчас'}
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </div>
        ) : null}

        {section === 'program' ? (
          <div className="space-y-5">
            <PanelIntro title="Авторассылки программы">
              <p>
                Два разных сообщения: плановая рассылка по расписанию и короткое уведомление при
                публикации. Настройте каждое по шагам.
              </p>
            </PanelIntro>

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
                    onClick={() => goToProgramPanel(panel.id)}
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
                        <span className="block text-sm font-semibold text-stone-900">{panel.title}</span>
                        <span className="mt-0.5 block text-xs text-stone-500">{panel.hint}</span>
                        <span className="mt-1.5 block text-[11px] font-medium text-stone-600">{status}</span>
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
                            <p className="text-sm font-medium text-stone-700">Пока нет предпросмотра</p>
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
                              service_plan_published_button_text: DEFAULT_PROGRAM_PUBLISHED_BUTTON_TEXT,
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
                            <p className="text-sm font-medium text-stone-700">Пока нет предпросмотра</p>
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
      </section>
    </div>
  );
}
