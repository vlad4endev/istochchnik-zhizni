/**
 * Получатели авторассылки программы: Telegram-чаты + чаты приложения.
 */
export type ServicePlanMailingDestinations = {
  /** ID Telegram-групп/каналов (−100…) */
  telegram_chat_ids: string[];
  /** ID conversations в приложении (каналы/группы) */
  messenger_conversation_ids: string[];
};

export function emptyServicePlanMailingDestinations(): ServicePlanMailingDestinations {
  return { telegram_chat_ids: [], messenger_conversation_ids: [] };
}

export function normalizeTelegramChatIdList(raw: unknown): string[] {
  if (typeof raw === 'string') {
    const parts = raw
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return normalizeTelegramChatIdList(parts);
  }
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const id = String(item ?? '').trim();
    if (!id) continue;
    if (!/^-?\d{5,20}$/.test(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= 20) break;
  }
  return out;
}

export function normalizeMessengerConversationIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const id = String(item ?? '').trim();
    if (!/^\d+$/.test(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= 40) break;
  }
  return out;
}

export function normalizeServicePlanMailingDestinations(
  raw: unknown,
): ServicePlanMailingDestinations | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return normalizeServicePlanMailingDestinations(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  return {
    telegram_chat_ids: normalizeTelegramChatIdList(o.telegram_chat_ids),
    messenger_conversation_ids: normalizeMessengerConversationIdList(
      o.messenger_conversation_ids,
    ),
  };
}

/** Принимает объект из PATCH: null сбрасывает к legacy, объект — сохраняет. */
export function parseDestinationsPatchInput(
  raw: unknown,
): ServicePlanMailingDestinations | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const normalized = normalizeServicePlanMailingDestinations(raw);
  return normalized ?? emptyServicePlanMailingDestinations();
}

export function destinationsJson(dest: ServicePlanMailingDestinations): string {
  return JSON.stringify({
    telegram_chat_ids: dest.telegram_chat_ids,
    messenger_conversation_ids: dest.messenger_conversation_ids,
  });
}

export function firstTelegramChatId(dest: ServicePlanMailingDestinations): string | null {
  return dest.telegram_chat_ids[0] ?? null;
}

/** Legacy-скаляры → список TG id (без дублей). */
export function telegramIdsFromLegacyScalars(ids: Array<string | null | undefined>): string[] {
  return normalizeTelegramChatIdList(ids.filter(Boolean));
}
