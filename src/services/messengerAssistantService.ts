/**
 * ИИ-ассистент «ИИ помощник» в мессенджере.
 *
 * - Личный канал на каждого участника (metadata.kind = 'assistant').
 * - Только чтение общих данных церкви: события, программы служения (проповеди),
 *   песенник, молитвенный календарь, расписания.
 * - Не читает личные чаты других пользователей и не изменяет данные.
 */

import { randomUUID } from 'node:crypto';

import { AiAgentError, chatCompletion } from '../ai/llmClient';
import type { ChatMessage } from '../ai/types';
import { query as dbQuery } from '../config/db';
import { resolveMessengerConversationDeepLink } from '../config/messengerPublic';
import { decryptMessageText, encryptMessageText } from '../lib/messageCrypto';
import type { MessagePayload, MessageWithSender } from '../types/messenger';
import { resolveEffectiveSystemPrompt, resolveLlmRuntimeConfig } from './aiSettingsService';
import { getPrayerDataByDate } from './calendarService';
import { listActiveEvents } from './eventsService';
import * as mediaSchedule from './mediaScheduleService';
import * as musicSchedule from './musicScheduleService';
import {
  getConversationMeta,
  getConversationMemberIds,
  isConversationMutedForMember,
  isMessengerAssistantChannelMetadata,
  loadMessages,
  MESSENGER_ASSISTANT_CHANNEL_KIND,
  MESSENGER_ASSISTANT_CHANNEL_TITLE,
} from './messengerService';
import { sendPushNotification } from './pushService';
import { listPlans } from './servicePlannerService';
import { listPublishedSongs } from './songService';
import { listSundayScheduleSlots } from './sundayScheduleSlots';
import { canAccessMessengerAssistant, normalizeAppRoles, type AppRole } from '../types/appRole';

async function memberCanAccessAssistant(memberId: number): Promise<boolean> {
  const res = await dbQuery(
    `SELECT app_role, app_roles FROM members WHERE id = $1 LIMIT 1`,
    [memberId],
  );
  const row = res.rows[0] as { app_role?: unknown; app_roles?: unknown } | undefined;
  if (!row) return false;
  const roles = normalizeAppRoles(row.app_roles, row.app_role) as AppRole[];
  return canAccessMessengerAssistant(roles);
}

const ASSISTANT_WELCOME =
  'Здравствуйте! Я — ИИ помощник.\n\n' +
  'Подскажу по событиям, проповедям, песням, молитвенному календарю и расписаниям.\n\n' +
  'Выберите пример вопроса ниже или напишите свой. ' +
  'Я читаю только общие данные программы и не вижу личные переписки.';

const DEFAULT_ASSISTANT_SYSTEM_PROMPT = `Ты — «ИИ помощник», дружелюбный ассистент церковной платформы «Источник жизни».

Твоя роль:
- Помогать участникам церкви ответами на вопросы по программе: событиям, служениям, проповедям (проповедник и тема), песням, молитвенному календарю и расписаниям.
- Опираться ТОЛЬКО на блок «Данные из базы» в контексте и на историю этого чата.
- Если данных недостаточно — честно скажи, чего не хватает, и предложи, что уточнить.
- Не выдумывай факты, даты, имена и тексты песен, которых нет в контексте.
- Не раскрывай и не запрашивай приватные данные других пользователей (личные чаты, пароли, телефоны вне открытого календаря).
- Не изменяй данные: ты только консультируешь. Если нужно что-то изменить — направь в нужный раздел приложения.
- Отвечай по-русски, кратко и по делу, структурируй списки при необходимости.
- Тон тёплый и уважительный, без морализаторства.
- Формат: можно использовать простой Markdown — **жирный** для дат/имён и списки с «- » в начале строки. Не экранируй символы (\- или \*) и не оборачивай весь ответ в блоки кода.`;

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d!);
  dt.setDate(dt.getDate() + days);
  return ymdLocal(dt);
}

function memberLabel(row: {
  first_name?: unknown;
  last_name?: unknown;
  name?: unknown;
} | null | undefined): string {
  if (!row) return '';
  const fn = String(row.first_name ?? '').trim();
  const ln = String(row.last_name ?? '').trim();
  const full = `${fn} ${ln}`.trim();
  if (full) return full;
  return String(row.name ?? '').trim();
}

async function resolveMemberNames(ids: number[]): Promise<Map<number, string>> {
  const uniq = [...new Set(ids.filter((n) => Number.isFinite(n) && n > 0))];
  const map = new Map<number, string>();
  if (uniq.length === 0) return map;
  const res = await dbQuery(
    `SELECT id, first_name, last_name, name FROM members WHERE id = ANY($1::int[])`,
    [uniq],
  );
  for (const raw of res.rows as Array<{
    id: unknown;
    first_name?: unknown;
    last_name?: unknown;
    name?: unknown;
  }>) {
    const id = Number(raw.id);
    if (!Number.isFinite(id)) continue;
    map.set(id, memberLabel(raw) || `участник ${id}`);
  }
  return map;
}

function extractSearchHints(text: string): string {
  const cleaned = text
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length < 2) return '';
  const stop = new Set([
    'что',
    'как',
    'где',
    'когда',
    'кто',
    'какой',
    'какая',
    'какие',
    'про',
    'для',
    'есть',
    'мне',
    'нас',
    'это',
    'или',
    'ли',
    'в',
    'на',
    'и',
    'а',
    'the',
    'song',
    'песня',
    'песни',
    'расскажи',
    'покажи',
    'найди',
    'подскажи',
  ]);
  const words = cleaned
    .split(' ')
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !stop.has(w.toLowerCase()));
  return words.slice(0, 6).join(' ');
}

async function loadPlanSermonAndSongLines(planIds: number[]): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  if (planIds.length === 0) return out;
  try {
    const res = await dbQuery(
      `SELECT
         b.service_plan_id,
         b.title,
         b.song_id,
         b.content_json,
         bt.code AS block_type_code,
         bt.kind AS block_type_kind,
         bt.name AS block_type_name
       FROM public.service_blocks b
       LEFT JOIN public.block_types bt ON bt.id = b.block_type_id
       WHERE b.service_plan_id = ANY($1::int[])
       ORDER BY b.service_plan_id ASC, b.order_index ASC, b.id ASC`,
      [planIds],
    );
    for (const raw of res.rows as Array<{
      service_plan_id: unknown;
      title?: unknown;
      song_id?: unknown;
      content_json?: unknown;
      block_type_code?: unknown;
      block_type_kind?: unknown;
      block_type_name?: unknown;
    }>) {
      const planId = Number(raw.service_plan_id);
      if (!Number.isFinite(planId)) continue;
      const code = String(raw.block_type_code ?? '').toLowerCase();
      const kind = String(raw.block_type_kind ?? '').toLowerCase();
      const typeName = String(raw.block_type_name ?? '');
      const title = String(raw.title ?? '').trim();
      const cj =
        raw.content_json && typeof raw.content_json === 'object' && !Array.isArray(raw.content_json)
          ? (raw.content_json as Record<string, unknown>)
          : {};
      const topic = typeof cj.sermon_topic === 'string' ? cj.sermon_topic.trim() : '';
      const scripture =
        typeof cj.sermon_scripture === 'string' ? cj.sermon_scripture.trim() : '';
      const lines = out.get(planId) ?? [];
      const isSermon =
        code === 'sermon' ||
        kind === 'sermon' ||
        /проповед/i.test(title) ||
        /проповед/i.test(typeName) ||
        Boolean(topic);
      const isSong =
        code === 'song' ||
        kind === 'song' ||
        raw.song_id != null ||
        /песн/i.test(title) ||
        /песн/i.test(typeName);
      if (isSermon) {
        lines.push(
          `    проповедь: ${topic || title || 'без темы'}${scripture ? ` (${scripture})` : ''}`,
        );
      } else if (isSong) {
        lines.push(`    песня: ${title || `id ${raw.song_id ?? '?'}`}`);
      }
      out.set(planId, lines);
    }
  } catch (e) {
    console.warn('[assistant] plan blocks query failed:', e);
  }
  return out;
}

async function buildChurchContextDigest(userQuestion: string): Promise<string> {
  const today = ymdLocal(new Date());
  const horizon = addDaysYmd(today, 28);
  const searchHint = extractSearchHints(userQuestion);

  const sections: string[] = [`Сегодня: ${today}`];

  try {
    const events = await listActiveEvents();
    const upcoming = events
      .filter((e) => e.event_date >= today && e.event_date <= horizon)
      .slice(0, 25);
    if (upcoming.length === 0) {
      sections.push('События (ближайшие 28 дней): нет активных.');
    } else {
      sections.push(
        'События (ближайшие 28 дней):\n' +
          upcoming
            .map((e) => {
              const time = e.event_time ? ` ${e.event_time}` : '';
              const cat = e.category ? ` [${e.category}]` : '';
              const desc = e.description?.trim()
                ? ` — ${e.description.trim().slice(0, 160)}`
                : '';
              return `- ${e.event_date}${time}${cat}: ${e.title}${desc}`;
            })
            .join('\n'),
      );
    }
  } catch (e) {
    console.warn('[assistant] events context failed:', e);
    sections.push('События: не удалось загрузить.');
  }

  try {
    const plans = await listPlans({ from: today, to: horizon });
    const recent = [...plans]
      .sort((a, b) => String(a.service_date).localeCompare(String(b.service_date)))
      .slice(0, 12);
    const nameIds: number[] = [];
    for (const p of recent) {
      if (p.leader_member_id) nameIds.push(p.leader_member_id);
      if (p.preacher_member_id) nameIds.push(p.preacher_member_id);
      if (p.music_ministry_member_id) nameIds.push(p.music_ministry_member_id);
    }
    const names = await resolveMemberNames(nameIds);
    const blockLines = await loadPlanSermonAndSongLines(recent.map((p) => p.id));

    const planLines: string[] = [];
    for (const p of recent) {
      const leader = p.leader_member_id ? names.get(p.leader_member_id) : null;
      const preacher = p.preacher_member_id ? names.get(p.preacher_member_id) : null;
      const music = p.music_ministry_member_id ? names.get(p.music_ministry_member_id) : null;
      planLines.push(
        `- ${p.service_date} ${p.start_time || ''} «${p.template_name || 'Служение'}» (статус: ${p.status})` +
          `${leader ? `; ведущий: ${leader}` : ''}` +
          `${preacher ? `; проповедник: ${preacher}` : ''}` +
          `${music ? `; музыка: ${music}` : ''}`,
      );
      const extra = blockLines.get(p.id) ?? [];
      planLines.push(...extra.slice(0, 12));
    }
    sections.push(
      planLines.length
        ? `Программы служения и проповеди:\n${planLines.join('\n')}`
        : 'Программы служения: нет планов в ближайшие 28 дней.',
    );
  } catch (e) {
    console.warn('[assistant] service plans context failed:', e);
    sections.push('Программы служения: не удалось загрузить.');
  }

  try {
    const slots = await listSundayScheduleSlots({ from: today, to: horizon });
    const ids = slots.flatMap((s) =>
      [s.leader_member_id, s.preacher_member_id].filter((x): x is number => x != null),
    );
    const names = await resolveMemberNames(ids);
    if (slots.length === 0) {
      sections.push('Воскресное расписание (слоты): пусто.');
    } else {
      sections.push(
        'Воскресное расписание:\n' +
          slots
            .slice(0, 10)
            .map((s) => {
              const leader = s.leader_member_id ? names.get(s.leader_member_id) : '—';
              const preacher = s.preacher_member_id ? names.get(s.preacher_member_id) : '—';
              return `- ${s.service_date}: ведущий ${leader}, проповедник ${preacher}`;
            })
            .join('\n'),
      );
    }
  } catch (e) {
    console.warn('[assistant] sunday schedule context failed:', e);
  }

  try {
    const from = new Date(`${today}T00:00:00`);
    const to = new Date(`${horizon}T00:00:00`);
    const [musicEvents, mediaEvents] = await Promise.all([
      musicSchedule.getEventsWithAssignments(from, to),
      mediaSchedule.getEventsWithAssignments(from, to),
    ]);
    const fmtMusic = musicEvents.slice(0, 8).map((ev) => {
      const asg = (ev.assignments ?? [])
        .map((a) => `${a.role?.name ?? 'роль'}: ${a.member?.name ?? '?'}`)
        .join('; ');
      return `- ${ev.event_date} «${ev.title}» музыка: ${asg || 'без назначений'}`;
    });
    const fmtMedia = mediaEvents.slice(0, 8).map((ev) => {
      const asg = (ev.assignments ?? [])
        .map((a) => `${a.role?.name ?? 'роль'}: ${a.member?.name ?? '?'}`)
        .join('; ');
      return `- ${ev.event_date} «${ev.title}» медиа: ${asg || 'без назначений'}`;
    });
    sections.push(
      ['Расписание музыки:', ...(fmtMusic.length ? fmtMusic : ['- нет данных'])].join('\n'),
    );
    sections.push(
      ['Расписание медиа:', ...(fmtMedia.length ? fmtMedia : ['- нет данных'])].join('\n'),
    );
  } catch (e) {
    console.warn('[assistant] music/media schedule context failed:', e);
  }

  try {
    const prayerDays: string[] = [];
    for (let i = 0; i <= 6; i += 1) {
      const day = addDaysYmd(today, i);
      const data = await getPrayerDataByDate(day);
      const themes = (data.global_themes ?? [])
        .map((t) => String(t.title ?? '').trim())
        .filter(Boolean)
        .slice(0, 3);
      const ministries = (data.ministries ?? [])
        .map((m) => String(m.title ?? '').trim())
        .filter(Boolean)
        .slice(0, 3);
      const members = (data.members ?? [])
        .map((m) => {
          const name = memberLabel(m);
          const need = String(m.prayer_request ?? '').trim();
          return need ? `${name}: ${need.slice(0, 120)}` : name;
        })
        .filter(Boolean)
        .slice(0, 3);
      prayerDays.push(
        `- ${day}: темы [${themes.join('; ') || '—'}]; служения [${ministries.join('; ') || '—'}]; в цикле [${members.join('; ') || '—'}]`,
      );
    }
    sections.push(`Молитвенный календарь (7 дней):\n${prayerDays.join('\n')}`);
  } catch (e) {
    console.warn('[assistant] prayer context failed:', e);
    sections.push('Молитвенный календарь: не удалось загрузить.');
  }

  try {
    const filters = searchHint ? { q: searchHint } : undefined;
    const songs = await listPublishedSongs(null, filters);
    const slice = songs.slice(0, searchHint ? 15 : 12);
    if (slice.length === 0) {
      sections.push(
        searchHint
          ? `Песенник (поиск «${searchHint}»): ничего не найдено.`
          : 'Песенник: каталог пуст или недоступен.',
      );
    } else {
      sections.push(
        `Песенник${searchHint ? ` (поиск «${searchHint}»)` : ' (фрагмент каталога)'}:\n` +
          slice
            .map((s) => {
              const num = s.song_number != null ? `#${s.song_number} ` : '';
              const key = s.default_key ? ` [${s.default_key}]` : '';
              const tags =
                Array.isArray(s.tags) && s.tags.length
                  ? ` теги: ${s.tags.slice(0, 4).join(', ')}`
                  : '';
              return `- ${num}${s.title}${key}${tags}`;
            })
            .join('\n'),
      );
    }
  } catch (e) {
    console.warn('[assistant] songs context failed:', e);
    sections.push('Песенник: не удалось загрузить.');
  }

  const digest = sections.join('\n\n');
  return digest.length > 14000 ? `${digest.slice(0, 13950)}\n…(обрезано)` : digest;
}

async function postAssistantBotMessage(
  conversationId: string,
  content: string,
  replyToMessageId?: string | null,
): Promise<MessageWithSender | null> {
  const text = content.trim();
  if (!text) return null;

  const contentForDb = encryptMessageText(text);
  const payload: MessagePayload = {
    text,
    assistant: true,
    kind: MESSENGER_ASSISTANT_CHANNEL_KIND,
  };

  await dbQuery(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [conversationId]);

  const replyId =
    replyToMessageId && /^\d+$/.test(String(replyToMessageId)) ? String(replyToMessageId) : null;

  const ins = await dbQuery(
    `INSERT INTO messages (conversation_id, sender_id, content, payload_type, payload, reply_to_message_id, client_msg_id)
     VALUES ($1::bigint, NULL, $2, 'text'::message_payload_type, $3::jsonb, $4::bigint, $5)
     RETURNING id`,
    [
      conversationId,
      contentForDb,
      JSON.stringify(payload),
      replyId,
      `assistant-${randomUUID()}`,
    ],
  );
  const rawId = (ins.rows[0] as { id?: unknown } | undefined)?.id;
  if (rawId == null) return null;
  const messageId = String(rawId);

  const memberIds = await getConversationMemberIds(conversationId);
  const viewerId = memberIds[0] ?? 0;
  const recent = await loadMessages(conversationId, viewerId, 8, null);
  const full = recent.find((m) => String(m.id) === messageId) ?? null;

  const now = new Date().toISOString();
  const messageForRealtime: MessageWithSender = full
    ? {
        ...full,
        sender_name: full.sender_name?.trim() || MESSENGER_ASSISTANT_CHANNEL_TITLE,
      }
    : {
        id: messageId,
        conversation_id: String(conversationId),
        sender_id: null,
        client_msg_id: null,
        content: text,
        payload_type: 'text',
        payload,
        interaction_count: 0,
        reply_to_message_id: replyId,
        is_edited: false,
        is_deleted: false,
        created_at: now,
        updated_at: now,
        sender_name: MESSENGER_ASSISTANT_CHANNEL_TITLE,
        sender_first_name: null,
        sender_last_name: null,
        reply_preview: null,
        reactions: [],
      };

  const { sendToRoomAll } = await import('../realtime/wsHub');
  sendToRoomAll(String(conversationId), {
    type: 'msg:new',
    conversationId: String(conversationId),
    message: { ...messageForRealtime, is_read: false as const },
  });

  try {
    const meta = await getConversationMeta(conversationId);
    const chatLabel = meta?.title?.trim() || MESSENGER_ASSISTANT_CHANNEL_TITLE;
    const previewShort = text.length > 160 ? `${text.slice(0, 157).trim()}…` : text;
    for (const rid of memberIds) {
      const r = Number(rid);
      if (!Number.isFinite(r)) continue;
      if (await isConversationMutedForMember(conversationId, r)) continue;
      await sendPushNotification(r, {
        title: chatLabel,
        body: previewShort,
        conversationId: String(conversationId),
        messageId,
        url: resolveMessengerConversationDeepLink(String(conversationId)),
        tag: `chat-${conversationId}`,
        renotify: true,
        badge: '/assets/pwa-64x64.png',
        icon: '/assets/pwa-192x192.png',
        actions: [
          { action: 'reply', title: 'Ответить' },
          { action: 'dismiss', title: 'Закрыть' },
        ],
      });
    }
  } catch (e) {
    console.warn('[assistant] push notify failed:', e);
  }

  return messageForRealtime;
}

/**
 * Создаёт или возвращает личный чат «ИИ помощник» для участника.
 */
export async function ensureAssistantConversation(
  memberId: number,
): Promise<{ conversationId: string; created: boolean }> {
  if (!Number.isFinite(memberId) || memberId < 1) {
    throw new Error('Invalid memberId');
  }
  if (!(await memberCanAccessAssistant(memberId))) {
    throw new Error('ИИ помощник доступен только членам церкви. Для прихожан чат недоступен.');
  }

  const found = await dbQuery(
    `SELECT c.id
     FROM conversations c
     JOIN conversation_participants cp
       ON cp.conversation_id = c.id
      AND cp.member_id = $1
      AND cp.left_at IS NULL
     WHERE c.type = 'channel'
       AND c.metadata->>'kind' = $2
       AND (c.metadata->>'owner_member_id') = $3
     LIMIT 1`,
    [memberId, MESSENGER_ASSISTANT_CHANNEL_KIND, String(memberId)],
  );

  if (found.rows[0]?.id != null) {
    const conversationId = String(found.rows[0].id);
    // Обновляем название, если чат создан со старым именем.
    await dbQuery(
      `UPDATE conversations SET title = $2 WHERE id = $1::bigint AND title IS DISTINCT FROM $2`,
      [conversationId, MESSENGER_ASSISTANT_CHANNEL_TITLE],
    );
    try {
      await refreshAssistantWelcomeIfStale(conversationId);
    } catch (e) {
      console.warn('[assistant] welcome refresh failed:', e);
    }
    return { conversationId, created: false };
  }

  const ins = await dbQuery(
    `INSERT INTO conversations (type, title, metadata, default_permissions)
     VALUES (
       'channel',
       $1,
       $2::jsonb,
       $3::jsonb
     )
     RETURNING id`,
    [
      MESSENGER_ASSISTANT_CHANNEL_TITLE,
      JSON.stringify({
        kind: MESSENGER_ASSISTANT_CHANNEL_KIND,
        owner_member_id: String(memberId),
      }),
      JSON.stringify({
        can_send_messages: true,
        can_send_media: false,
        can_add_users: false,
        can_pin_messages: false,
        can_manage_chat: false,
      }),
    ],
  );
  const convId = String((ins.rows[0] as { id: unknown }).id);

  await dbQuery(
    `INSERT INTO conversation_participants
       (conversation_id, member_id, role, ui_pinned, ui_pinned_at)
     VALUES ($1::bigint, $2, 'owner', TRUE, NOW())`,
    [convId, memberId],
  );

  try {
    await postAssistantBotMessage(convId, ASSISTANT_WELCOME);
  } catch (e) {
    console.warn('[assistant] welcome message failed:', e);
  }

  return { conversationId: convId, created: true };
}

function isAssistantOwnedBy(metadata: unknown, memberId: number): boolean {
  if (!isMessengerAssistantChannelMetadata(metadata)) return false;
  const owner = String((metadata as Record<string, unknown>).owner_member_id ?? '');
  return owner === String(memberId);
}

/** Обновить устаревшее приветствие (длинный список примеров / старое имя), если в чате только оно. */
async function refreshAssistantWelcomeIfStale(conversationId: string): Promise<void> {
  const res = await dbQuery(
    `SELECT id, content, sender_id, payload
     FROM messages
     WHERE conversation_id = $1::bigint AND COALESCE(is_deleted, FALSE) = FALSE
     ORDER BY id ASC
     LIMIT 3`,
    [conversationId],
  );
  if (res.rows.length !== 1) return;
  const row = res.rows[0] as {
    id: unknown;
    content?: unknown;
    sender_id?: unknown;
    payload?: unknown;
  };
  if (row.sender_id != null) return;
  const payload =
    row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : {};
  if (payload.assistant !== true && String(payload.kind ?? '') !== MESSENGER_ASSISTANT_CHANNEL_KIND) {
    return;
  }

  const current = decryptMessageText(String(row.content ?? '')).trim();
  if (!current || current === ASSISTANT_WELCOME) return;
  const looksStale =
    current.includes('Примеры вопросов:') ||
    current.includes('Ассистенот') ||
    current.includes('Примеры вопросов');
  if (!looksStale) return;

  const contentForDb = encryptMessageText(ASSISTANT_WELCOME);
  const nextPayload: MessagePayload = {
    text: ASSISTANT_WELCOME,
    assistant: true,
    kind: MESSENGER_ASSISTANT_CHANNEL_KIND,
  };
  await dbQuery(
    `UPDATE messages
     SET content = $2, payload = $3::jsonb, updated_at = NOW()
     WHERE id = $1::bigint`,
    [String(row.id), contentForDb, JSON.stringify(nextPayload)],
  );
}

/**
 * Обработать сообщение пользователя в чате «ИИ помощник» и ответить.
 * Вызывать fire-and-forget после успешной записи пользовательского сообщения.
 */
export async function replyAsAssistantBot(input: {
  conversationId: string;
  memberId: number;
  userMessageId: string;
  userText: string;
}): Promise<void> {
  const { conversationId, memberId, userMessageId, userText } = input;
  const text = String(userText ?? '').trim();
  if (!text) return;

  if (!(await memberCanAccessAssistant(memberId))) {
    return;
  }

  const meta = await getConversationMeta(conversationId);
  if (!meta || !isAssistantOwnedBy(meta.metadata, memberId)) {
    return;
  }

  const members = await getConversationMemberIds(conversationId);
  if (!members.includes(memberId) || members.length > 1) {
    console.warn('[assistant] refusing reply: unexpected participants', {
      conversationId,
      memberId,
      members,
    });
    return;
  }

  let history: MessageWithSender[] = [];
  try {
    history = await loadMessages(conversationId, memberId, 16, null);
  } catch (e) {
    console.warn('[assistant] load history failed:', e);
  }

  const chatHistory: ChatMessage[] = [];
  for (const m of history) {
    const body = String(m.content ?? '').trim();
    if (!body || m.is_deleted) continue;
    const isBot =
      m.sender_id == null ||
      (m.payload &&
        typeof m.payload === 'object' &&
        ((m.payload as Record<string, unknown>).assistant === true ||
          String((m.payload as Record<string, unknown>).kind ?? '') ===
            MESSENGER_ASSISTANT_CHANNEL_KIND));
    chatHistory.push({
      role: isBot ? 'assistant' : 'user',
      content: body.slice(0, 2000),
    });
  }

  if (
    chatHistory.length === 0 ||
    chatHistory[chatHistory.length - 1]?.role !== 'user' ||
    chatHistory[chatHistory.length - 1]?.content !== text.slice(0, 2000)
  ) {
    chatHistory.push({ role: 'user', content: text.slice(0, 2000) });
  }

  let digest = '';
  try {
    digest = await buildChurchContextDigest(text);
  } catch (e) {
    console.warn('[assistant] context digest failed:', e);
    digest = 'Контекст базы временно недоступен.';
  }

  let adminSectionPrompt: string | null = null;
  try {
    const cfg = await resolveLlmRuntimeConfig();
    const fromSettings = resolveEffectiveSystemPrompt(cfg, 'messenger');
    if (typeof fromSettings === 'string' && fromSettings.trim()) {
      adminSectionPrompt = fromSettings.trim();
    }
  } catch {
    /* ignore */
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: DEFAULT_ASSISTANT_SYSTEM_PROMPT },
    ...(adminSectionPrompt && adminSectionPrompt !== DEFAULT_ASSISTANT_SYSTEM_PROMPT
      ? [
          {
            role: 'system' as const,
            content: `Дополнительные инструкции из настроек ИИ (раздел «Мессенджер»):\n${adminSectionPrompt}`,
          },
        ]
      : []),
    {
      role: 'system',
      content:
        'Данные из базы (только чтение, общие данные церкви; не раскрывай личные переписки):\n\n' +
        digest,
    },
    ...chatHistory,
  ];

  let answer: string;
  try {
    answer = await chatCompletion(messages, {
      section: 'messenger',
      skipSystemPrompt: true,
      temperature: 0.4,
      max_tokens: 1200,
    });
  } catch (e) {
    if (e instanceof AiAgentError) {
      if (e.code === 'ai_disabled') {
        answer =
          'Модуль ИИ сейчас выключен в настройках. Администратор может включить его в разделе «Админка → Интеграции → ИИ».';
      } else if (e.code === 'ai_not_configured') {
        answer =
          'ИИ ещё не настроен: нужен API-ключ в админке (или переменная AI_API_KEY). Пока могу подсказать только после настройки.';
      } else {
        answer = `Не удалось получить ответ ИИ: ${e.message}`;
      }
    } else {
      console.error('[assistant] chatCompletion failed:', e);
      answer = 'Произошла ошибка при обращении к ИИ. Попробуйте ещё раз чуть позже.';
    }
  }

  const cleaned = String(answer ?? '')
    .replace(/\\([-*_`])/g, '$1')
    .replace(/\r\n/g, '\n')
    .replace(/```[\s\S]*?```/g, (block) =>
      block
        .replace(/^```[a-zA-Z0-9_-]*\n?/, '')
        .replace(/\n?```$/, '')
        .trim(),
    )
    .trim()
    .slice(0, 8000);
  if (!cleaned) return;

  await postAssistantBotMessage(conversationId, cleaned, userMessageId);
}
