import type { Request, Response } from 'express';
import {
  buildNextWeekPlanTelegramText,
  buildTodayPrayerTelegramText,
  getServicePlanMailingDestinationsRaw,
  getTelegramDispatchSettings,
  getTelegramSettings,
  listTelegramDispatchRecipients,
  resolvePrayerDispatchCalendarYmd,
  runTelegramDispatchNow,
  sendTodayPrayerTelegramToAllMembers,
  sendTelegramByPurpose,
  testTelegramBotConnection,
  testTelegramProxyConnection,
  updateTelegramDispatchSettings,
  updateTelegramSettings,
} from '../services/telegramService';
import {
  getCoordinatorTelegramScenariosPublic,
  loadCoordinatorTelegramScenarios,
  patchCoordinatorTelegramScenarios,
  runCoordinatorTelegramScenarioNow,
} from '../services/coordinatorTelegramScenariosService';
import type {
  CoordinatorTelegramScenario,
  CoordinatorTelegramScenarioId,
} from '../types/coordinatorTelegramScenarios';
import { DEFAULT_COORDINATOR_TG_SCENARIOS } from '../types/coordinatorTelegramScenarios';
import {
  getServicePlanMailingSchedule,
  updateServicePlanMailingSchedule,
} from '../services/servicePlanMondayMailingService';
import {
  listServicePlanMailingMessengerChats,
  MEDIA_TEAM_CHANNEL_KIND,
  SERVICE_PLAN_PLANNING_CHANNEL_KIND,
} from '../services/messengerService';
import { parseDestinationsPatchInput } from '../services/servicePlanMailingDestinations';
import {
  deleteTelegramChat,
  listTelegramChats,
  refreshTelegramChat,
  upsertTelegramChatById,
} from '../services/telegramChatsService';
import { notifyRealtime } from '../realtime/notify';

type AuthRequest = Request & { authUserId?: number; authUserRole?: string };

function ensureAdmin(req: Request, res: Response): AuthRequest | null {
  const r = req as AuthRequest;
  if (!r.authUserId) {
    res.status(401).json({ error: 'Требуется вход в аккаунт' });
    return null;
  }
  if (r.authUserRole !== 'admin') {
    res.status(403).json({ error: 'Недостаточно прав' });
    return null;
  }
  return r;
}

function errorToStatus(error: unknown): { status: number; message: string } {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg === 'telegram_disabled') return { status: 409, message: 'Telegram модуль выключен в настройках' };
  if (msg === 'telegram_missing_token') return { status: 400, message: 'Не задан Telegram Bot Token' };
  if (msg === 'telegram_bot_token_invalid_chars') {
    return {
      status: 400,
      message:
        'Токен содержит недопустимые символы. Скопируйте его из @BotFather заново (без пробелов и «умных» кавычек).',
    };
  }
  if (msg === 'telegram_missing_chat') return { status: 400, message: 'Не задан Telegram chat_id' };
  if (msg === 'telegram_missing_member_chats') {
    return { status: 400, message: 'Не найдено пользователей с заполненным Telegram ID' };
  }
  if (msg === 'telegram_empty_text') return { status: 400, message: 'Текст сообщения пуст' };
  if (msg === 'telegram_message_text_too_long_internal') {
    return {
      status: 500,
      message:
        'Не удалось разбить текст на части для Telegram (внутренняя ошибка длины). Сообщите разработчикам.',
    };
  }
  if (msg === 'telegram_prayer_date_invalid') {
    return { status: 400, message: 'Некорректная дата. Ожидается YYYY-MM-DD.' };
  }
  if (msg === 'telegram_once_at_invalid') {
    return {
      status: 400,
      message: 'Неверная дата и время. Укажите в формате ГГГГ-ММ-ДДTчч:мм в часовом поясе сервера.',
    };
  }
  if (msg.startsWith('telegram_send_failed:')) {
    const parts = msg.split(':');
    const status = parts[1] ?? '';
    const detail = parts.slice(2).join(':').trim();
    const detailLower = detail.toLowerCase();
    if (
      detailLower.includes('text is too long') ||
      detailLower.includes('message is too long') ||
      detailLower.includes('caption is too long')
    ) {
      return {
        status: 413,
        message:
          'Текст длиннее лимита Telegram (4096 символов на одно сообщение). Сократите блок молитвы или шаблон в админке. Если ошибка повторяется после обновления сервера, увеличьте таймаут прокси: рассылка отправляет несколько сообщений подряд каждому получателю.',
      };
    }
    if (status === '0') {
      return {
        status: 502,
        message: detail
          ? `Запрос к Telegram не выполнен (сеть или TLS): ${detail}. Исходящий HTTPS 443 до api.telegram.org; curl -I https://api.telegram.org`
          : 'Запрос к Telegram не выполнен (сеть или TLS). Проверьте HTTPS 443 и DNS.',
      };
    }
    return {
      status: 502,
      message: detail
        ? `Telegram API вернул ошибку (${status}): ${detail}`
        : 'Telegram API вернул ошибку при отправке',
    };
  }
  if (msg === 'telegram_connection_timeout') {
    return { status: 504, message: 'Таймаут при обращении к Telegram API' };
  }
  if (msg.startsWith('telegram_getme_failed:')) {
    const parts = msg.split(':');
    const status = parts[1] ?? '';
    const detail = parts.slice(2).join(':').trim();
    return {
      status: 502,
      message: detail
        ? `Telegram getMe (${status}): ${detail}`
        : `Telegram getMe вернул ошибку (${status})`,
    };
  }
  if (msg.startsWith('telegram_getme_network:')) {
    const detail = msg.slice('telegram_getme_network:'.length).trim();
    return {
      status: 502,
      message: detail
        ? `Нет связи с Telegram API: ${detail}. Исходящий HTTPS 443 до api.telegram.org; на сервере: curl -I https://api.telegram.org`
        : 'Нет связи с Telegram API. Проверьте исходящий HTTPS 443 и DNS (curl -I https://api.telegram.org).',
    };
  }
  if (msg === 'telegram_settings_read') {
    return { status: 503, message: 'Не удалось прочитать настройки из базы данных' };
  }
  if (msg === 'telegram_proxy_url_invalid') {
    return {
      status: 400,
      message:
        'Некорректный URL прокси. Пример: http://user:pass@host:8080 или http://host:3128',
    };
  }
  if (msg === 'telegram_proxy_protocol_unsupported') {
    return {
      status: 400,
      message: 'Поддерживаются только HTTP и HTTPS прокси (не SOCKS). Пример: http://host:8080',
    };
  }
  if (msg === 'telegram_proxy_agent_invalid') {
    return { status: 400, message: 'Не удалось создать клиент прокси. Проверьте URL.' };
  }
  if (msg === 'telegram_proxy_not_configured') {
    return {
      status: 400,
      message:
        'Прокси не настроен. Укажите URL в настройках Telegram или во временном поле проверки.',
    };
  }
  if (msg === 'telegram_chat_id_invalid') {
    return {
      status: 400,
      message: 'Некорректный ID чата. Укажите числовой ID (−100…) или @username.',
    };
  }
  if (msg === 'telegram_chat_not_found') {
    return { status: 404, message: 'Чат не найден в базе' };
  }
  if (msg.startsWith('telegram_getchat_failed:')) {
    const detail = msg.slice('telegram_getchat_failed:'.length).trim();
    return {
      status: 502,
      message: detail
        ? `Не удалось получить данные чата из Telegram: ${detail}. Бот должен быть добавлен в чат.`
        : 'Не удалось получить данные чата из Telegram. Бот должен быть добавлен в чат.',
    };
  }
  return { status: 500, message: 'Внутренняя ошибка Telegram модуля' };
}

export async function getTelegramSettingsHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  try {
    const [settings, mailingSchedule, destRaw, messengerChats] = await Promise.all([
      getTelegramSettings(),
      getServicePlanMailingSchedule(),
      getServicePlanMailingDestinationsRaw(),
      listServicePlanMailingMessengerChats().catch(() => []),
    ]);

    const planningId =
      messengerChats.find((c) => c.kind === SERVICE_PLAN_PLANNING_CHANNEL_KIND)?.id ?? null;
    const mediykaId =
      messengerChats.find((c) => c.kind === MEDIA_TEAM_CHANNEL_KIND)?.id ?? null;

    // Пока destinations не сохранены — подставляем рекомендуемые чаты приложения в ответ API.
    const mailingDestinations =
      destRaw.mailing != null
        ? settings.service_plan_mailing_destinations
        : {
            telegram_chat_ids: settings.service_plan_mailing_destinations.telegram_chat_ids,
            messenger_conversation_ids: planningId ? [planningId] : [],
          };
    const publishedDestinations =
      destRaw.published != null
        ? settings.service_plan_published_destinations
        : {
            telegram_chat_ids: settings.service_plan_published_destinations.telegram_chat_ids,
            messenger_conversation_ids: [planningId, mediykaId].filter(
              (id): id is string => Boolean(id),
            ),
          };

    res.json({
      ...settings,
      service_plan_mailing_destinations: mailingDestinations,
      service_plan_published_destinations: publishedDestinations,
      service_plan_mailing_enabled: mailingSchedule.enabled,
      service_plan_mailing_weekday: mailingSchedule.weekday,
      service_plan_mailing_time: mailingSchedule.time_hhmm,
      service_plan_mailing_timezone: mailingSchedule.timezone,
    });
  } catch (error) {
    console.error('[telegram] get settings failed:', error);
    res.status(500).json({ error: 'Не удалось загрузить Telegram настройки' });
  }
}

export async function getTelegramMailingMessengerChatsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  try {
    const chats = await listServicePlanMailingMessengerChats();
    res.json({ chats });
  } catch (error) {
    console.error('[telegram] list mailing messenger chats failed:', error);
    res.status(500).json({ error: 'Не удалось загрузить список чатов приложения' });
  }
}

export async function patchTelegramSettingsHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const body = req.body as
    | {
        enabled?: unknown;
        bot_token?: unknown;
        prayer_chat_id?: unknown;
        coordinator_chat_id?: unknown;
        default_chat_id?: unknown;
        prayer_template?: unknown;
        service_plan_chat_id?: unknown;
        service_plan_template?: unknown;
        service_plan_published_chat_id?: unknown;
        media_chat_id?: unknown;
        service_plan_mailing_destinations?: unknown;
        service_plan_published_destinations?: unknown;
        service_plan_published_template?: unknown;
        service_plan_published_button_text?: unknown;
        proxy_enabled?: unknown;
        proxy_url?: unknown;
        service_plan_mailing_enabled?: unknown;
        service_plan_mailing_weekday?: unknown;
        service_plan_mailing_time?: unknown;
        service_plan_mailing_timezone?: unknown;
      }
    | undefined;

  if (body?.enabled !== undefined && typeof body.enabled !== 'boolean') {
    res.status(400).json({ error: 'Поле "enabled" должно быть boolean' });
    return;
  }
  if (body?.bot_token !== undefined && body.bot_token !== null && typeof body.bot_token !== 'string') {
    res.status(400).json({ error: 'Поле "bot_token" должно быть строкой или null' });
    return;
  }
  if (
    body?.prayer_chat_id !== undefined &&
    body.prayer_chat_id !== null &&
    typeof body.prayer_chat_id !== 'string'
  ) {
    res.status(400).json({ error: 'Поле "prayer_chat_id" должно быть строкой или null' });
    return;
  }
  if (
    body?.coordinator_chat_id !== undefined &&
    body.coordinator_chat_id !== null &&
    typeof body.coordinator_chat_id !== 'string'
  ) {
    res.status(400).json({ error: 'Поле "coordinator_chat_id" должно быть строкой или null' });
    return;
  }
  if (
    body?.default_chat_id !== undefined &&
    body.default_chat_id !== null &&
    typeof body.default_chat_id !== 'string'
  ) {
    res.status(400).json({ error: 'Поле "default_chat_id" должно быть строкой или null' });
    return;
  }
  if (
    body?.prayer_template !== undefined &&
    body.prayer_template !== null &&
    typeof body.prayer_template !== 'string'
  ) {
    res.status(400).json({ error: 'Поле "prayer_template" должно быть строкой или null' });
    return;
  }
  if (
    body?.service_plan_chat_id !== undefined &&
    body.service_plan_chat_id !== null &&
    typeof body.service_plan_chat_id !== 'string'
  ) {
    res.status(400).json({ error: 'Поле "service_plan_chat_id" должно быть строкой или null' });
    return;
  }
  if (
    body?.service_plan_template !== undefined &&
    body.service_plan_template !== null &&
    typeof body.service_plan_template !== 'string'
  ) {
    res.status(400).json({ error: 'Поле "service_plan_template" должно быть строкой или null' });
    return;
  }
  if (
    body?.service_plan_published_chat_id !== undefined &&
    body.service_plan_published_chat_id !== null &&
    typeof body.service_plan_published_chat_id !== 'string'
  ) {
    res.status(400).json({ error: 'Поле "service_plan_published_chat_id" должно быть строкой или null' });
    return;
  }
  if (
    body?.media_chat_id !== undefined &&
    body.media_chat_id !== null &&
    typeof body.media_chat_id !== 'string'
  ) {
    res.status(400).json({ error: 'Поле "media_chat_id" должно быть строкой или null' });
    return;
  }
  if (body?.service_plan_mailing_destinations !== undefined) {
    const parsed = parseDestinationsPatchInput(body.service_plan_mailing_destinations);
    if (parsed === undefined) {
      res.status(400).json({
        error:
          'Поле "service_plan_mailing_destinations" должно быть объектом { telegram_chat_ids, messenger_conversation_ids } или null',
      });
      return;
    }
  }
  if (body?.service_plan_published_destinations !== undefined) {
    const parsed = parseDestinationsPatchInput(body.service_plan_published_destinations);
    if (parsed === undefined) {
      res.status(400).json({
        error:
          'Поле "service_plan_published_destinations" должно быть объектом { telegram_chat_ids, messenger_conversation_ids } или null',
      });
      return;
    }
  }
  if (
    body?.service_plan_published_template !== undefined &&
    body.service_plan_published_template !== null &&
    typeof body.service_plan_published_template !== 'string'
  ) {
    res.status(400).json({ error: 'Поле "service_plan_published_template" должно быть строкой или null' });
    return;
  }
  if (
    body?.service_plan_published_button_text !== undefined &&
    body.service_plan_published_button_text !== null &&
    typeof body.service_plan_published_button_text !== 'string'
  ) {
    res.status(400).json({
      error: 'Поле "service_plan_published_button_text" должно быть строкой или null',
    });
    return;
  }
  if (body?.proxy_enabled !== undefined && typeof body.proxy_enabled !== 'boolean') {
    res.status(400).json({ error: 'Поле "proxy_enabled" должно быть boolean' });
    return;
  }
  if (body?.proxy_url !== undefined && body.proxy_url !== null && typeof body.proxy_url !== 'string') {
    res.status(400).json({ error: 'Поле "proxy_url" должно быть строкой или null' });
    return;
  }
  if (
    body?.service_plan_mailing_enabled !== undefined &&
    typeof body.service_plan_mailing_enabled !== 'boolean'
  ) {
    res.status(400).json({ error: 'Поле "service_plan_mailing_enabled" должно быть boolean' });
    return;
  }
  if (body?.service_plan_mailing_weekday !== undefined) {
    const wd = Number(body.service_plan_mailing_weekday);
    if (!Number.isInteger(wd) || wd < 0 || wd > 6) {
      res.status(400).json({ error: 'Поле "service_plan_mailing_weekday" должно быть 0–6' });
      return;
    }
  }
  if (
    body?.service_plan_mailing_time !== undefined &&
    body.service_plan_mailing_time !== null &&
    (typeof body.service_plan_mailing_time !== 'string' ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.service_plan_mailing_time.trim()))
  ) {
    res.status(400).json({ error: 'Поле "service_plan_mailing_time" должно быть HH:MM' });
    return;
  }
  if (
    body?.service_plan_mailing_timezone !== undefined &&
    body.service_plan_mailing_timezone !== null &&
    typeof body.service_plan_mailing_timezone !== 'string'
  ) {
    res.status(400).json({ error: 'Поле "service_plan_mailing_timezone" должно быть строкой' });
    return;
  }

  try {
    const settings = await updateTelegramSettings({
      enabled: body?.enabled as boolean | undefined,
      bot_token: body?.bot_token as string | null | undefined,
      prayer_chat_id: body?.prayer_chat_id as string | null | undefined,
      coordinator_chat_id: body?.coordinator_chat_id as string | null | undefined,
      default_chat_id: body?.default_chat_id as string | null | undefined,
      prayer_template: body?.prayer_template as string | null | undefined,
      service_plan_chat_id: body?.service_plan_chat_id as string | null | undefined,
      service_plan_template: body?.service_plan_template as string | null | undefined,
      service_plan_published_chat_id: body?.service_plan_published_chat_id as string | null | undefined,
      media_chat_id: body?.media_chat_id as string | null | undefined,
      service_plan_mailing_destinations: parseDestinationsPatchInput(
        body?.service_plan_mailing_destinations,
      ),
      service_plan_published_destinations: parseDestinationsPatchInput(
        body?.service_plan_published_destinations,
      ),
      service_plan_published_template: body?.service_plan_published_template as
        | string
        | null
        | undefined,
      service_plan_published_button_text: body?.service_plan_published_button_text as
        | string
        | null
        | undefined,
      proxy_enabled: body?.proxy_enabled as boolean | undefined,
      proxy_url: body?.proxy_url as string | null | undefined,
    });

    const schedulePatch: {
      enabled?: boolean;
      weekday?: number;
      time_hhmm?: string;
      timezone?: string;
    } = {};
    if (typeof body?.service_plan_mailing_enabled === 'boolean') {
      schedulePatch.enabled = body.service_plan_mailing_enabled;
    }
    if (body?.service_plan_mailing_weekday !== undefined) {
      schedulePatch.weekday = Number(body.service_plan_mailing_weekday);
    }
    if (typeof body?.service_plan_mailing_time === 'string') {
      schedulePatch.time_hhmm = body.service_plan_mailing_time.trim();
    }
    if (typeof body?.service_plan_mailing_timezone === 'string') {
      schedulePatch.timezone = body.service_plan_mailing_timezone.trim();
    }
    const mailingSchedule =
      Object.keys(schedulePatch).length > 0
        ? await updateServicePlanMailingSchedule(schedulePatch)
        : await getServicePlanMailingSchedule();

    notifyRealtime(['admin']);
    res.json({
      ...settings,
      service_plan_mailing_enabled: mailingSchedule.enabled,
      service_plan_mailing_weekday: mailingSchedule.weekday,
      service_plan_mailing_time: mailingSchedule.time_hhmm,
      service_plan_mailing_timezone: mailingSchedule.timezone,
    });
  } catch (error) {
    console.error('[telegram] patch settings failed:', error);
    const mapped = errorToStatus(error);
    if (mapped.status !== 500) {
      res.status(mapped.status).json({ error: mapped.message });
      return;
    }
    res.status(500).json({ error: 'Не удалось сохранить Telegram настройки' });
  }
}

export async function postTelegramSendHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const body = req.body as { kind?: unknown; text?: unknown; chat_id?: unknown } | undefined;
  const kind = typeof body?.kind === 'string' ? body.kind.trim() : '';
  const chatIdOverride = typeof body?.chat_id === 'string' ? body.chat_id.trim() : null;

  if (kind !== 'prayer_today' && kind !== 'next_week' && kind !== 'custom' && kind !== 'prayer_today_all_members') {
    res.status(400).json({ error: 'Поле "kind" должно быть: prayer_today | next_week | custom | prayer_today_all_members' });
    return;
  }
  if (kind === 'custom' && typeof body?.text !== 'string') {
    res.status(400).json({ error: 'Для kind=custom требуется строка в поле "text"' });
    return;
  }

  try {
    if (kind === 'prayer_today_all_members') {
      const sent = await sendTodayPrayerTelegramToAllMembers();
      res.json({
        ok: true,
        kind,
        chat_id: 'broadcast',
        sent_count: sent.sent_count,
      });
      return;
    }

    const text =
      kind === 'prayer_today'
        ? await buildTodayPrayerTelegramText()
        : kind === 'next_week'
          ? await buildNextWeekPlanTelegramText()
          : (body?.text as string);

    const purpose = kind === 'next_week' ? 'coordinator' : kind === 'custom' ? 'default' : 'prayer';
    const sent = await sendTelegramByPurpose({
      purpose,
      text,
      chatIdOverride,
    });

    res.json({
      ok: true,
      kind,
      chat_id: sent.chat_id,
    });
  } catch (error) {
    const mapped = errorToStatus(error);
    res.status(mapped.status).json({ error: mapped.message });
  }
}

export async function getTelegramDispatchSettingsHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  try {
    res.json(await getTelegramDispatchSettings());
  } catch (error) {
    console.error('[telegram] get dispatch settings failed:', error);
    res.status(500).json({ error: 'Не удалось загрузить настройки рассылки' });
  }
}

export async function patchTelegramDispatchSettingsHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const b = req.body as {
    enabled?: unknown;
    kind?: unknown;
    time_hhmm?: unknown;
    once_at_iso?: unknown;
    once_at_local?: unknown;
    target?: unknown;
    member_ids?: unknown;
  };
  if (b.enabled !== undefined && typeof b.enabled !== 'boolean') {
    res.status(400).json({ error: 'Поле "enabled" должно быть boolean' });
    return;
  }
  if (b.kind !== undefined && b.kind !== 'daily' && b.kind !== 'once') {
    res.status(400).json({ error: 'Поле "kind" должно быть daily | once' });
    return;
  }
  if (b.target !== undefined && b.target !== 'all' && b.target !== 'selected') {
    res.status(400).json({ error: 'Поле "target" должно быть all | selected' });
    return;
  }
  if (
    b.member_ids !== undefined &&
    (!Array.isArray(b.member_ids) || b.member_ids.some((x) => !Number.isInteger(Number(x)) || Number(x) <= 0))
  ) {
    res.status(400).json({ error: 'Поле "member_ids" должно быть массивом положительных чисел' });
    return;
  }
  if (b.once_at_local !== undefined && b.once_at_local !== null && typeof b.once_at_local !== 'string') {
    res.status(400).json({ error: 'Поле "once_at_local" должно быть строкой или null' });
    return;
  }
  try {
    const next = await updateTelegramDispatchSettings({
      enabled: b.enabled as boolean | undefined,
      kind: b.kind as 'daily' | 'once' | undefined,
      time_hhmm: b.time_hhmm as string | null | undefined,
      once_at_iso: b.once_at_iso as string | null | undefined,
      once_at_local: b.once_at_local as string | null | undefined,
      target: b.target as 'all' | 'selected' | undefined,
      member_ids: b.member_ids as number[] | undefined,
    });
    res.json(next);
  } catch (error) {
    console.error('[telegram] patch dispatch settings failed:', error);
    const mapped = errorToStatus(error);
    if (mapped.status !== 500) {
      res.status(mapped.status).json({ error: mapped.message });
      return;
    }
    res.status(500).json({ error: 'Не удалось сохранить настройки рассылки' });
  }
}

export async function getTelegramDispatchRecipientsHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  try {
    res.json(await listTelegramDispatchRecipients());
  } catch (error) {
    console.error('[telegram] recipients failed:', error);
    res.status(500).json({ error: 'Не удалось загрузить получателей' });
  }
}

function parseOptionalDispatchDateFromBody(body: unknown): string | undefined {
  if (body == null || typeof body !== 'object') return undefined;
  const raw = (body as { date?: unknown }).date;
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'string') {
    throw new Error('telegram_dispatch_date_bad_type');
  }
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

export async function postTelegramDispatchRunNowHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  try {
    let prayerDate: string | undefined;
    try {
      prayerDate = parseOptionalDispatchDateFromBody(req.body);
    } catch {
      res.status(400).json({ error: 'Поле "date" должно быть строкой YYYY-MM-DD или отсутствовать' });
      return;
    }
    const sent = await runTelegramDispatchNow(prayerDate);
    res.json({ ok: true, sent_count: sent.sent_count, mode: sent.mode });
  } catch (error) {
    const mapped = errorToStatus(error);
    res.status(mapped.status).json({ error: mapped.message });
  }
}

export async function getTelegramDispatchPreviewPrayerHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const q = req.query.date;
  const raw = typeof q === 'string' ? q.trim() : '';
  try {
    const text = await buildTodayPrayerTelegramText(raw.length > 0 ? raw : null);
    res.json({
      text,
      date: resolvePrayerDispatchCalendarYmd(raw.length > 0 ? raw : null),
    });
  } catch (error) {
    const mapped = errorToStatus(error);
    if (mapped.status !== 500) {
      res.status(mapped.status).json({ error: mapped.message });
      return;
    }
    console.error('[telegram] preview prayer failed:', error);
    res.status(500).json({ error: 'Не удалось собрать текст молитвы' });
  }
}

export async function postTelegramTestConnectionHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const raw = (req.body as { bot_token?: unknown } | undefined)?.bot_token;
  if (raw !== undefined && raw !== null && typeof raw !== 'string') {
    res.status(400).json({ error: 'Поле "bot_token" должно быть строкой или null' });
    return;
  }
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  try {
    const info = await testTelegramBotConnection(trimmed.length > 0 ? trimmed : undefined);
    res.json({ ok: true, ...info });
  } catch (error) {
    console.error('[telegram] test-connection failed:', error);
    let mapped = errorToStatus(error);
    if (mapped.status === 500 && error instanceof Error && error.message && !error.message.startsWith('telegram_')) {
      mapped = { status: 502, message: `Проверка Telegram: ${error.message}` };
    }
    res.status(mapped.status).json({ error: mapped.message });
  }
}

export async function postTelegramTestProxyHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const body = req.body as { proxy_url?: unknown; bot_token?: unknown } | undefined;
  if (body?.proxy_url !== undefined && body.proxy_url !== null && typeof body.proxy_url !== 'string') {
    res.status(400).json({ error: 'Поле "proxy_url" должно быть строкой или null' });
    return;
  }
  if (body?.bot_token !== undefined && body.bot_token !== null && typeof body.bot_token !== 'string') {
    res.status(400).json({ error: 'Поле "bot_token" должно быть строкой или null' });
    return;
  }
  const proxyUrl =
    body?.proxy_url === undefined
      ? undefined
      : body.proxy_url === null
        ? null
        : String(body.proxy_url);
  const botToken =
    typeof body?.bot_token === 'string' && body.bot_token.trim().length > 0
      ? body.bot_token.trim()
      : undefined;
  try {
    const result = await testTelegramProxyConnection({
      proxy_url: proxyUrl,
      bot_token: botToken,
    });
    res.json(result);
  } catch (error) {
    console.error('[telegram] test-proxy failed:', error);
    let mapped = errorToStatus(error);
    if (mapped.status === 500 && error instanceof Error && error.message && !error.message.startsWith('telegram_')) {
      mapped = { status: 502, message: `Проверка прокси: ${error.message}` };
    }
    res.status(mapped.status).json({ error: mapped.message });
  }
}

export async function getTelegramChatsHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  try {
    const chats = await listTelegramChats();
    res.json(chats);
  } catch (error) {
    console.error('[telegram] list chats failed:', error);
    res.status(500).json({ error: 'Не удалось загрузить список Telegram-чатов' });
  }
}

export async function postTelegramChatHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const body = req.body as { chat_id?: unknown } | undefined;
  try {
    const chat = await upsertTelegramChatById(body?.chat_id);
    notifyRealtime(['admin']);
    res.status(201).json(chat);
  } catch (error) {
    console.error('[telegram] add chat failed:', error);
    const mapped = errorToStatus(error);
    res.status(mapped.status).json({ error: mapped.message });
  }
}

export async function postTelegramChatRefreshHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Некорректный id чата' });
    return;
  }
  try {
    const chat = await refreshTelegramChat(id);
    notifyRealtime(['admin']);
    res.json(chat);
  } catch (error) {
    console.error('[telegram] refresh chat failed:', error);
    const mapped = errorToStatus(error);
    res.status(mapped.status).json({ error: mapped.message });
  }
}

export async function deleteTelegramChatHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Некорректный id чата' });
    return;
  }
  try {
    await deleteTelegramChat(id);
    notifyRealtime(['admin']);
    res.status(204).send();
  } catch (error) {
    console.error('[telegram] delete chat failed:', error);
    const mapped = errorToStatus(error);
    res.status(mapped.status).json({ error: mapped.message });
  }
}

const COORDINATOR_SCENARIO_IDS = new Set(
  DEFAULT_COORDINATOR_TG_SCENARIOS.map((s) => s.id),
);

export async function getCoordinatorTelegramScenariosHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  try {
    const doc = await loadCoordinatorTelegramScenarios();
    res.json(getCoordinatorTelegramScenariosPublic(doc));
  } catch (error) {
    console.error('[telegram] get coordinator scenarios failed:', error);
    res.status(500).json({ error: 'Не удалось загрузить сценарии координаторов' });
  }
}

export async function patchCoordinatorTelegramScenariosHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const body = req.body as
    | {
        timezone?: unknown;
        scenarios?: unknown;
      }
    | undefined;

  if (body?.timezone !== undefined && typeof body.timezone !== 'string') {
    res.status(400).json({ error: 'Поле "timezone" должно быть строкой' });
    return;
  }
  if (body?.scenarios !== undefined && !Array.isArray(body.scenarios)) {
    res.status(400).json({ error: 'Поле "scenarios" должно быть массивом' });
    return;
  }

  let scenariosPatch: CoordinatorTelegramScenario[] | undefined;
  if (Array.isArray(body?.scenarios)) {
    scenariosPatch = body.scenarios as CoordinatorTelegramScenario[];
  }

  try {
    const doc = await patchCoordinatorTelegramScenarios({
      timezone: typeof body?.timezone === 'string' ? body.timezone : undefined,
      scenarios: scenariosPatch,
    });
    notifyRealtime(['admin']);
    res.json(getCoordinatorTelegramScenariosPublic(doc));
  } catch (error) {
    console.error('[telegram] patch coordinator scenarios failed:', error);
    res.status(500).json({ error: 'Не удалось сохранить сценарии координаторов' });
  }
}

export async function postCoordinatorTelegramScenarioRunNowHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const body = req.body as { scenario_id?: unknown } | undefined;
  const scenarioId =
    typeof body?.scenario_id === 'string' ? body.scenario_id.trim() : '';
  if (!COORDINATOR_SCENARIO_IDS.has(scenarioId as CoordinatorTelegramScenarioId)) {
    res.status(400).json({
      error:
        'Укажите scenario_id: assignment | missing_need_tomorrow | missing_need_today | week_list',
    });
    return;
  }
  try {
    const result = await runCoordinatorTelegramScenarioNow(
      scenarioId as CoordinatorTelegramScenarioId,
    );
    if (!result.ok && result.reason === 'assignment_is_event_driven') {
      res.status(409).json({
        error:
          'Сценарий «Назначение» срабатывает при назначении координатора, а не по кнопке «Запустить сейчас».',
        ...result,
      });
      return;
    }
    if (!result.ok && result.reason === 'scenario_disabled') {
      res.status(409).json({ error: 'Сценарий выключен. Включите его и сохраните.', ...result });
      return;
    }
    res.json(result);
  } catch (error) {
    console.error('[telegram] run coordinator scenario failed:', error);
    const mapped = errorToStatus(error);
    res.status(mapped.status).json({ error: mapped.message });
  }
}
