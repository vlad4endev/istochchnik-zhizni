/**
 * Разделы приложения, для которых можно задать отдельный системный промпт.
 * В коде передавайте `section` в `chatCompletion(..., { section: 'messenger' })`.
 */
export const AI_PROMPT_SCOPE_LIST = [
  { id: 'messenger', label: 'Мессенджер (христианский ИИ помощник)' },
  { id: 'songbook', label: 'Песенник и аккорды' },
  { id: 'studio', label: 'Студия и сет-листы' },
  { id: 'calendar', label: 'Молитвенный календарь' },
  { id: 'notifications', label: 'Уведомления' },
  { id: 'profile', label: 'Профиль и публикации' },
  { id: 'broadcast', label: 'Трансляция' },
  { id: 'resources', label: 'Ресурсы (подкасты и др.)' },
  { id: 'service_flow', label: 'Ход собрания' },
  { id: 'dashboard', label: 'Дашборд' },
  { id: 'admin', label: 'Админ-панель и отчёты' },
] as const;

export type AiPromptScopeId = (typeof AI_PROMPT_SCOPE_LIST)[number]['id'];

const SCOPE_IDS = new Set<string>(AI_PROMPT_SCOPE_LIST.map((s) => s.id));

export function isAiPromptScopeId(id: string): id is AiPromptScopeId {
  return SCOPE_IDS.has(id);
}
