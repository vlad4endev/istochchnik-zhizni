/**
 * Токен редактирования (edit_token) даёт правку блоков программы по публичной ссылке без входа и без проверки роли.
 * Поэтому в ответах API он нужен только тем, кто и так вправе править план; остальные видят пустую строку.
 * Ключ остаётся в ответе, чтобы формат не менялся для клиентов.
 */
export function redactEditToken<T extends { edit_token?: string }>(plan: T, canEdit: boolean): T {
  if (canEdit) return plan;
  return { ...plan, edit_token: '' };
}

export function redactEditTokens<T extends { edit_token?: string }>(plans: readonly T[], canEdit: boolean): T[] {
  return canEdit ? [...plans] : plans.map((plan) => redactEditToken(plan, false));
}
